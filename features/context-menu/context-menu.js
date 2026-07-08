(function () {
  'use strict';
  function rowFromEvent(e) {
    return window.__OB.gmail.closestRow(e.target);
  }

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
      row = rowFromEvent(e);
    } catch (err) {
      console.warn('[OB] context-menu: row lookup failed', err);
      return; // fail safe -> let the native browser/Gmail menu appear
    }
    if (!row) return; // not on a message row -> let Gmail/browser handle it
    e.preventDefault();
    try {
      // ensure the row is selected so actions target it
      const info = OB.gmail.getRowInfo(row);
      const items = [
        { label: 'Mark as unread', onClick: guard('markUnread', () => OB.gmail.markUnread([row])) },
        { label: 'Mark as read', onClick: guard('markRead', () => OB.gmail.markRead([row])) },
        { label: 'Categorize…', onClick: guard('categorize', () => openCategorySubmenu(e.clientX, e.clientY)) },
        { label: 'Create rule…', onClick: guard('createRule', () => OB.gmail.openCreateFilterForRow(row)) },
        { label: 'Reply with meeting', onClick: guard('replyWithMeeting', () => OB.replyWithMeeting.open({
            title: 'Re: ' + (info?.subject || ''),
            guests: info?.from ? [info.from] : OB.gmail.getOpenThreadRecipients()
          })) },
        { label: 'Move to folder…', onClick: guard('moveToFolder', () => OB.folderIllusionist.openPickerAt(e.clientX, e.clientY)) },
        { label: 'Archive', onClick: guard('archive', () => OB.gmail.archive()) },
        { label: 'Delete', onClick: guard('delete', () => OB.gmail.del()) },
        { label: 'Snooze…', onClick: guard('snooze', () => OB.gmail.snooze()) }
      ];
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
    if (document.__obCtxBound) return; document.__obCtxBound = true;
    window.__OB.settings.get('contextMenu').then((on) => {
      if (on) document.addEventListener('contextmenu', onContextMenu, true);
    });
  }
  const api = { init };
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).contextMenu = api;
})();
