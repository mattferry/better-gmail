(function () {
  'use strict';

  // Structural selectors (live-verified 2026-07-14 against real Gmail). The
  // fragile, drift-prone lookups (toolbar buttons, dropdowns, search controls)
  // now go through core/selector-resolver.js, which self-tunes at runtime —
  // static candidates → learned cache → semantic probe. Entries below that have
  // a resolver role are kept for reference/fallback only.
  const SELECTORS = {
    // resolver role: toolbar — main toolbar container above the message list
    toolbar: 'div[gh="mtb"]',
    // left-nav label links; the href carries the full label path
    leftNavLabelLink: 'div[role="navigation"] a[href*="#label"]',
    // message list rows
    listRow: 'div[role="main"] tr[role="row"]',
    // a selected row carries a checked checkbox
    rowCheckbox: 'div[role="checkbox"]',
    // resolver roles: moveToButton / labelsButton / markUnread / markRead /
    // archiveButton / deleteButton / snoozeButton / searchInput / searchOptions
    moveToButton: 'div[aria-label="Move to"], div[data-tooltip="Move to"]',
    labelsButton: 'div[aria-label="Labels"], div[data-tooltip="Labels"]',
    markUnread: 'div[aria-label="Mark as unread"], div[data-tooltip="Mark as unread"]',
    markRead: 'div[aria-label="Mark as read"], div[data-tooltip="Mark as read"]',
    searchInput: 'input[aria-label="Search mail"], input[name="q"]',
    searchOptions: 'button[aria-label="Advanced search options"], button[aria-label="Show search options"]',
    // an open thread's recipient chips
    recipientChip: 'span[email]',
    archiveButton: 'div[aria-label="Archive"], div[data-tooltip="Archive"]',
    deleteButton: 'div[aria-label="Delete"], div[data-tooltip="Delete"]',
    snoozeButton: 'div[aria-label="Snooze"], div[data-tooltip="Snooze"]',
    // a list row's subject text
    rowSubject: '[role="link"] span, .bog',
    // fallback row matcher for closestRow when listRow doesn't match
    rowFallback: 'tr[role="row"], div[role="row"]',

    // --- Move-to / Labels native dropdown ---
    // LIVE-VERIFIED 2026-07-14: container is div.J-M (several exist; only one
    // visible when open); items are [role="menuitem"] (the old .vY/[role=option]
    // matched nothing); the filter input is input[type="text"] inside it.
    moveDropdown: 'div.J-M',
    moveDropdownInput: 'input[type="text"], input:not([type])',
    moveDropdownItem: '[role="menuitem"], [role="option"]',

    // --- Open message internals (attachments-top, outlook-reply) ---
    // an expanded message in a thread
    messageContainer: 'div.adn.ads',
    // broader fallback when messageContainer misses
    messageContainerFallback: '[role="listitem"], .adn',
    // any element that can stand in for "a message" (outlook-reply rect comparisons)
    messageAny: '.adn.ads, .adn, .gs',
    // Gmail's own attachment tray — resolver role: attachmentTray
    attachmentTray: '.aQH',
    // the rendered message body
    messageBody: '.a3s.aiL, .a3s',
    // sender element carrying the email attribute (preferred form first)
    senderChip: '.gD[email]',
    senderChipFallback: '.go[email], [email]',
    // message date element (title attr holds the full timestamp)
    messageDate: '.g3',
    // open thread subject
    threadSubject: 'h2.hP',
    // "To:" recipient chips inside a message header
    toRecipientChips: '.hb .g2[email], .hb [email]',
    // Gmail's "On ... wrote:" attribution line inside a reply draft
    replyAttribution: '.gmail_quote_container .gmail_attr, .gmail_attr',
    // "Show trimmed content" (three dots) button candidates
    trimmedContent: ".ajR, .ajT, [aria-label*='Show trimmed content'], [data-tooltip*='Show trimmed content'], [role='button']",

    // --- Compose (live-verified 2026-07-14, all four match) ---
    composeBody: "div[contenteditable='true'][role='textbox']",
    composeToolbar: '.gU.Up',
    composeDialog: "div[role='dialog'], .M9, .AD, .aoI, .nH",
    composeSendBar: ".btC, .gU.Up, [role='toolbar']"
  };

  function q(sel, root) { return (root || document).querySelector(sel); }
  function qa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
  function R() { return window.__OB.resolver; }

  // Gmail's toolbar buttons IGNORE a bare el.click() — their handlers key off real
  // mousedown/mouseup sequences (live-verified 2026-07-14: .click() on "Move to"
  // did nothing; this sequence opens the dropdown). Use for any Gmail-owned control.
  function dispatchClick(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const opts = {
      bubbles: true, cancelable: true, view: window, button: 0,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2
    };
    for (const type of ['mousedown', 'mouseup', 'click']) el.dispatchEvent(new MouseEvent(type, opts));
    return true;
  }

  // Bounded rAF wait for asynchronously-rendered UI (native dropdowns).
  function waitFor(getEl, timeoutMs) {
    return new Promise((resolve) => {
      const deadline = Date.now() + (timeoutMs || 2000);
      (function poll() {
        let el = null;
        try { el = getEl(); } catch (e) { /* keep polling */ }
        if (el) return resolve(el);
        if (Date.now() > deadline) return resolve(null);
        requestAnimationFrame(poll);
      })();
    });
  }

  function isReady() { return !!R().resolve('toolbar'); }
  function getToolbar() { return R().resolve('toolbar'); }

  // Where injected toolbar UI must go. Appending to div[gh="mtb"] itself wraps
  // onto a second line that overlays the first message row (live-measured
  // 2026-07-14): the real button row is an inner FLEX container. Found
  // semantically (first flex descendant with children), not by Gmail's class.
  function getToolbarInsertionPoint() {
    const tb = getToolbar();
    if (!tb) return null;
    const walker = document.createTreeWalker(tb, NodeFilter.SHOW_ELEMENT);
    let node;
    while ((node = walker.nextNode())) {
      const d = getComputedStyle(node).display;
      if ((d === 'flex' || d === 'inline-flex') && node.children.length) return node;
    }
    return tb;
  }

  function getLeftNavLabels() {
    // Return label full-names. Gmail nests sub-labels; the visible text is the leaf,
    // but the href/aria often carries the full path. Prefer parsing the href label param.
    return qa(SELECTORS.leftNavLabelLink)
      .map((a) => {
        const m = decodeURIComponent(a.getAttribute('href') || '').match(/#label\/(.+)$/);
        return m ? m[1] : (a.textContent || '').trim();
      })
      .filter(Boolean);
  }

  function getSelectedRowEls() {
    return qa(SELECTORS.listRow).filter((r) => {
      const cb = q(SELECTORS.rowCheckbox, r);
      return cb && cb.getAttribute('aria-checked') === 'true';
    });
  }

  function getRowInfo(rowEl) {
    if (!rowEl) return null;
    const from = q(SELECTORS.recipientChip, rowEl)?.getAttribute('email') || null;
    const subject = (q(SELECTORS.rowSubject, rowEl)?.textContent || '').trim() || null;
    return { subject, from, threadId: rowEl.getAttribute('data-legacy-thread-id') || null };
  }

  function getOpenThreadRecipients() {
    return qa(SELECTORS.recipientChip).map((s) => s.getAttribute('email')).filter(Boolean);
  }

  // Both return a Promise<boolean> — the native dropdown renders asynchronously.
  function clickMoveTo(labelFullName) {
    const btn = R().resolve('moveToButton');
    if (!btn) return Promise.resolve(false);
    dispatchClick(btn);
    return selectFromNativeDropdown(labelFullName);
  }

  function applyLabel(rowEls, labelFullName) {
    const btn = R().resolve('labelsButton');
    if (!btn) return Promise.resolve(false);
    dispatchClick(btn);
    return selectFromNativeDropdown(labelFullName);
  }

  // After opening the native Move-to/Labels dropdown: wait for it to render,
  // type the leaf into its filter input, then click the matching item.
  // (Move-to and Labels currently share mechanics; the semantic difference —
  // archive vs keep-in-inbox — comes from which button opened the dropdown.)
  async function selectFromNativeDropdown(labelFullName) {
    if (!labelFullName) return false;
    const leaf = labelFullName.split('/').pop();
    const matchesLabel = (el) => {
      const t = (el.textContent || '').trim();
      return t === leaf || t === labelFullName;
    };

    const dropdown = await waitFor(() => R().resolve('moveDropdown'), 2500);
    if (!dropdown) return false;

    const input = q(SELECTORS.moveDropdownInput, dropdown);
    if (input) {
      input.focus();
      input.value = leaf;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      // give the list a beat to filter down
      await waitFor(() => qa(SELECTORS.moveDropdownItem, dropdown).find(matchesLabel), 1500);
    }
    const item = qa(SELECTORS.moveDropdownItem, dropdown).find(matchesLabel);
    if (!item) return false;
    dispatchClick(item);
    return true;
  }

  function selectRow(rowEl) {
    if (!rowEl) return false;
    // Validate the target BEFORE touching the existing selection, so a row we
    // can't select never costs the user their current multi-select.
    const cb = q(SELECTORS.rowCheckbox, rowEl);
    if (!cb) return false;
    getSelectedRowEls().forEach((r) => {
      if (r !== rowEl) { const other = q(SELECTORS.rowCheckbox, r); if (other) other.click(); }
    });
    if (cb.getAttribute('aria-checked') !== 'true') cb.click();
    return true;
  }

  function clickToolbarRole(role) { const b = R().resolve(role); if (!b) return false; return dispatchClick(b); }
  // These act on Gmail's CURRENT selection (callers select rows first — see
  // context-menu.js, which runs selectRow before invoking them).
  function markUnread() { return clickToolbarRole('markUnread'); }
  function markRead() { return clickToolbarRole('markRead'); }
  function archive() { return clickToolbarRole('archiveButton'); }
  function del() { return clickToolbarRole('deleteButton'); }     // 'delete' is reserved
  function snooze() { return clickToolbarRole('snoozeButton'); }  // opens Gmail's native snooze picker
  function closestRow(el) {
    return el && (el.closest(SELECTORS.listRow) || el.closest(SELECTORS.rowFallback));
  }
  // Main-scoped only: matches a real message-list row (div[role="main"] tr[role="row"]).
  // Used where we need certainty we're targeting an actual list row (e.g. the context
  // menu) rather than closestRow's broad rowFallback, which can match unrelated
  // role="row" elements outside the message list.
  function closestListRow(el) { return el ? el.closest(SELECTORS.listRow) : null; }

  function openCreateFilterForRow(rowEl) {
    // Gmail: open search options with the sender prefilled, which exposes "Create filter".
    const info = getRowInfo(rowEl);
    const search = R().resolve('searchInput');
    const opts = R().resolve('searchOptions');
    if (!search || !opts || !info?.from) return false;
    search.focus(); search.value = 'from:(' + info.from + ')';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    dispatchClick(opts); // opens the filter builder with From prefilled; user clicks "Create filter"
    return true;
  }

  const api = { isReady, getToolbar, getToolbarInsertionPoint, getLeftNavLabels, getSelectedRowEls, getRowInfo,
    getOpenThreadRecipients, clickMoveTo, applyLabel, markUnread, markRead,
    openCreateFilterForRow, archive, del, snooze, closestRow, closestListRow, selectRow,
    dispatchClick, waitFor, SELECTORS };
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).gmail = api;
})();
