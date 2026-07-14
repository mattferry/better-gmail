(function () {
  'use strict';

  // Attachments on top — relocates Gmail's own attachment tray items to a bar at
  // the top of the message (below the subject, above the body), like Outlook.
  //
  // HOW IT WORKS: Gmail keeps two things per message — the rendered body
  // (including inline signature images) and a separate attachment tray it builds
  // only for real attached files. We move the tray's cards, so signature images
  // are structurally excluded. For the Outlook edge case where a sender's client
  // attaches the signature logo as a real file, each tray item is cross-referenced
  // against the images rendered inline in the body (shared attachment id tokens,
  // filename matches, auto-generated-name patterns — see attachments-match.js);
  // matches are left where Gmail put them.
  //
  // Ported from Narendra S.'s "Gmail Attachments on Top" rework of Mehul S.'s
  // original extension.

  const BAR_CLASS = 'ob-attachments-bar';
  const LABEL_CLASS = 'ob-attachments-bar-label';
  const MOVED_ATTR = 'data-ob-att-moved';
  const FALLBACK_ATTR = 'data-ob-att-fallback-done';

  let enabled = false;
  let observer = null;
  let debounceTimer = null;

  function M() { return window.__OB.attachmentsMatch; }
  function S() { return window.__OB.gmail.SELECTORS; }

  function getInlineImageSignals(body) {
    const tokens = new Set();
    const names = new Set();
    body.querySelectorAll('img').forEach((img) => {
      M().extractTokens(img.src || img.getAttribute('data-src')).forEach((t) => tokens.add(t));
      ['alt', 'title'].forEach((attr) => {
        const val = M().normalizeName(img.getAttribute(attr));
        if (val) names.add(val);
      });
    });
    return { tokens, names };
  }

  function getAttachmentFilename(item) {
    const link = item.querySelector('a[download]');
    if (link) {
      const dl = link.getAttribute('download');
      if (dl) return dl;
    }
    const tooltipEl = item.querySelector('[data-tooltip]');
    if (tooltipEl) {
      const tip = tooltipEl.getAttribute('data-tooltip');
      if (tip) return tip;
    }
    const ariaEl = item.querySelector('[aria-label]');
    if (ariaEl) {
      const aria = ariaEl.getAttribute('aria-label');
      // current Gmail labels the card's controls "Download attachment <name>" /
      // "Add attachment to Drive <name>" — strip the verb to get the filename
      if (aria) return aria.replace(/^(download attachment|add attachment to drive)\s*/i, '');
    }
    return (item.textContent || '').trim().split('\n')[0];
  }

  function findTray(scope) {
    // Self-tuning: static .aQH first, then the resolver's semantic probe
    // (smallest container of the message's a[download] links).
    const R = window.__OB.resolver;
    return R ? R.resolve('attachmentTray', scope) : scope.querySelector(S().attachmentTray);
  }

  function relocateAttachmentsFor(messageEl) {
    if (!messageEl) return;
    const tray = findTray(messageEl);
    const body = messageEl.querySelector(S().messageBody);
    if (!tray || !body) return;
    if (tray.closest('.' + BAR_CLASS)) return;

    const signals = getInlineImageSignals(body);

    // Each direct child of the tray is normally one attachment card.
    const items = tray.children.length ? Array.from(tray.children) : [tray];
    const pending = items.filter((item) => item.getAttribute(MOVED_ATTR) !== '1');
    if (!pending.length) return;

    const toMove = [];
    const toKeep = [];
    pending.forEach((item) => {
      const link = item.querySelector('a[href]');
      const itemTokens = M().extractTokens(link ? link.href : null);
      const filename = getAttachmentFilename(item);
      const isSignatureImage =
        itemTokens.some((t) => signals.tokens.has(t)) ||
        M().namesLikelyMatch(filename, signals.names) ||
        M().looksLikeAutoInlineFilename(filename);
      (isSignatureImage ? toKeep : toMove).push(item);
    });

    // Safety net: if the heuristic thinks EVERY tray item is a signature image,
    // detection usually failed — promote them all anyway. Allowed only on a
    // message's very first evaluation: on a rescan, the real attachments were
    // already moved out, so an all-signature remainder is the correct working
    // state, not a failure.
    const fallbackAlreadyDecided = messageEl.getAttribute(FALLBACK_ATTR) === '1';
    let promote = toMove;
    if (!fallbackAlreadyDecided && !promote.length && toKeep.length) promote = toKeep;
    messageEl.setAttribute(FALLBACK_ATTR, '1');
    if (!promote.length) return;

    let bar = messageEl.querySelector('.' + BAR_CLASS);
    if (!bar) {
      bar = document.createElement('div');
      bar.className = BAR_CLASS;
      const label = document.createElement('div');
      label.className = LABEL_CLASS;
      bar.appendChild(label);
      const insertionPoint = body.closest('.gs') || body;
      insertionPoint.parentNode.insertBefore(bar, insertionPoint);
    }

    promote.forEach((item) => {
      bar.appendChild(item);
      item.setAttribute(MOVED_ATTR, '1');
    });

    const countEl = bar.querySelector('.' + LABEL_CLASS);
    if (countEl) countEl.textContent = 'Attachments (' + (bar.children.length - 1) + ')';
  }

  function scan() {
    let messages = Array.from(document.querySelectorAll(S().messageContainer));
    // Fallback: if Gmail's message-container class changed, locate containers by
    // walking up from any attachment tray we can find.
    if (!messages.length) {
      messages = Array.from(document.querySelectorAll(S().attachmentTray)).map((tray) =>
        tray.closest(S().messageContainerFallback) || tray.parentElement.parentElement || tray.parentElement
      );
    }
    messages.forEach((m) => {
      try { relocateAttachmentsFor(m); } catch (e) { console.warn('[OB] attachments-top:', e); }
    });
  }

  // Reversible: move every relocated card back into its message's native tray and
  // drop the bars, so toggling off in options restores Gmail's original layout
  // live (the standalone original needed a page refresh for this).
  function teardown() {
    document.querySelectorAll('.' + BAR_CLASS).forEach((bar) => {
      const scope = bar.closest(S().messageContainer) || bar.parentElement;
      let tray = scope ? findTray(scope) : null;
      // Whole-tray-moved edge (childless tray, audit fix 2026-07-14): the "item"
      // in the bar IS the tray — move it back out next to the bar first, or the
      // restore below would try tray.appendChild(tray) and throw mid-teardown.
      if (tray && bar.contains(tray)) {
        bar.parentNode.insertBefore(tray, bar);
        tray.removeAttribute(MOVED_ATTR);
      }
      if (tray) {
        bar.querySelectorAll('[' + MOVED_ATTR + ']').forEach((item) => {
          item.removeAttribute(MOVED_ATTR);
          tray.appendChild(item);
        });
      }
      // Only drop a bar that holds no relocated cards — never destroy attachments.
      if (!bar.querySelector('[' + MOVED_ATTR + ']')) bar.remove();
    });
    document.querySelectorAll('[' + FALLBACK_ATTR + ']').forEach((el) => el.removeAttribute(FALLBACK_ATTR));
  }

  // Attachments render asynchronously after navigation, so a per-navigate init is
  // not enough — a debounced observer rescans as Gmail fills the thread in. Bound
  // once; the live `enabled` flag makes it a no-op when the feature is off.
  function startObserving() {
    if (observer) return;
    observer = new MutationObserver(() => {
      if (!enabled) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(scan, 150);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Fully release the whole-body observer when the feature is off — a disabled
  // feature must not keep Chrome delivering MutationRecords for every Gmail DOM
  // change (audit fix 2026-07-14; this is the hot path core/router.js documents
  // having removed for performance).
  function stopObserving() {
    if (observer) { observer.disconnect(); observer = null; }
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  // Idempotent + reversible (bootstrap contract): re-reads the setting, then
  // either scans + observes or tears the bars back down.
  function init() {
    if (location.host !== 'mail.google.com') return;
    return window.__OB.settings.get('attachmentsTop').then((on) => {
      enabled = !!on;
      if (enabled) { startObserving(); scan(); } else { stopObserving(); teardown(); }
    }).catch((e) => console.log('[OB] attachments-top: init failed', e));
  }

  const api = { init };
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).attachmentsTop = api;
})();
