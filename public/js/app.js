/* Contact Manager frontend — vanilla JS, no dependencies. */

(function () {
  'use strict';

  const API_BASE = getApiBase();

  // ---------- DOM refs ----------
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

  let contacts = [];
  let debounceTimer = null;
  let pendingDelete = null;
  let editingId = null;

  // ---------- helpers ----------
  function getApiBase() {
    // Local dev: relative /api. Netlify: Netlify Functions rewrite handles /api/*.
    return '/api';
  }

  function showStatus(message, type) {
    statusEl.textContent = message;
    statusEl.className = 'status show ' + type;
    clearTimeout(showStatus._t);
    showStatus._t = setTimeout(() => {
      statusEl.classList.remove('show');
    }, 3000);
  }

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
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) +
      ' · ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  function request(url, options) {
    return fetch(API_BASE + url, options).then(async (res) => {
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch (_) { /* ignore */ }
      if (!res.ok) {
        const err = new Error((data && data.error) || res.statusText || 'Request failed');
        err.status = res.status;
        err.details = data && data.details;
        throw err;
      }
      return data;
    });
  }

  function getJSON(url) {
    return request(url);
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
            <li>📞 <span>${phone}</span></li>
            ${note ? `<li>📝 <span>${note}</span></li>` : ''}
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
              <path fill="currentColor" d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM8 9h8v10H8V9zm2.5-6.5h3l1 1H19v2H5v-2h4.5z"/>
            </svg>
          </button>
        </div>
      </li>
    `;
  }

  // ---------- data ----------
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

  // ---------- modal ----------
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

  // ---------- actions ----------
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

  async function sendJSON(url, method, body) {
    return request(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
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
  loadContacts();
})();