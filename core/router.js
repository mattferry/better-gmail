(function () {
  'use strict';
  const cbs = [];
  let last = location.href;
  function fire() { for (const cb of cbs) { try { cb(); } catch (e) { console.warn('[OB] router cb', e); } } }
  function onNavigate(cb) { cbs.push(cb); }
  // Gmail/Calendar mutate the DOM heavily on navigation; watch both URL + DOM.
  const mo = new MutationObserver(() => {
    if (location.href !== last) { last = location.href; debounced(); }
  });
  let t; function debounced() { clearTimeout(t); t = setTimeout(fire, 150); }
  function start() {
    mo.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('hashchange', debounced);
    // Defer the initial fire: content scripts run synchronously in manifest order, so router.js's
    // start() runs before later scripts (e.g. bootstrap.js) have registered their onNavigate
    // callbacks. A 0ms timer runs after the synchronous script-load phase completes, so by the
    // time this fires, all content scripts have finished loading and registering.
    setTimeout(fire, 0); // initial
  }
  if (typeof document !== 'undefined') {
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  }
  const api = { onNavigate };
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).router = api;
})();
