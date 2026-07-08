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

  const api = { toast, buildMenu, host };
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).ui = api;
})();
