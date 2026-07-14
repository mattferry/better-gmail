(function () {
  'use strict';
  function currentPref(mode) {
    if (mode === 'system') return matchMedia('(prefers-color-scheme: dark)').matches ? 'on' : 'off';
    return mode; // 'on' | 'off'
  }
  function apply(mode) {
    const host = location.host === 'calendar.google.com' ? 'calendar' : 'gmail';
    document.documentElement.setAttribute('data-ob-host', host);
    document.documentElement.setAttribute('data-ob-dark', currentPref(mode));
    syncSurfaces();
  }

  // ---- surface stamping (field fix 2026-07-14) ----
  // The invert rule can only cover the message BODY (.ii) — inverting any
  // ancestor would compose with it and flip the body back to light (the
  // original day-one bug). But Gmail's chrome around the body (the message
  // card, the reply bar, compose windows) stays white in a light theme. So:
  // find the light-background chrome at runtime and stamp it with
  // data-ob-dark-surface; dark-mode.css turns stamped surfaces dark with a
  // plain background (never a filter). Self-tuning: no Gmail classes needed.
  const SURFACE_ATTR = 'data-ob-dark-surface';
  let triggersWired = false;
  let debounceTimer = null;

  function isLightBg(el) {
    const bg = getComputedStyle(el).backgroundColor;
    const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!m) return false;
    if (m[4] !== undefined && parseFloat(m[4]) === 0) return false; // transparent
    return (+m[1] + +m[2] + +m[3]) / 3 > 200;
  }

  function stamp(el) {
    if (!el.hasAttribute(SURFACE_ATTR)) el.setAttribute(SURFACE_ATTR, '');
  }

  // Never stamp inside an inverted region (.ii body or a compose editor): a dark
  // background on an element the invert filter also covers would flip to light.
  function invertedContainer(el) {
    return el.closest('.ii') || el.closest('div[contenteditable="true"][role="textbox"]');
  }

  function refreshSurfaces() {
    if (document.documentElement.getAttribute('data-ob-dark') !== 'on' ||
        document.documentElement.getAttribute('data-ob-host') !== 'gmail') return;

    // Re-derive from scratch every time: role=main is REUSED across the list and
    // thread views, so a stamp applied while a thread was open would otherwise
    // persist onto the inbox list after navigating back (darkening it). Clearing
    // first, then re-stamping only what's currently valid, is correct and — since
    // this runs only on navigation/focus, not per-mutation — cheap. No repaint
    // happens between the clear and the re-stamp (one synchronous pass).
    clearSurfaces();

    // Read-mode chrome (A/A2) only when a message body is actually open. In the
    // inbox LIST view there is no .ii, and scanning role=main there would stamp
    // the inbox list itself — darkening chrome the feature must leave to Gmail's
    // own theme (a real overreach in light-theme Gmail). Compose (B) is
    // independent and runs whenever a compose/reply is open.
    const bodies = document.querySelectorAll('.ii');
    if (bodies.length) {
      // A) the message card: walk up from each body toward role=main, stamping
      // light chrome. The invertedContainer guard skips any ancestor that is
      // itself inside another inverted region (e.g. a read .ii quoted inside a
      // compose editor) — stamping there would double-darken under the filter.
      bodies.forEach((ii) => {
        let el = ii.parentElement;
        while (el && el !== document.body) {
          if (!invertedContainer(el) && isLightBg(el)) stamp(el);
          if (el.getAttribute('role') === 'main') break;
          el = el.parentElement;
        }
      });

      // A2) residual wide light bands in the open thread (reply/action bar,
      // footer strips) not on the card's ancestor chain. The offset size gate
      // runs BEFORE getComputedStyle so the expensive read only touches the few
      // wide elements. Scoped to a main that actually contains an open body.
      document.querySelectorAll('div[role="main"]').forEach((main) => {
        if (!main.querySelector('.ii')) return; // list-only main — skip
        const minW = main.getBoundingClientRect().width * 0.5;
        if (!minW) return;
        main.querySelectorAll('div').forEach((el) => {
          if (el.offsetWidth > minW && el.offsetHeight > 8 &&
              !el.hasAttribute(SURFACE_ATTR) && !invertedContainer(el) && isLightBg(el)) {
            stamp(el);
          }
        });
      });
    }

    // B) compose windows (bottom popup, popout dialog, inline reply). The header
    // fields (To/Subject) live in a sibling branch of the editor with transparent
    // backgrounds — the visible white is on the dialog/a wrapper — so stamp the
    // whole compose root and its light chrome (excluding the inverted editor).
    document.querySelectorAll('div[contenteditable="true"][role="textbox"]').forEach((editor) => {
      const root = editor.closest('div[role="dialog"]') || editor.parentElement;
      if (!root) return;
      stamp(root);
      let up = root.parentElement, hops = 0; // catch a white wrapper above the dialog
      while (up && up !== document.body && hops++ < 4) { if (isLightBg(up)) stamp(up); up = up.parentElement; }
      root.querySelectorAll('div, td, table, form').forEach((el) => {
        if (!invertedContainer(el) && isLightBg(el)) stamp(el);
      });
    });
  }

  function clearSurfaces() {
    document.querySelectorAll('[' + SURFACE_ATTR + ']').forEach((el) => el.removeAttribute(SURFACE_ATTR));
  }

  function scheduleRefresh() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(refreshSurfaces, 150);
  }

  // A thread's message body renders after the navigation fires (more so on slow
  // machines), so refresh once quickly and once late to catch the body — two
  // bounded passes per thread open, far cheaper than a per-mutation observer.
  function scheduleNavRefresh() {
    setTimeout(refreshSurfaces, 250);
    setTimeout(refreshSurfaces, 1000);
  }

  // Surfaces change on exactly two user actions: opening/closing a thread
  // (router navigation) and opening a compose/reply (focus lands in the
  // editor/fields). We drive off those events instead of a document.body
  // MutationObserver — that whole-page observer is the hot path router.js
  // documents removing, and adding it back would worsen the lag on weak
  // machines this extension targets (field decision 2026-07-14).
  function syncSurfaces() {
    const on = document.documentElement.getAttribute('data-ob-dark') === 'on' &&
               document.documentElement.getAttribute('data-ob-host') === 'gmail';
    if (!on) { clearTimeout(debounceTimer); clearSurfaces(); return; }
    // Immediate pass for the fast case, plus the two-shot late passes: on first
    // load (or a live enable) the body may not have painted yet, and the router's
    // one-time initial fire already ran before settings resolved, so we can't
    // rely on onNavigate for that first view.
    refreshSurfaces();
    scheduleNavRefresh();
    if (triggersWired) return;
    triggersWired = true;
    if (window.__OB && window.__OB.router && typeof window.__OB.router.onNavigate === 'function') {
      window.__OB.router.onNavigate(scheduleNavRefresh);
    }
    // focusin bubbles, fires when a compose/reply editor or its fields gain
    // focus — cheap, and exactly when compose chrome needs stamping.
    document.addEventListener('focusin', (e) => {
      if (e.target && e.target.closest &&
          e.target.closest('div[role="dialog"], div[contenteditable="true"][role="textbox"]')) {
        scheduleRefresh();
      }
    }, true);
    // Expanding a collapsed message in a multi-message thread reveals new card
    // chrome with no navigation and no editor focus — a click inside role=main
    // (which is where a message header expands) re-runs the refresh. Debounced;
    // a no-op cost in the list view (no .ii -> read passes skip).
    document.addEventListener('click', (e) => {
      if (e.target && e.target.closest && e.target.closest('div[role="main"]')) scheduleRefresh();
    }, true);
  }

  let wired = false;
  function applyFromSettings() {
    const OB = window.__OB;
    if (!OB || !OB.settings) return;
    OB.settings.getAll().then((s) => {
      const enabledHere = location.host === 'calendar.google.com' ? s.darkModeCalendar : s.darkModeGmail;
      apply(enabledHere ? s.darkMode : 'off');
    }).catch((e) => console.log('[OB] dark-mode: settings read failed', e));
  }
  function init() {
    const OB = window.__OB;
    if (!OB || !OB.settings) { console.log('[OB] dark-mode: __OB.settings unavailable, skipping init'); return; }
    applyFromSettings();
    if (wired) return;
    wired = true;
    if (typeof OB.settings.onChange === 'function') {
      OB.settings.onChange((changes) => {
        if (changes.darkMode || changes.darkModeGmail || changes.darkModeCalendar) applyFromSettings();
      });
    }
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyFromSettings);
  }
  const api = { apply, init, refreshSurfaces };
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).darkMode = api;
})();
