/**
 * Renders the public subset of the private GitHub Projects backlog board.
 * The filtering (dropping items marked Visibility = "Private") happens
 * server-side in the worker; this just renders whatever /api/backlog returns.
 */
(function () {
  const STATUS_BADGE = {
    "done": "badge-success",
    "completed": "badge-success",
    "in progress": "badge-primary",
    "blocked": "badge-danger"
  };

  function statusBadgeClass(status) {
    return STATUS_BADGE[(status || "").trim().toLowerCase()] || "badge-secondary";
  }

  function buildCard(item) {
    const col = document.createElement("div");
    col.className = "col-md-4 mb-3";

    const card = document.createElement("div");
    card.className = "card h-100";

    const body = document.createElement("div");
    body.className = "card-body";

    const title = document.createElement("h5");
    title.className = "card-title";
    title.textContent = item.title;
    body.appendChild(title);

    if (item.status) {
      const badge = document.createElement("span");
      badge.className = "badge " + statusBadgeClass(item.status) + " mb-2";
      badge.textContent = item.status;
      body.appendChild(badge);
    }

    card.appendChild(body);
    col.appendChild(card);
    return col;
  }

  fetch("/api/backlog")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      const items = Array.isArray(data.items) ? data.items : [];
      const list = document.getElementById("backlog-list");
      const empty = document.getElementById("backlog-empty");
      if (!list || !empty) return;

      if (items.length === 0) {
        empty.classList.remove("d-none");
        return;
      }

      items.forEach(function (item) {
        list.appendChild(buildCard(item));
      });
    })
    .catch(function () {
      const section = document.getElementById("backlog-section");
      if (section) section.classList.add("d-none");
    });
})();
