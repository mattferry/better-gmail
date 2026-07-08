(function () {
  'use strict';
  console.log('[OB] Better Gmail loaded on', location.host);
  const OB = window.__OB;
  OB.safe = OB.safe || function (n, fn) { try { return fn(); } catch (e) { console.warn('[OB]', n, e); } };

  // Re-run the enabled features. Each init is idempotent AND reversible (injects
  // its UI when its setting is on, tears it down when off) and re-reads settings,
  // so this doubles as both the on-navigate refresh and the live-toggle handler.
  // OB.safe guards a synchronous throw; each init also .catch()es its own async
  // settings read, so a failure in one feature never breaks Gmail or the others.
  function refreshFeatures() {
    OB.safe('folderIllusionist', () => OB.folderIllusionist.init());
    OB.safe('contextMenu', () => OB.contextMenu.init());
    OB.safe('quickViews', () => OB.quickViews.init());
  }

  OB.safe('darkMode', () => OB.darkMode.init());
  OB.safe('confirmDelete', () => OB.quickViews.initConfirmDelete()); // bind once — not per-navigate

  OB.router.onNavigate(() => {
    setTimeout(() => OB.safe('selfTest', () => OB.selfTest.run()), 500);
    refreshFeatures();
  });

  // Live feature toggles: apply option changes immediately instead of waiting for
  // a page reload. dark-mode wires its own onChange; this covers everything else.
  if (OB.settings && typeof OB.settings.onChange === 'function') {
    OB.settings.onChange(() => refreshFeatures());
  }
})();
