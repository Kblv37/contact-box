/* API client + session (token/user) management. */
(function () {
  'use strict';

  const API_BASE = '/api';
  const TOKEN_KEY = 'contact_manager_token';

  const App = (window.ContactManager = window.ContactManager || {});

  let token = localStorage.getItem(TOKEN_KEY) || null;
  let user = null;

  App.getToken = () => token;
  App.getUser = () => user;
  App.setUser = (u) => { user = u; };

  App.setSession = (data) => {
    token = data.token;
    user = data.user || null;
    try { localStorage.setItem(TOKEN_KEY, token); } catch (_) { /* private mode */ }
  };

  App.clearSession = () => {
    token = null;
    user = null;
    try { localStorage.removeItem(TOKEN_KEY); } catch (_) { /* noop */ }
  };

  // Set by app.js; called when a token expires / is rejected server-side.
  App.onUnauthorized = null;

  /**
   * fetch wrapper. Returns parsed JSON (or null). Throws Error with a readable
   * message so the UI never shows a bare "Request failed".
   */
  App.api = function (method, path, body) {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers['Authorization'] = 'Bearer ' + token;

    // Abort stalled requests instead of leaving the UI frozen with no feedback
    // (e.g. slow custom-domain/Cloudflare round-trips).
    const controller = 'AbortController' in window ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), 30000) : null;

    return fetch(API_BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller ? controller.signal : undefined,
    })
      .then(async (res) => {
        if (timer) clearTimeout(timer);
        const text = await res.text();
        let data = null;
        if (text) {
          try { data = JSON.parse(text); } catch (_) { data = null; }
        }

        if (res.status === 401 && path !== '/auth/login' && path !== '/auth/register' && App.onUnauthorized) {
          App.onUnauthorized();
        }

        if (!res.ok) {
          // Reason phrase is empty on HTTP/2, so build a readable message:
          // JSON error body > HTML "<pre>Cannot POST ...</pre>" > status code.
          let msg = (data && data.error) || res.statusText || '';
          if (!msg && text) {
            const m = text.match(/<pre>([^<]*)<\/pre>/i);
            if (m) msg = m[1].trim();
          }
          const suffix = res.status ? ` (HTTP ${res.status})` : '';
          const err = new Error((msg || 'Request failed') + suffix);
          err.status = res.status;
          err.details = data && data.details;
          throw err;
        }
        return data;
      })
      .catch((err) => {
        if (timer) clearTimeout(timer);
        if (err && err.name === 'AbortError') {
          throw new Error('The request took too long — please try again.');
        }
        if (err instanceof TypeError) {
          throw new Error('Network error — is the server running?');
        }
        throw err;
      });
  };

  App.getJSON = (path) => App.api('GET', path);
  App.sendJSON = (path, method, body) => App.api(method, path, body);
})();