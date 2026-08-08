/* Small UI helpers: escaping, formatting, status box, modal open/close,
   form field errors. No state here — everything acts on the DOM directly. */
(function () {
  'use strict';

  const App = (window.ContactManager = window.ContactManager || {});

  const $ = (id) => document.getElementById(id);

  App.escapeHtml = (value) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  App.initials = (name) => {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 1);
    return (parts[0].slice(0, 1) + parts[parts.length - 1].slice(0, 1)).toUpperCase();
  };

  App.formatDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return (
      d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) +
      ' · ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    );
  };

  // Transient toast-like status line inside the app header area.
  let statusTimer = null;
  App.showStatus = (message, type) => {
    const el = $('status');
    if (!el) return;
    el.textContent = message;
    el.className = 'status show ' + (type || 'success');
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => el.classList.remove('show'), 3500);
  };

  App.openModal = (el) => {
    el.hidden = false;
    el.classList.add('open');
  };

  App.closeModal = (el) => {
    el.classList.remove('open');
    el.hidden = true;
  };

  App.clearFieldErrors = () => {
    document.querySelectorAll('.field.invalid').forEach((f) => f.classList.remove('invalid'));
    document.querySelectorAll('.field-error').forEach((e) => (e.textContent = ''));
  };

  App.setFieldError = (name, message) => {
    const input = $(name);
    const holder = document.querySelector(`[data-error-for="${name}"]`);
    if (input) {
      const field = input.closest('.field');
      if (field) field.classList.add('invalid');
    }
    if (holder) holder.textContent = message;
  };
})();