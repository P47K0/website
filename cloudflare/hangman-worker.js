const LAST_CALL_KEY = 'aca:last-call';
const THRESHOLD_MS = 5 * 60 * 1000; // 5min
const ACA_ORIGIN = "https://hangman-game.whitewater-2e220d9b.westeurope.azurecontainerapps.io";

function shouldProxy(pathname)
{
    return (
      pathname === "/hubs/hangman" ||
      pathname.startsWith("/hubs/hangman/") ||
      pathname === "/api" ||
      pathname.startsWith("/api/")
    );
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

if (url.pathname === "/")
{
    return new Response(demoHTML, {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        },
    });
}

if (shouldProxy(url.pathname))
{
    return proxyToAca(request, env);
}

//ctx.waitUntil(maybeWarm(env));

return new Response("Not found", { status: 404 });
  },
};

async function proxyToAca(request, env)
{
    const incomingUrl = new URL(request.url);
    const path = incomingUrl.pathname.toLowerCase();
    const upstreamUrl = `${ACA_ORIGIN}${path}${incomingUrl.search}`;

    if (path.endsWith("/start"))
    {
        env.DB.prepare(`
          INSERT INTO demo_executions(demo_name, feature_name, executed_at, client_hash)

              VALUES(?, ?, ?, ?)
        `).bind(
              'hangman',
              'start',
              new Date().toISOString(),
              request.headers.get("CF-Connecting-IP")
            ).run().catch(err => console.error("Logging failed:", err));
    }

    const headers = new Headers(request.headers);
    headers.set("Host", new URL(ACA_ORIGIN).host);
    headers.set("X-Forwarded-Host", incomingUrl.host);
    headers.set("X-Forwarded-Proto", incomingUrl.protocol.replace(":", ""));

    const APIkey = await env.MY_SECRET.get()

  headers.set("X-Api-Key", APIkey);

    try
    {
        const response = await fetch(upstreamUrl.toString(), {
            method: request.method,
            headers,
            body: request.body,
            redirect: "manual",
        });

        // 5xx from the ingress means the container did not start (e.g. Azure credits ran out).
        if (response.status >= 500)
        {
            return demoUnavailableResponse();
        }

        return response;
    }
    catch (err)
    {
        console.error("ACA unreachable:", err);
        return demoUnavailableResponse();
    }
}

function demoUnavailableResponse()
{
    return new Response(JSON.stringify({ unavailable: true, message: "Demo currently not available" }), {
        status: 503,
        headers: { "content-type": "application/json", "cache-control": "no-store", "retry-after": "3600" },
    });
}

async function maybeWarm(env)
{
    const lastStr = await env.KV.get(LAST_CALL_KEY);
    const now = Date.now();
    console.log("Warmup...")
    if (!lastStr || now - Date.parse(lastStr) > THRESHOLD_MS)
    {
        await fetch('https://hangman-game.whitewater-2e220d9b.westeurope.azurecontainerapps.io/Status').catch(e => console.error('Warmup failed'));
        await env.KV.put(LAST_CALL_KEY, new Date().toISOString(), { expirationTtl: 3600});
    }
}

