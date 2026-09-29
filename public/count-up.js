/**
 * Shared count-up effect for homepage stat tiles: animates a number from 0 up
 * to its final value over a fixed duration, easing out, instead of just
 * popping in. Skips straight to the final value for visitors who've asked
 * for reduced motion.
 *
 * Kept off the critical path: nothing animates before the window "load"
 * event, a tile only starts once it scrolls into view, and all running tiles
 * share one requestAnimationFrame loop instead of one loop each.
 * window.afterLoad lets the counter scripts hold their /api fetches until
 * then too, so they don't compete with fonts and images during page load.
 */
(function () {
  const DURATION_MS = 5000;
  const prefersReducedMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  window.afterLoad = function (fn) {
    if (document.readyState === "complete") fn();
    else window.addEventListener("load", fn, { once: true });
  };

  const running = [];
  function tick(now) {
    for (let i = running.length - 1; i >= 0; i--) {
      const a = running[i];
      if (a.start === undefined) a.start = now;
      const progress = Math.min((now - a.start) / DURATION_MS, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      a.el.textContent = progress < 1 ? Math.round(eased * a.target).toLocaleString() : a.display;
      if (progress === 1) running.splice(i, 1);
    }
    if (running.length) requestAnimationFrame(tick);
  }
  function run(el, target, display) {
    running.push({ el: el, target: target, display: display });
    if (running.length === 1) requestAnimationFrame(tick);
  }

  const observer = "IntersectionObserver" in window
    ? new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          const pending = entry.target.__countUp;
          delete entry.target.__countUp;
          run(entry.target, pending.target, pending.display);
        });
      })
    : null;

  window.animateCountUp = function (el, target, finalText) {
    if (!el) return;
    target = Number(target) || 0;
    const display = finalText || target.toLocaleString();
    if (prefersReducedMotion) {
      el.textContent = display;
      return;
    }

    window.afterLoad(function () {
      if (!observer) return run(el, target, display);
      el.__countUp = { target: target, display: display };
      observer.observe(el);
    });
  };
})();
