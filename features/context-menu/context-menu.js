(function () {
  'use strict';

  // Cached module-scoped settings, refreshed each time init() runs (matches how
  // contextMenu's on/off flag was already handled before this fix).
  let categoriesEnabled = true;

  // Wrap a callback so a thrown error is caught and logged instead of escaping.
  // Menu-item onClicks fire later (from ui.js's own click listener), outside
  // onContextMenu's try/catch, so each one needs its own guard.
  function guard(name, fn) {
    return function () {
      try { return fn.apply(this, arguments); } catch (err) { console.warn('[OB] context-menu:', name, err); }
    };
  }

  function onContextMenu(e) {
    const OB = window.__OB;
    let row;
    try {
      row = OB.gmail.closestListRow(e.target);
    } catch (err) {
      console.warn('[OB] context-menu: row lookup failed', err);
      return; // fail safe -> let the native browser/Gmail menu appear
    }
    if (!row) return; // not on a message row -> let Gmail/browser handle it, no preventDefault
    let ok;
    try {
      ok = OB.gmail.selectRow(row);
    } catch (err) {
      console.warn('[OB] context-menu: selectRow failed', err);
      return; // fail safe -> let the native browser/Gmail menu appear
    }
    if (!ok) return; // couldn't confirm/select the row -> fall back to native menu, no preventDefault
    e.preventDefault();
    try {
      const info = OB.gmail.getRowInfo(row);
      const items = [
        { label: 'Mark as unread', onClick: guard('markUnread', () => OB.gmail.markUnread([row])) },
        { label: 'Mark as read', onClick: guard('markRead', () => OB.gmail.markRead([row])) }
      ];
      if (categoriesEnabled) {
        items.push({ label: 'Categorize…', onClick: guard('categorize', () => openCategorySubmenu(e.clientX, e.clientY)) });
      }
      items.push(
        { label: 'Create rule…', onClick: guard('createRule', () => OB.gmail.openCreateFilterForRow(row)) },
        { label: 'Reply with meeting', onClick: guard('replyWithMeeting', () => OB.replyWithMeeting.open({
            title: 'Re: ' + (info?.subject || ''),
            guests: info?.from ? [info.from] : OB.gmail.getOpenThreadRecipients()
          })) },
        { label: 'Move to folder…', onClick: guard('moveToFolder', () => OB.folderIllusionist.openPickerAt(e.clientX, e.clientY)) },
        { label: 'Archive', onClick: guard('archive', () => OB.gmail.archive()) },
        { label: 'Delete', onClick: guard('delete', () => OB.gmail.del()) },
        { label: 'Snooze…', onClick: guard('snooze', () => OB.gmail.snooze()) }
      );
      OB.ui.buildMenu(items, e.clientX, e.clientY);
    } catch (err) {
      console.warn('[OB] context-menu: build failed', err);
    }
  }

  function openCategorySubmenu(x, y) {
    const OB = window.__OB;
    const items = OB.categories.DEFAULT_CATEGORIES.map((c) => ({
      label: c.name,
      swatch: c.color,
      onClick: guard('categorize:' + c.name, () => OB.categories.applyToSelection(c.name))
    }));
    OB.ui.buildMenu(items, x + 8, y + 8);
  }

  function init() {
    window.__OB.settings.get('categories').then((on) => { categoriesEnabled = !!on; });
    if (document.__obCtxBound) return; document.__obCtxBound = true;
    window.__OB.settings.get('contextMenu').then((on) => {
      if (on) document.addEventListener('contextmenu', onContextMenu, true);
    });
  }
  const api = { init };
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).contextMenu = api;
})();