// ==================== DEMO HTML ====================
const demoHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Hangman Demo</title>
  <link rel="icon" href="data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A//www.w3.org/2000/svg%22%20viewBox%3D%220%200%20384%20512%22%3E%3Cg%20fill%3D%22none%22%20stroke%3D%22%2301696f%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M0%2018%20L160%2095%22%20stroke-width%3D%2218%22/%3E%3C/g%3E%3Cpath%20fill%3D%22%2301696f%22%20d%3D%22M248%2024a56%2056%200%201%200%20-112%200a56%2056%200%201%200%20112%200zm24%20212.7l46.3%2062.4c10.5%2014.2%2030.6%2017.2%2044.8%206.6s17.2-30.6%206.6-44.8l-70.5-95C274%20132%20234.3%20112%20192%20112s-82%2020-107.2%2053.9l-70.5%2095c-10.5%2014.2-7.6%2034.2%206.6%2044.8s34.2%207.6%2044.8-6.6L112%20236.7V512c0%2017.7%2014.3%2032%2032%2032s32-14.3%2032-32V352c0-8.8%207.2-16%2016-16s16%207.2%2016%2016V512c0%2017.7%2014.3%2032%2032%2032s32-14.3%2032-32V236.7z%22/%3E%3C/svg%3E" type="image/svg+xml" />
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/microsoft-signalr/8.0.7/signalr.min.js"></script>
</head>
<body class="bg-gray-100 py-12 text-gray-900">
  <div class="max-w-3xl mx-auto px-6">
    <div class="flex justify-end mb-6">
      <a href="https://www.koorevaar.com" rel="noopener noreferrer"
         class="flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-gray-50 border border-gray-300 rounded-2xl text-gray-700 hover:text-teal-700 transition font-medium shadow-sm">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1v-5m10-10l2 2m-2-2v10a1 1 0 01-1 1v-5m-6 0a1 1 0 001-1v5" />
        </svg>
        Home
      </a>
    </div>

    <h1 class="text-4xl font-bold text-center mb-2">Hangman Demo</h1>
    <p class="text-center text-gray-600 mb-8">Azure Container Apps + Two Qwen2.5 agents via Cloudflare + SignalR real-time game events</p>

    <div id="unavailableBanner" class="hidden mb-6 p-5 rounded-2xl bg-amber-50 border-2 border-amber-400 text-center">
      <p class="text-lg font-bold text-amber-800">Demo currently not available</p>
      <p class="text-sm text-amber-700 mt-1">The hosting behind this demo is paused for now. Please check back later.</p>
    </div>

    <div class="bg-white rounded-2xl shadow p-8 space-y-6">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button id="startBtn" class="bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl font-semibold transition">Start game</button>
        <div class="flex items-center justify-center gap-2">
          <input id="includeHumanToggle" type="checkbox" class="w-5 h-5 rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
          <label for="includeHumanToggle" class="text-sm text-gray-700 select-none">I want to guess</label>
        </div>
        <button id="stopBtn" class="bg-rose-600 hover:bg-rose-700 text-white py-4 rounded-xl font-semibold transition">Stop game</button>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div class="p-4 rounded-2xl bg-gray-50 border border-gray-200">
          <p class="text-sm text-gray-500">Status</p>
          <p id="status" class="text-xl font-semibold mt-1 text-gray-900">Disconnected</p>
        </div>
        <div class="p-4 rounded-2xl bg-gray-50 border border-gray-200">
          <p class="text-sm text-gray-500">Events</p>
          <p id="eventCount" class="text-xl font-semibold mt-1 text-gray-900">0</p>
        </div>
        <div class="p-4 rounded-2xl bg-gray-50 border border-gray-200">
          <p class="text-sm text-gray-500">Game ID</p>
          <p id="gameId" class="text-sm font-semibold mt-1 text-gray-900 break-all">-</p>
        </div>
        <div class="p-4 rounded-2xl bg-gray-50 border border-gray-200">
          <p class="text-sm text-gray-500">Time left</p>
          <p id="timeLeft" class="text-xl font-semibold mt-1 text-gray-900">-</p>
        </div>
      </div>

      <div id="humanTurnPanel" class="hidden p-5 rounded-2xl bg-amber-50 border-2 border-amber-400">
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p class="text-lg font-bold text-amber-800">Your turn! Guess a letter.</p>
            <p id="humanTurnBoard" class="text-sm text-amber-700 font-mono mt-1">-</p>
          </div>
          <form id="guessForm" class="flex items-center gap-2">
            <input id="letterInput" type="text" maxlength="1" pattern="[A-Za-z]" autocomplete="off" placeholder="a"
                   class="w-16 text-center text-2xl font-bold uppercase border-2 border-amber-400 rounded-xl py-2 focus:outline-none focus:ring-2 focus:ring-amber-500" />
            <button id="guessBtn" type="submit" class="bg-amber-600 hover:bg-amber-700 text-white py-2 px-6 rounded-xl font-semibold transition">Guess</button>
          </form>
        </div>
      </div>

      <div id="gameResultPanel" class="hidden p-5 rounded-2xl">
        <p id="gameResultHeadline" class="text-lg font-bold">-</p>
        <p id="gameResultDetail" class="text-sm font-mono mt-1">-</p>
      </div>

      <div>
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-xl font-semibold">Event stream</h2>
          <button id="clearBtn" class="px-4 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 transition">Clear</button>
        </div>
        <div id="log" class="min-h-[460px] max-h-[460px] overflow-auto rounded-2xl bg-gray-900 text-gray-100 p-4 font-mono text-sm whitespace-pre-wrap"></div>
      </div>
    </div>

    <p class="text-center text-xs text-gray-400 mt-6">
      Designed and built by Patrick Koorevaar. The human-player mode was implemented in collaboration with Claude Code.
    </p>
  </div>

  <script>
    const HUB_URL = '/hubs/hangman';
