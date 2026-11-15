const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key",
  "Content-Type": "application/json"
};

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      ...corsHeaders,
      ...extraHeaders
    }
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    if (url.pathname === "/health" && request.method === "GET") {
      return json({
        ok: true,
        service: "advisor-ai-agent",
        message: "Worker is running"
      });
    }

    if (url.pathname !== "/analyze") {
      return json({
        ok: false,
        error: "Not found"
      }, 404);
    }

    if (request.method !== "POST") {
      return json({
        ok: false,
        error: "Method not allowed"
      }, 405);
    }

    let API_KEY;
    try {
      API_KEY = await env.CAP_ADVISOR_API_KEY.get("CAP_ADVISOR_API_KEY");
    } catch (e) {
      console.error("Failed to read secret:", e);
      return new Response("Secret configuration error", { status: 500 });
    }

    const apiKey = request.headers.get("x-api-key");
    if (!apiKey || apiKey !== API_KEY) {
      return json({
        ok: false,
        error: "Unauthorized"
      }, 401);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({
        ok: false,
        error: "Invalid JSON body"
      }, 400);
    }

    // gemma-4 replaces llama-3.1-8b-instruct-fast, an undocumented alias
    // (checked 2026-11-13; the 8B Llama models are being retired).
    //
    // Two gemma-4 specifics, both tested 2026-11-13:
    // - response_format json_schema is NOT passed on: with it the model got
    //   stuck in endless blank lines in 3 of 4 runs (30 s, 1600 tokens, invalid
    //   JSON). The schema goes into the prompt and json_object mode keeps the
    //   output valid JSON (6 of 6 runs, 1 to 5 s).
    // - enable_thinking=false, or the reasoning uses the token budget.
    const schema = body.response_format?.type === "json_schema"
      ? body.response_format.json_schema?.schema
      : undefined;

    const messages = schema
      ? [
          ...body.messages,
          {
            role: "system",
            content:
              "Return ONLY one JSON object that matches this JSON schema, with " +
              "no markdown and no extra text: " + JSON.stringify(schema)
          }
        ]
      : body.messages;

    const aiResult = await env.AI.run(
      "@cf/google/gemma-4-26b-a4b-it",
      {
        messages,
        "max_tokens": 1600,
        "temperature": 0.1,
        response_format: schema ? { type: "json_object" } : body.response_format,
        chat_template_kwargs: { enable_thinking: false }
      }
    );

    console.info(aiResult);

    return json({
      result: {
        response: normalizeResponse(aiResult)
      }
    });
  }
};

// Llama models answered in `response` (already a parsed object in JSON mode),
// gemma-4 answers in `choices[0].message.content` as text. Return the same as
// before: a parsed object when the text is JSON, otherwise the text itself
// (the .NET client handles both).
function normalizeResponse(aiResult) {
  if (aiResult.response !== undefined) {
    return aiResult.response;
  }

  const text = aiResult.choices?.[0]?.message?.content ?? "";
  const cleaned = text.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    return text;
  }
}