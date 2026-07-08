(function () {
  'use strict';

  // Selectors that should be present in ANY steady view of the app (not gated behind
  // a particular UI being open, a row being selected, etc). Everything else in a
  // SELECTORS map is contextual — its absence is expected a lot of the time and
  // should not be reported as a possible breakage.
  const ALWAYS_PRESENT = {
    'mail.google.com': ['toolbar', 'leftNavLabelLink', 'listRow', 'searchInput'],
    'calendar.google.com': ['settingsGear']
  };

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
    const alwaysPresent = ALWAYS_PRESENT[host] || [];
    const broken = results.filter((r) => !r.ok);
    const critical = broken.filter((r) => alwaysPresent.includes(r.name));
    const contextual = broken.filter((r) => !alwaysPresent.includes(r.name));
    if (critical.length) {
      console.warn('[OB] self-test: critical selectors not found (Gmail may have changed):', critical);
    }
    if (contextual.length) {
      console.log('[OB] self-test: contextual selectors absent (expected unless that UI is open):', contextual);
    }
    if (!critical.length) {
      console.log('[OB] self-test: all', results.length, 'selectors OK');
    }
    return results;
  }
  const api = { run };
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).selfTest = api;
})();
