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

  // Resolver roles that only exist while their UI is open/selected — a miss here
  // is normal, not drift.
  const CONTEXTUAL_ROLES = ['moveDropdown', 'attachmentTray', 'moveToButton', 'labelsButton',
    'markUnread', 'markRead', 'archiveButton', 'deleteButton', 'snoozeButton', 'searchOptions'];

  function run() {
    const host = location.host;
    const A = window.__OB && window.__OB.gmail;
    const C = window.__OB && window.__OB.calendar;
    const RES = window.__OB && window.__OB.resolver;
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
    if (!broken.length) {
      console.log('[OB] self-test: all', results.length, 'selectors OK');
    } else if (!critical.length) {
      console.log('[OB] self-test: all critical selectors OK');
    }

    // Self-tuning resolver report: which tier (static / learned / probe) satisfied
    // each fragile role. 'probe' means the static selector has drifted and the
    // extension healed itself; 'miss' on a non-contextual role means real drift.
    if (host === 'mail.google.com' && RES) {
      const tiers = RES.report();
      const healed = tiers.filter((t) => t.tier === 'probe' || t.tier === 'learned');
      const missing = tiers.filter((t) => !t.ok && !CONTEXTUAL_ROLES.includes(t.role));
      if (healed.length) console.log('[OB] self-test: resolver self-tuned roles:', healed);
      if (missing.length) console.warn('[OB] self-test: resolver could not find (real drift):', missing);
      results.push(...tiers.map((t) => ({ name: 'role:' + t.role, sel: t.tier, ok: t.ok })));
    }
    return results;
  }
  const api = { run };
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).selfTest = api;
})();
