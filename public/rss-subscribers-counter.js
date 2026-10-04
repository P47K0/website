/**
 * Populates the "RSS subscribers" stat tile, an estimate from who polls the
 * blog's feed (see /api/feed-subscribers in worker/index.js). The tile stays
 * hidden until the count is above 0, so a new or failing estimate never
 * shows as "0 subscribers".
 */
(function () {
  window.afterLoad(function () {
    fetch("/api/feed-subscribers")
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!(data.count > 0)) return;
        document.getElementById("rss-subscribers-card").hidden = false;
        window.animateCountUp(document.getElementById("rss-subscribers-count"), data.count);
      })
      .catch(function () {});
  });
})();
