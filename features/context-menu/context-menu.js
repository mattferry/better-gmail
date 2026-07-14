(function () {
  'use strict';

  // Cached module-scoped settings, refreshed each time init() runs. The listener
  // is bound once and gated on contextMenuEnabled, so toggling the feature in
  // options takes effect live (no page reload) without add/removeEventListener
  // churn. contextMenuEnabled defaults false so we never hijack a right-click
  // before settings confirm the feature is on (fail safe -> native menu).
  let categoriesEnabled = true;
  let contextMenuEnabled = false;

  // Wrap a callback so a thrown error is caught and logged instead of escaping.
  // Menu-item onClicks fire later (from ui.js's own click listener), outside
  // onContextMenu's try/catch, so each one needs its own guard.
  function guard(name, fn) {
    return function () {
      try { return fn.apply(this, arguments); } catch (err) { console.warn('[OB] context-menu:', name, err); }
    };
  }

  function onContextMenu(e) {
    if (!contextMenuEnabled) return; // feature off -> let the native browser/Gmail menu appear
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
    try {
      const info = OB.gmail.getRowInfo(row);
      const items = [
        // markUnread/markRead act on Gmail's current selection — selectRow(row)
        // above guarantees that selection is exactly this row.
        { label: 'Mark as unread', onClick: guard('markUnread', () => OB.gmail.markUnread()) },
        { label: 'Mark as read', onClick: guard('markRead', () => OB.gmail.markRead()) }
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
      // Suppress the native/Gmail menus ONLY after our menu is successfully
      // built — fail-open: if buildMenu throws, the user still gets a menu
      // (capture-phase stopPropagation also blocks Gmail's own handler, so this
      // must run after the build, never before it — finding, verified).
      e.preventDefault();
      e.stopPropagation();
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
    const S = window.__OB.settings;
    S.get('categories').then((on) => { categoriesEnabled = !!on; })
      .catch((e) => console.log('[OB] context-menu: categories read failed', e));
    S.get('contextMenu').then((on) => { contextMenuEnabled = !!on; })
      .catch((e) => console.log('[OB] context-menu: contextMenu read failed', e));
    // Bind the listener exactly once; the handler itself respects contextMenuEnabled.
    if (document.__obCtxBound) return; document.__obCtxBound = true;
    document.addEventListener('contextmenu', onContextMenu, true);
  }
  const api = { init };
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).contextMenu = api;
})();
