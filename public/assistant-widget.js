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
  var STYLE = [
    '.aw-launcher{position:fixed;right:20px;bottom:20px;width:56px;height:56px;border-radius:50%;',
    'background:#2563eb;color:#fff;border:none;box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer;',
    'font-size:24px;line-height:56px;text-align:center;z-index:9999;padding:0;}',
    '.aw-launcher:hover{background:#1d4ed8;}',
    '.aw-panel{position:fixed;right:20px;bottom:88px;width:340px;max-width:calc(100vw - 40px);',
    'height:460px;max-height:calc(100vh - 120px);background:#fff;border-radius:16px;',
    'box-shadow:0 8px 30px rgba(0,0,0,.3);display:none;flex-direction:column;overflow:hidden;',
    'font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;color:#111827;z-index:9999;}',
    '.aw-panel.aw-open{display:flex;}',
    '.aw-header{background:#2563eb;color:#fff;padding:12px 16px;display:flex;',
    'justify-content:space-between;align-items:center;flex-shrink:0;}',
    '.aw-header h2{margin:0;font-size:15px;font-weight:600;}',
    '.aw-close{background:none;border:none;color:#fff;font-size:18px;cursor:pointer;padding:0 4px;}',
    '.aw-messages{flex:1;overflow-y:auto;padding:12px 16px;display:flex;flex-direction:column;gap:10px;}',
    '.aw-msg{max-width:85%;padding:8px 12px;border-radius:12px;white-space:pre-wrap;line-height:1.4;}',
    '.aw-msg-user{align-self:flex-end;background:#2563eb;color:#fff;border-bottom-right-radius:2px;}',
    '.aw-msg-assistant{align-self:flex-start;background:#f3f4f6;color:#111827;border-bottom-left-radius:2px;}',
    '.aw-msg-error{align-self:flex-start;background:#fef2f2;color:#991b1b;border:1px solid #fecaca;}',
    '.aw-msg-system{align-self:center;background:none;color:#6b7280;font-size:12px;font-style:italic;}',
    '.aw-footer{border-top:1px solid #e5e7eb;padding:8px 12px;flex-shrink:0;}',
    '.aw-input-row{display:flex;gap:6px;}',
    '.aw-input{flex:1;resize:none;border:1px solid #d1d5db;border-radius:10px;padding:8px 10px;',
    'font:inherit;max-height:80px;}',
    '.aw-input:focus{outline:2px solid #2563eb;outline-offset:1px;}',
    '.aw-send{background:#2563eb;color:#fff;border:none;border-radius:10px;padding:0 14px;',
    'font:inherit;font-weight:600;cursor:pointer;}',
    '.aw-send:disabled{background:#93c5fd;cursor:not-allowed;}',
    '.aw-consent{display:flex;align-items:flex-start;gap:6px;margin-top:8px;font-size:11px;color:#6b7280;}',
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
  launcher.textContent = '\u{1F4AC}'; // speech balloon emoji

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
    '<textarea class="aw-input" rows="1" placeholder="Ask something about Patrick..." aria-label="Your question"></textarea>' +
    '<button class="aw-send">Send</button>' +
    '</div>' +
    '<label class="aw-consent">' +
    '<input type="checkbox" class="aw-consent-checkbox">' +
    '<span>Allow this conversation to be saved for review. Off by default; questions that look abusive or that try to override the assistant are logged either way.</span>' +
    '</label>' +
    '</div>';

  document.body.appendChild(launcher);
  document.body.appendChild(panel);

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
        addMessage("Hi! Ask me anything about Patrick's background, skills, or projects.", 'system');
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
    container.style.display = 'none';
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
