/**
 * Populates the homepage's "Most-read article" link, if there's any data
 * yet.
 *
 * Fetched client-side, after initial paint, same as blog-counter.js. Hits
 * this site's own /api/most-viewed-article route rather than blog-api-proxy
 * directly: that endpoint's CORS allow-list is locked to blog.koorevaar.com,
 * so a same-origin worker route proxies it server-side (see worker/index.js).
 * A 204 (nothing synced yet, or any upstream error) means there's nothing to
 * show -- the link just stays hidden rather than rendering empty.
 *
 * The thumbnail is the article's coverImageUrl (a pre-resized 1200x630 JPEG
 * on images.koorevaar.com, CSS-scaled down here). Articles without one just
 * show the text card; an image that fails to load is hidden again.
 */
(function () {
  fetch("/api/most-viewed-article")
    .then(function (r) { return r.status === 204 ? null : r.json(); })
    .then(function (data) {
      if (!data || !data.slug) return;
      const el = document.getElementById("most-viewed-article");
      if (!el) return;
      document.getElementById("mv-article-title").textContent = data.title || "";
      document.getElementById("mv-article-summary").textContent = data.summary || "";
      el.href = "https://blog.koorevaar.com/articles/" + encodeURIComponent(data.slug);
      const thumb = document.getElementById("mv-article-thumb");
      if (thumb && data.coverImageUrl) {
        thumb.onerror = function () { thumb.hidden = true; };
        thumb.src = data.coverImageUrl;
        thumb.hidden = false;
      }
      el.style.display = "flex";
    })
    .catch(function () {});
})();
