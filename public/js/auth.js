/* Auth view: login / register tabs, form submit, show-password toggle,
   and view switching (auth <-> app). Depends on App.api and App.ui. */
(function () {
  'use strict';

  const App = (window.ContactManager = window.ContactManager || {});
  const $ = (id) => document.getElementById(id);

  const authView = $('authView');
  const appView = $('appView');
  const authForm = $('authForm');
  const authMode = $('authMode');
  const nameField = $('nameField');
  const authName = $('authName');
  const authEmail = $('authEmail');
  const authPassword = $('authPassword');
  const authSubmit = $('authSubmit');
  const authSwitch = $('authSwitch');
  const authTabLogin = $('authTabLogin');
  const authTabRegister = $('authTabRegister');
  const userEmailEl = $('userEmail');
  const logoutBtn = $('logoutBtn');
  const pwToggle = $('togglePassword');

  // ---------- view switching ----------
  function showAuthView() {
    resetAuthForm();
    appView.hidden = true;
    authView.hidden = false;
  }

  // Always return to a clean, predictable LOGIN form (e.g. on logout, init).
  // Otherwise the mode/tab can be left in 'register' state and the submit
  // button would re-register instead of logging in.
  function resetAuthForm() {
    setAuthMode('login');
    clearAuthError();
    authName.value = '';
    authEmail.value = '';
    authPassword.value = '';
    authSubmit.disabled = false;
    if (pwToggle) {
      authPassword.type = 'password';
      pwToggle.classList.remove('is-visible');
      pwToggle.setAttribute('aria-pressed', 'false');
      pwToggle.setAttribute('aria-label', 'Show password');
    }
  }

  function showAppView() {
    authView.hidden = true;
    appView.hidden = false;
    const u = App.getUser();
    if (userEmailEl) userEmailEl.textContent = u ? u.email : '';
    if (App.contacts) App.contacts.load();
  }

  // ---------- auth form helpers ----------
  function setAuthMode(mode) {
    authMode.value = mode;
    nameField.hidden = mode !== 'register';
    authTabLogin.classList.toggle('active', mode === 'login');
    authTabRegister.classList.toggle('active', mode === 'register');
    authSubmit.textContent = mode === 'login' ? 'Log in' : 'Create account';
    authSwitch.innerHTML =
      mode === 'login'
        ? 'Don&rsquo;t have an account? <strong>Sign up</strong>'
        : 'Already have an account? <strong>Log in</strong>';
  }

  function setAuthError(message) {
    App.toast(message, 'error');
  }

  function clearAuthError() {
    // Toasts auto-dismiss; nothing to clear.
  }

  async function handleSubmit(e) {
    e.preventDefault();
    clearAuthError();

    const mode = authMode.value;
    const email = authEmail.value.trim().toLowerCase();
    const password = authPassword.value;
    const name = authName.value.trim();

    if (!email || !password) {
      setAuthError('Email and password are required');
      return;
    }
    if (mode === 'register' && password.length < 6) {
      setAuthError('Password must be at least 6 characters');
      return;
    }

    authSubmit.disabled = true;
    const busyText = authSubmit.textContent;
    authSubmit.textContent = mode === 'register' ? 'Creating account…' : 'Signing in…';
    try {
      const data =
        mode === 'register'
          ? await App.sendJSON('/auth/register', 'POST', { name, email, password })
          : await App.sendJSON('/auth/login', 'POST', { email, password });

      App.setSession(data);
      resetAuthForm();
      showAppView();
    } catch (err) {
      const msg = err.details ? Object.values(err.details).join(' ') : err.message;
      setAuthError(msg);
    } finally {
      authSubmit.disabled = false;
      authSubmit.textContent = busyText;
    }
  }

  // ---------- show/hide password ----------
  function setupPasswordToggle() {
    if (!pwToggle || !authPassword) return;
    pwToggle.addEventListener('click', () => {
      const show = authPassword.type === 'password';
      authPassword.type = show ? 'text' : 'password';
      pwToggle.classList.toggle('is-visible', show);
      pwToggle.setAttribute('aria-pressed', String(show));
      pwToggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      authPassword.focus();
    });
  }

  function logout() {
    App.sendJSON('/auth/logout', 'POST').catch(() => {});
    App.clearSession();
    showAuthView();
  }

  // ---------- expose ----------
  App.auth = { showAuthView, showAppView, logout };

  // ---------- wire up ----------
  authForm.addEventListener('submit', handleSubmit);
  authSwitch.addEventListener('click', () => setAuthMode(authMode.value === 'login' ? 'register' : 'login'));
  [authTabLogin, authTabRegister].forEach((tab) => {
    tab.addEventListener('click', () => setAuthMode(tab.dataset.mode));
  });
  logoutBtn.addEventListener('click', logout);
  setupPasswordToggle();
})();