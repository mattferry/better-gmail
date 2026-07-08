(function () {
  'use strict';
  const BAR_ID = 'ob-quick-views';
  const VIEWS = [
    { label: 'Unread', q: 'is:unread' },
    { label: 'Flagged', q: 'is:starred' },
    { label: 'Today', q: 'newer_than:1d' },
    { label: 'Attachments', q: 'has:attachment' }
  ];

  // Wrap a DOM event handler so a thrown error is caught and logged instead of
  // escaping into Gmail's own listeners (golden rule: handlers must not throw).
  function guard(name, fn) {
    return function () {
      try { return fn.apply(this, arguments); } catch (err) { console.warn('[OB] quickViews:', name, err); }
    };
  }

  function ensureBar() {
    const OB = window.__OB;
    const toolbar = OB.gmail.getToolbar();
    if (!toolbar || document.getElementById(BAR_ID)) return; // idempotent: guard by element id
    const bar = document.createElement('div');
    bar.id = BAR_ID;
    bar.style.cssText = 'display:inline-flex;gap:6px;margin-left:8px;';
    for (const v of VIEWS) {
      const chip = document.createElement('button');
      chip.textContent = v.label;
      chip.style.cssText = 'border:1px solid rgba(0,0,0,.2);border-radius:12px;padding:2px 10px;' +
        'background:transparent;cursor:pointer;font:12px system-ui;';
      chip.addEventListener('click', guard('chip:' + v.label, () => runSearch(v.q)));
      bar.appendChild(chip);
    }
    toolbar.appendChild(bar);
  }

  function runSearch(query) {
    // Navigate Gmail's hash to a search — the most robust way to trigger a saved view.
    location.hash = '#search/' + encodeURIComponent(query);
  }

  // Bind once (see bootstrap.js — called once at load, not per-navigate).
  function initConfirmDelete() {
    if (document.__obDeleteConfirmBound) return;
    document.__obDeleteConfirmBound = true;
    window.__OB.settings.get('confirmBeforeDelete').then((on) => {
      if (!on) return;
      document.addEventListener('click', guard('confirmDelete', (e) => {
        // Intended exception to "no raw Gmail selectors": matches Gmail's own
        // "Delete forever" control directly, per brief.
        const t = e.target.closest && e.target.closest('[aria-label="Delete forever"]');
        if (t && !confirm('Permanently delete? This cannot be undone.')) {
          e.preventDefault(); e.stopPropagation();
        }
      }), true);
    });
  }

  function initDensity() {
    window.__OB.settings.get('compactDensity').then((on) => {
      document.documentElement.toggleAttribute('data-ob-compact', !!on);
    }).catch((e) => console.log('[OB] quick-views: density init failed', e));
  }

  function init() {
    window.__OB.settings.get('quickViews').then((on) => { if (on) ensureBar(); });
    initDensity();
  }

  const api = { init, initConfirmDelete };
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).quickViews = api;
})();
