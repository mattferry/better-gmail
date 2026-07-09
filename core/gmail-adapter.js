(function () {
  'use strict';

  // Every selector must be verified live before shipping. Update the date + note when Gmail changes.
  const SELECTORS = {
    // verify live — main toolbar container above the message list
    toolbar: 'div[gh="mtb"]',
    // left-nav label links; filter to those with a data-tooltip / text = label name
    leftNavLabelLink: 'div[role="navigation"] a[href*="#label"]',
    // message list rows
    listRow: 'div[role="main"] tr[role="row"]',
    // a selected row carries a checked checkbox
    rowCheckbox: 'div[role="checkbox"]',
    // toolbar "Move to" button (folder-with-arrow); found by aria-label
    moveToButton: 'div[aria-label="Move to"], div[data-tooltip="Move to"]',
    // toolbar "Labels" button
    labelsButton: 'div[aria-label="Labels"], div[data-tooltip="Labels"]',
    // "Mark as unread" toolbar/menu item
    markUnread: 'div[aria-label="Mark as unread"], div[data-tooltip="Mark as unread"]',
    markRead: 'div[aria-label="Mark as read"], div[data-tooltip="Mark as read"]',
    // the search box (used to drive "create filter")
    searchInput: 'input[aria-label="Search mail"], input[name="q"]',
    // "Show search options" caret that opens the filter builder
    searchOptions: 'button[aria-label="Show search options"]',
    // an open thread's recipient chips
    recipientChip: 'span[email]',
    // toolbar action buttons (appear when a row is selected / thread open)
    archiveButton: 'div[aria-label="Archive"], div[data-tooltip="Archive"]',
    deleteButton: 'div[aria-label="Delete"], div[data-tooltip="Delete"]',
    snoozeButton: 'div[aria-label="Snooze"], div[data-tooltip="Snooze"]',
    // verify live — a list row's subject text
    rowSubject: '[role="link"] span, .bog',
    // fallback row matcher for closestRow when listRow doesn't match (e.g. a differently-scoped ancestor)
    rowFallback: 'tr[role="row"], div[role="row"]',

    // --- Move-to / Labels native dropdown (opened by moveToButton / labelsButton) ---
    // UNVERIFIED — needs live tuning
    moveDropdown: 'div[role="listbox"], div.J-M',
    // UNVERIFIED — needs live tuning
    moveDropdownInput: 'div[role="listbox"] input, div.J-M input[type="text"]',
    // UNVERIFIED — needs live tuning
    moveDropdownItem: 'div[role="listbox"] [role="option"], div.J-M .vY',

    // --- Open message internals (attachments-top, outlook-reply) ---
    // These came from the team's standalone extensions (in daily use at work when
    // ported 2026-07-09), so they were live-verified in that context — not in this repo.
    // an expanded message in a thread
    messageContainer: 'div.adn.ads',
    // broader fallback when messageContainer misses (walk up from a tray / rect math)
    messageContainerFallback: '[role="listitem"], .adn',
    // any element that can stand in for "a message" (outlook-reply rect comparisons)
    messageAny: '.adn.ads, .adn, .gs',
    // Gmail's own attachment tray (real attached files only — never signature images)
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

    // --- Compose (auto-capitalize, format-painter, table-inserter, outlook-reply) ---
    // the editable draft body
    composeBody: "div[contenteditable='true'][role='textbox']",
    // formatting toolbar inside a compose window (table-inserter injects here)
    composeToolbar: '.gU.Up',
    // containers that can act as a compose root, nearest-ancestor-first via closest()
    composeDialog: "div[role='dialog'], .M9, .AD, .aoI, .nH",
    // the send-button bar of a compose window
    composeSendBar: ".btC, .gU.Up, [role='toolbar']"
  };

  function q(sel, root) { return (root || document).querySelector(sel); }
  function qa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  function isReady() { return !!q(SELECTORS.toolbar); }
  function getToolbar() { return q(SELECTORS.toolbar); }

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

  function clickMoveTo(labelFullName) {
    const btn = q(SELECTORS.moveToButton);
    if (!btn) return false;
    btn.click(); // opens Gmail's native Move-to dropdown (applies label + archives)
    // The dropdown renders a searchable list; type the label and Enter, OR click the matching item.
    return selectFromNativeDropdown(labelFullName);
  }

  function applyLabel(rowEls, labelFullName) {
    const btn = q(SELECTORS.labelsButton);
    if (!btn) return false;
    btn.click();
    return selectFromNativeDropdown(labelFullName, /*keepInInbox*/ true);
  }

  // Helper: after opening a native label/move dropdown, pick the target label.
  // BEST-EFFORT / UNVERIFIED — needs live tuning against the real dropdown DOM (see task-2 Step 3).
  // Strategy: the dropdown has a filter input; set its value, dispatch 'input',
  // then find the option whose text === leaf label name and click it.
  //
  // LIVE-TUNING: Gmail renders the Move-to / Labels dropdown ASYNCHRONOUSLY after the
  // button click. A synchronous query here will miss it. The live-tuning pass must wait
  // for the dropdown (MutationObserver or a short requestAnimationFrame/setTimeout retry)
  // BEFORE setting the filter input and clicking the matching option — this is NOT just a
  // selector swap.
  function selectFromNativeDropdown(labelFullName, keepInInbox) {
    // keepInInbox is reserved for future divergence between Move-to and Labels dropdown
    // handling; both currently use the same filter-and-click mechanics.
    if (!labelFullName) return false;
    const input = q(SELECTORS.moveDropdownInput);
    if (!input) return false;
    const leaf = labelFullName.split('/').pop();
    input.focus();
    input.value = leaf;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const item = qa(SELECTORS.moveDropdownItem).find((el) => (el.textContent || '').trim() === leaf);
    if (!item) return false;
    item.click();
    return true;
  }

  function selectRow(rowEl) {
    if (!rowEl) return false;
    // Clear any stale selection so toolbar actions can't hit the wrong message.
    getSelectedRowEls().forEach((r) => {
      if (r !== rowEl) { const cb = q(SELECTORS.rowCheckbox, r); if (cb) cb.click(); }
    });
    const cb = q(SELECTORS.rowCheckbox, rowEl);
    if (!cb) return false;
    if (cb.getAttribute('aria-checked') !== 'true') cb.click();
    return true;
  }

  function clickToolbar(sel) { const b = q(sel); if (!b) return false; b.click(); return true; }
  function markUnread(rowEls) { return clickToolbar(SELECTORS.markUnread); }
  function markRead(rowEls) { return clickToolbar(SELECTORS.markRead); }
  function archive() { return clickToolbar(SELECTORS.archiveButton); }
  function del() { return clickToolbar(SELECTORS.deleteButton); }     // 'delete' is reserved
  function snooze() { return clickToolbar(SELECTORS.snoozeButton); }  // opens Gmail's native snooze picker
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
    const search = q(SELECTORS.searchInput);
    const opts = q(SELECTORS.searchOptions);
    if (!search || !opts || !info?.from) return false;
    search.focus(); search.value = 'from:(' + info.from + ')';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    opts.click(); // opens the filter builder with From prefilled; user clicks "Create filter"
    return true;
  }

  const api = { isReady, getToolbar, getLeftNavLabels, getSelectedRowEls, getRowInfo,
    getOpenThreadRecipients, clickMoveTo, applyLabel, markUnread, markRead,
    openCreateFilterForRow, archive, del, snooze, closestRow, closestListRow, selectRow, SELECTORS };
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).gmail = api;
})();
