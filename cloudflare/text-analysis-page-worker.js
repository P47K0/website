const LAST_CALL_KEY = 'aca:last-call';
const THRESHOLD_MS = 5 * 60 * 1000; // 5min

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.toLowerCase();

    // === Serve Demo Page ===
    if (path === "/" || path === "/demo" || path === "/demo.html") {
      ctx.waitUntil(maybeWarm(env));
      return new Response(demoHTML, {
        headers: { "Content-Type": "text/html; charset=UTF-8" }
      });
    }

    // === Handle Preflight (OPTIONS) requests ===
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
          "Access-Control-Max-Age": "86400",
        }
      });
    }    

    // === Proxy to ACA API ===
    if (path === "/sentiment" || path === "/detect-language") {
      const apiUrl = `https://text-intelligence-api.whitewater-2e220d9b.westeurope.azurecontainerapps.io${path}`;

      try {
        const response = await fetch(apiUrl, {
          method: request.method,
          headers: {
            "Content-Type": "application/json",
          },
          body: request.body,
        });

        const newResponse = new Response(response.body, response);

        // Add CORS headers
        newResponse.headers.set("Access-Control-Allow-Origin", "*");
        newResponse.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        newResponse.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key");

        return newResponse;

      } catch (err) {
        return new Response("Proxy Error: " + err.message, { 
          status: 502,
          headers: { "Access-Control-Allow-Origin": "*" }
        });
      }
    }

    return new Response("Not Found", { status: 404 });
  }
};

async function maybeWarm(env) {  
    const lastStr = await env.KV.get(LAST_CALL_KEY);
    const now = Date.now();
    console.log("Warmup...")
    if (!lastStr || now - Date.parse(lastStr) > THRESHOLD_MS) {
      await fetch('https://text-intelligence-api.whitewater-2e220d9b.westeurope.azurecontainerapps.io/detect-language', {
        method: 'POST',
        body: JSON.stringify({text: 'hi'}),
        headers: {'Content-Type': 'application/json'}
      }).catch(e => console.error('Warmup failed'));
      await env.KV.put(LAST_CALL_KEY, new Date().toISOString(), {expirationTtl: 3600});
    }
  }

const favicon = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='%2301696f' class='bi bi-question-circle' viewBox='0 0 16 16'%3E%3Cpath d='M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16'/%3E%3Cpath d='M5.255 5.786a.237.237 0 0 0 .241.247h.825c.138 0 .248-.113.266-.25.09-.656.54-1.134 1.342-1.134.686 0 1.314.343 1.314 1.168 0 .635-.374.927-.965 1.371-.673.489-1.206 1.06-1.168 1.987l.003.217a.25.25 0 0 0 .25.246h.811a.25.25 0 0 0 .25-.25v-.105c0-.718.273-.927 1.01-1.486.609-.463 1.244-.977 1.244-2.056 0-1.511-1.276-2.241-2.673-2.241-1.267 0-2.655.59-2.75 2.286m1.557 5.763c0 .533.425.927 1.01.927.609 0 1.028-.394 1.028-.927 0-.552-.42-.94-1.029-.94-.584 0-1.009.388-1.009.94'/%3E%3C/svg%3E`;

// ==================== DEMO HTML ====================
const demoHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Text Analysis Demo</title>
  <link rel="icon" href="${favicon}" type="image/svg+xml">
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 py-12">
  <div class="max-w-2xl mx-auto px-6">
    <!-- Home Button -->
    <div class="flex justify-end mb-6">
      <a href="https://www.koorevaar.com" 
         class="flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-gray-50 border border-gray-300 rounded-2xl text-gray-700 hover:text-blue-600 transition font-medium shadow-sm">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1v-5m10-10l2 2m-2-2v10a1 1 0 01-1 1v-5m-6 0a1 1 0 001-1v5" />
        </svg>
        Home
      </a>
    </div>

    <h1 class="text-4xl font-bold text-center mb-2">Text Analysis Demo</h1>
    <p class="text-center text-gray-600 mb-8">Azure Container Apps + Cloudflare Workers AI</p>

    <div class="bg-white rounded-2xl shadow p-8">
      <textarea id="text" rows="6" class="w-full p-4 border rounded-xl text-lg" placeholder="Enter text here..."></textarea>
      
      <div class="flex gap-4 mt-6">
        <button onclick="analyze('sentiment')" class="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl font-semibold">Sentiment Analysis</button>
        <button onclick="analyze('language')" class="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-4 rounded-xl font-semibold">Detect Language</button>
      </div>

      <div id="result" class="mt-8 min-h-[140px]"></div>
    </div>
  </div>

  <script>
    async function analyze(type) {
      const text = document.getElementById('text').value.trim();
      const resultDiv = document.getElementById('result');
      if (!text) return;

      resultDiv.innerHTML = '<p class="text-center py-8 text-gray-500">Analyzing...</p>';

      const endpoint = type === 'sentiment' ? '/sentiment' : '/detect-language';

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text })
        });

        const data = await res.json();

        if (type === 'sentiment') {
          resultDiv.innerHTML = \`<div class="p-6 rounded-2xl border-l-8 border-blue-500 bg-white"><strong class="text-3xl">\${data.sentiment || 'NEUTRAL'}</strong></div>\`;
        } else {
          resultDiv.innerHTML = \`<div class="p-6 rounded-2xl border-l-8 border-purple-500 bg-white"><strong class="text-3xl">\${(data.language || 'unknown').toUpperCase()}</strong></div>\`;
        }
      } catch (err) {
        resultDiv.innerHTML = \`<div class="p-6 bg-red-50 border border-red-300 rounded-2xl"><p class="text-red-600">Error</p></div>\`;
      }
    }
  </script>
</body>
</html>`;