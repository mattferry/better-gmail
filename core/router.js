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
    fire(); // initial
  }
  if (typeof document !== 'undefined') {
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  }
  const api = { onNavigate };
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).router = api;
})();
