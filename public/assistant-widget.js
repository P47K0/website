/**
 * Floating "Ask about Patrick" chat widget for www.koorevaar.com.
 *
 * Self-contained, no build step, no dependencies -- injects its own CSS and
 * DOM, matching the site's plain-JS approach. Talks to the assistant-worker
 * Cloudflare Worker at ai-assistant.koorevaar.com, which:
 *   - requires a fresh Turnstile token on every single request (verified
 *     server-side, one-time-use per Cloudflare's own siteverify semantics),
 *   - rate-limits by IP (20 requests / 10 minutes) and returns 429 past that,
 *   - only supports English/Dutch questions -- a third language gets an
 *     honest redirect from the model itself, this widget doesn't need to
 *     detect language client-side at all.
 *
 * Usage: include this file once, with the Turnstile site key as a data
 * attribute on the script tag itself (see the integration snippet in
 * assistant-widget-snippet.html):
 *
 *   <script src="/assistant-widget.js" data-turnstile-sitekey="YOUR_SITE_KEY" defer></script>
 *
 * Optional data attributes on the same tag:
 *   data-api-url    defaults to "https://ai-assistant.koorevaar.com/ask"
 */
(function () {
  'use strict';

  var CURRENT_SCRIPT = document.currentScript;
  var SITE_KEY = CURRENT_SCRIPT && CURRENT_SCRIPT.getAttribute('data-turnstile-sitekey');
  var API_URL = (CURRENT_SCRIPT && CURRENT_SCRIPT.getAttribute('data-api-url')) || 'https://ai-assistant.koorevaar.com/ask';
  var TURNSTILE_SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js';

  if (!SITE_KEY) {
    console.error('[assistant-widget] Missing data-turnstile-sitekey on the script tag -- widget not started.');
    return;
  }

  // ---------------------------------------------------------------------
  // Styles -- injected once, scoped by the aw- prefix so nothing here leaks
  // into or clashes with the host page's own CSS.
  // ---------------------------------------------------------------------
  // Colors mirror the host site's own dark navy / azure design system
  // (see public/index.html's :root custom properties) rather than a
  // generic stock palette, so the widget reads as part of the page
  // instead of a bolted-on chat box.
  // The launcher is the avatar itself -- no button chrome, just the
  // character standing in the corner (see assistant-avatar-*.webp below).
  // Its footprint is AVATAR_SIZE square; the panel's own "bottom" offset is
  // derived from that plus a fixed gap so the avatar always stays fully
  // visible above the launcher's own base offset on both breakpoints,
  // rather than two sets of hand-matched magic numbers that could drift
  // apart on a future edit.
  var AVATAR_SIZE = 100; // px, square
  var AVATAR_PANEL_GAP = 12; // px, gap between the avatar's top edge and the panel
  var LAUNCHER_BOTTOM_DESKTOP = 20; // px, launcher's own offset from the viewport edge
  var LAUNCHER_BOTTOM_MOBILE = 76; // px, extra room for the mobile nav bar below it
  var PANEL_BOTTOM_DESKTOP = LAUNCHER_BOTTOM_DESKTOP + AVATAR_SIZE + AVATAR_PANEL_GAP;
  var PANEL_BOTTOM_MOBILE = LAUNCHER_BOTTOM_MOBILE + AVATAR_SIZE + AVATAR_PANEL_GAP;
  // Extra breathing room above the panel itself, unrelated to avatar size --
  // kept from the original desktop/mobile values.
  var PANEL_TOP_MARGIN_DESKTOP = 32;
  var PANEL_TOP_MARGIN_MOBILE = 36;
  var PANEL_MAX_HEIGHT_SUBTRACT_DESKTOP = PANEL_BOTTOM_DESKTOP + PANEL_TOP_MARGIN_DESKTOP;
  var PANEL_MAX_HEIGHT_SUBTRACT_MOBILE = PANEL_BOTTOM_MOBILE + PANEL_TOP_MARGIN_MOBILE;

  var STYLE = [
    '.aw-launcher{position:fixed;right:20px;bottom:' + LAUNCHER_BOTTOM_DESKTOP + 'px;',
    'bottom:calc(' + LAUNCHER_BOTTOM_DESKTOP + 'px + env(safe-area-inset-bottom));',
    'width:' + AVATAR_SIZE + 'px;height:' + AVATAR_SIZE + 'px;border:none;background:none;padding:0;',
    'cursor:pointer;z-index:9999;filter:drop-shadow(0 6px 16px rgba(0,0,0,.45));}',
    '.aw-launcher:hover{filter:drop-shadow(0 6px 16px rgba(0,0,0,.45)) brightness(1.08);}',
    // Stacked, crossfaded via opacity so a state change never flashes the
    // wrong still mid-swap -- see the avatar idle animation section below.
    '.aw-avatar-img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;',
    'object-position:bottom;opacity:0;transition:opacity .4s ease;pointer-events:none;}',
    '.aw-avatar-img.aw-avatar-on{opacity:1;}',
    '.aw-panel{position:fixed;right:20px;bottom:' + PANEL_BOTTOM_DESKTOP + 'px;',
    'bottom:calc(' + PANEL_BOTTOM_DESKTOP + 'px + env(safe-area-inset-bottom));',
    'width:340px;max-width:calc(100vw - 40px);',
    'height:460px;max-height:calc(100vh - ' + PANEL_MAX_HEIGHT_SUBTRACT_DESKTOP + 'px);',
    'max-height:calc(100dvh - ' + PANEL_MAX_HEIGHT_SUBTRACT_DESKTOP + 'px);',
    'background:rgba(15,26,48,.9);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.14);border-radius:16px;',
    'box-shadow:0 8px 30px rgba(0,0,0,.45);display:none;flex-direction:column;overflow:hidden;',
    'font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;color:#F2F6FC;z-index:9999;}',
    '.aw-panel.aw-open{display:flex;}',
    '@media (max-width:600px){',
    '.aw-launcher{bottom:calc(' + LAUNCHER_BOTTOM_MOBILE + 'px + env(safe-area-inset-bottom));}',
    '.aw-panel{bottom:calc(' + PANEL_BOTTOM_MOBILE + 'px + env(safe-area-inset-bottom));right:12px;max-width:calc(100vw - 24px);',
    // Shorter than the 460px desktop panel: on a phone, the on-screen
    // keyboard eats a big chunk of vertical space the moment the message
    // field is focused (which happens automatically on open), and a tall
    // fixed-height panel can end up with its header and welcome message
    // pushed out of view above the keyboard. A shorter panel leaves enough
    // headroom for that not to happen.
    'height:360px;max-height:calc(100vh - ' + PANEL_MAX_HEIGHT_SUBTRACT_MOBILE + 'px);',
    'max-height:calc(100dvh - ' + PANEL_MAX_HEIGHT_SUBTRACT_MOBILE + 'px);}',
    '}',
    '.aw-header{background:linear-gradient(90deg,#2E8FEF,#63C7FF);color:#04101F;padding:12px 16px;display:flex;',
    'justify-content:space-between;align-items:center;flex-shrink:0;}',
    '.aw-header h2{margin:0;font-size:15px;font-weight:600;}',
    '.aw-close{background:none;border:none;color:#04101F;font-size:18px;cursor:pointer;padding:0 4px;opacity:.75;}',
    '.aw-close:hover{opacity:1;}',
    '.aw-messages{flex:1;overflow-y:auto;padding:12px 16px;display:flex;flex-direction:column;gap:10px;}',
    '.aw-msg{max-width:85%;padding:8px 12px;border-radius:12px;white-space:pre-wrap;line-height:1.4;}',
    '.aw-msg-user{align-self:flex-end;background:linear-gradient(90deg,#2E8FEF,#63C7FF);color:#04101F;border-bottom-right-radius:2px;}',
    '.aw-msg-assistant{align-self:flex-start;background:rgba(255,255,255,.07);color:#F2F6FC;',
    'border:1px solid rgba(255,255,255,.12);border-bottom-left-radius:2px;}',
    '.aw-msg-error{align-self:flex-start;background:rgba(239,68,68,.12);color:#FCA5A5;border:1px solid rgba(252,165,165,.35);}',
    '.aw-msg-system{align-self:center;background:none;color:#93A0B4;font-size:12px;font-style:italic;}',
    '.aw-footer{border-top:1px solid rgba(255,255,255,.12);padding:8px 12px;flex-shrink:0;}',
    '.aw-input-row{display:flex;gap:6px;}',
    '.aw-input{flex:1;resize:none;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);',
    'border-radius:10px;padding:8px 10px;color:#F2F6FC;',
    // 16px, not inherited 14px: iOS Safari auto-zooms the whole page in when
    // a focused text input is under 16px, and it doesn't reliably zoom back
    // out afterward -- exactly the "page shifts right and stays that way"
    // bug this caused, since the widget auto-focuses this field on open.
    'font-family:inherit;font-size:16px;max-height:80px;}',
    '.aw-input::placeholder{color:#6E85A8;}',
    '.aw-input:focus{outline:2px solid #63C7FF;outline-offset:1px;}',
    '.aw-send{background:linear-gradient(90deg,#2E8FEF,#63C7FF);color:#04101F;border:none;border-radius:10px;padding:0 14px;',
    'font:inherit;font-weight:600;cursor:pointer;}',
    '.aw-send:disabled{background:rgba(46,143,239,.35);color:rgba(4,16,31,.5);cursor:not-allowed;}',
    '.aw-consent{display:flex;align-items:flex-start;gap:6px;margin-top:8px;font-size:11px;color:#93A0B4;}',
    '.aw-consent input{margin-top:2px;}',
  ].join('');

  var styleEl = document.createElement('style');
  styleEl.textContent = STYLE;
  document.head.appendChild(styleEl);

  // ---------------------------------------------------------------------
  // DOM
  // ---------------------------------------------------------------------
  var launcher = document.createElement('button');
  launcher.className = 'aw-launcher';
  launcher.setAttribute('aria-label', 'Ask a question about Patrick');
  launcher.setAttribute('aria-expanded', 'false');

  // The launcher's visible content is 4 stacked, crossfaded stills of
  // Patrick himself (waist-up, transparent background) rather than an
  // emoji -- see the "Avatar idle animation" section below for how they're
  // swapped. Built here so the "rest" still is already in the DOM (and
  // fetching) before that section runs.
  var AVATAR_FILES = {
    rest: 'assistant-avatar-rest.webp',
    blink1: 'assistant-avatar-blink-1.webp',
    turnLeft: 'assistant-avatar-turn-left.webp',
    turnRight: 'assistant-avatar-turn-right.webp'
  };
  var prefersReducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var avatarImgs = {};
  for (var avatarState in AVATAR_FILES) {
    if (Object.prototype.hasOwnProperty.call(AVATAR_FILES, avatarState)) {
      var avatarImg = document.createElement('img');
      avatarImg.className = 'aw-avatar-img' + (avatarState === 'rest' ? ' aw-avatar-on' : '');
      avatarImg.alt = '';
      avatarImg.setAttribute('aria-hidden', 'true');
      // Reduced motion: only "rest" ever gets shown, so only it gets
      // fetched -- no point spending bandwidth on stills the loop below
      // will never pick.
      if (avatarState === 'rest' || !prefersReducedMotion) {
        avatarImg.src = '/' + AVATAR_FILES[avatarState];
      }
      launcher.appendChild(avatarImg);
      avatarImgs[avatarState] = avatarImg;
    }
  }

  var panel = document.createElement('div');
  panel.className = 'aw-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Ask about Patrick');

  panel.innerHTML =
    '<div class="aw-header">' +
    '<h2>Ask about Patrick</h2>' +
    '<button class="aw-close" aria-label="Close chat">×</button>' +
    '</div>' +
    '<div class="aw-messages" aria-live="polite"></div>' +
    '<div class="aw-footer">' +
    '<div class="aw-input-row">' +
    '<textarea class="aw-input" rows="1" placeholder="Ask me something" aria-label="Your question"></textarea>' +
    '<button class="aw-send">Send</button>' +
    '</div>' +
    '<label class="aw-consent">' +
    '<input type="checkbox" class="aw-consent-checkbox">' +
    '<span>Allow this conversation to be saved for review. Off by default; questions that look abusive or that try to override the assistant are logged either way.</span>' +
    '</label>' +
    '</div>';

  document.body.appendChild(launcher);
  document.body.appendChild(panel);

  // ---------------------------------------------------------------------
  // Avatar idle animation -- crossfades the launcher between its 4 stills.
  // Sits on "rest" most of the time; occasionally blinks, or glances left
  // or right, then eases back. Deliberately driven by randomized delays via
  // nested setTimeout rather than setInterval -- a fixed cadence reads as
  // robotic almost immediately.
  // ---------------------------------------------------------------------
  // Each entry is one idle "beat" the loop can fire (weight is relative,
  // not a percentage); "rest" itself isn't listed here since it's the
  // baseline the avatar returns to between beats, not something the loop
  // picks. Blinking is weighted far more likely than a turn.
  var AVATAR_IDLE_BEATS = [
    { state: 'blink1', weight: 6, holdMin: 180, holdMax: 380 },
    { state: 'turnLeft', weight: 2, holdMin: 900, holdMax: 1600 },
    { state: 'turnRight', weight: 2, holdMin: 900, holdMax: 1600 }
  ];

  function setAvatarState(state) {
    for (var key in avatarImgs) {
      if (Object.prototype.hasOwnProperty.call(avatarImgs, key)) {
        avatarImgs[key].classList.toggle('aw-avatar-on', key === state);
      }
    }
  }

  function pickIdleBeat() {
    var totalWeight = 0;
    var i;
    for (i = 0; i < AVATAR_IDLE_BEATS.length; i++) {
      totalWeight += AVATAR_IDLE_BEATS[i].weight;
    }
    var r = Math.random() * totalWeight;
    for (i = 0; i < AVATAR_IDLE_BEATS.length; i++) {
      var beat = AVATAR_IDLE_BEATS[i];
      if (r < beat.weight) {
        return beat;
      }
      r -= beat.weight;
    }
    return AVATAR_IDLE_BEATS[AVATAR_IDLE_BEATS.length - 1];
  }

  function scheduleNextAvatarBeat() {
    // Randomized 3-9s gap between beats.
    var delay = 3000 + Math.random() * 6000;
    setTimeout(runAvatarBeat, delay);
  }

  function runAvatarBeat() {
    var beat = pickIdleBeat();
    setAvatarState(beat.state);
    var hold = beat.holdMin + Math.random() * (beat.holdMax - beat.holdMin);
    setTimeout(function () {
      setAvatarState('rest');
      scheduleNextAvatarBeat();
    }, hold);
  }

  if (!prefersReducedMotion) {
    scheduleNextAvatarBeat();
  }

  var messagesEl = panel.querySelector('.aw-messages');
  var inputEl = panel.querySelector('.aw-input');
  var sendBtn = panel.querySelector('.aw-send');
  var closeBtn = panel.querySelector('.aw-close');
  var consentCheckbox = panel.querySelector('.aw-consent-checkbox');

  function addMessage(text, kind) {
    var el = document.createElement('div');
    el.className = 'aw-msg aw-msg-' + kind;
    el.textContent = text;
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return el;
  }

  function setOpen(open) {
    panel.classList.toggle('aw-open', open);
    launcher.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      inputEl.focus();
      if (messagesEl.children.length === 0) {
        addMessage("Hi! I am Patrick, your AI assistant that can answer questions about my background, skills, or projects.", 'system');
      }
    }
  }

  launcher.addEventListener('click', function () {
    setOpen(!panel.classList.contains('aw-open'));
  });
  closeBtn.addEventListener('click', function () {
    setOpen(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && panel.classList.contains('aw-open')) {
      setOpen(false);
    }
  });
  inputEl.addEventListener('input', function () {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 80) + 'px';
  });
  inputEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });
  sendBtn.addEventListener('click', handleSend);

  // ---------------------------------------------------------------------
  // Turnstile -- loaded and rendered invisibly, executed fresh before every
  // single question since each server-side siteverify call consumes its
  // token. See Cloudflare's own "invisible, execution: execute" pattern for
  // action-triggered (not form-submit) flows.
  // ---------------------------------------------------------------------
  var turnstileWidgetId = null;
  var turnstileReady = false;
  var pendingTokenResolve = null;
  var pendingTokenReject = null;

  function renderAssistantTurnstileWidget() {
    var container = document.createElement('div');
    // Deliberately not display:none -- Cloudflare doesn't recommend hiding a
    // Turnstile container that way, and it's been linked to unexpected
    // layout side effects on some mobile browsers. Instead, pin it to a
    // fixed 1x1px clipped box at the viewport's top-left corner: small and
    // clipped enough to be invisible, but still genuinely rendered, and
    // deliberately NOT pushed off-canvas with a large negative offset --
    // that classic hiding trick can itself expand the page's scrollable
    // area on some mobile browsers, which is the opposite of the goal here.
    container.style.position = 'fixed';
    container.style.left = '0';
    container.style.top = '0';
    container.style.width = '1px';
    container.style.height = '1px';
    container.style.overflow = 'hidden';
    container.style.clip = 'rect(0,0,0,0)';
    document.body.appendChild(container);

    turnstileWidgetId = window.turnstile.render(container, {
      sitekey: SITE_KEY,
      size: 'invisible',
      execution: 'execute',
      callback: function (token) {
        if (pendingTokenResolve) {
          pendingTokenResolve(token);
          pendingTokenResolve = null;
          pendingTokenReject = null;
        }
      },
      'error-callback': function () {
        if (pendingTokenReject) {
          pendingTokenReject(new Error('turnstile-error'));
          pendingTokenResolve = null;
          pendingTokenReject = null;
        }
      },
      'expired-callback': function () {
        if (pendingTokenReject) {
          pendingTokenReject(new Error('turnstile-expired'));
          pendingTokenResolve = null;
          pendingTokenReject = null;
        }
      },
    });
    turnstileReady = true;
  }

  (function loadTurnstile() {
    // The host page may already load the Turnstile script itself for some
    // other widget (e.g. an invisible human-visitor check). Reuse that
    // instead of injecting a second <script src="...api.js"> tag -- two
    // copies of the same script both trying to define window.turnstile is
    // unnecessary and untested, and Turnstile happily renders multiple
    // independent widgets off a single loaded script.
    if (window.turnstile) {
      renderAssistantTurnstileWidget();
      return;
    }
    if (document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]')) {
      var poll = setInterval(function () {
        if (window.turnstile) {
          clearInterval(poll);
          renderAssistantTurnstileWidget();
        }
      }, 50);
      return;
    }
    window.__assistantWidgetOnTurnstileLoad = renderAssistantTurnstileWidget;
    var s = document.createElement('script');
    s.src = TURNSTILE_SCRIPT_SRC + '?onload=__assistantWidgetOnTurnstileLoad&render=explicit';
    s.async = true;
    s.defer = true;
    document.head.appendChild(s);
  })();

  function getFreshTurnstileToken() {
    return new Promise(function (resolve, reject) {
      if (!turnstileReady || turnstileWidgetId === null) {
        reject(new Error('turnstile-not-ready'));
        return;
      }
      pendingTokenResolve = resolve;
      pendingTokenReject = reject;
      window.turnstile.reset(turnstileWidgetId);
      window.turnstile.execute(turnstileWidgetId);
    });
  }

  // ---------------------------------------------------------------------
  // Sending a question
  // ---------------------------------------------------------------------
  var sending = false;

  // Fire-and-forget usage count, logged to this site's own Worker (not
  // assistant-worker) -- only called once a real answer has come back, so it
  // counts actual use rather than failed/blocked/rate-limited attempts. A
  // relative URL deliberately, since it always targets whatever site is
  // hosting this widget, unlike the configurable API_URL above.
  function logAssistantUsage() {
    fetch('/api/assistant-usage', { method: 'POST' })
      .then(function (res) {
        if (res.ok) bumpAiMessagesStatTile();
      })
      .catch(function () {});
  }

  // Optimistic local increment of the homepage's "AI messages sent" stat
  // tile, so the visitor sees their own message reflected instantly instead
  // of waiting for a future page load to refetch the real count. Only
  // updates what's already on screen -- silently a no-op if that tile isn't
  // present (e.g. the widget embedded somewhere else) or hasn't finished its
  // own initial load yet (still showing the "-" placeholder).
  function bumpAiMessagesStatTile() {
    var el = document.getElementById('ai-messages-count');
    if (!el) return;
    var current = parseInt(el.textContent.replace(/[^0-9]/g, ''), 10);
    if (isNaN(current)) return;
    el.textContent = (current + 1).toLocaleString();
  }

  function handleSend() {
    if (sending) {
      return;
    }
    var question = inputEl.value.trim();
    if (!question) {
      return;
    }

    sending = true;
    sendBtn.disabled = true;
    addMessage(question, 'user');
    inputEl.value = '';
    inputEl.style.height = 'auto';
    var thinkingEl = addMessage('Thinking...', 'system');

    getFreshTurnstileToken()
      .then(function (turnstileToken) {
        return fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            question: question,
            turnstileToken: turnstileToken,
            allowLogging: consentCheckbox.checked,
          }),
        });
      })
      .then(function (response) {
        thinkingEl.remove();
        if (response.status === 429) {
          addMessage("You've asked a lot of questions in a short time. Please wait a bit and try again.", 'error');
          return;
        }
        if (!response.ok) {
          addMessage('Something went wrong answering that. Please try again in a moment.', 'error');
          return;
        }
        return response.json().then(function (data) {
          addMessage(data.answer, 'assistant');
          logAssistantUsage();
        });
      })
      .catch(function () {
        thinkingEl.remove();
        addMessage('Could not reach the assistant right now. Please try again in a moment.', 'error');
      })
      .finally(function () {
        sending = false;
        sendBtn.disabled = false;
      });
  }
})();
