/**
 * Main site worker: serves the static assets in public/ (unchanged) and adds a
 * small no-captcha "human visitor" counter on top of Cloudflare Web Analytics.
 *
 * - POST /api/visit         verify an invisible Turnstile token, record one
 *                            human visit per (UTC day, visitor hash).
 * - GET  /api/visit-stats   public aggregate counts for the homepage stat tile.
 * - GET  /api/backlog       public subset of the private GitHub Projects
 *                            backlog board (see handleBacklog below).
 * - /go/sitemap-index       honeypot: never linked visibly, disallowed in
 *                            robots.txt; anything that requests it gets logged
 *                            separately and excluded from the human count.
 */

// Backlog board this site pulls from — a personal (user-owned) GitHub
// Projects v2 board, not an org. Not secret, just config.
const BACKLOG_OWNER = "P47K0";
const BACKLOG_PROJECT_NUMBER = 1;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/visit" && request.method === "POST") {
      return handleVisit(request, env);
    }
    if (url.pathname === "/api/visit-stats" && request.method === "GET") {
      return handleVisitStats(env);
    }
    if (url.pathname === "/api/backlog" && request.method === "GET") {
      return handleBacklog(env);
    }
    if (url.pathname === "/go/sitemap-index") {
      return handleHoneypot(request, env);
    }

    return env.ASSETS.fetch(request);
  }
};

async function handleVisit(request, env) {
  try {
    const { token } = await request.json();
    if (!token || typeof token !== "string") {
      return Response.json({ ok: false }, { status: 400 });
    }

    const ip = request.headers.get("CF-Connecting-IP") || "0.0.0.0";

    const verifyRes = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: ip
      })
    });
    const verify = await verifyRes.json();
    if (!verify.success) {
      return Response.json({ ok: false }, { status: 403 });
    }

    const ua = request.headers.get("User-Agent") || "";
    const { day, hash } = await dailyVisitorHash(ip, ua, env.VISITOR_HASH_SALT);

    await env.DB.prepare(
      `INSERT OR IGNORE INTO human_visits (visit_day, visitor_hash, first_seen_at)
       VALUES (?, ?, ?)`
    ).bind(day, hash, new Date().toISOString()).run();

    return Response.json({ ok: true });
  } catch (err) {
    console.error("visit error:", err.message);
    return Response.json({ ok: false }, { status: 500 });
  }
}

async function handleVisitStats(env) {
  const monthPrefix = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
  try {
    const [monthRow, allTimeRow] = await Promise.all([
      env.DB.prepare(
        `SELECT COUNT(DISTINCT visitor_hash) AS n FROM human_visits WHERE visit_day LIKE ?`
      ).bind(`${monthPrefix}-%`).first(),
      env.DB.prepare(`SELECT COUNT(DISTINCT visitor_hash) AS n FROM human_visits`).first()
    ]);
    return Response.json(
      { thisMonth: monthRow?.n ?? 0, allTime: allTimeRow?.n ?? 0 },
      { headers: { "Cache-Control": "public, max-age=60" } }
    );
  } catch (err) {
    console.error("stats error:", err.message);
    return Response.json({ thisMonth: 0, allTime: 0 });
  }
}

// Public subset of the private GitHub Projects backlog board. The board is
// private, so this fetch has to happen server-side with a token — items are
// hidden unless explicitly marked Visibility = "Private"; blank/other values
// are shown (the board's own default is public).
async function handleBacklog(env) {
  const query = `
    query($owner: String!, $number: Int!) {
      user(login: $owner) {
        projectV2(number: $number) {
          items(first: 100) {
            nodes {
              content {
                ... on DraftIssue { title body }
                ... on Issue { title body }
                ... on PullRequest { title body }
              }
              fieldValues(first: 20) {
                nodes {
                  ... on ProjectV2ItemFieldSingleSelectValue {
                    name
                    field { ... on ProjectV2FieldCommon { name } }
                  }
                }
              }
            }
          }
        }
      }
    }`;

  try {
    if (!env.GITHUB_BACKLOG_TOKEN) throw new Error("GITHUB_BACKLOG_TOKEN not configured");

    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${env.GITHUB_BACKLOG_TOKEN}`,
        "Content-Type": "application/json",
        "User-Agent": "koorevaar.com-backlog-worker"
      },
      body: JSON.stringify({
        query,
        variables: { owner: BACKLOG_OWNER, number: BACKLOG_PROJECT_NUMBER }
      })
    });

    if (!res.ok) throw new Error(`GitHub API responded ${res.status}`);
    const payload = await res.json();
    if (payload.errors) throw new Error(payload.errors.map(e => e.message).join("; "));

    const nodes = payload.data?.user?.projectV2?.items?.nodes ?? [];
    const items = nodes
      .map(node => {
        const fields = {};
        for (const fv of node.fieldValues?.nodes ?? []) {
          if (fv?.field?.name) fields[fv.field.name] = fv.name;
        }
        return {
          title: node.content?.title ?? "",
          description: node.content?.body ?? "",
          status: fields["Status"] ?? "",
          visibility: fields["Visibility"] ?? ""
        };
      })
      .filter(item => item.title && item.visibility !== "Private")
      .map(({ title, description, status }) => ({ title, description, status }));

    return Response.json(
      { items },
      { headers: { "Cache-Control": "public, max-age=300" } }
    );
  } catch (err) {
    console.error("backlog error:", err.message);
    return Response.json({ items: [] });
  }
}

async function handleHoneypot(request, env) {
  try {
    const ip = request.headers.get("CF-Connecting-IP") || "0.0.0.0";
    const ua = request.headers.get("User-Agent") || "";
    const { day, hash } = await dailyVisitorHash(ip, ua, env.VISITOR_HASH_SALT);
    await env.DB.prepare(
      `INSERT OR IGNORE INTO honeypot_hits (visit_day, visitor_hash, hit_at)
       VALUES (?, ?, ?)`
    ).bind(day, hash, new Date().toISOString()).run();
  } catch (err) {
    console.error("honeypot error:", err.message);
  }
  return new Response("Not Found", { status: 404 }); // never reveal it's a trap
}

// Daily-rotating hash: no cookies, no raw IP stored, dedupes one visit per
// visitor per UTC day without any way to correlate a visitor across days.
async function dailyVisitorHash(ip, ua, salt) {
  const day = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD' UTC
  const enc = new TextEncoder().encode(`${ip}|${ua}|${day}|${salt}`);
  const digest = await crypto.subtle.digest("SHA-256", enc);
  const hash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
  return { day, hash };
}
