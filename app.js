(() => {
  "use strict";

  const suppliedConfig = window.HERBALIFE_ADMIN_CONFIG || {};
  const config = {
    supabaseUrl: String(suppliedConfig.supabaseUrl || "").trim(),
    supabasePublishableKey: String(suppliedConfig.supabasePublishableKey || "").trim(),
    adminLoginDomain: String(
      suppliedConfig.adminLoginDomain || suppliedConfig.loginIdDomain || "herbalife.com",
    )
      .trim()
      .toLowerCase(),
    userLoginDomain: String(
      suppliedConfig.userLoginDomain || "herbalife.user",
    )
      .trim()
      .toLowerCase(),
    edgeFunctionName: String(suppliedConfig.edgeFunctionName || "admin-users").trim(),
    adminSessionInactivityMinutes: Math.max(
      5,
      Number(suppliedConfig.adminSessionInactivityMinutes) || 15,
    ),
    minimumUserPasswordLength: Math.max(
      6,
      Number(suppliedConfig.minimumUserPasswordLength) || 8,
    ),
  };

  const configReady =
    /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(config.supabaseUrl) &&
    config.supabasePublishableKey &&
    !config.supabasePublishableKey.includes("YOUR_");

  const elements = {
    loginView: document.getElementById("loginView"),
    dashboardView: document.getElementById("dashboardView"),
    loginForm: document.getElementById("loginForm"),
    adminLoginId: document.getElementById("adminLoginId"),
    adminPassword: document.getElementById("adminPassword"),
    loginButton: document.getElementById("loginButton"),
    loginError: document.getElementById("loginError"),
    adminIdentity: document.getElementById("adminIdentity"),
    logoutButton: document.getElementById("logoutButton"),
    refreshButton: document.getElementById("refreshButton"),
    totalUsersStat: document.getElementById("totalUsersStat"),
    activeUsersStat: document.getElementById("activeUsersStat"),
    disabledUsersStat: document.getElementById("disabledUsersStat"),
    createUserForm: document.getElementById("createUserForm"),
    newLoginId: document.getElementById("newLoginId"),
    newPassword: document.getElementById("newPassword"),
    newUserActive: document.getElementById("newUserActive"),
    createUserButton: document.getElementById("createUserButton"),
    createError: document.getElementById("createError"),
    passwordRuleText: document.getElementById("passwordRuleText"),
    userSearch: document.getElementById("userSearch"),
    usersLoading: document.getElementById("usersLoading"),
    usersEmpty: document.getElementById("usersEmpty"),
    usersTableWrap: document.getElementById("usersTableWrap"),
    usersTableBody: document.getElementById("usersTableBody"),
    passwordDialog: document.getElementById("passwordDialog"),
    resetPasswordForm: document.getElementById("resetPasswordForm"),
    resetUserLabel: document.getElementById("resetUserLabel"),
    resetUserId: document.getElementById("resetUserId"),
    resetPassword: document.getElementById("resetPassword"),
    resetPasswordButton: document.getElementById("resetPasswordButton"),
    resetError: document.getElementById("resetError"),
    credentialDialog: document.getElementById("credentialDialog"),
    credentialDialogTitle: document.getElementById("credentialDialogTitle"),
    credentialLoginId: document.getElementById("credentialLoginId"),
    credentialPassword: document.getElementById("credentialPassword"),
    copyCredentialsButton: document.getElementById("copyCredentialsButton"),
    confirmDialog: document.getElementById("confirmDialog"),
    confirmTitle: document.getElementById("confirmTitle"),
    confirmMessage: document.getElementById("confirmMessage"),
    confirmActionButton: document.getElementById("confirmActionButton"),
    toastRegion: document.getElementById("toastRegion"),
  };

  elements.passwordRuleText.textContent = `Use at least ${config.minimumUserPasswordLength} characters.`;
  elements.newPassword.minLength = config.minimumUserPasswordLength;
  elements.resetPassword.minLength = config.minimumUserPasswordLength;

  let client = null;
  let currentUsers = [];
  let inactivityTimer = null;
  let pendingConfirmation = null;
  let lastDisplayedCredential = null;

  function buildSessionStorage() {
    return {
      getItem(key) {
        return Promise.resolve(window.sessionStorage.getItem(key));
      },
      setItem(key, value) {
        window.sessionStorage.setItem(key, value);
        return Promise.resolve();
      },
      removeItem(key) {
        window.sessionStorage.removeItem(key);
        return Promise.resolve();
      },
    };
  }

  function createSupabaseClient() {
    if (!configReady || !window.supabase || !window.supabase.createClient) return null;
    return window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storage: buildSessionStorage(),
        storageKey: "herbalife-admin-console-session",
      },
    });
  }

  function normaliseLoginId(value) {
    return String(value || "").trim().toLowerCase();
  }

  function validateLoginId(value) {
    const loginId = normaliseLoginId(value);
    if (loginId.length < 3 || loginId.length > 64) {
      return "User ID must contain between 3 and 64 characters.";
    }
    if (!/^[a-z0-9._-]+$/.test(loginId)) {
      return "Use only letters, numbers, full stops, underscores and hyphens.";
    }
    return "";
  }

  function identityForLoginId(loginId) {
    return `${normaliseLoginId(loginId)}@${config.adminLoginDomain}`;
  }

  function displayLoginIdFromEmail(email) {
    const value = String(email || "").toLowerCase();
    const suffix = `@${config.adminLoginDomain}`;
    return value.endsWith(suffix) ? value.slice(0, -suffix.length) : value;
  }

  function setFormError(element, message) {
    element.textContent = message || "";
    element.hidden = !message;
  }

  function setBusy(button, busy, busyLabel) {
    if (!button.dataset.originalLabel) button.dataset.originalLabel = button.textContent;
    button.disabled = busy;
    button.textContent = busy ? busyLabel : button.dataset.originalLabel;
  }

  function showToast(message, type = "success") {
    const toast = document.createElement("div");
    toast.className = `toast${type === "error" ? " toast-error" : ""}`;
    toast.textContent = message;
    elements.toastRegion.appendChild(toast);
    window.setTimeout(() => toast.remove(), 4300);
  }

  function formatDateTime(value) {
    if (!value) return "Never";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Never";
    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function parseFunctionError(error) {
    if (!error) return "The request could not be completed.";
    try {
      if (error.context && typeof error.context.json === "function") {
        const body = await error.context.json();
        if (body && body.error) return String(body.error);
      }
    } catch (_) {
      // Fall back to the public error message.
    }
    return error.message || "The request could not be completed.";
  }

  async function invokeAdminFunction(payload) {
    const { data: sessionData } = await client.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) throw new Error("Administrator session has expired.");

    const { data, error } = await client.functions.invoke(config.edgeFunctionName, {
      body: payload,
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (error) throw new Error(await parseFunctionError(error));
    if (!data || data.ok !== true) throw new Error(data?.error || "The request could not be completed.");
    return data;
  }

  function showLogin(message = "") {
    clearInactivityTimer();
    elements.dashboardView.hidden = true;
    elements.loginView.hidden = false;
    elements.adminPassword.value = "";
    setFormError(elements.loginError, message);
    window.setTimeout(() => elements.adminLoginId.focus(), 20);
  }

  function showDashboard(adminLoginId) {
    elements.loginView.hidden = true;
    elements.dashboardView.hidden = false;
    elements.adminIdentity.textContent = adminLoginId ? `Signed in as ${adminLoginId}` : "Administrator";
    resetInactivityTimer();
  }

  function clearInactivityTimer() {
    if (inactivityTimer) window.clearTimeout(inactivityTimer);
    inactivityTimer = null;
  }

  function resetInactivityTimer() {
    if (elements.dashboardView.hidden) return;
    clearInactivityTimer();
    inactivityTimer = window.setTimeout(async () => {
      await logout("You were signed out after a period of inactivity.");
    }, config.adminSessionInactivityMinutes * 60 * 1000);
  }

  async function logout(message = "") {
    clearInactivityTimer();
    if (client) await client.auth.signOut().catch(() => {});
    currentUsers = [];
    renderUsers();
    showLogin(message);
  }

  function renderStats() {
    const active = currentUsers.filter((user) => user.active).length;
    elements.totalUsersStat.textContent = currentUsers.length.toLocaleString("en-IN");
    elements.activeUsersStat.textContent = active.toLocaleString("en-IN");
    elements.disabledUsersStat.textContent = (currentUsers.length - active).toLocaleString("en-IN");
  }

  function renderUsers() {
    renderStats();
    const query = normaliseLoginId(elements.userSearch.value);
    const filtered = currentUsers.filter((user) => !query || user.loginId.includes(query));

    elements.usersLoading.hidden = true;
    elements.usersEmpty.hidden = filtered.length !== 0;
    elements.usersTableWrap.hidden = filtered.length === 0;

    elements.usersTableBody.innerHTML = filtered
      .map(
        (user) => `
          <tr>
            <td data-label="User ID"><span class="user-id">${escapeHtml(user.loginId)}</span></td>
            <td data-label="Status">
              <span class="status-pill ${user.active ? "status-active" : "status-disabled"}">
                ${user.active ? "Active" : "Disabled"}
              </span>
            </td>
            <td data-label="Last login" class="muted-cell">${escapeHtml(formatDateTime(user.lastLoginAt))}</td>
            <td data-label="Created" class="muted-cell">${escapeHtml(formatDateTime(user.createdAt))}</td>
            <td class="actions-column" data-label="Actions">
              <div class="row-actions">
                <button class="row-action" type="button" data-action="reset-password" data-user-id="${escapeHtml(user.id)}" data-login-id="${escapeHtml(user.loginId)}">Reset password</button>
                <button class="row-action ${user.active ? "row-action-danger" : ""}" type="button" data-action="toggle-access" data-user-id="${escapeHtml(user.id)}" data-login-id="${escapeHtml(user.loginId)}" data-current-active="${user.active}">
                  ${user.active ? "Disable" : "Enable"}
                </button>
              </div>
            </td>
          </tr>
        `,
      )
      .join("");
  }

  async function loadUsers({ quiet = false } = {}) {
    if (!quiet) {
      elements.usersLoading.hidden = false;
      elements.usersEmpty.hidden = true;
      elements.usersTableWrap.hidden = true;
    }
    try {
      const result = await invokeAdminFunction({ action: "list" });
      currentUsers = Array.isArray(result.users) ? result.users : [];
      currentUsers.sort((a, b) => a.loginId.localeCompare(b.loginId));
      renderUsers();
    } catch (error) {
      const message = error.message || "Could not load users.";
      if (/administrator session|not authorised|expired/i.test(message)) {
        await logout(message);
        return;
      }
      elements.usersLoading.textContent = message;
      elements.usersLoading.hidden = false;
      showToast(message, "error");
    }
  }

  function showCredentialDialog(title, loginId, password) {
    lastDisplayedCredential = { loginId, password };
    elements.credentialDialogTitle.textContent = title;
    elements.credentialLoginId.textContent = loginId;
    elements.credentialPassword.textContent = password;
    elements.credentialDialog.showModal();
  }

  async function copyCredentials() {
    if (!lastDisplayedCredential) return;
    const text = `User ID: ${lastDisplayedCredential.loginId}\nPassword: ${lastDisplayedCredential.password}`;
    try {
      await navigator.clipboard.writeText(text);
      showToast("Credentials copied.");
    } catch (_) {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      showToast("Credentials copied.");
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    setFormError(elements.loginError, "");
    if (!configReady || !client) {
      setFormError(elements.loginError, "Configure the Supabase Project URL and publishable key in config.js first.");
      return;
    }

    const loginId = normaliseLoginId(elements.adminLoginId.value);
    const loginError = validateLoginId(loginId);
    if (loginError) {
      setFormError(elements.loginError, loginError);
      return;
    }
    if (!elements.adminPassword.value) {
      setFormError(elements.loginError, "Enter the administrator password.");
      return;
    }

    setBusy(elements.loginButton, true, "Signing in…");
    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: identityForLoginId(loginId),
        password: elements.adminPassword.value,
      });
      if (error || !data.session) throw new Error("Invalid administrator ID or password.");

      showDashboard(loginId);
      try {
        await loadUsers();
      } catch (_) {
        // loadUsers handles administrator authorization failures.
      }
    } catch (error) {
      await client.auth.signOut().catch(() => {});
      setFormError(elements.loginError, error.message || "Unable to sign in.");
    } finally {
      setBusy(elements.loginButton, false, "Signing in…");
    }
  }

  async function handleCreateUser(event) {
    event.preventDefault();
    setFormError(elements.createError, "");
    const loginId = normaliseLoginId(elements.newLoginId.value);
    const loginError = validateLoginId(loginId);
    if (loginError) {
      setFormError(elements.createError, loginError);
      return;
    }
    const password = elements.newPassword.value;
    if (password.length < config.minimumUserPasswordLength) {
      setFormError(
        elements.createError,
        `Password must contain at least ${config.minimumUserPasswordLength} characters.`,
      );
      return;
    }

    setBusy(elements.createUserButton, true, "Creating…");
    try {
      await invokeAdminFunction({
        action: "create",
        loginId,
        password,
        active: elements.newUserActive.checked,
      });
      elements.createUserForm.reset();
      elements.newUserActive.checked = true;
      showCredentialDialog("User created", loginId, password);
      await loadUsers({ quiet: true });
      showToast("User created successfully.");
    } catch (error) {
      setFormError(elements.createError, error.message || "Could not create the user.");
    } finally {
      setBusy(elements.createUserButton, false, "Creating…");
    }
  }

  function openResetDialog(userId, loginId) {
    elements.resetUserId.value = userId;
    elements.resetUserLabel.textContent = loginId;
    elements.resetPassword.value = "";
    setFormError(elements.resetError, "");
    elements.passwordDialog.showModal();
    window.setTimeout(() => elements.resetPassword.focus(), 30);
  }

  async function handleResetPassword(event) {
    event.preventDefault();
    setFormError(elements.resetError, "");
    const userId = elements.resetUserId.value;
    const loginId = elements.resetUserLabel.textContent;
    const password = elements.resetPassword.value;
    if (password.length < config.minimumUserPasswordLength) {
      setFormError(
        elements.resetError,
        `Password must contain at least ${config.minimumUserPasswordLength} characters.`,
      );
      return;
    }

    setBusy(elements.resetPasswordButton, true, "Updating…");
    try {
      await invokeAdminFunction({ action: "reset-password", userId, password });
      elements.passwordDialog.close();
      showCredentialDialog("Password updated", loginId, password);
      showToast("Password updated successfully.");
    } catch (error) {
      setFormError(elements.resetError, error.message || "Could not update the password.");
    } finally {
      setBusy(elements.resetPasswordButton, false, "Updating…");
    }
  }

  function openAccessConfirmation(userId, loginId, currentActive) {
    const enable = !currentActive;
    elements.confirmTitle.textContent = enable ? "Enable user access" : "Disable user access";
    elements.confirmMessage.textContent = enable
      ? `Allow ${loginId} to sign in to the calculator?`
      : `Prevent ${loginId} from signing in? A device that remains offline may retain its existing offline access until that grant expires.`;
    delete elements.confirmActionButton.dataset.originalLabel;
    elements.confirmActionButton.textContent = enable ? "Enable access" : "Disable access";
    elements.confirmActionButton.className = `button ${enable ? "button-primary" : "button-danger"}`;
    pendingConfirmation = async () => {
      setBusy(elements.confirmActionButton, true, enable ? "Enabling…" : "Disabling…");
      try {
        await invokeAdminFunction({ action: "set-access", userId, active: enable });
        elements.confirmDialog.close();
        await loadUsers({ quiet: true });
        showToast(enable ? "User access enabled." : "User access disabled.");
      } catch (error) {
        showToast(error.message || "Could not change access.", "error");
      } finally {
        setBusy(elements.confirmActionButton, false, "Working…");
        pendingConfirmation = null;
      }
    };
    elements.confirmDialog.showModal();
  }

  function handleUserTableClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const userId = button.dataset.userId;
    const loginId = button.dataset.loginId;
    if (button.dataset.action === "reset-password") {
      openResetDialog(userId, loginId);
    } else if (button.dataset.action === "toggle-access") {
      openAccessConfirmation(userId, loginId, button.dataset.currentActive === "true");
    }
  }

  function handlePasswordToggle(button) {
    const input = document.getElementById(button.dataset.togglePassword);
    if (!input) return;
    const showing = input.type === "text";
    input.type = showing ? "password" : "text";
    button.textContent = showing ? "Show" : "Hide";
    button.setAttribute("aria-label", showing ? "Show password" : "Hide password");
  }

  async function restoreAdminSession() {
    if (!client) {
      showLogin("Configure config.js before using this portal.");
      return;
    }
    const { data } = await client.auth.getSession();
    const session = data?.session;
    if (!session) {
      showLogin();
      return;
    }
    const loginId = displayLoginIdFromEmail(session.user?.email);
    showDashboard(loginId);
    await loadUsers();
  }

  elements.loginForm.addEventListener("submit", handleLogin);
  elements.logoutButton.addEventListener("click", () => logout());
  elements.refreshButton.addEventListener("click", () => loadUsers());
  elements.createUserForm.addEventListener("submit", handleCreateUser);
  elements.userSearch.addEventListener("input", renderUsers);
  elements.usersTableBody.addEventListener("click", handleUserTableClick);
  elements.resetPasswordForm.addEventListener("submit", handleResetPassword);
  elements.copyCredentialsButton.addEventListener("click", copyCredentials);
  elements.confirmActionButton.addEventListener("click", () => pendingConfirmation?.());

  document.addEventListener("click", (event) => {
    const passwordButton = event.target.closest("[data-toggle-password]");
    if (passwordButton) handlePasswordToggle(passwordButton);

    const closeButton = event.target.closest("[data-close-dialog]");
    if (closeButton) {
      const dialog = document.getElementById(closeButton.dataset.closeDialog);
      if (dialog?.open) dialog.close();
    }
  });

  ["pointerdown", "keydown", "touchstart"].forEach((eventName) => {
    document.addEventListener(eventName, resetInactivityTimer, { passive: true });
  });

  [elements.passwordDialog, elements.credentialDialog, elements.confirmDialog].forEach((dialog) => {
    dialog.addEventListener("close", () => {
      if (dialog === elements.credentialDialog) {
        lastDisplayedCredential = null;
        elements.credentialPassword.textContent = "";
      }
      if (dialog === elements.confirmDialog) pendingConfirmation = null;
    });
  });

  client = createSupabaseClient();
  restoreAdminSession();
})();
