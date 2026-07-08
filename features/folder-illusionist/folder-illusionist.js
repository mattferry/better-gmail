(function () {
  'use strict';
  const BTN_ID = 'ob-move-to-folder';

  function ensureButton() {
    const OB = window.__OB;
    const toolbar = OB.gmail.getToolbar();
    if (!toolbar || document.getElementById(BTN_ID)) return;
    const btn = document.createElement('div');
    btn.id = BTN_ID;
    btn.textContent = '📁 Move to Folder';
    btn.style.cssText = 'cursor:pointer;padding:6px 10px;margin:0 6px;border-radius:6px;' +
      'font:13px system-ui;display:inline-flex;align-items:center;background:rgba(0,0,0,.05);';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const r = btn.getBoundingClientRect();
      openPickerAt(r.left, r.bottom + 4);
    });
    toolbar.appendChild(btn);
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
    OB.ui.buildMenu(items, x, y);
  }

  function flatten(nodes, depth = 0, out = []) {
    for (const n of nodes) { out.push(Object.assign({ depth }, n)); flatten(n.children, depth + 1, out); }
    return out;
  }

  function moveTo(fullName) {
    const OB = window.__OB;
    const ok = OB.gmail.clickMoveTo(fullName);
    OB.ui.toast(ok ? ('Moved to ' + fullName) : ('Could not move to ' + fullName));
  }

  function init() {
    window.__OB.settings.get('folderIllusionist').then((on) => { if (on) ensureButton(); });
  }
  const api = { init, openPickerAt };
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).folderIllusionist = api;
})();