const CREATE_ENDPOINT = '/api/hangman/create';
const START_ENDPOINT = '/api/hangman/GAME_ID/start';
const STOP_ENDPOINT = '/api/hangman/GAME_ID/stop';
const GUESS_ENDPOINT = '/api/hangman/GAME_ID/guess';

let connection = null;
let events = 0;
let currentGameId = null;
let isRunning = false;
let isTerminal = false;
let isHumanTurn = false;

const statusEl = document.getElementById('status');
const eventCountEl = document.getElementById('eventCount');
const gameIdEl = document.getElementById('gameId');
const logEl = document.getElementById('log');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const humanTurnPanel = document.getElementById('humanTurnPanel');
const humanTurnBoardEl = document.getElementById('humanTurnBoard');
const guessForm = document.getElementById('guessForm');
const letterInput = document.getElementById('letterInput');
const guessBtn = document.getElementById('guessBtn');
const includeHumanToggle = document.getElementById('includeHumanToggle');
const timeLeftEl = document.getElementById('timeLeft');
const gameResultPanel = document.getElementById('gameResultPanel');
const gameResultHeadlineEl = document.getElementById('gameResultHeadline');
const gameResultDetailEl = document.getElementById('gameResultDetail');

const GAME_RESULT_THEMES = {
    win: { panel: 'bg-green-50 border-2 border-green-400', headline: 'text-green-800', detail: 'text-green-700' },
    loss: { panel: 'bg-red-50 border-2 border-red-400', headline: 'text-red-800', detail: 'text-red-700' },
    timeout: { panel: 'bg-amber-50 border-2 border-amber-400', headline: 'text-amber-800', detail: 'text-amber-700' },
    stopped: { panel: 'bg-gray-100 border-2 border-gray-300', headline: 'text-gray-800', detail: 'text-gray-600' }
};

function showGameResult(headline, detail, tone)
{
    const theme = GAME_RESULT_THEMES[tone] || GAME_RESULT_THEMES.stopped;
    gameResultPanel.className = 'p-5 rounded-2xl ' + theme.panel;
    gameResultHeadlineEl.className = 'text-lg font-bold ' + theme.headline;
    gameResultHeadlineEl.textContent = headline;
    gameResultDetailEl.className = 'text-sm font-mono mt-1 ' + theme.detail;
    gameResultDetailEl.textContent = detail || '';
}

function hideGameResult()
{
    gameResultPanel.classList.add('hidden');
}

let countdownIntervalId = null;
let countdownDeadlineMs = null;

function formatCountdown(remainingMs)
{
    const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return minutes + ':' + String(seconds).padStart(2, '0');
}

function tickCountdown()
{
    if (!countdownDeadlineMs)
    {
        timeLeftEl.textContent = '-';
        return;
    }

    const remaining = countdownDeadlineMs - Date.now();
    timeLeftEl.textContent = formatCountdown(remaining);

    if (remaining <= 0)
    {
        stopCountdown();
    }
}

function startCountdown(startedAtUtc, timeoutSeconds)
{
    stopCountdown();

    if (!timeoutSeconds)
    {
        return;
    }

    const startedMs = startedAtUtc ? new Date(startedAtUtc).getTime() : Date.now();
    countdownDeadlineMs = startedMs + timeoutSeconds * 1000;
    tickCountdown();
    countdownIntervalId = setInterval(tickCountdown, 1000);
}

function stopCountdown()
{
    if (countdownIntervalId)
    {
        clearInterval(countdownIntervalId);
        countdownIntervalId = null;
    }
    countdownDeadlineMs = null;
    timeLeftEl.textContent = '-';
}

function withGameId(template, gameId)
{
    if (!gameId)
    {
        throw new Error('No gameId available.');
    }
    return template.replace('GAME_ID', encodeURIComponent(gameId));
}

function log(message, type = 'info')
{
    const line = document.createElement('div');
    const timestamp = new Date().toLocaleTimeString();
    const color = type === 'error' ? 'text-red-300' : type === 'success' ? 'text-green-300' : type === 'action' ? 'text-sky-300' : 'text-gray-100';
    line.className = color;
    line.textContent = '[' + timestamp + '] ' + message;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
    console.log(line.textContent);
}

function setStatus(text, cssClass)
{
    statusEl.textContent = text;
    statusEl.className = 'text-xl font-semibold mt-1 ' + cssClass;
}

function incrementEvents()
{
    events += 1;
    eventCountEl.textContent = String(events);
}

