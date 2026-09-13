# Handover: "Ask about Patrick" chat widget

Context for integrating this into the koorevaar.com site. Written by a Claude Code session working in a separate repo (`Pat.Aca.BlogServiceApi`), which owns the backend this widget talks to — that session, and that repo, are not available from here, so this doc is meant to be self-contained.

## What was integrated

Two pieces landed in this repo:
- [public/assistant-widget.js](public/assistant-widget.js) — the whole widget. Vanilla JS, no build step, no dependencies. Injects its own floating button, chat panel, and scoped CSS into the page.
- A `<script>` tag near the end of [public/index.html](public/index.html), just before `</body>`.

Read `assistant-widget.js` top-to-bottom before changing anything — it's short and every non-obvious decision has a comment explaining why, not just what.

## Status of the two things this widget cannot work without

1. **Turnstile site key for this domain — done.** `data-turnstile-sitekey` in [public/index.html](public/index.html) is set to the real key (`0x4AAAAAAEuW1UZyrV4YDywH`). This assumes that Turnstile widget's allowed hostnames (Cloudflare dashboard → Turnstile) already include `www.koorevaar.com` — worth a quick check in the dashboard if Turnstile verification fails unexpectedly.
2. **A CORS fix on the backend Worker — still pending.** The backend (`assistant-worker`, in `Pat.Aca.BlogServiceApi/Cloudflare/assistant-worker`, a sibling Cloudflare Worker in a different repo) had zero CORS headers until another session added them, on branch `feature/assistant-worker-cors`, scoped to exactly `https://www.koorevaar.com`. That branch was committed but **not pushed, not merged, not deployed** — the sandbox that built it had no GitHub push access. Until it's live, every `fetch()` from this widget will be silently blocked by the browser's own CORS check, no matter how correct this widget's code is. If testing and every request fails with a generic network error (not a 429/403/500 the widget can display), check devtools for a CORS error specifically, not just "failed to fetch".

This second one isn't something to work around from this side — it has to be pushed, merged, and deployed in the other repo. Until it is, the widget will fail closed (CORS block) and is safe to leave live in the page.

## Backend contract (`assistant-worker`, endpoint `https://ai-assistant.koorevaar.com/ask`)

`POST`, JSON body:
```json
{ "question": "string, required", "turnstileToken": "string, required", "allowLogging": false }
```

Responses:
- `200` — `{ "answer": "string", "chunks": [...], "cache": "hit" | "miss" }`. Only `answer` matters to the widget; `chunks` is retrieval debug info, not meant for display.
- `400` — malformed body (empty/missing question). Shouldn't happen from this widget's own validation, but don't assume it can't.
- `403` — Turnstile verification failed. Expect this in early testing before the site key/hostname is configured — it's not a bug in the widget.
- `429` — rate limited, 20 requests per IP per 10 minutes, fixed window. Real during testing if you fire requests in a loop; not a sign of anything broken.
- Network-level failure with no response at all — almost certainly the CORS gap above, not a widget bug.

Turnstile tokens are **single-use**: one token per question, not one for the whole session. The widget already handles this (invisible Turnstile, `execution: 'execute'`, a fresh `execute()` + `reset()` right before each send) — don't try to cache or reuse a token across questions if modifying this.

The assistant only answers in English or Dutch. A question in any other language gets an explicit redirect reply from the model itself ("I can only help in English or Dutch"), not a wrong-language guess. This is handled entirely server-side — the widget doesn't need any client-side language detection or restriction.

## Design intent worth preserving if the UI gets touched

- The "allow this conversation to be saved" checkbox is opt-in (unchecked by default) by deliberate design, not an oversight — questions that look abusive or like a prompt-injection attempt get logged server-side regardless of this checkbox, which is why the disclosure text sits right next to it rather than being buried in a privacy policy elsewhere.
- The widget is meant to feel like a small, unobtrusive corner chat, not a dedicated page — that's a stated product decision (a floating widget, not a `/chat` route), not just how it happened to get built.

## One implementation detail to preserve

The script reads its config via `document.currentScript.getAttribute(...)` at the top level, synchronously, during initial script execution. This only works because the script tag is a plain classic script (not `type="module"`) and the reading happens before any `await`/async boundary. If this ever gets converted to a module or the config-reading code gets moved into an async callback, `document.currentScript` will be `null` by then and the widget will silently fail to find its site key. Keep the config-reading at the very top of the IIFE if this gets refactored.

## Remaining follow-ups before this is live

1. ~~Create/reuse a Turnstile widget with `www.koorevaar.com` allowed, and paste its site key into `data-turnstile-sitekey`.~~ Done — real site key is in [public/index.html](public/index.html).
2. Push, merge, and deploy the `feature/assistant-worker-cors` branch in the `Pat.Aca.BlogServiceApi` repo.
3. Once that's done, do a real end-to-end browser test (ask a question, confirm a 200 with an answer, confirm the 429 and non-English/Dutch redirect paths behave as documented above).
