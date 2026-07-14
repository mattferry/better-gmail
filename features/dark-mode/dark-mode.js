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
  let observer = null;
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

    // A) the message card: walk up from each rendered body to role=main,
    // stamping light chrome. Bounded to the ancestor chain — cheap on any size.
    document.querySelectorAll('.ii').forEach((ii) => {
      let el = ii.parentElement;
      while (el && el !== document.body) {
        if (isLightBg(el)) stamp(el);
        if (el.getAttribute('role') === 'main') break;
        el = el.parentElement;
      }
    });

    // A2) residual wide light bands in the thread (reply/action bar, footer
    // strips) that aren't on the card's ancestor chain. The offset size gate
    // runs BEFORE getComputedStyle, so the expensive style read only happens for
    // the handful of wide elements — keeps this cheap on a big thread.
    document.querySelectorAll('div[role="main"]').forEach((main) => {
      const minW = main.getBoundingClientRect().width * 0.5;
      if (!minW) return;
      main.querySelectorAll('div').forEach((el) => {
        if (el.offsetWidth > minW && el.offsetHeight > 8 &&
            !el.hasAttribute(SURFACE_ATTR) && !invertedContainer(el) && isLightBg(el)) {
          stamp(el);
        }
      });
    });

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

  // Compose windows appear without a navigation, and Gmail re-renders cards, so
  // surfaces are re-stamped on DOM changes — debounced, and fully disconnected
  // while dark mode is off so the observer costs nothing when unused.
  function syncSurfaces() {
    const on = document.documentElement.getAttribute('data-ob-dark') === 'on' &&
               document.documentElement.getAttribute('data-ob-host') === 'gmail';
    if (on) {
      refreshSurfaces();
      if (!observer) {
        observer = new MutationObserver(() => {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(refreshSurfaces, 300);
        });
        observer.observe(document.body, { childList: true, subtree: true });
      }
    } else {
      if (observer) { observer.disconnect(); observer = null; }
      clearTimeout(debounceTimer);
      clearSurfaces();
    }
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
