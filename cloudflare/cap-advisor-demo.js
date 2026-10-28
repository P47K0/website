const LAST_CALL_KEY = 'aca:last-call';
const THRESHOLD_MS = 5 * 60 * 1000; // 5min

const ASSESSMENT_ENDPOINT = "https://capacity-advisor.whitewater-2e220d9b.westeurope.azurecontainerapps.io";
const SIMULATION_ENDPOINT = "https://capacity-simulator.whitewater-2e220d9b.westeurope.azurecontainerapps.io";

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function demoUnavailableResponse() {
  return new Response(JSON.stringify({ unavailable: true, message: "Demo currently not available" }), {
    status: 503,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "retry-after": "3600"
    }
  });
}

function shouldProxy(pathname) {
  return (
    pathname === "/hubs/advisor" ||
    pathname.startsWith("/hubs/advisor/") ||
    pathname === "/api" ||
    pathname.startsWith("/api/")
  );
}

// Helper function to remove resourceId recursively from objects
function removeResourceId(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => removeResourceId(item));
  }
  
  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key.toLowerCase() !== 'resourceid') {
      cleaned[key] = removeResourceId(value);
    }
  }
  return cleaned;
}

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);

      if (url.pathname === '/robots.txt') {
        return new Response(
          'User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /hubs/\n',
          {
            headers: {
              'Content-Type': 'text/plain; charset=utf-8',
              'Cache-Control': 'public, max-age=86400',
            },
          },
        );
      }

      if (url.pathname === "/") {
        return new Response(demoHTML, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      }

      if (shouldProxy(url.pathname)) {
        try {
          const response = await proxyToAca(request, env);

          // 5xx from the ingress means the container did not start (e.g. Azure credits ran out).
          if (response.status >= 500) {
            return demoUnavailableResponse();
          }

          return response;
        } catch (err) {
          console.error("ACA unreachable:", err);
          return demoUnavailableResponse();
        }
      }

      return new Response("Not found", { status: 404 });
    } catch (error) {
      return json({
        error: "Worker fetch failed",
        message: error instanceof Error ? error.message : String(error)
      }, 500);
    }
  },
};

async function proxyToAca(request, env) {
  const incomingUrl = new URL(request.url);
  const path = incomingUrl.pathname.toLowerCase();

  if (path === "/hubs/advisor" || path.startsWith("/hubs/advisor/")) {
    const upstreamUrl = new URL(incomingUrl.pathname + incomingUrl.search, ASSESSMENT_ENDPOINT);

    const response = await fetch(upstreamUrl.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "manual",
    });

    // Filter resourceId from SignalR responses
    if (response.headers.get("content-type")?.includes("application/json")) {
      const data = await response.json();
      const cleanedData = removeResourceId(data);
      return json(cleanedData, response.status);
    }

    return response;
  }

  if (path === "/api/simulation/start" || path === "/api/simulation/stop" || path === "/api/simulation/status") {
    const upstreamUrl = new URL(incomingUrl.pathname + incomingUrl.search, SIMULATION_ENDPOINT);
    const headers = new Headers(request.headers);
    headers.set("X-Api-Key", await env.SIMULATION_API_KEY.get());

    const response = await fetch(upstreamUrl.toString(), {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "manual",
    });

    // Filter resourceId from simulation responses
    if (response.headers.get("content-type")?.includes("application/json")) {
      const data = await response.json();
      const cleanedData = removeResourceId(data);
      return json(cleanedData, response.status);
    }

    return response;
  }

  if (path === "/api/assessment/run") {
    const upstreamUrl = new URL(incomingUrl.pathname + incomingUrl.search, ASSESSMENT_ENDPOINT);
    const headers = new Headers(request.headers);
    headers.set("X-ApiKey", await env.ASSESSMENT_API_KEY.get());

    if (path === "/api/assessment/run" && request.method.toUpperCase() === "POST") {
      env.DB.prepare(`
        INSERT INTO demo_executions (demo_name, feature_name, executed_at, client_hash)
        VALUES (?, ?, ?, ?)
        `).bind(
        "advisor-assessment",
        "start",
        new Date().toISOString(),
        request.headers.get("CF-Connecting-IP")
      ).run().catch(err => console.error("Logging failed:", err));
    }

    const response = await fetch(upstreamUrl.toString(), {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "manual",
    });

    // Filter resourceId from assessment responses
    if (response.headers.get("content-type")?.includes("application/json")) {
      const data = await response.json();
      const cleanedData = removeResourceId(data);
      return json(cleanedData, response.status);
    }

    return response;
  }

  return new Response("Not found", { status: 404 });
}

const demoHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Advisor Assessment Demo</title>
  <link rel="icon" href="data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%2064%2064%22%3E%3Crect%20x%3D%228%22%20y%3D%2212%22%20width%3D%2248%22%20height%3D%2240%22%20rx%3D%2210%22%20fill%3D%22%2301696f%22/%3E%3Cpath%20d%3D%22M18%2040l8-10%208%206%2012-16%22%20fill%3D%22none%22%20stroke%3D%22white%22%20stroke-width%3D%225%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22/%3E%3C/svg%3E" type="image/svg+xml" />
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/microsoft-signalr/8.0.7/signalr.min.js"></script>
</head>
<body class="bg-gray-100 py-12 text-gray-900">
  <div class="max-w-7xl mx-auto px-6">
    <div class="flex justify-end mb-6">
      <a href="https://www.koorevaar.com" rel="noopener noreferrer"
         class="flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-gray-50 border border-gray-300 rounded-2xl text-gray-700 hover:text-teal-700 transition font-medium shadow-sm">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1v-5m10-10l2 2m-2-2v10a1 1 0 01-1 1v-5m-6 0a1 1 0 001-1v5" />
        </svg>
        Home
      </a>
    </div>


    <h1 class="text-4xl font-bold text-center mb-2">Advisor Assessment Demo</h1>
    <p class="text-center text-gray-600 mb-8">Simulation control, demo progress, advisor assessment, and SignalR real-time events</p>


    <div id="unavailableBanner" class="hidden mb-6 p-5 rounded-2xl bg-amber-50 border-2 border-amber-400 text-center">
      <p class="text-lg font-bold text-amber-800">Demo currently not available</p>
      <p class="text-sm text-amber-700 mt-1">The hosting behind this demo is paused for now. Please check back later.</p>
    </div>

    <div class="bg-white rounded-2xl shadow p-8 space-y-6">
      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <button id="startSimulationBtn" class="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed text-white py-4 rounded-xl font-semibold transition">Start simulation</button>
        <button id="cancelSimulationBtn" class="bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 disabled:cursor-not-allowed text-white py-4 rounded-xl font-semibold transition">Cancel simulation</button>
        <button id="runAssessmentBtn" class="bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 disabled:cursor-not-allowed text-white py-4 rounded-xl font-semibold transition">Run assessment</button>
      </div>


      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-7 gap-4">
        <div class="p-4 rounded-2xl bg-gray-50 border border-gray-200">
          <p class="text-sm text-gray-500">Status</p>
          <p id="status" class="text-xl font-semibold mt-1 text-gray-900">Connecting</p>
        </div>
        <div class="p-4 rounded-2xl bg-gray-50 border border-gray-200">
          <p class="text-sm text-gray-500">Events</p>
          <p id="eventCount" class="text-xl font-semibold mt-1 text-gray-900">0</p>
        </div>
        <div class="p-4 rounded-2xl bg-gray-50 border border-gray-200">
          <p class="text-sm text-gray-500">Simulation</p>
          <p id="simulationState" class="text-sm font-semibold mt-1 text-gray-900 break-words">Idle</p>
        </div>
        <div class="p-4 rounded-2xl bg-gray-50 border border-gray-200">
          <p class="text-sm text-gray-500">Assessment</p>
          <p id="assessmentStatus" class="text-sm font-semibold mt-1 text-gray-900 break-words">Idle</p>
        </div>
        <div class="p-4 rounded-2xl bg-gray-50 border border-gray-200">
          <p class="text-sm text-gray-500">Elapsed</p>
          <p id="elapsedNow" class="text-xl font-semibold mt-1 text-gray-900">0s</p>
        </div>
        <div class="p-4 rounded-2xl bg-gray-50 border border-gray-200">
          <p class="text-sm text-gray-500">CPU</p>
          <p id="cpuNow" class="text-xl font-semibold mt-1 text-gray-900">-</p>
        </div>
        <div class="p-4 rounded-2xl bg-gray-50 border border-gray-200">
          <p class="text-sm text-gray-500">Memory</p>
          <p id="memNow" class="text-xl font-semibold mt-1 text-gray-900">-</p>
        </div>
      </div>


      <div class="rounded-2xl border border-gray-200 bg-gray-50 p-5">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-xl font-semibold">Simulation progress</h2>
          <span id="progressMeta" class="text-sm text-gray-500">0s / 0s</span>
        </div>


        <div class="rounded-2xl bg-white border border-gray-200 p-5 space-y-4">
          <div class="w-full h-6 rounded-full bg-gray-200 overflow-hidden">
            <div id="progressBar" class="h-full rounded-full bg-teal-600 transition-all duration-500 ease-out" style="width: 0%;"></div>
          </div>


          <div class="grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
            <div class="text-gray-600">
              Progress:
              <span id="progressPercent" class="font-semibold text-gray-900">0%</span>
            </div>
            <div class="text-gray-600">
              Ramp-up:
              <span id="rampUpNow" class="font-semibold text-gray-900">0s</span>
            </div>
            <div class="text-gray-600">
              Duration:
              <span id="durationNow" class="font-semibold text-gray-900">0s</span>
            </div>
            <div class="text-gray-600">
              Scenario:
              <span id="scenarioNow" class="font-semibold text-gray-900">-</span>
            </div>
          </div>
        </div>
      </div>


      <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div class="rounded-2xl border border-gray-200 bg-gray-50 p-5">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-xl font-semibold">Advisor assessment</h2>
            <button id="clearAssessmentBtn" class="px-4 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 transition">Clear</button>
          </div>
          <div id="assessmentPanel" class="min-h-[260px] max-h-[260px] overflow-auto rounded-2xl bg-white border border-gray-200 p-4 whitespace-pre-wrap text-sm text-gray-800"></div>
        </div>


        <div>
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-xl font-semibold">SignalR log</h2>
            <button id="clearLogBtn" class="px-4 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 transition">Clear</button>
          </div>
          <div id="log" class="min-h-[260px] max-h-[260px] overflow-auto rounded-2xl bg-gray-900 text-gray-100 p-4 font-mono text-sm whitespace-pre-wrap"></div>
        </div>
      </div>
    </div>
  </div>


  <script>
    const HUB_URL = '/hubs/advisor';
    const START_SIMULATION_ENDPOINT = '/api/simulation/start';
    const CANCEL_SIMULATION_ENDPOINT = '/api/simulation/stop';
    const SIMULATION_STATUS_ENDPOINT = '/api/simulation/status';
    const RUN_ASSESSMENT_ENDPOINT = '/api/assessment/run';


    let connection = null;
    let events = 0;
    let simulationRunning = false;
    let assessmentRunning = false;
    let currentSimulationRequest = null;


    let statusPollTimer = null;
    let statusPollActive = false;
    let connectPromise = null;
    let demoUnavailable = false;
    let keepCompletedProgress = false;


    const statusEl = document.getElementById('status');
    const eventCountEl = document.getElementById('eventCount');
    const simulationStateEl = document.getElementById('simulationState');
    const assessmentStatusEl = document.getElementById('assessmentStatus');
    const elapsedNowEl = document.getElementById('elapsedNow');
    const cpuNowEl = document.getElementById('cpuNow');
    const memNowEl = document.getElementById('memNow');
    const assessmentPanelEl = document.getElementById('assessmentPanel');
    const logEl = document.getElementById('log');


    const progressBarEl = document.getElementById('progressBar');
    const progressPercentEl = document.getElementById('progressPercent');
    const progressMetaEl = document.getElementById('progressMeta');
    const rampUpNowEl = document.getElementById('rampUpNow');
    const durationNowEl = document.getElementById('durationNow');
    const scenarioNowEl = document.getElementById('scenarioNow');


    const startSimulationBtn = document.getElementById('startSimulationBtn');
    const cancelSimulationBtn = document.getElementById('cancelSimulationBtn');
    const runAssessmentBtn = document.getElementById('runAssessmentBtn');


    function log(message, type = 'info') {
      const line = document.createElement('div');
      const timestamp = new Date().toLocaleTimeString();
      const color =
        type === 'error' ? 'text-red-300' :
        type === 'success' ? 'text-green-300' :
        type === 'action' ? 'text-sky-300' :
        type === 'warn' ? 'text-amber-300' :
        'text-gray-100';


      line.className = color;
      line.textContent = '[' + timestamp + '] ' + message;
      logEl.appendChild(line);
      logEl.scrollTop = logEl.scrollHeight;
      console.log(line.textContent);
    }


    function setStatus(text, cssClass) {
      statusEl.textContent = text;
      statusEl.className = 'text-xl font-semibold mt-1 ' + cssClass;
    }


    function incrementEvents() {
      events += 1;
      eventCountEl.textContent = String(events);
    }


    function setSimulationRunning(value) {
      simulationRunning = value;
      updateButtons();
    }


    function setAssessmentRunning(value, label) {
      assessmentRunning = value;
      if (assessmentStatusEl) {
        assessmentStatusEl.textContent = label || (value ? 'Running' : 'Idle');
      }
      updateButtons();
    }


    function isUnavailableError(error) {
      return error?.status >= 500 || error?.statusCode >= 500;
    }


    function showUnavailable() {
      if (demoUnavailable) return;
      demoUnavailable = true;
      stopStatusPolling();
      simulationRunning = false;
      assessmentRunning = false;
      document.getElementById('unavailableBanner').classList.remove('hidden');
      setStatus('Unavailable', 'text-amber-600');
      log('Demo currently not available.', 'error');
      updateButtons();
    }


    function updateButtons() {
      if (demoUnavailable) {
        startSimulationBtn.disabled = true;
        cancelSimulationBtn.disabled = true;
        runAssessmentBtn.disabled = true;
        return;
      }

      const connected = !!connection && connection.state === signalR.HubConnectionState.Connected;


      startSimulationBtn.disabled = simulationRunning;
      cancelSimulationBtn.disabled = !connected || !simulationRunning;
      runAssessmentBtn.disabled = false;
    }


    function formatMemory(value) {
      if (value == null || Number.isNaN(Number(value))) return '-';
      if (value >= 1024) {
        return (value / 1024).toFixed(2) + ' GB';
      }
      return Number(value).toFixed(0) + ' MB';
    }


    function resetProgress() {
      keepCompletedProgress = false;
      progressBarEl.style.width = '0%';
      progressPercentEl.textContent = '0%';
      progressMetaEl.textContent = '0s / 0s';
      elapsedNowEl.textContent = '0s';
      rampUpNowEl.textContent = '0s';
      durationNowEl.textContent = '0s';
      scenarioNowEl.textContent = '-';
    }


    function updateProgress(elapsedSeconds, durationSeconds, rampUpSeconds, scenarioName) {
      const elapsed = Math.max(0, Number(elapsedSeconds) || 0);
      const duration = Math.max(0, Number(durationSeconds) || 0);
      const rampUp = Math.max(0, Number(rampUpSeconds) || 0);
      const percent = duration > 0 ? Math.min(100, (elapsed / duration) * 100) : 0;


      progressBarEl.style.width = percent.toFixed(1) + '%';
      progressPercentEl.textContent = percent.toFixed(0) + '%';
      progressMetaEl.textContent = elapsed + 's / ' + duration + 's';
      elapsedNowEl.textContent = elapsed + 's';
      rampUpNowEl.textContent = rampUp + 's';
      durationNowEl.textContent = duration + 's';
      scenarioNowEl.textContent = scenarioName || '-';
    }


    function updateAssessmentMetrics(data) {
      const cpuPercent = data?.cpuUsagePercent;
      const memPercent = data?.memoryUsagePercent;
      const memMb = data?.snapshot?.memoryUsageMb;


      cpuNowEl.textContent = typeof cpuPercent === 'number' ? cpuPercent.toFixed(1) + '%' : '-';
      memNowEl.textContent =
        typeof memMb === 'number'
          ? formatMemory(memMb) + (typeof memPercent === 'number' ? ' (' + memPercent.toFixed(1) + '%)' : '')
          : '-';
    }


    function setAssessmentText(data) {
      if (data == null) {
        assessmentPanelEl.textContent = '';
        return;
      }


      if (typeof data === 'string') {
        assessmentPanelEl.textContent = data;
        return;
      }


      assessmentPanelEl.textContent = JSON.stringify(data, null, 2);
    }


    async function postJson(url, body) {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {})
      });


      const text = await response.text();
      let data = null;


      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text || null;
      }


      if (!response.ok) {
        const error = new Error(response.status + ' ' + response.statusText + (data ? ' - ' + JSON.stringify(data) : ''));
        error.status = response.status;
        throw error;
      }


      return { data, rawText: text };
    }


    async function getJson(url) {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });


      const text = await response.text();
      let data = null;


      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text || null;
      }


      if (!response.ok) {
        const error = new Error(response.status + ' ' + response.statusText + (data ? ' - ' + JSON.stringify(data) : ''));
        error.status = response.status;
        throw error;
      }


      return data;
    }


    function registerConnectionHandlers(conn) {
      conn.onreconnecting(() => {
        setStatus('Reconnecting', 'text-amber-600');
        log('SignalR reconnecting...', 'warn');
        updateButtons();
      });


      conn.onreconnected(() => {
        setStatus('Connected', 'text-green-600');
        log('SignalR reconnected.', 'success');
        updateButtons();
      });


      conn.onclose(() => {
        setStatus('Disconnected', 'text-gray-900');
        log('SignalR disconnected.');
        connection = null;
        updateButtons();
      });


      conn.on('AssessmentStarted', data => {
        incrementEvents();
        setAssessmentRunning(true, 'Running');
        log('[AssessmentStarted] ' + JSON.stringify(data), 'success');
      });


      conn.on('AssessmentCompleted', data => {
        incrementEvents();
        setAssessmentRunning(false, 'Completed');
        const assessment = data?.assessment ?? data;
        setAssessmentText(assessment);
        updateAssessmentMetrics(assessment);
        log('[AssessmentCompleted] ' + JSON.stringify(data), 'success');
      });


      conn.on('AssessmentCancelled', data => {
        incrementEvents();
        setAssessmentRunning(false, 'Cancelled');
        log('[AssessmentCancelled] ' + JSON.stringify(data), 'warn');
      });


      conn.on('LogMessage', data => {
        incrementEvents();
        if (typeof data === 'string') {
          log(data);
        } else {
          log('[LogMessage] ' + JSON.stringify(data));
        }
      });


      conn.on('Error', message => {
        incrementEvents();
        log('[Error] ' + (typeof message === 'string' ? message : JSON.stringify(message)), 'error');
      });
    }


    async function connect() {
      if (connection && connection.state === signalR.HubConnectionState.Connected) {
        return connection;
      }


      if (connectPromise) {
        return connectPromise;
      }


      connectPromise = (async () => {
        if (!connection) {
          connection = new signalR.HubConnectionBuilder()
            .withUrl(HUB_URL)
            .withAutomaticReconnect([0, 2000, 10000, 30000])
            .build();


          registerConnectionHandlers(connection);
        }


        if (connection.state === signalR.HubConnectionState.Disconnected) {
          setStatus('Connecting', 'text-sky-600');
          await connection.start();
          setStatus('Connected', 'text-green-600');
          log('SignalR connected.', 'success');
        }


        updateButtons();
        return connection;
      })();


      try {
        return await connectPromise;
      } catch (error) {
        connection = null;
        if (isUnavailableError(error)) {
          showUnavailable();
          throw error;
        }
        setStatus('Failed', 'text-red-600');
        log('Connect failed: ' + error.message, 'error');
        updateButtons();
        throw error;
      } finally {
        connectPromise = null;
      }
    }


    async function ensureConnected() {
      if (connection && connection.state === signalR.HubConnectionState.Connected) {
        return;
      }
      await connect();
    }


    async function disconnect() {
      stopStatusPolling();


      if (!connection) return;


      try {
        await connection.stop();
      } finally {
        connection = null;
        setStatus('Disconnected', 'text-gray-900');
        log('Disconnected.');
        updateButtons();
      }
    }


    async function startSimulation() {
      try {
        await ensureConnected();


        const payload = {
          scenarioName: 'demo-load',
          cpuTargetPercent: 100,
          memoryTargetMb: 250,
          rampUpSeconds: 45,
          durationSeconds: 60,
          autoStop: true
        };


        currentSimulationRequest = payload;


        resetProgress();
        cpuNowEl.textContent = '-';
        memNowEl.textContent = '-';
        simulationStateEl.textContent = 'Starting';
        assessmentPanelEl.textContent = '';
        setAssessmentRunning(false, 'Idle');
        updateProgress(0, payload.durationSeconds, payload.rampUpSeconds, payload.scenarioName);


        log('Starting simulation: ' + JSON.stringify(payload), 'action');


        const result = await postJson(START_SIMULATION_ENDPOINT, payload);
        log('Start response: ' + (result.rawText || ''), 'action');


        setSimulationRunning(true);
        startStatusPolling();
      } catch (error) {
        if (demoUnavailable || isUnavailableError(error)) {
          showUnavailable();
          return;
        }
        log('Start simulation failed: ' + error.message, 'error');
      }
    }


    async function cancelSimulation() {
      try {
        log('Cancelling simulation...', 'action');
        const result = await postJson(CANCEL_SIMULATION_ENDPOINT, {});
        log('Cancel simulation response: ' + (result.rawText || ''), 'action');
        startStatusPolling();
      } catch (error) {
        if (demoUnavailable || isUnavailableError(error)) {
          showUnavailable();
          return;
        }
        log('Cancel simulation failed: ' + error.message, 'error');
      }
    }


    async function runAssessment() {
      try {
        await ensureConnected();


        log('Running advisor assessment...', 'action');
        setAssessmentRunning(true, 'Running');


        const result = await postJson(RUN_ASSESSMENT_ENDPOINT, {});
        if (result.data) {
          const assessment = result.data.assessment || result.data;
          setAssessmentText(assessment);
          updateAssessmentMetrics(assessment);
        }


        log('Assessment response: ' + (result.rawText || ''), 'action');
      } catch (error) {
        if (demoUnavailable || isUnavailableError(error)) {
          showUnavailable();
          return;
        }
        setAssessmentRunning(false, 'Failed');
        log('Run assessment failed: ' + error.message, 'error');
      }
    }


    function isTerminalSimulationState(state) {
      if (!state) return false;
      const normalized = String(state).toLowerCase();
      return normalized === 'idle' ||
               normalized === 'completed' ||
               normalized === 'cancelled' ||
               normalized === 'stopped' ||
               normalized === 'failed';
    }


    function applySimulationStatus(data) {
      if (!data || typeof data !== 'object') return;


      const state = data.state || 'Unknown';
      const normalized = String(state).toLowerCase();


      const elapsed = typeof data.elapsedSeconds === 'number' ? data.elapsedSeconds : 0;
      const duration =
        typeof data.durationSeconds === 'number'
          ? data.durationSeconds
          : (currentSimulationRequest?.durationSeconds || 0);
      const rampUp =
        typeof data.rampUpSeconds === 'number'
          ? data.rampUpSeconds
          : (currentSimulationRequest?.rampUpSeconds || 0);
      const scenario = data.scenarioName || currentSimulationRequest?.scenarioName || '-';


      if (keepCompletedProgress && (normalized === 'idle' || normalized === 'unknown')) {
        simulationStateEl.textContent = 'Completed';
        return;
      }


      simulationStateEl.textContent = state;


      if (normalized === 'completed' || normalized === 'stopped' || normalized === 'cancelled') {
        keepCompletedProgress = true;
        updateProgress(duration, duration, rampUp, scenario);
        setSimulationRunning(false);
      } else if (normalized === 'failed') {
        keepCompletedProgress = false;
        updateProgress(elapsed, duration, rampUp, scenario);
        setSimulationRunning(false);
      } else {
        keepCompletedProgress = false;
        updateProgress(elapsed, duration, rampUp, scenario);
        setSimulationRunning(
          normalized === 'running' ||
          normalized === 'starting' ||
          normalized === 'ramping' ||
          normalized === 'busy'
        );
      }


      if (data.message) {
        log('[SimulationStatus] ' + data.message + ' | elapsed=' + elapsed + 's', 'info');
      }
    }


    async function pollSimulationStatus() {
      if (!statusPollActive) return;


      try {
        const data = await getJson(SIMULATION_STATUS_ENDPOINT);
        applySimulationStatus(data);


        if (isTerminalSimulationState(data?.state)) {
          statusPollActive = false;
          statusPollTimer = null;
          setSimulationRunning(false);
          return;
        }
      } catch (error) {
        if (isUnavailableError(error)) {
          showUnavailable();
          return;
        }
        log('Status poll failed: ' + error.message, 'error');
      }


      if (statusPollActive) {
        statusPollTimer = setTimeout(pollSimulationStatus, 3000);
      }
    }


    function startStatusPolling() {
      stopStatusPolling();
      statusPollActive = true;
      pollSimulationStatus();
    }


    function stopStatusPolling() {
      statusPollActive = false;
      if (statusPollTimer) {
        clearTimeout(statusPollTimer);
      }
      statusPollTimer = null;
    }


    document.getElementById('startSimulationBtn').addEventListener('click', startSimulation);
    document.getElementById('cancelSimulationBtn').addEventListener('click', cancelSimulation);
    document.getElementById('runAssessmentBtn').addEventListener('click', runAssessment);


    document.getElementById('clearLogBtn').addEventListener('click', () => {
      logEl.innerHTML = '';
      events = 0;
      eventCountEl.textContent = '0';
    });


    document.getElementById('clearAssessmentBtn').addEventListener('click', () => {
      assessmentPanelEl.textContent = '';
      setAssessmentRunning(false, 'Idle');
      cpuNowEl.textContent = '-';
      memNowEl.textContent = '-';
    });


    resetProgress();
    updateButtons();
    log('Ready. Connecting to the advisor hub...');


    window.addEventListener('load', async () => {
      try {
        await connect();
      } catch (error) {
        if (demoUnavailable) return;
        log('Initial auto-connect failed: ' + error.message, 'error');
      }
    });
  </script>
</body>
</html>`;