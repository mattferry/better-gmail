(function () {
  'use strict';
  const BAR_ID = 'ob-quick-views';
  const VIEWS = [
    { label: 'Unread', q: 'is:unread' },
    { label: 'Flagged', q: 'is:starred' },
    { label: 'Today', q: 'newer_than:1d' },
    { label: 'Attachments', q: 'has:attachment' }
  ];

  // Live flag for the (bound-once) confirm-before-delete listener, refreshed from
  // settings on init so an options toggle takes effect without a page reload.
  let confirmDeleteOn = false;

  // Wrap a DOM event handler so a thrown error is caught and logged instead of
  // escaping into Gmail's own listeners (golden rule: handlers must not throw).
  function guard(name, fn) {
    return function () {
      try { return fn.apply(this, arguments); } catch (err) { console.warn('[OB] quickViews:', name, err); }
    };
  }

  function buildBar() {
    const bar = document.createElement('div');
    // Compact: the Gmail toolbar strip is ~20px tall (live-measured 2026-07-14).
    bar.style.cssText = 'display:inline-flex;gap:4px;margin-left:6px;align-items:center;vertical-align:middle;';
    for (const v of VIEWS) {
      const chip = document.createElement('button');
      chip.textContent = v.label;
      chip.style.cssText = 'border:1px solid rgba(128,128,128,.5);border-radius:10px;padding:0 8px;' +
        'background:transparent;cursor:pointer;font:11px/16px system-ui;color:inherit;flex:0 0 auto;';
      // stopPropagation so the click can't double-fire into Gmail's own delegated
      // toolbar handlers (parity with the folder-illusionist button).
      chip.addEventListener('click', guard('chip:' + v.label, (e) => { e.stopPropagation(); runSearch(v.q); }));
      bar.appendChild(chip);
    }
    return bar;
  }

  function runSearch(query) {
    // Navigate Gmail's hash to a search — the most robust way to trigger a saved view.
    location.hash = '#search/' + encodeURIComponent(query);
  }

  function refreshConfirmDelete() {
    return window.__OB.settings.get('confirmBeforeDelete')
      .then((on) => { confirmDeleteOn = !!on; })
      .catch((e) => console.log('[OB] quick-views: confirmDelete read failed', e));
  }

  // Bind once (see bootstrap.js — called once at load, not per-navigate). The
  // listener itself is a no-op unless confirmDeleteOn, which init() keeps in sync
  // with settings, so the toggle works live without rebinding.
  function initConfirmDelete() {
    refreshConfirmDelete();
    if (document.__obDeleteConfirmBound) return;
    document.__obDeleteConfirmBound = true;
    document.addEventListener('click', guard('confirmDelete', (e) => {
      if (!confirmDeleteOn) return;
      // Intended exception to "no raw Gmail selectors": matches Gmail's own
      // "Delete forever" control directly, per brief.
      const t = e.target.closest && e.target.closest('[aria-label="Delete forever"]');
      if (t && !confirm('Permanently delete? This cannot be undone.')) {
        e.preventDefault(); e.stopPropagation();
      }
    }), true);
  }

  function initDensity() {
    return window.__OB.settings.get('compactDensity').then((on) => {
      // quick-views.css keys off data-ob-host as well; set it here so compact
      // density doesn't silently depend on dark-mode's init having run first.
      if (!document.documentElement.hasAttribute('data-ob-host')) {
        document.documentElement.setAttribute('data-ob-host',
          location.host === 'calendar.google.com' ? 'calendar' : 'gmail');
      }
      document.documentElement.toggleAttribute('data-ob-compact', !!on);
    }).catch((e) => console.log('[OB] quick-views: density init failed', e));
  }

  // Idempotent + reversible: injects the chip bar when enabled, removes it when
  // disabled, and re-syncs the density + confirm-delete settings — so live
  // toggles take effect without a page reload.
  function init() {
    const OB = window.__OB;
    OB.settings.get('quickViews')
      .then((on) => { if (on) OB.ui.ensureChild(OB.gmail.getToolbarInsertionPoint(), BAR_ID, buildBar); else OB.ui.removeById(BAR_ID); })
      .catch((e) => console.log('[OB] quick-views: init failed', e));
    initDensity();
    refreshConfirmDelete();
  }

  const api = { init, initConfirmDelete };
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).quickViews = api;
})();
