/**
 * Computes "Months AI-assisted dev" from a fixed start date instead of a
 * hand-typed number that drifts every month — same reasoning as
 * tenure-counter.js's year counters.
 *
 * Started using AI tools (chat-only at first: Grok, Perplexity) for
 * development in April 2025.
 *
 * Floored to full completed months (a monthiversary that hasn't happened
 * yet this month doesn't count), so the plain integer is always accurate
 * on its own.
 */
(function () {
  function fullMonthsSince(startDate) {
    var now = new Date();
    var months =
      (now.getFullYear() - startDate.getFullYear()) * 12 +
      (now.getMonth() - startDate.getMonth());
    if (now.getDate() < startDate.getDate()) months--;
    return Math.max(months, 0);
  }

  var months = fullMonthsSince(new Date(2025, 3, 1));

  var tile = document.getElementById("ai-dev-months-count");
  if (tile && window.animateCountUp) window.animateCountUp(tile, months);
})();
