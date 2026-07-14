(function () {
  'use strict';

  // Performance mode (field request 2026-07-14): make Gmail feel lighter on
  // weak machines by removing Gmail's CSS transitions and smooth-scroll (the
  // main per-frame jank), gated on html[data-ob-perf] (see performance.css).
  // The extension's own footprint stays lean regardless (dark-mode surfaces run
  // off navigation/focus, not a page observer; per-navigate work is debounced) —
  // this switch is about Gmail's cost, not ours.

  function init() {
    if (location.host !== 'mail.google.com') return;
    return window.__OB.settings.get('performanceMode').then((on) => {
      document.documentElement.toggleAttribute('data-ob-perf', !!on);
    }).catch((e) => console.log('[OB] performance: init failed', e));
  }

  const api = { init };
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).performance = api;
})();
