/**
 * Populates the homepage's "Recently answered by the AI assistant" box, if
 * there's anything cached yet. Answers only, no questions shown -- see
 * worker/index.js's handleRecentAnswers for why.
 *
 * Fetched client-side, after initial paint, same as most-viewed-article.js.
 * A 204 (cache still empty, or any upstream error) means there's nothing to
 * show -- the box just stays hidden rather than rendering empty.
 */
(function () {
  fetch("/api/recent-answers")
    .then(function (r) { return r.status === 204 ? null : r.json(); })
    .then(function (data) {
      if (!data || !Array.isArray(data.answers) || data.answers.length === 0) return;
      const el = document.getElementById("recent-answers");
      const list = document.getElementById("recent-answers-list");
      if (!el || !list) return;
      data.answers.forEach(function (answer) {
        const li = document.createElement("li");
        li.textContent = answer;
        list.appendChild(li);
      });
      el.style.display = "block";
    })
    .catch(function () {});
})();
