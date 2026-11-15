// src/index.js
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const providedKey = request.headers.get("X-API-Key");

    /*let OLLAMA_API_KEY;
    try {
      OLLAMA_API_KEY = await env.SECRET_STORE.get("OLLAMA_API_KEY");
    } catch (e) {
      console.error("Failed to read secret:", e);
      return new Response("Secret configuration error", { status: 500 });
    }

    if (!OLLAMA_API_KEY) {
      return new Response("API Key not configured", { status: 500 });
    }

    if (!providedKey || providedKey !== OLLAMA_API_KEY) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { 
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }*/

    const clientIP = request.headers.get("CF-Connecting-IP") || "unknown";

    const { success } = await env.RATE_LIMITER.limit({ 
      key: clientIP
    });

    if (!success) {
      return new Response("Rate limit exceeded", { status: 429 });
    }

    // We'll fill this after first deployment
    const allowedIPs = [
      "20.54.139.218"
    ];

    if (allowedIPs.length > 0 && (!clientIP || !allowedIPs.includes(clientIP))) {
      return new Response("Forbidden", { status: 403 });
    }

    if (path === "/api/version") {
      return Response.json({ version: "0.3.0" });
    }

    if (path !== "/api/generate") {
      return new Response("Not Found", { status: 404 });
    }

    let body;
    try {
      // Try to parse JSON with better error message
      const rawBody = await request.text();
      body = JSON.parse(rawBody);
    } catch (e) {
      return Response.json({
        error: "Invalid JSON",
        message: "Could not parse request body. Make sure you're sending valid JSON (use lowercase true/false)."
      }, { status: 400 });
    }

    try {
      const prompt = (body.prompt || "").trim();
      const stream = body.stream === true || body.stream === "true";

      if (!prompt) {
        return Response.json({ error: "prompt is required" }, { status: 400 });
      }

      const modelMatch = prompt.match(/You are a\s*(.*?)\s*(?:model.)/s);
      const modelText = modelMatch ? modelMatch[1].trim() : null;

      const match = prompt.match(/Text:\s*(.*?)\s*(?:Respond|Return)/s);
      const typedText = match ? match[1].trim() : null;      

      if (typedText === "hi" && modelText === "language detection") {
        return Response.json({
          model: body.model || "text-intelligence",
          created_at: new Date().toISOString(),
          response: "{ \"language\": \"en\" }",
          done: true,
          done_reason: "stop",
          total_duration: 650000000,
          load_duration: 25000000,
          prompt_eval_count: prompt.length,
          eval_count: 60,
          stream: stream
        });        
      }

      try {        
        await env.EMAIL.send({
          from: "patrick@koorevaar.com",
          to: "pret75@icloud.com",
          subject: "Text analytics API used",
          text: modelText + " " + typedText,
        });        
      }
      catch (err) {
        console.error("💥 Email Error:", err.message);
      }

      env.DB.prepare(`
          INSERT INTO requests (timestamp, prompt_text, model, client_ip)
          VALUES (?, ?, ?, ?)
        `).bind(
          new Date().toISOString(),
          typedText.substring(0, 5000),   // truncate if needed
          modelText,
          request.headers.get("CF-Connecting-IP")
        ).run().catch(err => console.error("Logging failed:", err));

      // gemma-4 replaces llama-3.1-8b-instruct-fp8 (deprecated 2026-11-20).
      // It must get chat `messages`: a raw `prompt` makes it return rows of
      // "}" (tested 2026-11-13). enable_thinking=false stops it from spending
      // max_tokens on reasoning, which would leave the answer empty.
      const aiOptions = {
        messages: [{ role: "user", content: prompt }],
        max_tokens: parseInt(body.max_tokens) || 300,
        temperature: parseFloat(body.temperature) || 0.0,
        chat_template_kwargs: { enable_thinking: false },
      };

      const aiResponse = await env.AI.run("@cf/google/gemma-4-26b-a4b-it", aiOptions);

      // Llama-family models answer in `response`, gemma-4 in an OpenAI-style
      // `choices[0].message.content`.
      let rawText = aiResponse.response || aiResponse.text
        || aiResponse.choices?.[0]?.message?.content || "";

      // Clean up common model issues
      rawText = rawText.replace(/```json\s*|\s*```/g, "").trim();

      return Response.json({
        model: body.model || "text-intelligence",
        created_at: new Date().toISOString(),
        response: rawText,
        done: true,
        done_reason: "stop",
        total_duration: 650000000,
        load_duration: 25000000,
        prompt_eval_count: prompt.length,
        eval_count: 60,
        stream: stream
      });

    } catch (err) {
      console.error("Worker Error:", err);
      return Response.json({
        error: "Internal server error",
        message: err.message
      }, { status: 500 });
    }
  }
};