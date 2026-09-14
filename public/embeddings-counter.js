/**
 * Populates the "Embeddings stored" stat tile: total vector count backing
 * the "Ask about Patrick" chat widget's retrieval. Fetched from this site's
 * own /api/embeddings-count route, which proxies assistant-worker's internal
 * endpoint server-side (see worker/index.js) rather than calling it directly
 * from the browser.
 */
(function () {
  fetch("/api/embeddings-count")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      const el = document.getElementById("embeddings-count");
      window.animateCountUp(el, data.count ?? 0);
    })
    .catch(function () {});
})();
