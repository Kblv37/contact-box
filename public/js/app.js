/* Contact Manager frontend — vanilla JS, no dependencies. */

(function () {
  'use strict';

  const API_BASE = '/api';
  const TOKEN_KEY = 'contact_manager_token';

  // ---------- DOM refs: auth ----------
  const authView = document.getElementById('authView');
  const appView = document.getElementById('appView');
  const authForm = document.getElementById('authForm');
  const authMode = document.getElementById('authMode');
  const authName = document.getElementById('authName');
  const nameField = document.getElementById('nameField');
  const authEmail = document.getElementById('authEmail');
  const authPassword = document.getElementById('authPassword');
  const authError = document.getElementById('authError');
  const authSubmit = document.getElementById('authSubmit');
  const authSwitch = document.getElementById('authSwitch');
  const authTabLogin = document.getElementById('authTabLogin');
  const authTabRegister = document.getElementById('authTabRegister');

  // ---------- DOM refs: app ----------
  const userEmailEl = document.getElementById('userEmail');
  const logoutBtn = document.getElementById('logoutBtn');
  const contactList = document.getElementById('contactList');
  const emptyState = document.getElementById('emptyState');
  const noResults = document.getElementById('noResults');
  const searchInput = document.getElementById('searchInput');
  const countEl = document.getElementById('count');
  const statusEl = document.getElementById('status');
  const modal = document.getElementById('modal');
  const modalTitle = document.getElementById('modalTitle');
  const contactForm = document.getElementById('contactForm');
  const contactIdInput = document.getElementById('contactId');
  const saveBtn = document.getElementById('saveBtn');
  const confirmModal = document.getElementById('confirmModal');
  const confirmText = document.getElementById('confirmText');
  const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

  // ---------- state ----------
  let token = localStorage.getItem(TOKEN_KEY) || null;
  let currentUser = null;
  let contacts = [];
  let debounceTimer = null;
  let pendingDelete = null;
  let editingId = null;

  // ---------- api ----------
  function api(method, path, body) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = 'Bearer ' + token;

    return fetch(API_BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then(async (res) => {
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch (_) { /* ignore */ }

      if (res.status === 401 && path !== '/auth/login' && path !== '/auth/register') {
        forceLogout();
      }
      if (!res.ok) {
        const err = new Error((data && data.error) || res.statusText || 'Request failed');
        err.status = res.status;
        err.details = data && data.details;
        throw err;
      }
      return data;
    }).catch((err) => {
      if (err instanceof TypeError) {
        throw new Error('Network error — is the server running?');
      }
      throw err;
    });
  }

  const getJSON = (path) => api('GET', path);
  const sendJSON = (path, method, body) => api(method, path, body);

  // ---------- auth UI ----------
  function showAuth(keepEmail = false) {
    appView.hidden = true;
    authView.hidden = false;
    if (!keepEmail) {
      authForm.reset();
      setAuthMode('login');
    }
    clearAuthError();
    setTimeout(() => authEmail.focus(), 50);
  }

  function showApp() {
    authView.hidden = true;
    appView.hidden = false;
    userEmailEl.textContent = currentUser ? currentUser.email : '';
    searchInput.value = '';
    render();
    loadContacts();
  }

  function forceLogout() {
    token = null;
    currentUser = null;
    localStorage.removeItem(TOKEN_KEY);
    showAuth();
  }

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
    authError.textContent = message;
    authError.hidden = false;
  }

  function clearAuthError() {
    authError.textContent = '';
    authError.hidden = true;
  }

  async function handleAuthSubmit(e) {
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
    try {
      const data = mode === 'register'
        ? await sendJSON('/auth/register', 'POST', { name, email, password })
        : await sendJSON('/auth/login', 'POST', { email, password });

      token = data.token;
      currentUser = data.user;
      localStorage.setItem(TOKEN_KEY, token);
      showApp();
    } catch (err) {
      setAuthError(err.details ? Object.values(err.details).join(' ') : err.message);
    } finally {
      authSubmit.disabled = false;
    }
  }

  // ---------- status ----------
  function showStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = 'status show ' + type;
    clearTimeout(showStatus._t);
    showStatus._t = setTimeout(() => statusEl.classList.remove('show'), 3000);
  }

  // ---------- helpers ----------
  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function initials(name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 1);
    return (parts[0].slice(0, 1) + parts[parts.length - 1].slice(0, 1)).toUpperCase();
  }

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return (
      d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) +
      ' · ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    );
  }

  // ---------- rendering ----------
  function render(applyFilter = true) {
    const q = applyFilter ? searchInput.value.trim().toLowerCase() : '';
    let visible = contacts;

    if (q) {
      visible = contacts.filter((c) =>
        (c.name + ' ' + c.phone + ' ' + c.note).toLowerCase().includes(q)
      );
    }

    countEl.textContent = visible.length + ' / ' + contacts.length;

    emptyState.hidden = contacts.length > 0;
    noResults.hidden = !(contacts.length > 0 && visible.length === 0);

    contactList.innerHTML = visible.map(contactCardHtml).join('');
  }

  function contactCardHtml(c) {
    const initial = escapeHtml(initials(c.name));
    const name = escapeHtml(c.name);
    const phone = escapeHtml(c.phone);
    const note = escapeHtml(c.note);
    const date = escapeHtml(formatDate(c.created_at));

    return `
      <li class="contact-card" data-id="${c.id}">
        <div class="avatar">${initial}</div>
        <div class="contact-body">
          <p class="contact-name">${name}</p>
          <ul class="contact-meta">
            <li><span class="meta-icon">📞</span> <span>${phone}</span></li>
            ${note ? `<li><span class="meta-icon">📝</span> <span>${note}</span></li>` : ''}
          </ul>
          <span class="contact-date">${date}</span>
        </div>
        <div class="contact-actions">
          <button class="btn btn-ghost icon-btn" data-action="edit" aria-label="Edit ${name}">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
            </svg>
          </button>
          <button class="btn btn-ghost icon-btn" data-action="delete" aria-label="Delete ${name}">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path fill="currentColor" d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM8 9h8v10H8V9zm2.5-5.5h3l1 1H19v2H5v-2h4.5z"/>
            </svg>
          </button>
        </div>
      </li>
    `;
  }

  // ---------- contacts data ----------
  async function loadContacts() {
    try {
      const data = await getJSON('/contacts');
      contacts = Array.isArray(data) ? data : [];
      render();
    } catch (err) {
      contacts = [];
      render();
      showStatus('Failed to load contacts: ' + err.message, 'error');
    }
  }

  // ---------- add/edit modal ----------
  function openAddModal() {
    editingId = null;
    contactIdInput.value = '';
    contactForm.reset();
    clearErrors();
    modalTitle.textContent = 'Add contact';
    saveBtn.textContent = 'Add';
    modal.hidden = false;
    setTimeout(() => document.getElementById('name').focus(), 50);
  }

  function openEditModal(contact) {
    editingId = contact.id;
    contactIdInput.value = contact.id;
    document.getElementById('name').value = contact.name || '';
    document.getElementById('phone').value = contact.phone || '';
    document.getElementById('note').value = contact.note || '';
    clearErrors();
    modalTitle.textContent = 'Edit contact';
    saveBtn.textContent = 'Save';
    modal.hidden = false;
    setTimeout(() => document.getElementById('name').focus(), 50);
  }

  function closeModal(el) {
    el.hidden = true;
  }

  function clearErrors() {
    document.querySelectorAll('.field.invalid').forEach((f) => f.classList.remove('invalid'));
    document.querySelectorAll('.field-error').forEach((e) => (e.textContent = ''));
  }

  function setFieldError(name, message) {
    const input = document.getElementById(name);
    const holder = document.querySelector(`[data-error-for="${name}"]`);
    if (input && input.closest('.field')) input.closest('.field').classList.add('invalid');
    if (holder) holder.textContent = message;
  }

  // ---------- contact actions ----------
  async function submitForm(e) {
    e.preventDefault();
    clearErrors();

    const payload = {
      name: document.getElementById('name').value.trim(),
      phone: document.getElementById('phone').value.trim(),
      note: document.getElementById('note').value.trim(),
    };

    if (!payload.name || !payload.phone) {
      if (!payload.name) setFieldError('name', 'Name is required');
      if (!payload.phone) setFieldError('phone', 'Phone is required');
      return;
    }

    const isEdit = editingId != null;
    try {
      if (isEdit) {
        await sendJSON('/contacts/' + editingId, 'PUT', payload);
        showStatus('Contact updated', 'success');
      } else {
        await sendJSON('/contacts', 'POST', payload);
        showStatus('Contact added', 'success');
      }
      closeModal(modal);
      await loadContacts();
    } catch (err) {
      if (err.details) {
        for (const key of Object.keys(err.details)) setFieldError(key, err.details[key]);
      }
      showStatus('Failed: ' + err.message, 'error');
    }
  }

  function askDelete(contact) {
    pendingDelete = contact;
    confirmText.textContent = `Delete "${contact.name}"? This cannot be undone.`;
    confirmModal.hidden = false;
  }

  async function doDelete() {
    if (!pendingDelete) return;
    const contact = pendingDelete;
    pendingDelete = null;
    try {
      await sendJSON('/contacts/' + contact.id, 'DELETE');
      closeModal(confirmModal);
      showStatus('Contact deleted', 'success');
      await loadContacts();
    } catch (err) {
      closeModal(confirmModal);
      showStatus('Failed to delete: ' + err.message, 'error');
    }
  }

  // ---------- events ----------
  authForm.addEventListener('submit', handleAuthSubmit);
  authSwitch.addEventListener('click', () =>
    setAuthMode(authMode.value === 'login' ? 'register' : 'login')
  );
  document.querySelectorAll('.auth-tab').forEach((tab) => {
    tab.addEventListener('click', () => setAuthMode(tab.dataset.mode));
  });
  logoutBtn.addEventListener('click', () => {
    sendJSON('/auth/logout', 'POST').catch(() => {});
    forceLogout();
  });

  contactList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const li = btn.closest('.contact-card');
    const contact = contacts.find((c) => String(c.id) === li.dataset.id);
    if (!contact) return;

    if (btn.dataset.action === 'edit') openEditModal(contact);
    else if (btn.dataset.action === 'delete') askDelete(contact);
  });

  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => render(), 150);
  });

  document.getElementById('addBtn').addEventListener('click', openAddModal);
  contactForm.addEventListener('submit', submitForm);
  confirmDeleteBtn.addEventListener('click', doDelete);

  document.querySelectorAll('[data-close]').forEach((el) => {
    el.addEventListener('click', () => closeModal(el.closest('.modal')));
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !authView.hidden) return;
    if (e.key === 'Escape') {
      closeModal(modal);
      closeModal(confirmModal);
    }
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal(modal);
  });
  confirmModal.addEventListener('click', (e) => {
    if (e.target === confirmModal) closeModal(confirmModal);
  });

  // ---------- init ----------
  async function init() {
    if (token) {
      try {
        currentUser = await getJSON('/auth/me');
        showApp();
        return;
      } catch (_) {
        token = null;
        localStorage.removeItem(TOKEN_KEY);
      }
    }
    showAuth();
  }

  init();
})();