function setGameId(value)
{
    currentGameId = value || null;
    gameIdEl.textContent = currentGameId || '-';
    updateButtons();
}

function setRunning(value)
{
    isRunning = value;
    updateButtons();
}

function setTerminal(value)
{
    isTerminal = value;
    if (value)
    {
        setHumanTurn(false);
    }
    updateButtons();
}

function setHumanTurn(value, boardText)
{
    isHumanTurn = value;
    humanTurnPanel.classList.toggle('hidden', !value);

    if (boardText !== undefined && boardText !== null)
    {
        humanTurnBoardEl.textContent = boardText;
    }

    if (value)
    {
        letterInput.value = '';
        letterInput.focus();
    }
}

function showUnavailable()
{
    document.getElementById('unavailableBanner').classList.remove('hidden');
    setStatus('Unavailable', 'text-amber-600');
    startBtn.disabled = true;
    startBtn.classList.add('opacity-50', 'cursor-not-allowed');
    log('Demo currently not available.', 'error');
}

function updateButtons()
{
    const connected = !!connection;
    const hasGame = !!currentGameId;

    startBtn.disabled = isRunning;
    stopBtn.disabled = !connected || !hasGame || !isRunning;
    includeHumanToggle.disabled = isRunning;
}

function tryCaptureGameId(payload)
{
    if (!payload || typeof payload !== 'object') return;
    const candidate = payload.gameId || payload.id || payload.sessionId;
    if (candidate)
    {
        setGameId(candidate);
    }
}

async function connect()
{
    if (connection)
    {
        log('Already connected.');
        return;
    }

    connection = new signalR.HubConnectionBuilder()
      .withUrl(HUB_URL)
      .withAutomaticReconnect()
      .build();

    connection.onreconnecting(() => {
        setStatus('Reconnecting', 'text-amber-600');
        log('SignalR reconnecting...', 'error');
    });

    connection.onreconnected(async () => {
        setStatus('Connected', 'text-green-600');
        log('SignalR reconnected.', 'success');
        if (currentGameId)
        {
            await connection.invoke('JoinGame', currentGameId);
            log('Joined game: ' + currentGameId, 'success');
        }
    });

    connection.onclose(() => {
        setStatus('Disconnected', 'text-gray-900');
        log('SignalR disconnected.');
        connection = null;
        setHumanTurn(false);
        stopCountdown();
        updateButtons();
    });

    connection.on('GameStarted', data => {
        incrementEvents();
        log('[GameStarted] ' + JSON.stringify(data), 'success');
        if (data?.gameId) setGameId(data.gameId);
        setHumanTurn(false);
        setRunning(true);
        setTerminal(false);
        startCountdown(data?.startedAtUtc, data?.timeoutSeconds);
        hideGameResult();
    });

    connection.on('TurnStarting', data => {
        incrementEvents();
        log('[TurnStarting] ' + JSON.stringify(data), 'success');
        if (data?.gameId) setGameId(data.gameId);
    });

    connection.on('HumanTurnReady', data => {
        incrementEvents();
        log('[HumanTurnReady] Your turn! ' + (data?.state || ''), 'action');
        if (data?.gameId) setGameId(data.gameId);
        setHumanTurn(true, data?.state || '');
    });

    connection.on('TurnPlayed', data => {
        incrementEvents();
        log(data.agentName + ' [' + data.message + ']', 'success');
        if (data?.gameId) setGameId(data.gameId);
        setHumanTurn(false);
    });

    connection.on('GameFinished', data => {
        incrementEvents();
        log('[GameFinished] ' + JSON.stringify(data), 'success');
        if (data?.gameId) setGameId(data.gameId);
        setRunning(false);
        setTerminal(true);
        stopCountdown();

        const winner = data?.winner || 'Unknown';
        const isHangmanWin = winner === 'Hangman';
        const isHumanWin = winner === 'Human';
        const headline = isHangmanWin ? 'Hangman wins!' : isHumanWin ? 'You win!' : winner + ' wins!';
        showGameResult(
            headline,
            data?.finalBoard || '',
            isHangmanWin ? 'loss' : 'win');
    });

    connection.on('GameStopped', data => {
        incrementEvents();
        const isTimeout = data?.reason === 'timeout';
        const reasonText = isTimeout ? ' (5-minute time limit reached)' : '';
        log('[GameStopped]' + reasonText + ' ' + JSON.stringify(data), 'success');
        if (data?.gameId) setGameId(data.gameId);
        setRunning(false);
        setTerminal(true);
        stopCountdown();

        showGameResult(
            isTimeout ? 'Game timed out' : 'Game stopped',
            data?.state || '',
            isTimeout ? 'timeout' : 'stopped');
    });

    connection.on('Error', message => {
        incrementEvents();
        log('[Error] ' + (typeof message === 'string' ? message : JSON.stringify(message)), 'error');
    });

    try
    {
        await connection.start();
        setStatus('Connected', 'text-green-600');
        log('SignalR connected.', 'success');
        updateButtons();
    }
    catch (error)
    {
        connection = null;
        if (error?.statusCode >= 500)
        {
            showUnavailable();
            return;
        }
        setStatus('Failed', 'text-red-600');
        log('Connect failed: ' + error.message, 'error');
        updateButtons();
    }
}

