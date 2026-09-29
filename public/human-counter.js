/**
 * No-captcha human visitor counter.
 *
 * A visit is only counted once an invisible Turnstile token exists AND the
 * visitor has dwelled on the page for a few seconds AND produced at least one
 * real interaction (scroll, pointer, key, touch). This filters out plain
 * scripted requests and bots that don't execute JS or don't behave like a
 * person, without ever showing a challenge.
 */
(function () {
  const DWELL_MS = 5000;
  let interacted = false;
  let dwellDone = false;
  let fired = false;

  function maybeFire(token) {
    if (fired || !token || !interacted || !dwellDone) return;
    fired = true;
    fetch("/api/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token })
    }).catch(() => {});
  }

  // Turnstile is only loaded once the visitor interacts (see loadTurnstile in
  // index.html): a visit can't count without an interaction anyway, and
  // this keeps its ~900 KB challenge out of the page load.
  function renderTurnstile() {
    if (!window.loadTurnstile) return;
    window.loadTurnstile()
      .then(function (turnstile) {
        turnstile.render("#turnstile-container", {
          sitekey: "0x4AAAAAAElQdCZJAeoJJRls",
          size: "invisible",
          callback: function (token) {
            if (window.onTurnstileSuccess) window.onTurnstileSuccess(token);
          }
        });
      })
      .catch(function () {});
  }

  const interactionEvents = ["scroll", "pointermove", "keydown", "touchstart"];
  function onInteract() {
    interacted = true;
    renderTurnstile();
    maybeFire(window.__turnstileToken);
    interactionEvents.forEach(evt => window.removeEventListener(evt, onInteract));
  }
  interactionEvents.forEach(evt => window.addEventListener(evt, onInteract, { passive: true }));

  setTimeout(function () {
    dwellDone = true;
    maybeFire(window.__turnstileToken);
  }, DWELL_MS);

  // Called by the Turnstile widget's callback once a token is ready.
  window.onTurnstileSuccess = function (token) {
    window.__turnstileToken = token;
    maybeFire(token);
  };

  // Populate the public "Site Visits" stat tile.
  window.afterLoad(function () {
    fetch("/api/visit-stats")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        const el = document.getElementById("site-visit-count");
        window.animateCountUp(el, data.allTime ?? 0);
      })
      .catch(function () {});
  });
})();
