/**
 * Populates the "Side Projects" stat tile by counting the project cards
 * actually rendered on the page, instead of a hand-typed number that drifts
 * out of sync whenever a card is added or removed.
 *
 * The homepage layout spreads personal projects across several sections
 * (Applied AI, DevOps side-project cards, and the More projects list) rather
 * than one dedicated "side projects" container, so each qualifying card
 * carries a `data-project` attribute instead of relying on a shared parent
 * id or id-prefix convention. Day-job infrastructure cards (production AKS,
 * CI/CD, IaC) deliberately don't carry the attribute — they aren't side
 * projects.
 */
(function () {
  const count = document.querySelectorAll('[data-project]').length;
  const el = document.getElementById("side-project-count");
  window.animateCountUp(el, count);
})();
