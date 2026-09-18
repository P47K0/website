/**
 * Drives the count-up animation (see count-up.js) for stat tiles whose
 * value is a fixed constant maintained by hand, rather than computed by
 * their own dedicated counter script (tenure-counter.js, blog-counter.js,
 * etc). Kept in one place so every "static" tile animates consistently
 * instead of just popping in with its final number.
 */
(function () {
  function animate(id, target, finalText) {
    var el = document.getElementById(id);
    if (el && window.animateCountUp) window.animateCountUp(el, target, finalText);
  }

  animate("certifications-count", 7);
  animate("applied-ai-count", 6);
  animate("so-reputation-count", 1400, "1.4k");
  animate("aca-apps-count", 8);
  animate("azure-functions-count", 4);
  animate("cloudflare-workers-count", 12);
})();
