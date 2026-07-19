(function () {
  "use strict";

  var backend = window.gpjBackend;
  if (!backend) return;

  function element(selector) {
    return document.querySelector(selector);
  }

  function showToast(message) {
    var toast = element("#toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    window.setTimeout(function () { toast.classList.remove("show"); }, 3200);
  }

  function currentRole() {
    var profile = backend.getProfile && backend.getProfile();
    return profile && profile.role ? profile.role : "technician";
  }

  function canManage() {
    var role = currentRole();
    return role === "manager" || role === "developer";
  }

  function openAdminLogin() {
    var modal = element("#modal");
    var kicker = element("#modal-kicker");
    var title = element("#modal-title");
    var body = element("#modal-body");
    if (!modal || !body) return;
    if (kicker) kicker.textContent = "Acesso seguro";
    if (title) title.textContent = "Entrar como Gestor ou DEV";
    body.innerHTML =
      '<form id="gpj-admin-login" class="form-stack">' +
        '<p class="modal-copy">Técnicos continuam usando a operação compartilhada sem senha. Para áreas administrativas, use uma conta cadastrada no Supabase.</p>' +
        '<label>E-mail<input id="gpj-admin-email" type="email" autocomplete="username" placeholder="nome@empresa.com.br" required></label>' +
        '<label>Senha<input id="gpj-admin-password" type="password" autocomplete="current-password" placeholder="Sua senha" required></label>' +
        '<p id="gpj-admin-error" class="validation-note" hidden></p>' +
        '<div class="modal-actions"><button class="button" value="cancel" type="button" data-gpj-close-login>Cancelar</button><button id="gpj-admin-submit" class="button button--primary" type="submit">Entrar</button></div>' +
      '</form>';
    if (!modal.open) modal.showModal();
    window.setTimeout(function () {
      var input = element("#gpj-admin-email");
      if (input) input.focus();
    }, 0);
  }

  function closeLogin() {
    var modal = element("#modal");
    if (modal && modal.open) modal.close();
  }

  function protectAction(event, action) {
    var protectedActions = {
      "delete-technician": true,
      "save-manager-settings": true,
      "save-channels": true
    };
    if (!protectedActions[action] || canManage()) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    showToast("Esta alteração exige uma conta de Gestor ou DEV.");
    return true;
  }

  function syncBiosProblemVisibility() {
    var destination = element("#bios-destination");
    var problemField = element(".bios-problem");
    if (destination && problemField) problemField.classList.toggle("is-hidden", destination.value !== "repair");
  }

  document.addEventListener("click", function (event) {
    var profileButton = event.target.closest && event.target.closest("#profile-button");
    if (profileButton && backend.isAuthenticated && !backend.isAuthenticated()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openAdminLogin();
      return;
    }

    var closeButton = event.target.closest && event.target.closest("[data-gpj-close-login]");
    if (closeButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeLogin();
      return;
    }

    var logoutButton = event.target.closest && event.target.closest('[data-action="sign-out"]');
    if (logoutButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      logoutButton.disabled = true;
      backend.signOut().finally(function () { window.location.reload(); });
      return;
    }

    var actionButton = event.target.closest && event.target.closest("[data-action]");
    if (actionButton) protectAction(event, actionButton.dataset.action);
  }, true);

  document.addEventListener("submit", function (event) {
    if (event.target && event.target.id === "gpj-admin-login") {
      event.preventDefault();
      event.stopImmediatePropagation();
      var email = element("#gpj-admin-email").value.trim();
      var password = element("#gpj-admin-password").value;
      var submit = element("#gpj-admin-submit");
      var errorBox = element("#gpj-admin-error");
      submit.disabled = true;
      submit.textContent = "Entrando...";
      if (errorBox) errorBox.hidden = true;
      backend.signIn(email, password).then(function () {
        window.location.reload();
      }).catch(function (error) {
        submit.disabled = false;
        submit.textContent = "Entrar";
        if (errorBox) {
          errorBox.hidden = false;
          errorBox.textContent = error.message || "Não foi possível autenticar.";
        }
      });
      return;
    }

    if (event.target && event.target.id === "technician-form" && !canManage()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showToast("O cadastro de técnicos exige uma conta de Gestor ou DEV.");
    }
  }, true);

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
