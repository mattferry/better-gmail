(function () {
  'use strict';
  const HOST_ID = 'ob-ui-host';

  function host() {
    let h = document.getElementById(HOST_ID);
    if (!h) {
      h = document.createElement('div');
      h.id = HOST_ID;
      h.attachShadow({ mode: 'open' });
      // Keep our UI out of any page invert filter:
      h.style.cssText = 'all:initial;position:fixed;z-index:2147483647;top:0;left:0;filter:none;';
      document.documentElement.appendChild(h);
      const style = document.createElement('style');
      style.textContent = OB_UI_CSS;
      h.shadowRoot.appendChild(style);
    }
    return h;
  }

  const OB_UI_CSS = `
    .ob-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
      background:#323232;color:#fff;padding:10px 16px;border-radius:6px;font:14px system-ui;
      box-shadow:0 2px 12px rgba(0,0,0,.4);opacity:0;transition:opacity .15s;}
    .ob-toast.show{opacity:1;}
    .ob-menu{position:fixed;min-width:200px;background:#fff;color:#202124;border-radius:8px;
      box-shadow:0 4px 20px rgba(0,0,0,.25);padding:6px 0;font:13px system-ui;}
    .ob-menu-item{display:flex;align-items:center;gap:10px;padding:8px 16px;cursor:pointer;white-space:nowrap;}
    .ob-menu-item:hover{background:#f1f3f4;}
    .ob-swatch{width:12px;height:12px;border-radius:3px;display:inline-block;}
    @media (prefers-color-scheme: dark){
      .ob-menu{background:#2a2a2a;color:#e8eaed;}
      .ob-menu-item:hover{background:#3c4043;}
    }
  `;

  function toast(msg) {
    const root = host().shadowRoot;
    const el = document.createElement('div');
    el.className = 'ob-toast';
    el.textContent = msg;
    root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 200); }, 2600);
  }

  let closeCurrentMenu = null;

  function buildMenu(items, x, y) {
    if (closeCurrentMenu) { closeCurrentMenu(); closeCurrentMenu = null; }
    const root = host().shadowRoot;
    root.querySelectorAll('.ob-menu').forEach((m) => m.remove());
    const menu = document.createElement('div');
    menu.className = 'ob-menu';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    for (const it of items) {
      const row = document.createElement('div');
      row.className = 'ob-menu-item';
      if (it.swatch) {
        const s = document.createElement('span');
        s.className = 'ob-swatch'; s.style.background = it.swatch;
        row.appendChild(s);
      }
      const label = document.createElement('span');
      label.textContent = it.label;
      row.appendChild(label);
      row.addEventListener('click', (e) => { e.stopPropagation(); close(); it.onClick && it.onClick(); });
      menu.appendChild(row);
    }
    root.appendChild(menu);
    // Reposition if off-screen; clamp so it can't render off the left/top edge either.
    const r = menu.getBoundingClientRect();
    if (r.right > innerWidth) menu.style.left = Math.max(4, x - r.width) + 'px';
    if (r.bottom > innerHeight) menu.style.top = Math.max(4, y - r.height) + 'px';
    // Idempotent: safe to call more than once (e.g. once from an outside-click/Escape and again
    // from the next buildMenu() call cleaning up a stale reference) — menu.remove()/
    // removeEventListener are no-ops when already removed/detached.
    const close = () => {
      menu.remove();
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', onKey);
      if (closeCurrentMenu === close) closeCurrentMenu = null;
    };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    setTimeout(() => { document.addEventListener('click', close); document.addEventListener('keydown', onKey); }, 0);
    closeCurrentMenu = close;
    return menu;
  }

  // Idempotently inject a child element identified by `id` into `parent`.
  // If an element with that id already exists it is returned unchanged; otherwise
  // build() creates it, it is tagged with the id, appended, and returned. Returns
  // null if `parent` is falsy (e.g. the Gmail toolbar isn't in the DOM yet), so
  // callers can safely no-op. Shared by the toolbar features (folder-illusionist,
  // quick-views), which re-run their init on every navigate. Pairs with removeById
  // so a feature turned off in settings can tear its element back down.
  function ensureChild(parent, id, build) {
    if (!parent) return null;
    const existing = document.getElementById(id);
    if (existing) {
      // Re-home when the intended parent changed since injection — e.g. an
      // early init fell back to a coarser container before Gmail finished
      // rendering the real one. Without this, the first placement sticks
      // forever because the id already exists (QA finding).
      if (existing.parentElement !== parent) parent.appendChild(existing);
      return existing;
    }
    const el = build();
    el.id = id;
    parent.appendChild(el);
    return el;
  }

  function removeById(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
    return !!el;
  }

  // Readable text color for injected controls, chosen from the effective
  // background behind `el` (walk up to the first opaque bg). Theme-agnostic:
  // Gmail's toolbar sets color:#202124 even in its dark theme (its icons are
  // SVGs, not text), so inheriting `color` renders black-on-dark — luminance of
  // the real background is the reliable signal (field fix 2026-07-14).
  function readableTextColor(el) {
    let n = el;
    let rgb = [255, 255, 255];
    while (n && n !== document.documentElement) {
      const bg = getComputedStyle(n).backgroundColor;
      const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      // Only a near-opaque layer defines the effective background. A translucent
      // fill (0<a<1) sits over whatever is behind it, so keep walking — using its
      // uncomposited RGB would pick the wrong contrast (finding, verified).
      if (m && (m[4] === undefined || parseFloat(m[4]) >= 0.9)) { rgb = [+m[1], +m[2], +m[3]]; break; }
      n = n.parentElement;
    }
    const lum = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
    return lum < 128 ? '#e8eaed' : '#202124';
  }

  const api = { toast, buildMenu, host, ensureChild, removeById, readableTextColor };
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).ui = api;
})();
