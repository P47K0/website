/**
 * Populates the "AI messages sent" stat tile: total number of questions
 * answered by the "Ask about Patrick" chat widget, counted from the
 * demo_executions rows it logs (see /api/assistant-usage in worker/index.js).
 */
(function () {
  fetch("/api/ai-messages-count")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      const el = document.getElementById("ai-messages-count");
      window.animateCountUp(el, data.count ?? 0);
    })
    .catch(function () {});
})();
