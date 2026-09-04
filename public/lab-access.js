/**
 * "Request Login" modal on the CKA Practice Lab card. Posts to this site's
 * own /api/lab-access, which forwards to the contact worker over a service
 * binding (same one the Lab's own in-app feedback button reaches) — so
 * Patrick gets the request by email without any CORS setup between origins.
 */
(function () {
  const LAB_ACCESS_ENDPOINT = "/api/lab-access";

  const form = document.getElementById("lab-access-form");
  const emailInput = document.getElementById("lab-access-email");
  const submitBtn = document.getElementById("lab-access-submit");
  const status = document.getElementById("lab-access-status");
  if (!form || !emailInput || !submitBtn || !status) return;

  function setStatus(text, className) {
    status.textContent = text;
    status.className = className ? "mt-3 " + className : "mt-3";
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    const email = emailInput.value.trim();
    if (!email) return;

    submitBtn.disabled = true;
    submitBtn.textContent = "Sending...";
    setStatus("");

    fetch(LAB_ACCESS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email })
    })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (data) {
        if (data.success) {
          setStatus("Thanks! I'll email you a login shortly.", "text-success");
          form.reset();
        } else {
          setStatus(data.message || "Something went wrong. Please try again later.", "text-danger");
        }
      })
      .catch(function () {
        setStatus("Something went wrong. Please try again later.", "text-danger");
      })
      .finally(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = "Send Request";
      });
  });

  // Clear status/fields whenever the modal is reopened.
  const modal = document.getElementById("lab-access-modal");
  if (modal && window.jQuery) {
    window.jQuery(modal).on("show.bs.modal", function () {
      setStatus("");
      form.reset();
    });
  }
})();
