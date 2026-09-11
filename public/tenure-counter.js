/**
 * Computes "Years in IT" and "Years Azure & Kubernetes" from fixed start
 * dates instead of a hand-typed number that needs a manual edit every
 * birthday — same reasoning as side-project-counter.js.
 *
 * Years in IT: started 1 Jan 2000.
 * Years Azure & Kubernetes: started 1 Nov 2020.
 *
 * Both are floored to full completed years (an anniversary that hasn't
 * happened yet this year doesn't count), so the plain integer is always
 * accurate on its own — no "+" suffix needed.
 */
(function () {
  function fullYearsSince(startDate) {
    var now = new Date();
    var years = now.getFullYear() - startDate.getFullYear();
    var hadAnniversaryThisYear =
      now.getMonth() > startDate.getMonth() ||
      (now.getMonth() === startDate.getMonth() && now.getDate() >= startDate.getDate());
    if (!hadAnniversaryThisYear) years--;
    return years;
  }

  var yearsInIT = fullYearsSince(new Date(2000, 0, 1));
  var yearsAzure = fullYearsSince(new Date(2020, 10, 1));

  var itTile = document.getElementById("years-it-count");
  var azureTile = document.getElementById("years-azure-count");
  if (itTile && window.animateCountUp) window.animateCountUp(itTile, yearsInIT);
  if (azureTile && window.animateCountUp) window.animateCountUp(azureTile, yearsAzure);

  var itInline = document.getElementById("years-it-inline");
  var azureInline = document.getElementById("years-azure-inline");
  if (itInline) itInline.textContent = yearsInIT;
  if (azureInline) azureInline.textContent = yearsAzure;
})();
