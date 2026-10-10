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
  // Must match the delay in the idle-animation section's cleanup timeout
  // below, which uses this same constant -- see the comment there.
  var AVATAR_TRANSITION_MS = 350;
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
    'object-position:bottom;opacity:0;transition:opacity ' + AVATAR_TRANSITION_MS + 'ms ease;pointer-events:none;}',
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
    // Shorter than the 460px desktop panel to fit a phone screen. Keeping
    // the header visible while the on-screen keyboard is open is handled by
    // fitToScreen() in the script below.
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
    '.aw-msg-source{align-self:flex-start;margin-top:-4px;font-size:12px;}',
    '.aw-msg-source a{color:#63C7FF;text-decoration:underline;}',
    '.aw-msg-source a:hover{color:#F2F6FC;}',
    '.aw-flash{outline:2px solid #63C7FF;outline-offset:4px;border-radius:12px;}',
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
      // Only "rest" is fetched right away (the host page may preload it).
      // The other stills wait for the window load event so they don't
      // compete with "rest" and the page's own resources; setAvatarState
      // skips any still that hasn't finished loading yet. Reduced motion:
      // only "rest" ever gets shown, so the others are never fetched.
      if (avatarState === 'rest') {
        avatarImg.src = '/' + AVATAR_FILES[avatarState];
      }
      launcher.appendChild(avatarImg);
      avatarImgs[avatarState] = avatarImg;
    }
  }
  if (!prefersReducedMotion) {
    var loadIdleStills = function () {
      for (var state in avatarImgs) {
        if (Object.prototype.hasOwnProperty.call(avatarImgs, state) && state !== 'rest') {
          avatarImgs[state].src = '/' + AVATAR_FILES[state];
        }
      }
    };
    if (document.readyState === 'complete') loadIdleStills();
    else window.addEventListener('load', loadIdleStills, { once: true });
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
  //
  // transitionMs is per-beat, not shared: a blink needs to actually read as
  // a blink. Since the anti-darkening fix below keeps the outgoing still
  // fully visible for the *entire* fade-back transition (not just the
  // nominal hold), reusing the slower turn-speed crossfade for blinks meant
  // "eyes closed" lasted holdMax + a full 350ms tail on top -- up to
  // ~730ms, closer to a wince than a blink. A snappy transition tied to the
  // blink beat itself keeps that tail short.
  var AVATAR_IDLE_BEATS = [
    { state: 'blink1', weight: 6, holdMin: 90, holdMax: 180, transitionMs: 90 },
    { state: 'turnLeft', weight: 2, holdMin: 900, holdMax: 1600, transitionMs: AVATAR_TRANSITION_MS },
    { state: 'turnRight', weight: 2, holdMin: 900, holdMax: 1600, transitionMs: AVATAR_TRANSITION_MS }
  ];

  // Fading the outgoing still down while the incoming one fades up at the
  // same time (i.e. toggling the class on every layer at once) looks wrong:
  // alpha-compositing two simultaneously semi-transparent layers doesn't
  // sum back to fully opaque, so right at the transition's midpoint the
  // avatar is genuinely more translucent and the page's dark background
  // shows through -- visible as a brief darkening on every swap. Instead,
  // the outgoing still is kept fully opaque underneath until the incoming
  // one has completely finished fading in on top of it, and only then gets
  // cut away -- by then it's fully covered, so the cut is invisible, and
  // the stack's combined alpha never drops below 1.
  var avatarTransitionToken = 0;

  function setAvatarState(state, transitionMs) {
    var img = avatarImgs[state];
    // Not loaded yet (the idle stills are fetched after page load): skip
    // this beat rather than fade to an empty image.
    if (!img || img.classList.contains('aw-avatar-on') || !img.complete || !img.naturalWidth) {
      return;
    }
    var duration = transitionMs || AVATAR_TRANSITION_MS;
    // Overrides the CSS rule's default duration for just this element/swap
    // -- inline style wins over the stylesheet rule at equal specificity.
    img.style.transitionDuration = duration + 'ms';
    // Move to the end so it paints on top of whatever's currently visible,
    // regardless of which direction this transition is (e.g. blink1 back
    // to rest needs rest on top just as much as rest to blink1 does).
    launcher.appendChild(img);
    img.classList.add('aw-avatar-on');
    var token = ++avatarTransitionToken;
    setTimeout(function () {
      // A newer state change already fired before this one settled --
      // leave the older still(s) alone; whichever transition finishes last
      // is responsible for cleaning up everything behind it.
      if (token !== avatarTransitionToken) {
        return;
      }
      for (var key in avatarImgs) {
        if (Object.prototype.hasOwnProperty.call(avatarImgs, key) && key !== state) {
          avatarImgs[key].classList.remove('aw-avatar-on');
        }
      }
    }, duration);
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
    setAvatarState(beat.state, beat.transitionMs);
    var hold = beat.holdMin + Math.random() * (beat.holdMax - beat.holdMin);
    setTimeout(function () {
      // Same speed back -- a blink needs to open as fast as it closed.
      setAvatarState('rest', beat.transitionMs);
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

  // ---------------------------------------------------------------------
  // Finding the answer on this page
  // ---------------------------------------------------------------------
  // The assistant widget lives on the homepage the `about` answers come from,
  // so instead of trusting retrieval to name a section (a heading-only chunk
  // wins most "Patrick" questions, see the assistant-worker's source-link.ts),
  // match the question and answer text against the page's own marked items
  // (data-md-item: project cards, skill groups, certifications...) and scroll
  // to the clearest winner. Lexical on purpose: no model call, always in sync
  // with the page. No clear winner means no link.
  var STOPWORDS = {};
  ('a an and are as at be been but by can could did do does for from had has have he her his how i if in into is it its ' +
   'me more most my no not of on one or our out she so than that the their them then there these they this to up us ' +
   'was we were what when where which who will with would you your about also any over some such very patrick ' +
   'patricks koorevaar experience work works worked working has have having used use using ' +
   'de het een en van in is op te dat die voor met zijn heeft hij wat hoe welke waar wie ook naar bij aan om als ' +
   'blog contact directly check feel free ask help background skill project enough information ' +
   'ervaring werkt gewerkt').split(' ').forEach(function (w) { STOPWORDS[w] = true; });

  function stems(text) {
    var seen = {};
    var out = [];
    String(text || '').toLowerCase().split(/[^a-z0-9]+/).forEach(function (w) {
      if (w.length < 2 || STOPWORDS[w] || /^[0-9]+$/.test(w)) return;
      if (w.length > 4 && w.charAt(w.length - 1) === 's') w = w.slice(0, -1);
      if (!seen[w]) { seen[w] = true; out.push(w); }
    });
    return out;
  }

  var pageIndex = null;
  function getPageIndex() {
    if (pageIndex) return pageIndex;
    var items = [];
    var df = {};
    Array.prototype.forEach.call(document.querySelectorAll('[data-md-item]'), function (el) {
      var titleEl = el.querySelector('[data-md-title]');
      var title = titleEl ? titleEl.textContent.trim() : '';
      // data-kw: hand-written extra terms (Dutch names, synonyms) on an item or
      // its section, matched like the visible text but not shown or exported.
      var sectionEl = el.closest('[data-md-section]');
      var kwTokens = stems((el.getAttribute('data-kw') || '') + ' ' +
        (sectionEl ? sectionEl.getAttribute('data-kw') || '' : ''));
      var tokens = stems(el.textContent).concat(kwTokens);
      var titleTokens = {};
      stems(title).forEach(function (t) { titleTokens[t] = true; });
      var set = {};
      tokens.forEach(function (t) { set[t] = true; df[t] = (df[t] || 0) + 1; });
      var kwSet = {};
      kwTokens.forEach(function (t) { kwSet[t] = true; });
      items.push({ el: el, title: title, set: set, titleTokens: titleTokens, kwSet: kwSet });
    });
    pageIndex = { items: items, df: df };
    return pageIndex;
  }

  // Tuned against the real homepage with a handful of questions, not traffic.
  var MATCH_MIN_SCORE = 12;
  var MATCH_MIN_TERMS = 2;
  var MATCH_MIN_LEAD = 1.3;
  var KW_TERM_WORTH = 6;

  function findOnPage(question, answer) {
    var idx = getPageIndex();
    var n = idx.items.length;
    if (!n) return null;
    var weights = {};
    stems(answer).forEach(function (t) { weights[t] = 1; });
    stems(question).forEach(function (t) { weights[t] = 3; });
    var scored = idx.items.map(function (item) {
      var score = 0, terms = 0;
      for (var t in weights) {
        if (item.set[t]) {
          var idf = Math.log(1 + n / idx.df[t]);
          var part = idf * (item.titleTokens[t] ? 2 : 1);
          // Curated keywords are spread over a whole section, which drags
          // their idf down; give them a flat worth instead.
          if (item.kwSet[t]) part = Math.max(part, KW_TERM_WORTH);
          score += weights[t] * part;
          // A curated keyword is evidence enough on its own: counts double.
          terms += item.kwSet[t] ? 2 : 1;
        }
      }
      return { item: item, score: score, terms: terms };
    }).sort(function (a, b) { return b.score - a.score; });
    var best = scored[0];
    if (!best || best.score < MATCH_MIN_SCORE || best.terms < MATCH_MIN_TERMS) return null;
    // Cards in one section back each other up, so the lead is over the best
    // item in a different section.
    var bestSection = best.item.el.closest('[data-md-section]');
    var rival = scored.filter(function (r) { return r.item.el.closest('[data-md-section]') !== bestSection; })[0];
    if (rival && best.score < rival.score * MATCH_MIN_LEAD) return null;
    var target = best.item.el;
    var label = best.item.title;
    // Many cards tied (a match on a section-wide keyword, e.g. "projects"):
    // no single card is the answer, so point at the section. Skill groups and
    // certifications sit in collapsed panels: same, an element with no box
    // can't be scrolled to.
    var tied = scored.filter(function (r) {
      return r.score >= best.score * 0.9 && r.item.el.closest('[data-md-section]') === bestSection;
    }).length;
    if (tied >= 3 || target.getClientRects().length === 0) {
      target = bestSection || target;
      label = target.getAttribute('data-md-title') || label;
    }
    return { el: target, label: label };
  }

  // Link under an answer. First match wins: a contact link from the Worker's
  // `source` (contact.koorevaar.com, for contact intent, a CV request or a
  // question it could not answer); a blog article from
  // the Worker's `source` (an https blog.koorevaar.com article URL, opened in
  // a new tab); whatever findOnPage() clearly matches on this page; otherwise
  // the homepage section id the Worker voted for. Anything else is ignored. Article and section sources are built Worker-side from real
  // slugs/ids, never model text.
  var ARTICLE_URL_PREFIX = 'https://blog.koorevaar.com/articles/';
  var CONTACT_URL_PREFIX = 'https://contact.koorevaar.com';
  var CONTACT_LABELS = {
    contact: 'Contact Patrick',
    cv: 'Request the CV',
    unanswered: 'Ask Patrick directly'
  };

  function flash(el) {
    el.classList.add('aw-flash');
    setTimeout(function () { el.classList.remove('aw-flash'); }, 2500);
  }

  function scrollToOnPage(target) {
    // On phones the panel covers most of the page, so get it out of the way.
    if (window.innerWidth <= 600) {
      setOpen(false);
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    flash(target);
  }

  function addSourceLink(source, question, answer) {
    var a = document.createElement('a');
    var target = null;
    var label = null;
    if (source && source.type === 'article' && typeof source.url === 'string' &&
        source.url.indexOf(ARTICLE_URL_PREFIX) === 0) {
      a.href = source.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = 'Read more on the blog →';
    } else if (source && source.type === 'contact' && typeof source.url === 'string' &&
               (source.url === CONTACT_URL_PREFIX || source.url.indexOf(CONTACT_URL_PREFIX + '/') === 0)) {
      // The Worker only sends this for contact intent, a CV request or a
      // question it could not answer, and it replaces any other link.
      a.href = source.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = (CONTACT_LABELS[source.reason] || CONTACT_LABELS.contact) + ' →';
    } else {
      // The page match first: it reads the live page, so when it has a clear
      // winner it beats the Worker's voted section, which can still point at
      // a heading chunk's section. The vote is the fallback.
      var found = findOnPage(question, answer);
      if (found) {
        target = found.el;
        label = found.label;
      } else if (source && source.type === 'section' && typeof source.anchor === 'string' &&
                 /^#[a-z][a-z-]*-section$/.test(source.anchor)) {
        target = document.getElementById(source.anchor.slice(1));
      }
      if (!target) {
        return;
      }
      a.href = '#' + (target.id || '');
      a.textContent = (label ? 'See “' + label + '” on the page' : 'See this on the page') + ' ↓';
      a.addEventListener('click', function (e) {
        e.preventDefault();
        scrollToOnPage(target);
      });
    }
    var el = document.createElement('div');
    el.className = 'aw-msg-source';
    el.appendChild(a);
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  // On touch screens, focusing the message field on open pops up the
  // keyboard straight away and Safari scrolls the header off screen, so
  // focus the close button there instead and let the visitor tap the field.
  var touch = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  var vv = window.visualViewport;

  // While the keyboard is open, pin the panel to the visible part of the
  // viewport so the header stays in view.
  function fitToScreen() {
    var s = panel.style;
    if (vv && panel.classList.contains('aw-open') && vv.height < window.innerHeight - 100) {
      s.top = (vv.offsetTop + 8) + 'px';
      s.bottom = 'auto';
      s.height = Math.min(360, vv.height - 16) + 'px'; // 360 = mobile panel height in the CSS
      s.maxHeight = 'none';
    } else {
      s.top = s.bottom = s.height = s.maxHeight = '';
    }
  }
  if (vv) {
    vv.addEventListener('resize', fitToScreen);
    vv.addEventListener('scroll', fitToScreen);
  }

  function setOpen(open) {
    panel.classList.toggle('aw-open', open);
    launcher.setAttribute('aria-expanded', open ? 'true' : 'false');
    fitToScreen();
    if (open) {
      (touch ? closeBtn : inputEl).focus();
      if (messagesEl.children.length === 0) {
        addMessage("Hi! I am Patrick, your AI assistant that can answer questions about my background, skills, or projects.", 'system');
      }
    }
  }

  launcher.addEventListener('click', function () {
    setOpen(!panel.classList.contains('aw-open'));
    // Warm up Turnstile while the visitor types their first question.
    ensureTurnstileWidget().catch(function () {});
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
  //
  // Loaded lazily: nothing is fetched until the chat is opened or a
  // question is sent, so Turnstile's ~900 KB challenge stays out of the
  // host page's load.
  // ---------------------------------------------------------------------
  var turnstileWidgetId = null;
  var turnstileWidgetPromise = null;
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
  }

  function loadTurnstileScript() {
    // The host page may load the Turnstile script itself for some other
    // widget (e.g. an invisible human-visitor check). Reuse that instead of
    // injecting a second <script src="...api.js"> tag -- two copies of the
    // same script both trying to define window.turnstile is unnecessary and
    // untested, and Turnstile happily renders multiple independent widgets
    // off a single loaded script. www.koorevaar.com exposes its shared lazy
    // loader as window.loadTurnstile.
    if (window.loadTurnstile) return window.loadTurnstile();
    if (window.turnstile) return Promise.resolve(window.turnstile);
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]')) {
        var poll = setInterval(function () {
          if (window.turnstile) {
            clearInterval(poll);
            resolve(window.turnstile);
          }
        }, 50);
        return;
      }
      window.__assistantWidgetOnTurnstileLoad = function () { resolve(window.turnstile); };
      var s = document.createElement('script');
      s.src = TURNSTILE_SCRIPT_SRC + '?onload=__assistantWidgetOnTurnstileLoad&render=explicit';
      s.async = true;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  // Loads the script and renders this widget's Turnstile instance once;
  // a failed load is forgotten so the next attempt retries.
  function ensureTurnstileWidget() {
    if (!turnstileWidgetPromise) {
      turnstileWidgetPromise = loadTurnstileScript()
        .then(renderAssistantTurnstileWidget)
        .catch(function (err) {
          turnstileWidgetPromise = null;
          throw err;
        });
    }
    return turnstileWidgetPromise;
  }

  function getFreshTurnstileToken() {
    return ensureTurnstileWidget().then(function () {
      return new Promise(function (resolve, reject) {
        pendingTokenResolve = resolve;
        pendingTokenReject = reject;
        window.turnstile.reset(turnstileWidgetId);
        window.turnstile.execute(turnstileWidgetId);
      });
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
          addSourceLink(data.source, question, data.answer);
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
