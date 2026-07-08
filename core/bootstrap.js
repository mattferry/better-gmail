(function () {
  'use strict';
  console.log('[OB] Better Gmail loaded on', location.host);
  const OB = window.__OB;
  OB.router.onNavigate(() => {
    setTimeout(() => OB.selfTest.run(), 500);
    // feature init calls are added in later tasks
  });
})();
