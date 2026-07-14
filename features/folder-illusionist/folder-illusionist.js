(function () {
  'use strict';
  const BTN_ID = 'ob-move-to-folder';

  function buildButton() {
    const btn = document.createElement('div');
    btn.textContent = '📁 Move to Folder';
    // Keyboard-accessible (it's a div so it inherits Gmail's toolbar look, but it
    // must still behave like a button), and compact: the Gmail toolbar strip is
    // only ~20px tall (live-measured 2026-07-14) — anything taller overflows onto
    // the first message row.
    btn.setAttribute('role', 'button');
    btn.setAttribute('tabindex', '0');
    btn.style.cssText = 'cursor:pointer;padding:1px 8px;margin:0 4px;border-radius:10px;' +
      'font:12px/16px system-ui;display:inline-flex;align-items:center;flex:0 0 auto;' +
      'background:rgba(128,128,128,.15);vertical-align:middle;';
    const open = (e) => {
      e.stopPropagation();
      const r = btn.getBoundingClientRect();
      openPickerAt(r.left, r.bottom + 4);
    };
    btn.addEventListener('click', open);
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e); }
    });
    return btn;
  }

  function openPickerAt(x, y) {
    const OB = window.__OB;
    const rows = OB.gmail.getSelectedRowEls();
    if (!rows.length) { OB.ui.toast('Select an email first'); return; }
    const labels = OB.gmail.getLeftNavLabels();
    const tree = OB.labelTree.buildLabelTree(labels);
    const items = flatten(tree).map((node) => ({
      label: '  '.repeat(node.depth) + (node.children.length ? '▸ ' : '') + node.name,
      onClick: () => moveTo(node.fullName)
    }));
    OB.ui.buildMenu(items.length ? items : [{ label: 'No folders yet', onClick: () => {} }], x, y);
  }

  function flatten(nodes, depth = 0, out = []) {
    for (const n of nodes) { out.push(Object.assign({ depth }, n)); flatten(n.children, depth + 1, out); }
    return out;
  }

  function moveTo(fullName) {
    const OB = window.__OB;
    // clickMoveTo is async — Gmail renders the native dropdown after the click.
    Promise.resolve(OB.gmail.clickMoveTo(fullName))
      .then((ok) => OB.ui.toast(ok ? ('Moved to ' + fullName) : ('Could not move to ' + fullName)))
      .catch((e) => { console.warn('[OB] folder-illusionist: move failed', e); OB.ui.toast('Could not move to ' + fullName); });
  }

  // Idempotent + reversible: injects the button when enabled, removes it when
  // disabled — so a live settings toggle takes effect without a page reload.
  function init() {
    if (location.host !== 'mail.google.com') return; // never inject into Calendar
    const OB = window.__OB;
    return OB.settings.get('folderIllusionist')
      .then((on) => {
        if (!on) { OB.ui.removeById(BTN_ID); return; }
        const el = OB.ui.ensureChild(OB.gmail.getToolbarInsertionPoint(), BTN_ID, buildButton);
        // Pick a readable color from the toolbar's real background — inheriting
        // Gmail's `color` rendered black-on-dark in its dark theme. `important`
        // is required: Gmail sets the toolbar text color via an !important rule
        // in a cross-origin sheet, so a plain inline color loses (field fix).
        if (el) el.style.setProperty('color', OB.ui.readableTextColor(el.parentElement || el), 'important');
      })
      .catch((e) => console.log('[OB] folder-illusionist: init failed', e));
  }
  const api = { init, openPickerAt };
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).folderIllusionist = api;
})();
