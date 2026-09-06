/**
 * Populates the public "Blog Articles" stat tile.
 *
 * Fetched client-side, after initial paint, so this never blocks the
 * homepage's time-to-first-byte. Hits this site's own /api/blog-count route
 * rather than blog-api-proxy directly: that endpoint's CORS allow-list is
 * locked to blog.koorevaar.com, so a same-origin worker route proxies it
 * server-side (see worker/index.js) and the count shown is exactly what a
 * visitor could actually read on the blog.
 */
(function () {
  fetch("/api/blog-count")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      const el = document.getElementById("blog-article-count");
      window.animateCountUp(el, data.count ?? 0);
    })
    .catch(function () {});
})();
