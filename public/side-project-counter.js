/**
 * Populates the "Side Projects" stat tile by counting the project cards
 * actually rendered in the Side Projects section, instead of a hand-typed
 * number that drifts out of sync whenever a card is added or removed.
 *
 * Each project card's wrapper carries an id like "project-blog-platform";
 * subcards inside a project (the feature grid) never do, so this selector
 * only ever matches the top-level cards.
 */
(function () {
  const count = document.querySelectorAll('#side-projects-section [id^="project-"]').length;
  const el = document.getElementById("side-project-count");
  window.animateCountUp(el, count);
})();
