/* Bootstrap: decides which view to show on load, handles token expiry and
   global keys. Must run last, after api.js / ui.js / auth.js / contacts.js. */
(function () {
  'use strict';

  const App = (window.ContactManager = window.ContactManager || {});
  const $ = (id) => document.getElementById(id);

  // Token rejected by the server -> back to the auth screen.
  App.onUnauthorized = () => {
    App.clearSession();
    App.auth.showAuthView();
  };

  function forceCloseModals() {
    App.closeModal($('modal'));
    App.closeModal($('confirmModal'));
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      forceCloseModals();
    }
  });

  async function init() {
    // Guarantee a closed, non-blocking UI state on every page load.
    forceCloseModals();

    if (App.getToken()) {
      try {
        const user = await App.getJSON('/auth/me');
        App.setUser(user);
        App.auth.showAppView();
        return;
      } catch (_) {
        App.clearSession();
      }
    }
    App.auth.showAuthView();
  }

  init();
})();