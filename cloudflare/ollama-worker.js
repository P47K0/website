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

    const clientIP = request.headers.get("CF-Connecting-IP");

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

      try {
        await env.EMAIL.send({
          from: "patrick@koorevaar.com",
          to: "pkoorevaar@hotmail.com",
          subject: "Text analytics API used",
          text: modelText,
        });
      }
      catch (err) {
        console.error("Email Error:", err.message);
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

      const aiOptions = {
        prompt: prompt,
        max_tokens: parseInt(body.max_tokens) || 300,
        temperature: parseFloat(body.temperature) || 0.0,
      };

      const aiResponse = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", aiOptions);

      let rawText = aiResponse.response || aiResponse.text || "";

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