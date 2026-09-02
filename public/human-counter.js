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

  const interactionEvents = ["scroll", "pointermove", "keydown", "touchstart"];
  function onInteract() {
    interacted = true;
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

  // Populate the public "Human Visits" stat tile.
  fetch("/api/visit-stats")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      const el = document.getElementById("human-visitor-count");
      if (el) el.textContent = (data.allTime ?? 0).toLocaleString();
    })
    .catch(function () {});
})();
