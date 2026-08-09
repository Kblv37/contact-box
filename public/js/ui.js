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

  // Global toast: a small floating notification (top vanishes, bottom shows)
  // used for transient messages (errors, confirmations). Auto-dismisses.
  let toastTimer = null;
  App.toast = (message, type) => {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.className = 'show ' + (type || 'success');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = ''; }, 3600);
  };

  // Copy text to the clipboard (works over https and localhost, with a
  // legacy execCommand fallback for other contexts).
  App.copyText = (text) => {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(String(text));
    }
    return new Promise((resolve, reject) => {
      const ta = document.createElement('textarea');
      ta.value = String(text);
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (err) {
        return reject(err);
      } finally {
        ta.remove();
      }
      ok ? resolve() : reject(new Error('Copy failed'));
    });
  };

  // Backwards-compatible alias.
  App.showStatus = App.toast;

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