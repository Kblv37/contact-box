/* Contacts view: list rendering, live search, add/edit/delete via modals.
   Depends on App.api and App.ui. */
(function () {
  'use strict';

  const App = (window.ContactManager = window.ContactManager || {});
  const $ = (id) => document.getElementById(id);

  const contactList = $('contactList');
  const emptyState = $('emptyState');
  const noResults = $('noResults');
  const searchInput = $('searchInput');
  const countEl = $('count');
  const modal = $('modal');
  const modalTitle = $('modalTitle');
  const contactForm = $('contactForm');
  const contactIdInput = $('contactId');
  const saveBtn = $('saveBtn');
  const confirmModal = $('confirmModal');
  const confirmText = $('confirmText');
  const confirmDeleteBtn = $('confirmDeleteBtn');

  const state = { contacts: [] };
  let debounceTimer = null;
  let editingId = null;
  let pendingDelete = null;

  // ---------- rendering ----------
  function render(applyFilter = true) {
    const q = applyFilter ? searchInput.value.trim().toLowerCase() : '';
    let visible = state.contacts;

    if (q) {
      visible = state.contacts.filter((c) =>
        (c.name + ' ' + c.phone + ' ' + c.note).toLowerCase().includes(q)
      );
    }

    countEl.textContent = visible.length + ' / ' + state.contacts.length;
    emptyState.hidden = state.contacts.length > 0;
    noResults.hidden = !(state.contacts.length > 0 && visible.length === 0);
    contactList.innerHTML = visible.map(contactCardHtml).join('');
  }

  function contactCardHtml(c) {
    const initial = App.escapeHtml(App.initials(c.name));
    const name = App.escapeHtml(c.name);
    const phone = App.escapeHtml(c.phone);
    const note = App.escapeHtml(c.note);
    const date = App.escapeHtml(App.formatDate(c.created_at));

    return `
      <li class="contact-card" data-id="${c.id}">
        <div class="avatar">${initial}</div>
        <div class="contact-body">
          <p class="contact-name">${name}</p>
          <ul class="contact-meta">
            <li><span class="meta-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.62 10.79c1.44 2.83 3.76 5.15 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg></span> <span class="contact-phone" data-copy role="button" tabindex="0" aria-label="Copy phone number">${phone}</span></li>
            ${note ? `<li><span class="meta-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg></span> <span>${note}</span></li>` : ''}
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

  // ---------- data ----------
  async function load() {
    try {
      const data = await App.getJSON('/contacts');
      state.contacts = Array.isArray(data) ? data : [];
      render();
    } catch (err) {
      state.contacts = [];
      render();
      App.toast('Failed to load contacts: ' + err.message, 'error');
    }
  }

  // ---------- add / edit modal ----------
  function openAddModal() {
    editingId = null;
    contactIdInput.value = '';
    contactForm.reset();
    App.clearFieldErrors();
    modalTitle.textContent = 'Add contact';
    saveBtn.textContent = 'Add';
    App.openModal(modal);
    setTimeout(() => $('name').focus(), 50);
  }

  function openEditModal(contact) {
    editingId = contact.id;
    contactIdInput.value = contact.id;
    $('name').value = contact.name || '';
    $('phone').value = contact.phone || '';
    $('note').value = contact.note || '';
    App.clearFieldErrors();
    modalTitle.textContent = 'Edit contact';
    saveBtn.textContent = 'Save';
    App.openModal(modal);
    setTimeout(() => $('name').focus(), 50);
  }

  // ---------- create / update ----------
  async function submitForm(e) {
    e.preventDefault();
    App.clearFieldErrors();

    const payload = {
      name: $('name').value.trim(),
      phone: $('phone').value.trim(),
      note: $('note').value.trim(),
    };

    if (!payload.name || !payload.phone) {
      if (!payload.name) App.setFieldError('name', 'Name is required');
      if (!payload.phone) App.setFieldError('phone', 'Phone is required');
      return;
    }

    const isEdit = editingId != null;
    try {
      if (isEdit) {
        await App.sendJSON('/contacts/' + editingId, 'PUT', payload);
        App.toast('Contact updated', 'success');
      } else {
        await App.sendJSON('/contacts', 'POST', payload);
        App.toast('Contact added', 'success');
      }
      App.closeModal(modal);
      await load();
    } catch (err) {
      if (err.details) {
        for (const key of Object.keys(err.details)) App.setFieldError(key, err.details[key]);
      }
      App.toast('Failed: ' + err.message, 'error');
    }
  }

  // ---------- delete ----------
  function askDelete(contact) {
    pendingDelete = contact;
    confirmText.textContent = `Delete "${contact.name}"? This cannot be undone.`;
    App.openModal(confirmModal);
  }

  async function doDelete() {
    if (!pendingDelete) return;
    const contact = pendingDelete;
    pendingDelete = null;
    try {
      await App.sendJSON('/contacts/' + contact.id, 'DELETE');
      App.closeModal(confirmModal);
      App.toast('Contact deleted', 'success');
      await load();
    } catch (err) {
      App.closeModal(confirmModal);
      App.toast('Failed to delete: ' + err.message, 'error');
    }
  }

  // ---------- expose ----------
  App.contacts = { load, state };

  // ---------- wire up ----------
  contactList.addEventListener('click', (e) => {
    const copyEl = e.target.closest('[data-copy]');
    if (copyEl) {
      App.copyText(copyEl.textContent.trim())
        .then(() => App.toast('Phone number copied', 'success'))
        .catch(() => App.toast('Could not copy phone number', 'error'));
      return;
    }

    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const li = btn.closest('.contact-card');
    const contact = state.contacts.find((c) => String(c.id) === li.dataset.id);
    if (!contact) return;

    if (btn.dataset.action === 'edit') openEditModal(contact);
    else if (btn.dataset.action === 'delete') askDelete(contact);
  });

  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => render(), 150);
  });

  $('addBtn').addEventListener('click', openAddModal);
  contactForm.addEventListener('submit', submitForm);
  confirmDeleteBtn.addEventListener('click', doDelete);

  // Close via backdrop / close buttons (both modals)
  [modal, confirmModal].forEach((m) => {
    m.addEventListener('click', (e) => {
      if (e.target === m) App.closeModal(m);
    });
    m.querySelectorAll('[data-close]').forEach((el) => {
      el.addEventListener('click', () => App.closeModal(m));
    });
  });
})();