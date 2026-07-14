(function () {
  'use strict';
  const DEFAULT_CATEGORIES = [
    { name: 'Red', color: '#d50000' },
    { name: 'Orange', color: '#e65100' },
    { name: 'Yellow', color: '#f9a825' },
    { name: 'Green', color: '#2e7d32' },
    { name: 'Blue', color: '#1565c0' },
    { name: 'Purple', color: '#6a1b9a' }
  ];
  function colorFor(name, defs) {
    const list = defs || DEFAULT_CATEGORIES;
    const hit = list.find((c) => c.name.toLowerCase() === String(name).toLowerCase());
    return hit ? hit.color : null;
  }
  // Browser-only: apply a category to the selected rows by applying the Gmail
  // label "Categories/<name>" (persists + shows on mobile). Uses the adapter.
  function applyToSelection(name) {
    const OB = window.__OB;
    const rows = OB.gmail.getSelectedRowEls();
    if (!rows.length) { OB.ui.toast('Select an email first'); return; }
    // applyLabel is async — Gmail renders the native Labels dropdown after the click.
    Promise.resolve(OB.gmail.applyLabel(rows, 'Categories/' + name))
      .then((ok) => OB.ui.toast(ok ? ('Categorized: ' + name) : 'Could not categorize'))
      .catch((e) => { console.warn('[OB] categories: apply failed', e); OB.ui.toast('Could not categorize'); });
  }
  const api = { DEFAULT_CATEGORIES, colorFor, applyToSelection };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).categories = api;
})();
