/**
 * Shared count-up effect for homepage stat tiles: animates a number from 0 up
 * to its final value over a fixed duration, easing out, instead of just
 * popping in. Skips straight to the final value for visitors who've asked
 * for reduced motion.
 */
(function () {
  const DURATION_MS = 5000;
  const prefersReducedMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  window.animateCountUp = function (el, target) {
    if (!el) return;
    target = Number(target) || 0;
    if (prefersReducedMotion) {
      el.textContent = target.toLocaleString();
      return;
    }

    const start = performance.now();
    function tick(now) {
      const progress = Math.min((now - start) / DURATION_MS, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      el.textContent = Math.round(eased * target).toLocaleString();
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  };
})();
