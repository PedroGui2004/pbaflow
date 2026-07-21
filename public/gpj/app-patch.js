(function () {
  "use strict";

  function element(selector) {
    return document.querySelector(selector);
  }

  function syncBiosProblemVisibility() {
    var destination = element("#bios-destination");
    var problemField = element(".bios-problem");
    if (destination && problemField) problemField.classList.toggle("is-hidden", destination.value !== "repair");
  }

  document.addEventListener("change", function (event) {
    if (event.target && event.target.id === "bios-destination") syncBiosProblemVisibility();
  }, true);

  window.addEventListener("gpj:aux-sync", function (event) {
    var hash = event.detail && event.detail.hash;
    if (!hash || sessionStorage.getItem("gpj-aux-sync-hash") === hash) return;
    sessionStorage.setItem("gpj-aux-sync-hash", hash);
    window.location.reload();
  });

  var observer = new MutationObserver(function () { syncBiosProblemVisibility(); });
  observer.observe(document.body, { childList: true, subtree: true });
  syncBiosProblemVisibility();
})();
