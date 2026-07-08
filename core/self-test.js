(function () {
  'use strict';
  function run() {
    const host = location.host;
    const A = window.__OB && window.__OB.gmail;
    const C = window.__OB && window.__OB.calendar;
    const results = [];
    if (host === 'mail.google.com' && A) {
      for (const [name, sel] of Object.entries(A.SELECTORS)) {
        const ok = !!document.querySelector(sel);
        results.push({ name, sel, ok });
      }
    }
    if (host === 'calendar.google.com' && C) {
      for (const [name, sel] of Object.entries(C.SELECTORS)) {
        results.push({ name, sel, ok: !!document.querySelector(sel) });
      }
    }
    const broken = results.filter((r) => !r.ok);
    if (broken.length) console.warn('[OB] self-test: selectors not found (Gmail may have changed):', broken);
    else console.log('[OB] self-test: all', results.length, 'selectors OK');
    return results;
  }
  const api = { run };
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).selfTest = api;
})();
