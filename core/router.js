(function () {
  'use strict';
  const cbs = [];
  let last = location.href;
  function fire() { for (const cb of cbs) { try { cb(); } catch (e) { console.warn('[OB] router cb', e); } } }
  function onNavigate(cb) { cbs.push(cb); }

  // Coalesce rapid navigation events and give the SPA a beat to re-render before
  // feature init runs. Only schedules a fire when the URL actually changed.
  let t;
  function schedule() {
    if (location.href === last) return;
    last = location.href;
    clearTimeout(t);
    t = setTimeout(fire, 150);
  }

  function start() {
    // Gmail navigates by URL hash (#inbox, #label/x, #search/x, thread views), so
    // 'hashchange' catches every Gmail view change; 'popstate' covers back/forward
    // (including Calendar's History-API navigation). This replaces a
    // document.body {childList, subtree} MutationObserver that woke on EVERY Gmail
    // DOM mutation just to poll location.href — a hot path in an app that mutates
    // the DOM constantly. Firing semantics are unchanged: the old observer
    // callback was gated on the same location.href-changed check, so it too fired
    // only on URL changes.
    window.addEventListener('hashchange', schedule);
    window.addEventListener('popstate', schedule);
    // Defer the initial fire: content scripts run synchronously in manifest order, so router.js's
    // start() runs before later scripts (e.g. bootstrap.js) have registered their onNavigate
    // callbacks. A 0ms timer runs after the synchronous script-load phase completes, so by the
    // time this fires, all content scripts have finished loading and registering.
    setTimeout(fire, 0); // initial
  }
  if (typeof window !== 'undefined') start();
  const api = { onNavigate };
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).router = api;
})();
