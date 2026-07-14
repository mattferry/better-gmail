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

  // ---- surface stamping (field fix 2026-07-14, hardened after QA) ----
  // The body (.ii) is inverted by a static CSS rule — reliable, no flash. But
  // Gmail keeps "paper" surfaces white even in its own dark theme: the message
  // card MARGIN around the body, and compose windows. We darken that chrome at
  // runtime: mark the light-background card/compose chrome with
  // data-ob-dark-surface (CSS gives it a plain dark background — never a filter,
  // which would double-invert the body it contains) and recolor the known header
  // text light. The reply/action bar is deliberately NOT stamped: its buttons
  // carry text we can't reliably recolor, so darkening it would produce
  // dark-on-dark labels — better left as Gmail renders it.
  const SURFACE_ATTR = 'data-ob-dark-surface';
  const EDITOR_ATTR = 'data-ob-dark-editor';
  let triggersWired = false;
  let debounceTimer = null;

  // Opaque light background only: a translucent fill (0<a<1) sits over whatever
  // is behind it, so its raw RGB isn't the effective color (QA finding).
  function isOpaqueLight(el) {
    const bg = getComputedStyle(el).backgroundColor;
    const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (!m) return false;
    if (m[4] !== undefined && parseFloat(m[4]) < 0.9) return false; // transparent/translucent
    return (+m[1] + +m[2] + +m[3]) / 3 > 200;
  }

  function stamp(el) {
    // Never stamp inside an inverted region (.ii body or a marked compose
    // editor): a dark background under the invert filter flips to light. Guards
    // EVERY stamp site (QA finding).
    if (el.closest('.ii') || el.closest('[' + EDITOR_ATTR + ']')) return;
    if (!el.hasAttribute(SURFACE_ATTR)) el.setAttribute(SURFACE_ATTR, '');
  }

  // A Gmail compose/reply editor (not a Chat/Keep/Tasks contenteditable, which
  // live in role=complementary side panels): the editor sits in a compose
  // dialog or in the mail reading pane (inline reply), never a side panel.
  function isComposeEditor(editor) {
    if (editor.closest('[role="complementary"], [role="navigation"]')) return false;
    return !!editor.closest('div[role="dialog"], div[role="main"]');
  }

  function refreshSurfaces() {
    if (document.documentElement.getAttribute('data-ob-dark') !== 'on' ||
        document.documentElement.getAttribute('data-ob-host') !== 'gmail') return;

    // Re-derive from scratch: role=main is REUSED across list and thread views,
    // so a mark applied with a thread open would otherwise persist onto the inbox
    // list after navigating back (darkening it). Clear then re-derive — runs on
    // navigation/focus only, and no repaint happens mid-pass (one sync run).
    clearSurfaces();

    // Mark real Gmail compose editors FIRST so stamp()'s editor guard sees them.
    document.querySelectorAll('div[contenteditable="true"][role="textbox"]').forEach((editor) => {
      if (isComposeEditor(editor)) editor.setAttribute(EDITOR_ATTR, '');
    });

    // A) the message card MARGIN: walk up from each open body toward role=main,
    // darkening the light card chrome around it. Only ancestors of an open .ii —
    // never the inbox list (there is no .ii there). stamp() guards nesting.
    document.querySelectorAll('.ii').forEach((ii) => {
      let el = ii.parentElement;
      while (el && el !== document.body) {
        if (isOpaqueLight(el)) stamp(el);
        if (el.getAttribute('role') === 'main') break;
        el = el.parentElement;
      }
    });

    // B) compose windows (bottom popup, popout, inline reply): darken the light
    // chrome around each marked editor (the To/Subject fields sit in a sibling
    // branch with transparent backgrounds; the visible white is on the dialog).
    document.querySelectorAll('[' + EDITOR_ATTR + ']').forEach((editor) => {
      const root = editor.closest('div[role="dialog"]') || editor.parentElement;
      if (!root) return;
      stamp(root);
      let up = root.parentElement, hops = 0; // a white wrapper above the dialog
      while (up && up !== document.body && hops++ < 4) { if (isOpaqueLight(up)) stamp(up); up = up.parentElement; }
      root.querySelectorAll('div, td, table, form').forEach((el) => {
        if (isOpaqueLight(el)) stamp(el);
      });
    });
  }

  function clearSurfaces() {
    document.querySelectorAll('[' + SURFACE_ATTR + '],[' + EDITOR_ATTR + ']').forEach((el) => {
      el.removeAttribute(SURFACE_ATTR); el.removeAttribute(EDITOR_ATTR);
    });
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
