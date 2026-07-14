(function () {
  'use strict';

  // Performance mode (field request 2026-07-14): make Gmail feel lighter on
  // weak machines. Two levers, both pure CSS gated on html[data-ob-perf]
  // (see performance.css):
  //   1. Collapse Gmail's animations/transitions to ~0 — hover and pane
  //      animations are a major jank source on low-end hardware.
  //   2. content-visibility:auto on message-list rows — the browser skips
  //      layout/paint for rows outside the viewport entirely.
  // The extension's own footprint stays lean regardless of this setting
  // (observers disconnect when features are off; per-navigate work is
  // debounced) — this switch is about Gmail's cost, not ours.

  function init() {
    if (location.host !== 'mail.google.com') return;
    return window.__OB.settings.get('performanceMode').then((on) => {
      document.documentElement.toggleAttribute('data-ob-perf', !!on);
    }).catch((e) => console.log('[OB] performance: init failed', e));
  }

  const api = { init };
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).performance = api;
})();