async function postJson(url, body)
{
    const response = await fetch(url, {
    method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || { })
      });

const text = await response.text();
let data = null;
try
{
    data = text ? JSON.parse(text) : null;
}
catch
{
    data = text || null;
}

if (!response.ok)
{
    const error = new Error(response.status + ' ' + response.statusText + (data ? ' - ' + JSON.stringify(data) : ''));
    error.status = response.status;
    throw error;
}

return { data, rawText: text }
;
    }

    async function createGame()
{
    const includeHuman = includeHumanToggle.checked;
    log('Creating game (' + (includeHuman ? 'you + AgentA + AgentB' : 'AgentA + AgentB only') + ')...', 'action');
    const createUrl = CREATE_ENDPOINT + '?includeHuman=' + (includeHuman ? 'true' : 'false');
    const result = await postJson(createUrl, { });
    const created = result.data;
    const gameId = created?.gameId || created?.id || created?.sessionId;

    if (!gameId)
    {
        throw new Error('Game created, but no gameId returned.');
    }

    setGameId(gameId);
    setRunning(false);
    setTerminal(false);
    hideGameResult();
    log('Created game: ' + gameId, 'success');
    return gameId;
}

async function joinGame(gameId)
{
    await connection.invoke('JoinGame', gameId);
    setGameId(gameId);
    log('Joined game: ' + gameId, 'success');
}

async function startGame()
{
    try
    {
        if (!connection)
        {
            await connect();
            if (!connection)
            {
                return;
            }
        }

        const gameId = await createGame();
        await joinGame(gameId);

        const result = await postJson(withGameId(START_ENDPOINT, gameId), { });
        log('Start response: ' + (result.rawText || ''), 'action');

        setRunning(true);
        setTerminal(false);
    }
    catch (error)
    {
        if (error?.status === 429)
        {
            log('Please try again in a few seconds.', 'error');
        }
        else if (error?.status === 503)
        {
            showUnavailable();
        }
        else
        {
            log('Start failed: ' + error.message, 'error');
        }
    }
}

async function stopGame()
{
    try
    {
        if (!currentGameId)
        {
            throw new Error('No gameId available.');
        }

        log('Stopping game...', 'action');
        const result = await postJson(withGameId(STOP_ENDPOINT, currentGameId), { });
        log('Stop response: ' + (result.rawText || ''), 'action');
    }
    catch (error)
    {
        log('Stop failed: ' + error.message, 'error');
    }
}

async function submitGuess(rawLetter)
{
    if (!currentGameId)
    {
        log('No active game.', 'error');
        return;
    }

    const letter = (rawLetter || '').trim().toLowerCase();
    if (!/^[a-z]$/.test(letter))
    {
        log('Enter a single letter a-z.', 'error');
        return;
    }

    guessBtn.disabled = true;
    try
    {
        log('Guessing "' + letter + '"...', 'action');
        const result = await postJson(withGameId(GUESS_ENDPOINT, currentGameId), { letter: letter });
        log('Guess response: ' + (result.rawText || ''), 'action');
        letterInput.value = '';
    }
    catch (error)
    {
        log('Guess failed: ' + error.message, 'error');
    }
    finally
    {
        guessBtn.disabled = false;
    }
}

document.getElementById('startBtn').addEventListener('click', startGame);
document.getElementById('stopBtn').addEventListener('click', stopGame);
document.getElementById('clearBtn').addEventListener('click', () => {
    logEl.innerHTML = '';
    events = 0;
    eventCountEl.textContent = '0';
});
guessForm.addEventListener('submit', event => {
    event.preventDefault();
    submitGuess(letterInput.value);
});

updateButtons();
log('Ready. Press [Start game] to start a new game.');
  </script>
</body>
</html>`;
