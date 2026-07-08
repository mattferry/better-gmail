(function () {
  'use strict';
  console.log('[OB] Better Gmail loaded on', location.host);
  const OB = window.__OB;
  window.__OB.safe = window.__OB.safe || function (n, fn) { try { return fn(); } catch (e) { console.warn('[OB]', n, e); } };
  OB.darkMode.init();
  OB.router.onNavigate(() => {
    setTimeout(() => OB.selfTest.run(), 500);
    window.__OB.safe('folderIllusionist', () => window.__OB.folderIllusionist.init());
    window.__OB.safe('contextMenu', () => window.__OB.contextMenu.init());
    // feature init calls are added in later tasks
  });
})();
