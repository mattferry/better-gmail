(function () {
  'use strict';
  const SELECTORS = {
    // verify live — Settings gear that opens the density/theme menu
    settingsGear: 'button[aria-label*="Settings"]'
  };
  function isReady() { return location.host === 'calendar.google.com' && !!document.querySelector('[role="main"]'); }
  // Google Calendar has a native dark theme. If the account isn't already dark,
  // we invert residual white surfaces via dark-mode.css; there is no reliable
  // programmatic toggle, so this is a no-op hook kept for future use.
  function enforceDarkTheme() { /* handled by CSS invert of residual surfaces */ }
  const api = { isReady, enforceDarkTheme, SELECTORS };
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).calendar = api;
})();
