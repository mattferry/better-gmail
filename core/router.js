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
    // history navigation. Together these fully cover Gmail's hash-routed SPA nav.
    // Neither fires on a bare history.pushState() call (e.g. Google Calendar's path
    // routing, which pushes new URLs without a hash change or a popstate event) — the
    // Navigation API listener below additionally covers that case where available.
    // Both replace a document.body {childList, subtree} MutationObserver that woke on
    // EVERY Gmail DOM mutation just to poll location.href — a hot path in an app that
    // mutates the DOM constantly, dropped here for performance. This is not exact
    // parity with that old observer (which incidentally also caught pushState via its
    // DOM-mutation trigger); the Navigation API listener is the additive supplement
    // that closes that specific gap.
    window.addEventListener('hashchange', schedule);
    window.addEventListener('popstate', schedule);

    // Supplementary: the Navigation API 'navigatesuccess' fires after same-document
    // navigations including history.pushState (e.g. Google Calendar's path routing),
    // which hashchange/popstate miss. Additive + feature-detected: if unavailable or it
    // never fires, hashchange/popstate still fully cover Gmail. schedule()'s URL-equality
    // guard dedupes any overlap. (Navigation API behavior in the content-script isolated
    // world is not yet browser-verified here.)
    if (window.navigation && typeof window.navigation.addEventListener === 'function') {
      try { window.navigation.addEventListener('navigatesuccess', schedule); } catch (e) { /* ignore */ }
    }
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
