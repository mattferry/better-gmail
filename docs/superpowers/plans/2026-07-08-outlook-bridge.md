# Outlook-Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an unpacked MV3 Chrome extension that makes Gmail + Google Calendar behave like Outlook for coworkers migrating off Outlook — invert dark mode, a "Move to Folder" button, an Outlook-style right-click menu, color categories, and quick views.

**Architecture:** Content-script only (no OAuth, no remote code, no build step). All Gmail/Calendar DOM access is centralized in adapter modules so there is exactly one place to fix when Google changes its HTML. Pure logic lives in dual-export modules that run in the browser *and* are `require`-able by Node's test runner. Features never touch the DOM directly and never break Gmail — every feature init is guarded and fails silently.

**Tech Stack:** Plain modern JavaScript (ES2022), Chrome Manifest V3 content scripts, `chrome.storage.sync`, Node ≥ 18 built-in test runner (`node --test`) for the pure logic. No bundler, no npm dependencies.

## Global Constraints

- **Manifest V3**, content scripts only. No background service worker network calls, no remote code, no external hosts.
- **Permissions:** `storage` + host permissions `https://mail.google.com/*` and `https://calendar.google.com/*` ONLY. Do not add others without updating this plan.
- **No npm runtime dependencies.** Dev-time = Node's built-in `node --test` only. `package.json` has no `dependencies`.
- **Module pattern (mandatory for every `.js` file):** wrap the file body in an IIFE; expose the public API on `window.__OB.<namespace>` in the browser and on `module.exports` in Node. Never leak top-level names into the shared content-script global. Template:
  ```js
  (function () {
    'use strict';
    // ... top-level functions/consts here, private to this IIFE ...
    const api = { /* public fns */ };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;      // Node
    if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).NS = api;  // browser
  })();
  ```
- **Golden rule:** a feature must NEVER break Gmail. Wrap every feature's entry point in `try/catch`; on error, disable that feature and `console.warn('[OB]', ...)`. Never `throw` out of an injected handler.
- **Git discipline:** work on a feature branch, never `main`. Stage explicit paths only — NEVER `git add -A`/`.`/`-u`. Every commit message ends with:
  ```
  Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
  ```
- **Namespaced logging:** all console output is prefixed `[OB]` so it's greppable and obviously ours.
- **Selectors:** prefer stable anchors (`aria-label`, `role`, `data-*`, `gh=` view attributes, visible text) over Gmail's obfuscated CSS classes (`.T-I-J3` etc.), which change without notice. Every selector lives in an adapter's `SELECTORS` registry — never inline in a feature.

---

## Executor Preliminaries (read once before Task 1)

You have zero context for this project. Here is everything environment-specific you need.

### How to load / reload the extension
1. Open `chrome://extensions`.
2. Toggle **Developer mode** on (top-right).
3. **Load unpacked** → select the repo root (`C:\Users\mferr\outlook-bridge`).
4. After any code change: click the **↻ reload** icon on the Outlook-Bridge card, then hard-refresh the Gmail/Calendar tab (`Ctrl+Shift+R`).
5. To read our logs: open the Gmail tab, DevTools (`F12`) → Console → filter by `[OB]`.

### How to run the automated tests
- From the repo root: `node --test` (runs every `test/*.test.js`). Requires Node ≥ 18 (already installed on this machine via WSL/Windows — use `node --version` to confirm; if Windows Node is too new/absent, run `wsl node --test`).
- These tests only cover pure logic. They never touch `chrome.*` or the DOM.

### How to discover a Gmail/Calendar selector (you WILL do this repeatedly)
Gmail's classes are obfuscated and unstable. Procedure:
1. In the Gmail tab, right-click the target UI element → **Inspect**.
2. Look for a **stable anchor first**, in this priority order: `aria-label`, `role`, `data-tooltip`, `gh` attribute, `data-*`, visible text content. Only fall back to a class if nothing stable exists, and if so pick the *structural* relationship (e.g. "the toolbar `div[gh='mtb']`") rather than a leaf obfuscated class.
3. Add/confirm the selector in the relevant adapter's `SELECTORS` object with a comment showing the date you verified it and what element it targets.
4. If a selector can't be found, the adapter method returns `null`/`false` and the feature degrades — it does not throw.

Representative anchors known-good as of 2026-07: the main toolbar container carries `gh="mtb"`; the left-nav label links are `a` elements inside the navigation whose text is the label name; message-list rows are `tr.zA` with `role="row"` (verify live — treat `zA` as a hint, prefer `role="row"` within the list container). **Verify all of these live; do not trust them blind.**

### Never-break-Gmail wrapper (use everywhere a feature attaches to the page)
```js
function safe(name, fn) {
  try { return fn(); }
  catch (e) { console.warn('[OB] feature "' + name + '" disabled:', e); return undefined; }
}
```

---

## File Structure

```
outlook-bridge/
  manifest.json                         # MV3 manifest — content scripts, permissions
  package.json                          # node --test script; no deps
  .gitignore
  README.md                             # install + reload instructions for coworkers
  assets/
    icon16.png icon48.png icon128.png   # extension icons
  core/
    namespace.js      # establishes window.__OB (loads first)
    settings.js       # DEFAULTS, mergeDefaults (pure) + async get/set over chrome.storage.sync
    ui.js             # toast(), popover(), buildMenu() — shared styled UI, Shadow DOM hosted
    gmail-adapter.js  # SELECTORS + all Gmail DOM read/write methods
    calendar-adapter.js
    router.js         # onNavigate() — fires on Gmail/Calendar SPA view changes
    self-test.js      # verifies critical selectors resolve; warns if not
    bootstrap.js      # entry point: runs self-test, inits enabled features (loads last)
  features/
    dark-mode/
      dark-mode.css   # invert rules, gated on html[data-ob-dark]
      dark-mode.js
    folder-illusionist/
      label-tree.js   # buildLabelTree (pure)
      folder-illusionist.js
    context-menu/
      reply-with-meeting.js  # buildMeetingUrl (pure) + open action
      context-menu.js
    categories/
      categories.js   # DEFAULT_CATEGORIES, colorFor (pure) + apply/render
    quick-views/
      quick-views.js
  options/
    options.html options.js options.css
  test/
    settings.test.js
    label-tree.test.js
    reply-with-meeting.test.js
    categories.test.js
```

Content-script load order in `manifest.json` (dependency order): `core/namespace.js`, `core/settings.js`, `core/ui.js`, `core/gmail-adapter.js`, `core/calendar-adapter.js`, `core/router.js`, `core/self-test.js`, then each feature file, then `core/bootstrap.js` last.

---

# PHASE 1 — Skeleton + Dark Mode (a working, useful extension on its own)

## Task 1: Project skeleton, namespace, settings, test harness

**Files:**
- Create: `package.json`, `.gitignore`, `README.md`
- Create: `core/namespace.js`, `core/settings.js`, `core/bootstrap.js`
- Create: `manifest.json`
- Create: `assets/icon16.png`, `assets/icon48.png`, `assets/icon128.png` (any simple PNGs; a solid-color square is fine for now)
- Test: `test/settings.test.js`

**Interfaces:**
- Produces: `window.__OB` (object). `__OB.settings.DEFAULTS` (object), `__OB.settings.mergeDefaults(stored) -> object`, `__OB.settings.get(key) -> Promise<any>`, `__OB.settings.getAll() -> Promise<object>`, `__OB.settings.set(key, val) -> Promise<void>`, `__OB.settings.onChange(cb)`.

- [ ] **Step 1: Write `package.json`**
```json
{
  "name": "outlook-bridge",
  "version": "0.1.0",
  "private": true,
  "description": "Make Gmail + Google Calendar behave like Outlook.",
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: Write `.gitignore`**
```
node_modules/
*.log
.DS_Store
```

- [ ] **Step 3: Write the failing settings test** — `test/settings.test.js`
```js
const test = require('node:test');
const assert = require('node:assert');
const settings = require('../core/settings.js');

test('DEFAULTS has expected keys', () => {
  assert.strictEqual(settings.DEFAULTS.darkMode, 'on');
  assert.strictEqual(settings.DEFAULTS.folderIllusionist, true);
});

test('mergeDefaults overlays stored values onto defaults', () => {
  const merged = settings.mergeDefaults({ darkMode: 'off', unknown: 1 });
  assert.strictEqual(merged.darkMode, 'off');       // overridden
  assert.strictEqual(merged.contextMenu, true);      // from defaults
  assert.strictEqual(merged.unknown, 1);             // extra passthrough
});

test('mergeDefaults with null returns a copy of defaults', () => {
  const merged = settings.mergeDefaults(null);
  assert.strictEqual(merged.darkMode, 'on');
  assert.notStrictEqual(merged, settings.DEFAULTS);  // not the same object
});
```

- [ ] **Step 4: Run it to confirm it fails**

Run: `node --test test/settings.test.js`
Expected: FAIL — `Cannot find module '../core/settings.js'`.

- [ ] **Step 5: Write `core/namespace.js`** (browser-only; establishes the global)
```js
(function () {
  'use strict';
  if (typeof window !== 'undefined') window.__OB = window.__OB || {};
})();
```

- [ ] **Step 6: Write `core/settings.js`**
```js
(function () {
  'use strict';

  const DEFAULTS = {
    darkMode: 'on',            // 'on' | 'off' | 'system'
    darkModeGmail: true,
    darkModeCalendar: true,
    folderIllusionist: true,
    contextMenu: true,
    categories: true,
    quickViews: true,
    confirmBeforeDelete: true,
    compactDensity: false,
    categoryDefs: null,        // null => use categories DEFAULT_CATEGORIES
  };

  function mergeDefaults(stored) {
    return Object.assign({}, DEFAULTS, stored || {});
  }

  // Browser-only async API over chrome.storage.sync
  function get(key) {
    return getAll().then((all) => all[key]);
  }
  function getAll() {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.storage) return resolve(mergeDefaults(null));
      chrome.storage.sync.get(null, (stored) => resolve(mergeDefaults(stored)));
    });
  }
  function set(key, val) {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.storage) return resolve();
      chrome.storage.sync.set({ [key]: val }, () => resolve());
    });
  }
  function onChange(cb) {
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync') cb(changes);
    });
  }

  const api = { DEFAULTS, mergeDefaults, get, getAll, set, onChange };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).settings = api;
})();
```

- [ ] **Step 7: Run the test to confirm it passes**

Run: `node --test test/settings.test.js`
Expected: PASS — 3 tests.

- [ ] **Step 8: Write `core/bootstrap.js`** (minimal for now — proves injection works)
```js
(function () {
  'use strict';
  console.log('[OB] Outlook-Bridge loaded on', location.host);
  // Feature init is added in later tasks.
})();
```

- [ ] **Step 9: Create the three icon PNGs** in `assets/` (16/48/128 px). A solid indigo square is fine; replace with real art later. (On this machine you can generate them any way; they just need to exist and be valid PNGs.)

- [ ] **Step 10: Write `manifest.json`**
```json
{
  "manifest_version": 3,
  "name": "Outlook-Bridge",
  "version": "0.1.0",
  "description": "Make Gmail + Google Calendar behave like Outlook.",
  "icons": { "16": "assets/icon16.png", "48": "assets/icon48.png", "128": "assets/icon128.png" },
  "permissions": ["storage"],
  "host_permissions": ["https://mail.google.com/*", "https://calendar.google.com/*"],
  "options_page": "options/options.html",
  "content_scripts": [
    {
      "matches": ["https://mail.google.com/*", "https://calendar.google.com/*"],
      "run_at": "document_idle",
      "js": [
        "core/namespace.js",
        "core/settings.js",
        "core/bootstrap.js"
      ]
    }
  ]
}
```
(Note: `options_page` points at a file created in Task 4; Chrome tolerates it missing until opened, but create a stub now if it complains — an empty `options/options.html` is enough to load.)

- [ ] **Step 11: Load unpacked and verify injection**

Manual verification:
1. `chrome://extensions` → Developer mode → Load unpacked → repo root. Card appears, no errors.
2. Open `https://mail.google.com`, open DevTools console, filter `[OB]`.
3. Expected: `[OB] Outlook-Bridge loaded on mail.google.com`.
4. Open `https://calendar.google.com`, same log with `calendar.google.com`.

- [ ] **Step 12: Commit**
```bash
git add package.json .gitignore README.md manifest.json \
        core/namespace.js core/settings.js core/bootstrap.js \
        assets/icon16.png assets/icon48.png assets/icon128.png \
        test/settings.test.js
git commit -m "feat: extension skeleton, namespace, settings + test harness

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Core services — UI helpers, Gmail/Calendar adapters, router, self-test

This is the discovery-heavy task: you will inspect live Gmail/Calendar to fill in selectors. Methods return `null`/`false` when their anchor isn't found — they never throw.

**Files:**
- Create: `core/ui.js`, `core/gmail-adapter.js`, `core/calendar-adapter.js`, `core/router.js`, `core/self-test.js`
- Modify: `core/bootstrap.js` (run self-test), `manifest.json` (add the new files to `content_scripts.js` in load order)

**Interfaces:**
- Produces `__OB.ui`: `toast(msg)`, `buildMenu(items, x, y) -> HTMLElement` where `items = [{label, swatch?, onClick}]` (swatch = a hex color for a color chip). Nested menus are done by calling `buildMenu` again at an offset, not via a `submenu` field.
- Produces `__OB.gmail`: `isReady() -> boolean`, `getToolbar() -> Element|null`, `getLeftNavLabels() -> string[]` (label full-names from the left nav), `getSelectedRowEls() -> Element[]`, `getRowInfo(rowEl) -> {subject, from, threadId}|null`, `getOpenThreadRecipients() -> string[]`, `clickMoveTo(labelFullName) -> boolean`, `markUnread(rowEls) -> boolean`, `markRead(rowEls) -> boolean`, `openCreateFilterForRow(rowEl) -> boolean`, `applyLabel(rowEls, labelFullName) -> boolean`, `archive() -> boolean`, `del() -> boolean`, `snooze() -> boolean`, `closestRow(el) -> Element|null`, `SELECTORS` (object).
- Produces `__OB.calendar`: `isReady() -> boolean`, `enforceDarkTheme() -> void`, `SELECTORS`.
- Produces `__OB.router`: `onNavigate(cb)` — calls `cb()` on initial load and every SPA view change (debounced).

- [ ] **Step 1: Write `core/ui.js`** — Shadow-DOM-hosted so Gmail's CSS (and our own invert filter) can't corrupt it.
```js
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

  function buildMenu(items, x, y) {
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
    // Reposition if off-screen
    const r = menu.getBoundingClientRect();
    if (r.right > innerWidth) menu.style.left = (x - r.width) + 'px';
    if (r.bottom > innerHeight) menu.style.top = (y - r.height) + 'px';
    const close = () => { menu.remove(); document.removeEventListener('click', close); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    setTimeout(() => { document.addEventListener('click', close); document.addEventListener('keydown', onKey); }, 0);
    return menu;
  }

  const api = { toast, buildMenu, host };
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).ui = api;
})();
```

- [ ] **Step 2: Write `core/gmail-adapter.js` scaffold with the SELECTORS registry and method stubs**, then fill each selector by live inspection (see Preliminaries → "How to discover a selector"). Structure:
```js
(function () {
  'use strict';

  // Every selector verified live. Update the date + note when Gmail changes.
  const SELECTORS = {
    // verified 2026-07-08 — main toolbar container above the message list
    toolbar: 'div[gh="mtb"]',
    // left-nav label links; filter to those with a data-tooltip / text = label name
    leftNavLabelLink: 'div[role="navigation"] a[href*="#label"]',
    // message list rows
    listRow: 'div[role="main"] tr[role="row"]',
    // a selected row carries a checked checkbox
    rowCheckbox: 'div[role="checkbox"]',
    // toolbar "Move to" button (folder-with-arrow); found by aria-label
    moveToButton: 'div[aria-label="Move to"], div[data-tooltip="Move to"]',
    // toolbar "Labels" button
    labelsButton: 'div[aria-label="Labels"], div[data-tooltip="Labels"]',
    // "Mark as unread" toolbar/menu item
    markUnread: 'div[aria-label="Mark as unread"], div[data-tooltip="Mark as unread"]',
    markRead: 'div[aria-label="Mark as read"], div[data-tooltip="Mark as read"]',
    // the search box (used to drive "create filter")
    searchInput: 'input[aria-label="Search mail"], input[name="q"]',
    // "Show search options" caret that opens the filter builder
    searchOptions: 'button[aria-label="Show search options"]',
    // an open thread's recipient chips
    recipientChip: 'span[email]',
    // toolbar action buttons (appear when a row is selected / thread open)
    archiveButton: 'div[aria-label="Archive"], div[data-tooltip="Archive"]',
    deleteButton: 'div[aria-label="Delete"], div[data-tooltip="Delete"]',
    snoozeButton: 'div[aria-label="Snooze"], div[data-tooltip="Snooze"]'
  };

  function q(sel, root) { return (root || document).querySelector(sel); }
  function qa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  function isReady() { return !!q(SELECTORS.toolbar); }
  function getToolbar() { return q(SELECTORS.toolbar); }

  function getLeftNavLabels() {
    // Return label full-names. Gmail nests sub-labels; the visible text is the leaf,
    // but the href/aria often carries the full path. Prefer parsing the href label param.
    return qa(SELECTORS.leftNavLabelLink)
      .map((a) => {
        const m = decodeURIComponent(a.getAttribute('href') || '').match(/#label\/(.+)$/);
        return m ? m[1] : (a.textContent || '').trim();
      })
      .filter(Boolean);
  }

  function getSelectedRowEls() {
    return qa(SELECTORS.listRow).filter((r) => {
      const cb = q(SELECTORS.rowCheckbox, r);
      return cb && cb.getAttribute('aria-checked') === 'true';
    });
  }

  function getRowInfo(rowEl) {
    if (!rowEl) return null;
    const from = (q('span[email]', rowEl) || {}).getAttribute?.('email') || null;
    const subject = (rowEl.querySelector('[role="link"] span, .bog')?.textContent || '').trim() || null;
    return { subject, from, threadId: rowEl.getAttribute('data-legacy-thread-id') || null };
  }

  function getOpenThreadRecipients() {
    return qa(SELECTORS.recipientChip).map((s) => s.getAttribute('email')).filter(Boolean);
  }

  function clickMoveTo(labelFullName) {
    const btn = q(SELECTORS.moveToButton);
    if (!btn) return false;
    btn.click(); // opens Gmail's native Move-to dropdown (applies label + archives)
    // The dropdown renders a searchable list; type the label and Enter, OR click the matching item.
    return selectFromNativeDropdown(labelFullName);
  }

  function applyLabel(rowEls, labelFullName) {
    const btn = q(SELECTORS.labelsButton);
    if (!btn) return false;
    btn.click();
    return selectFromNativeDropdown(labelFullName, /*keepInInbox*/ true);
  }

  // Helper: after opening a native label/move dropdown, pick the target label.
  // Discover the dropdown container + its item/search structure live and implement here.
  function selectFromNativeDropdown(labelFullName, keepInInbox) {
    // Strategy: the dropdown has a filter input; set its value, dispatch 'input',
    // then find the option whose text === leaf label name and click it.
    // Implement against the live DOM; return true on success, false otherwise.
    return false; // Filled in live per Task 2 Step 3 (exact procedure documented there);
                  // stub returns false so the feature degrades until that step is done.
  }

  function markUnread(rowEls) {
    const btn = q(SELECTORS.markUnread);
    if (!btn) return false;
    btn.click();
    return true;
  }
  function markRead(rowEls) {
    const btn = q(SELECTORS.markRead);
    if (!btn) return false;
    btn.click();
    return true;
  }

  function clickToolbar(sel) { const b = q(sel); if (!b) return false; b.click(); return true; }
  function archive() { return clickToolbar(SELECTORS.archiveButton); }
  function del() { return clickToolbar(SELECTORS.deleteButton); }     // 'delete' is reserved
  function snooze() { return clickToolbar(SELECTORS.snoozeButton); }  // opens Gmail's native snooze picker
  function closestRow(el) {
    return el && (el.closest(SELECTORS.listRow) || el.closest('tr[role="row"], div[role="row"]'));
  }

  function openCreateFilterForRow(rowEl) {
    // Gmail: open search options with the sender prefilled, which exposes "Create filter".
    const info = getRowInfo(rowEl);
    const search = q(SELECTORS.searchInput);
    const opts = q(SELECTORS.searchOptions);
    if (!search || !opts || !info?.from) return false;
    search.focus(); search.value = 'from:(' + info.from + ')';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    opts.click(); // opens the filter builder with From prefilled; user clicks "Create filter"
    return true;
  }

  const api = { isReady, getToolbar, getLeftNavLabels, getSelectedRowEls, getRowInfo,
    getOpenThreadRecipients, clickMoveTo, applyLabel, markUnread, markRead,
    openCreateFilterForRow, archive, del, snooze, closestRow, SELECTORS };
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).gmail = api;
})();
```
NOTE: `selectFromNativeDropdown` is the one method that MUST be completed live (it depends on the dropdown's runtime DOM, which cannot be known ahead of time). Its manual completion is a step below. Every other method should work with verified selectors.

- [ ] **Step 3: Complete `selectFromNativeDropdown` against the live dropdown**

Manual procedure:
1. In Gmail, select one email, click the native **Move to** toolbar button. Inspect the dropdown that appears.
2. Identify: (a) the dropdown container, (b) its filter/search `input`, (c) the option rows and where the label text lives.
3. Implement: set the input's `.value`, dispatch an `input` Event (bubbles), then `querySelector` the option whose trimmed text equals the leaf of `labelFullName` (`labelFullName.split('/').pop()`) and `.click()` it. Return `true`; if any anchor is missing return `false`.
4. Add the discovered selectors to `SELECTORS` (e.g. `moveDropdown`, `moveDropdownInput`, `moveDropdownItem`) with the verified-date comment.

- [ ] **Step 4: Write `core/calendar-adapter.js`**
```js
(function () {
  'use strict';
  const SELECTORS = {
    // verified 2026-07-08 — Settings gear that opens the density/theme menu
    settingsGear: 'button[aria-label*="Settings"]'
  };
  function isReady() { return location.host === 'calendar.google.com' && !!document.querySelector('[role="main"]'); }
  // Google Calendar has a native dark theme. If the account isn't already dark,
  // we invert residual white surfaces via dark-mode.css; there is no reliable
  // programmatic toggle, so this is a no-op hook kept for future use.
  function enforceDarkTheme() { /* handled by CSS invert of residual surfaces */ }
  const api = { isReady, enforceDarkTheme, SELECTORS };
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).calendar = api;
})();
```

- [ ] **Step 5: Write `core/router.js`** — fire a callback on SPA view changes.
```js
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
```

- [ ] **Step 6: Write `core/self-test.js`** — early-warning when Gmail changes.
```js
(function () {
  'use strict';
  function run() {
    const host = location.host;
    const A = window.__OB && window.__OB.gmail;
    const C = window.__OB && window.__OB.calendar;
    const results = [];
    if (host === 'mail.google.com' && A) {
      for (const [name, sel] of Object.entries(A.SELECTORS)) {
        const ok = !!document.querySelector(sel);
        results.push({ name, sel, ok });
      }
    }
    if (host === 'calendar.google.com' && C) {
      for (const [name, sel] of Object.entries(C.SELECTORS)) {
        results.push({ name, sel, ok: !!document.querySelector(sel) });
      }
    }
    const broken = results.filter((r) => !r.ok);
    if (broken.length) console.warn('[OB] self-test: selectors not found (Gmail may have changed):', broken);
    else console.log('[OB] self-test: all', results.length, 'selectors OK');
    return results;
  }
  const api = { run };
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).selfTest = api;
})();
```
NOTE: some selectors only exist after a row is selected (e.g. `markUnread`), so a few "not found" at idle are expected — that's fine; the warning is a signal, not a failure. Consider marking such selectors optional in a follow-up.

- [ ] **Step 7: Update `core/bootstrap.js` to run self-test after the view settles**
```js
(function () {
  'use strict';
  console.log('[OB] Outlook-Bridge loaded on', location.host);
  const OB = window.__OB;
  OB.router.onNavigate(() => {
    setTimeout(() => OB.selfTest.run(), 500);
    // feature init calls are added in later tasks
  });
})();
```

- [ ] **Step 8: Update `manifest.json` content_scripts js list** to load all core files in order, bootstrap last:
```json
"js": [
  "core/namespace.js",
  "core/settings.js",
  "core/ui.js",
  "core/gmail-adapter.js",
  "core/calendar-adapter.js",
  "core/router.js",
  "core/self-test.js",
  "core/bootstrap.js"
]
```

- [ ] **Step 9: Manual verification**
1. Reload the extension + hard-refresh Gmail.
2. Console filter `[OB]`: expect the load line, then `self-test: all N selectors OK` (or a warning listing only the select-dependent ones like `markUnread`).
3. In the console run `__OB.gmail.getLeftNavLabels()` → expect an array of your label names.
4. Run `__OB.ui.toast('hello')` → a dark toast appears bottom-center and fades.
5. Select an email, run `__OB.gmail.getSelectedRowEls().length` → expect `1`.

- [ ] **Step 10: Commit**
```bash
git add core/ui.js core/gmail-adapter.js core/calendar-adapter.js \
        core/router.js core/self-test.js core/bootstrap.js manifest.json
git commit -m "feat: core UI, Gmail/Calendar adapters, router, self-test

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Dark mode (invert)

**Files:**
- Create: `features/dark-mode/dark-mode.css`, `features/dark-mode/dark-mode.js`
- Modify: `manifest.json` (add a `document_start` CSS injection + the JS file), `core/bootstrap.js` (init dark mode)

**Interfaces:**
- Produces `__OB.darkMode`: `apply(mode)` where `mode ∈ {'on','off','system'}`, `init()`.

- [ ] **Step 1: Write `features/dark-mode/dark-mode.css`** — invert gated on a root attribute so JS can toggle without a reload.
```css
/* Applied only when the root opts in, so 'off' is a no-op with zero cost. */
html[data-ob-dark="on"] .ii,           /* email body container (verify class live) */
html[data-ob-dark="on"] .a3s,          /* rendered message body (verify live) */
html[data-ob-dark="on"] div[role="listitem"] .ii {
  filter: invert(1) hue-rotate(180deg);
  background: #fff;                     /* give the invert a white base -> becomes dark */
}
/* Un-invert media so photos/logos look normal */
html[data-ob-dark="on"] .ii img,
html[data-ob-dark="on"] .a3s img,
html[data-ob-dark="on"] .ii video {
  filter: invert(1) hue-rotate(180deg);
}
/* Calendar: invert residual white surfaces only (native dark handles the rest). */
html[data-ob-dark="on"][data-ob-host="calendar"] .residual-white-surface {
  filter: invert(1) hue-rotate(180deg);
}
```
NOTE: `.ii` / `.a3s` are the historically-stable Gmail message-body classes; VERIFY them live and adjust. Prefer wrapping the message body by a stable ancestor if these have changed.

- [ ] **Step 2: Write `features/dark-mode/dark-mode.js`**
```js
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
  }
  function init() {
    const OB = window.__OB;
    OB.settings.getAll().then((s) => {
      const enabledHere = location.host === 'calendar.google.com' ? s.darkModeCalendar : s.darkModeGmail;
      apply(enabledHere ? s.darkMode : 'off');
    });
    OB.settings.onChange((changes) => {
      if (changes.darkMode || changes.darkModeGmail || changes.darkModeCalendar) init();
    });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => init());
  }
  const api = { apply, init };
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).darkMode = api;
})();
```

- [ ] **Step 3: Wire into `manifest.json`** — inject the CSS at `document_start` to prevent a white flash, and add the JS to the main content script list (before `bootstrap.js`). Add a second content_scripts entry:
```json
{
  "matches": ["https://mail.google.com/*", "https://calendar.google.com/*"],
  "run_at": "document_start",
  "css": ["features/dark-mode/dark-mode.css"]
}
```
and add `"features/dark-mode/dark-mode.js"` to the existing `document_idle` entry's `js` array immediately before `core/bootstrap.js`.

- [ ] **Step 4: Init from `core/bootstrap.js`** — add inside the load block (once, not per-navigate):
```js
window.__OB.darkMode.init();
```

- [ ] **Step 5: Manual verification** (this is the flagship feature — check carefully)
1. Reload + hard-refresh Gmail. Open an email that has a white HTML body (e.g. a newsletter).
2. Expected: the body renders dark; text is light; **photos/logos look normal** (not color-inverted).
3. Toggle in console: `__OB.darkMode.apply('off')` → body returns to white instantly. `apply('on')` → dark again.
4. Open Google Calendar. Confirm no bright-white panels remain (native dark should cover most; note any residual white surface and add its selector to the CSS `residual-white-surface` rule).
5. Confirm no white flash on Gmail load (CSS is injected at `document_start`).

- [ ] **Step 6: Commit**
```bash
git add features/dark-mode/dark-mode.css features/dark-mode/dark-mode.js manifest.json core/bootstrap.js
git commit -m "feat: invert dark mode for Gmail bodies + Calendar residuals

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Options page

**Files:**
- Create: `options/options.html`, `options/options.js`, `options/options.css`
- (Manifest already references `options_page`.)

**Interfaces:**
- Consumes: `__OB.settings` — but the options page runs in an extension page (not a content script), so it uses `chrome.storage.sync` directly (it can't see `window.__OB`). Replicate the DEFAULTS inline or load `core/settings.js` via a `<script>` tag (it dual-exports; in the options page `window.__OB.settings` will be set). Prefer loading `core/settings.js` with a `<script src="../core/settings.js">`.

- [ ] **Step 1: Write `options/options.html`**
```html
<!doctype html>
<html>
<head><meta charset="utf-8"><link rel="stylesheet" href="options.css"></head>
<body>
  <h1>Outlook-Bridge settings</h1>
  <section>
    <label>Dark mode
      <select id="darkMode">
        <option value="on">On</option>
        <option value="off">Off</option>
        <option value="system">Follow system</option>
      </select>
    </label>
    <label><input type="checkbox" id="darkModeGmail"> Dark mode in Gmail</label>
    <label><input type="checkbox" id="darkModeCalendar"> Dark mode in Calendar</label>
  </section>
  <section>
    <label><input type="checkbox" id="folderIllusionist"> Move-to-Folder button</label>
    <label><input type="checkbox" id="contextMenu"> Enhanced right-click menu</label>
    <label><input type="checkbox" id="categories"> Color categories</label>
    <label><input type="checkbox" id="quickViews"> Quick views</label>
    <label><input type="checkbox" id="confirmBeforeDelete"> Confirm before permanent delete</label>
    <label><input type="checkbox" id="compactDensity"> Compact density</label>
  </section>
  <p id="saved" hidden>Saved.</p>
  <script src="../core/settings.js"></script>
  <script src="options.js"></script>
</body>
</html>
```

- [ ] **Step 2: Write `options/options.css`** (minimal, readable, dark-aware)
```css
body{font:14px system-ui;max-width:560px;margin:32px auto;padding:0 16px;color:#202124;background:#fff;}
section{margin:20px 0;padding:16px;border:1px solid #dadce0;border-radius:8px;display:grid;gap:12px;}
label{display:flex;align-items:center;gap:8px;}
@media (prefers-color-scheme:dark){body{background:#202124;color:#e8eaed;}section{border-color:#3c4043;}}
```

- [ ] **Step 3: Write `options/options.js`**
```js
const S = window.__OB.settings;                 // dual-export gives us this in the options page
const CHECKS = ['darkModeGmail','darkModeCalendar','folderIllusionist','contextMenu',
  'categories','quickViews','confirmBeforeDelete','compactDensity'];

function load() {
  S.getAll().then((s) => {
    document.getElementById('darkMode').value = s.darkMode;
    for (const k of CHECKS) document.getElementById(k).checked = !!s[k];
  });
}
function save(key, val) {
  S.set(key, val).then(() => {
    const el = document.getElementById('saved'); el.hidden = false;
    setTimeout(() => (el.hidden = true), 1200);
  });
}
document.getElementById('darkMode').addEventListener('change', (e) => save('darkMode', e.target.value));
for (const k of CHECKS) document.getElementById(k).addEventListener('change', (e) => save(k, e.target.checked));
load();
```

- [ ] **Step 4: Manual verification**
1. Reload extension → `chrome://extensions` → Outlook-Bridge → **Details** → **Extension options**.
2. Toggle "Dark mode in Gmail" off → switch to the Gmail tab → body goes light (the `onChange` listener from Task 3 re-applies). Toggle on → dark returns.
3. Confirm each checkbox persists across a page reload.

- [ ] **Step 5: Commit**
```bash
git add options/options.html options/options.js options/options.css
git commit -m "feat: options page with per-feature toggles

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

**✅ Phase 1 checkpoint:** the extension is now independently useful — real dark mode + a settings page. Good place for a review gate.

---

# PHASE 2 — Folder Illusionist

## Task 5: `buildLabelTree` pure module + tests

**Files:**
- Create: `features/folder-illusionist/label-tree.js`
- Test: `test/label-tree.test.js`

**Interfaces:**
- Produces `__OB.labelTree.buildLabelTree(fullNames: string[]) -> Node[]` where `Node = {name, fullName, children: Node[]}`. Synthesizes missing intermediate parents. Sorted alphabetically at each level.

- [ ] **Step 1: Write the failing test** — `test/label-tree.test.js`
```js
const test = require('node:test');
const assert = require('node:assert');
const { buildLabelTree } = require('../features/folder-illusionist/label-tree.js');

test('flat labels become root nodes', () => {
  const t = buildLabelTree(['Work', 'Personal']);
  assert.deepStrictEqual(t.map(n => n.name), ['Personal', 'Work']); // sorted
});

test('nested labels build a tree', () => {
  const t = buildLabelTree(['Clients/Acme', 'Clients/Beta', 'Work']);
  const clients = t.find(n => n.name === 'Clients');
  assert.ok(clients);
  assert.deepStrictEqual(clients.children.map(c => c.name), ['Acme', 'Beta']);
  assert.strictEqual(clients.children[0].fullName, 'Clients/Acme');
});

test('missing intermediate parents are synthesized', () => {
  const t = buildLabelTree(['A/B/C']);
  assert.strictEqual(t[0].name, 'A');
  assert.strictEqual(t[0].children[0].name, 'B');
  assert.strictEqual(t[0].children[0].children[0].fullName, 'A/B/C');
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `node --test test/label-tree.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `features/folder-illusionist/label-tree.js`**
```js
(function () {
  'use strict';
  function buildLabelTree(fullNames) {
    const root = { name: '', fullName: '', children: [] };
    const index = new Map([['', root]]);
    const sorted = [...new Set(fullNames)].sort((a, b) => a.localeCompare(b));
    for (const full of sorted) {
      const parts = full.split('/');
      let parentPath = '';
      for (let i = 0; i < parts.length; i++) {
        const path = i === 0 ? parts[0] : parentPath + '/' + parts[i];
        if (!index.has(path)) {
          const node = { name: parts[i], fullName: path, children: [] };
          index.get(parentPath).children.push(node);
          index.set(path, node);
        }
        parentPath = path;
      }
    }
    return root.children;
  }
  const api = { buildLabelTree };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).labelTree = api;
})();
```

- [ ] **Step 4: Run to confirm pass**

Run: `node --test test/label-tree.test.js`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**
```bash
git add features/folder-illusionist/label-tree.js test/label-tree.test.js
git commit -m "feat: label-tree builder with tests

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Folder Illusionist button + folder-tree picker

**Files:**
- Create: `features/folder-illusionist/folder-illusionist.js`
- Modify: `manifest.json` (add label-tree.js + folder-illusionist.js to js list), `core/bootstrap.js` (init on navigate)

**Interfaces:**
- Consumes: `__OB.gmail.getToolbar/getLeftNavLabels/clickMoveTo/getSelectedRowEls`, `__OB.labelTree.buildLabelTree`, `__OB.ui.buildMenu/toast`, `__OB.settings`.
- Produces `__OB.folderIllusionist.init()` (idempotent — safe to call on every navigate).

- [ ] **Step 1: Implement `features/folder-illusionist/folder-illusionist.js`**
```js
(function () {
  'use strict';
  const BTN_ID = 'ob-move-to-folder';

  function ensureButton() {
    const OB = window.__OB;
    const toolbar = OB.gmail.getToolbar();
    if (!toolbar || document.getElementById(BTN_ID)) return;
    const btn = document.createElement('div');
    btn.id = BTN_ID;
    btn.textContent = '📁 Move to Folder';
    btn.style.cssText = 'cursor:pointer;padding:6px 10px;margin:0 6px;border-radius:6px;' +
      'font:13px system-ui;display:inline-flex;align-items:center;background:rgba(0,0,0,.05);';
    btn.addEventListener('click', (e) => { e.stopPropagation(); openPicker(btn); });
    toolbar.appendChild(btn);
  }

  function openPicker(anchor) {
    const OB = window.__OB;
    const rows = OB.gmail.getSelectedRowEls();
    if (!rows.length) { OB.ui.toast('Select an email first'); return; }
    const labels = OB.gmail.getLeftNavLabels();
    const tree = OB.labelTree.buildLabelTree(labels);
    const items = flatten(tree).map((node) => ({
      label: '  '.repeat(node.depth) + (node.children.length ? '▸ ' : '') + node.name,
      onClick: () => moveTo(node.fullName)
    }));
    const r = anchor.getBoundingClientRect();
    OB.ui.buildMenu(items, r.left, r.bottom + 4);
  }

  function flatten(nodes, depth = 0, out = []) {
    for (const n of nodes) { out.push(Object.assign({ depth }, n)); flatten(n.children, depth + 1, out); }
    return out;
  }

  function moveTo(fullName) {
    const OB = window.__OB;
    const ok = OB.gmail.clickMoveTo(fullName);
    OB.ui.toast(ok ? ('Moved to ' + fullName) : ('Could not move to ' + fullName));
  }

  function init() {
    window.__OB.settings.get('folderIllusionist').then((on) => { if (on) ensureButton(); });
  }
  const api = { init };
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).folderIllusionist = api;
})();
```

- [ ] **Step 2: Wire manifest + bootstrap** — add `"features/folder-illusionist/label-tree.js"` and `"features/folder-illusionist/folder-illusionist.js"` to the js list (before bootstrap). In `core/bootstrap.js`, inside the `onNavigate` callback:
```js
window.__OB.safe = window.__OB.safe || function (n, fn) { try { return fn(); } catch (e) { console.warn('[OB]', n, e); } };
window.__OB.safe('folderIllusionist', () => window.__OB.folderIllusionist.init());
```

- [ ] **Step 3: Manual verification**
1. Reload + hard-refresh Gmail. A "📁 Move to Folder" button appears in the toolbar.
2. Select an email → click it → a folder-tree menu appears, nested labels indented with ▸.
3. Click a folder → toast "Moved to X"; the email leaves the inbox AND gains that label (check the label in the left nav). This proves the label+archive-in-one behavior.
4. With nothing selected → click → toast "Select an email first".

- [ ] **Step 4: Commit**
```bash
git add features/folder-illusionist/folder-illusionist.js manifest.json core/bootstrap.js
git commit -m "feat: Folder Illusionist move-to-folder button + tree picker

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

# PHASE 3 — Context menu + Categories

## Task 7: `buildMeetingUrl` pure module + tests (Reply with Meeting)

**Files:**
- Create: `features/context-menu/reply-with-meeting.js`
- Test: `test/reply-with-meeting.test.js`

**Interfaces:**
- Produces `__OB.replyWithMeeting.buildMeetingUrl({title?, guests?: string[], details?, dates?}) -> string` and `open(opts)` (browser-only: `window.open(url)`).

- [ ] **Step 1: Write the failing test** — `test/reply-with-meeting.test.js`
```js
const test = require('node:test');
const assert = require('node:assert');
const { buildMeetingUrl } = require('../features/context-menu/reply-with-meeting.js');

test('builds a TEMPLATE url with title', () => {
  const u = buildMeetingUrl({ title: 'Re: Budget' });
  assert.ok(u.startsWith('https://calendar.google.com/calendar/render?'));
  assert.ok(u.includes('action=TEMPLATE'));
  assert.ok(u.includes('text=Re%3A+Budget') || u.includes('text=Re:+Budget'));
});

test('appends each guest as an add= param', () => {
  const u = buildMeetingUrl({ title: 'Sync', guests: ['a@x.com', 'b@y.com'] });
  assert.ok(u.includes('add=a%40x.com'));
  assert.ok(u.includes('add=b%40y.com'));
});

test('empty options still produce a valid template url', () => {
  const u = buildMeetingUrl();
  assert.ok(u.includes('action=TEMPLATE'));
});
```

- [ ] **Step 2: Run to confirm failure** — `node --test test/reply-with-meeting.test.js` → FAIL (module not found).

- [ ] **Step 3: Implement `features/context-menu/reply-with-meeting.js`**
```js
(function () {
  'use strict';
  function buildMeetingUrl(opts) {
    const { title = '', guests = [], details = '', dates = '' } = opts || {};
    const params = new URLSearchParams();
    params.set('action', 'TEMPLATE');
    if (title) params.set('text', title);
    if (details) params.set('details', details);
    if (dates) params.set('dates', dates);
    let url = 'https://calendar.google.com/calendar/render?' + params.toString();
    for (const g of guests) if (g) url += '&add=' + encodeURIComponent(g);
    return url;
  }
  function open(opts) { if (typeof window !== 'undefined') window.open(buildMeetingUrl(opts), '_blank'); }
  const api = { buildMeetingUrl, open };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).replyWithMeeting = api;
})();
```

- [ ] **Step 4: Run to confirm pass** — `node --test test/reply-with-meeting.test.js` → PASS (3 tests).

- [ ] **Step 5: Commit**
```bash
git add features/context-menu/reply-with-meeting.js test/reply-with-meeting.test.js
git commit -m "feat: reply-with-meeting calendar URL builder + tests

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Categories module + tests + apply/render

**Files:**
- Create: `features/categories/categories.js`
- Test: `test/categories.test.js`
- Modify: `manifest.json`, `core/bootstrap.js`

**Interfaces:**
- Produces `__OB.categories`: `DEFAULT_CATEGORIES: [{name,color}]`, `colorFor(name, defs?) -> string|null` (pure), plus browser-only `applyToSelection(name)`, `renderChips()`.

- [ ] **Step 1: Write the failing test** — `test/categories.test.js`
```js
const test = require('node:test');
const assert = require('node:assert');
const cat = require('../features/categories/categories.js');

test('DEFAULT_CATEGORIES has six named colors', () => {
  assert.strictEqual(cat.DEFAULT_CATEGORIES.length, 6);
  assert.ok(cat.DEFAULT_CATEGORIES.every(c => c.name && /^#[0-9a-f]{6}$/i.test(c.color)));
});

test('colorFor is case-insensitive and returns null for unknown', () => {
  assert.strictEqual(cat.colorFor('red'), '#d50000');
  assert.strictEqual(cat.colorFor('Nope'), null);
});
```

- [ ] **Step 2: Run to confirm failure** — `node --test test/categories.test.js` → FAIL.

- [ ] **Step 3: Implement `features/categories/categories.js`**
```js
(function () {
  'use strict';
  const DEFAULT_CATEGORIES = [
    { name: 'Red', color: '#d50000' },
    { name: 'Orange', color: '#e65100' },
    { name: 'Yellow', color: '#f9a825' },
    { name: 'Green', color: '#2e7d32' },
    { name: 'Blue', color: '#1565c0' },
    { name: 'Purple', color: '#6a1b9a' }
  ];
  function colorFor(name, defs) {
    const list = defs || DEFAULT_CATEGORIES;
    const hit = list.find((c) => c.name.toLowerCase() === String(name).toLowerCase());
    return hit ? hit.color : null;
  }
  // Browser-only: apply a category to the selected rows by applying the Gmail
  // label "Categories/<name>" (persists + shows on mobile). Uses the adapter.
  function applyToSelection(name) {
    const OB = window.__OB;
    const rows = OB.gmail.getSelectedRowEls();
    if (!rows.length) { OB.ui.toast('Select an email first'); return; }
    const ok = OB.gmail.applyLabel(rows, 'Categories/' + name);
    OB.ui.toast(ok ? ('Categorized: ' + name) : 'Could not categorize');
  }
  const api = { DEFAULT_CATEGORIES, colorFor, applyToSelection };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).categories = api;
})();
```
(Chip rendering on rows — drawing a colored swatch next to categorized emails — is a polish add. If time allows, iterate a `renderChips()` that reads each row's applied `Categories/*` label from the DOM and injects a swatch; otherwise defer. Do NOT block Phase 3 on chips.)

- [ ] **Step 4: Run to confirm pass** — `node --test test/categories.test.js` → PASS.

- [ ] **Step 5: Wire manifest** — add `"features/context-menu/reply-with-meeting.js"` and `"features/categories/categories.js"` to the js list (before bootstrap). No bootstrap init needed yet (invoked from the context menu in Task 9).

- [ ] **Step 6: Commit**
```bash
git add features/categories/categories.js test/categories.test.js manifest.json
git commit -m "feat: color categories (labels) + tests

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Enhanced right-click context menu

**Files:**
- Create: `features/context-menu/context-menu.js`
- Modify: `manifest.json`, `core/bootstrap.js`

**Interfaces:**
- Consumes: `__OB.gmail` (closestRow/markUnread/markRead/getRowInfo/getSelectedRowEls/openCreateFilterForRow/getOpenThreadRecipients/archive/del/snooze), `__OB.categories.applyToSelection/DEFAULT_CATEGORIES`, `__OB.replyWithMeeting.open`, `__OB.folderIllusionist.openPickerAt`, `__OB.ui.buildMenu`.
- Produces `__OB.contextMenu.init()`.

- [ ] **Step 1: Implement `features/context-menu/context-menu.js`**
```js
(function () {
  'use strict';
  function rowFromEvent(e) {
    return window.__OB.gmail.closestRow(e.target);
  }

  function onContextMenu(e) {
    const OB = window.__OB;
    const row = rowFromEvent(e);
    if (!row) return; // not on a message row -> let Gmail/browser handle it
    e.preventDefault();
    // ensure the row is selected so actions target it
    const info = OB.gmail.getRowInfo(row);
    const items = [
      { label: 'Mark as unread', onClick: () => OB.gmail.markUnread([row]) },
      { label: 'Mark as read', onClick: () => OB.gmail.markRead([row]) },
      { label: 'Categorize…', onClick: () => openCategorySubmenu(e.clientX, e.clientY) },
      { label: 'Create rule…', onClick: () => OB.gmail.openCreateFilterForRow(row) },
      { label: 'Reply with meeting', onClick: () => OB.replyWithMeeting.open({
          title: 'Re: ' + (info?.subject || ''),
          guests: info?.from ? [info.from] : OB.gmail.getOpenThreadRecipients()
        }) },
      { label: 'Move to folder…', onClick: () => OB.folderIllusionist.openPickerAt(e.clientX, e.clientY) },
      { label: 'Archive', onClick: () => OB.gmail.archive() },
      { label: 'Delete', onClick: () => OB.gmail.del() },
      { label: 'Snooze…', onClick: () => OB.gmail.snooze() }
    ];
    OB.ui.buildMenu(items, e.clientX, e.clientY);
  }

  function openCategorySubmenu(x, y) {
    const OB = window.__OB;
    const items = OB.categories.DEFAULT_CATEGORIES.map((c) => ({
      label: c.name, swatch: c.color, onClick: () => OB.categories.applyToSelection(c.name)
    }));
    OB.ui.buildMenu(items, x + 8, y + 8);
  }

  function init() {
    if (document.__obCtxBound) return; document.__obCtxBound = true;
    window.__OB.settings.get('contextMenu').then((on) => {
      if (on) document.addEventListener('contextmenu', onContextMenu, true);
    });
  }
  const api = { init };
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).contextMenu = api;
})();
```
The "Move to folder…" item above calls `__OB.folderIllusionist.openPickerAt(x, y)`, which does not exist yet — Step 2 creates it. (Task 6 only exposed `init()`.)

- [ ] **Step 2: Refactor Folder Illusionist to expose the picker** — in `features/folder-illusionist/folder-illusionist.js`, generalize `openPicker(anchor)` into `openPickerAt(x, y)` that builds the same tree menu but positions it at `(x, y)` instead of under the button (`OB.ui.buildMenu(items, x, y)`); keep the button's click handler working by having it call `openPickerAt(r.left, r.bottom + 4)` using the button's rect. Add `openPickerAt` to that file's `api` object.

- [ ] **Step 3: Wire manifest + bootstrap** — add `"features/context-menu/context-menu.js"` to the js list (before bootstrap). In `core/bootstrap.js` onNavigate:
```js
window.__OB.safe('contextMenu', () => window.__OB.contextMenu.init());
```

- [ ] **Step 4: Manual verification**
1. Reload + hard-refresh Gmail. Right-click a message row → our styled menu appears (not the browser's).
2. "Mark as unread" → the row bolds (unread). "Mark as read" → un-bolds.
3. "Categorize…" → color submenu → pick one → toast; confirm a `Categories/<name>` label is applied.
4. "Create rule…" → Gmail's native filter builder opens with the sender prefilled.
5. "Reply with meeting" → a Calendar event-compose tab opens with the sender as a guest (best-effort) and `Re: <subject>` as the title.
6. "Move to folder…" → the folder tree appears at the cursor; picking one moves+archives.
7. Right-click somewhere that is NOT a message row → the normal browser menu still appears.

- [ ] **Step 5: Commit**
```bash
git add features/context-menu/context-menu.js features/folder-illusionist/folder-illusionist.js manifest.json core/bootstrap.js
git commit -m "feat: Outlook-style right-click context menu

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

# PHASE 4 — Quick views + polish

## Task 10: Quick views, density, confirm-before-delete

**Files:**
- Create: `features/quick-views/quick-views.js`
- Modify: `manifest.json`, `core/bootstrap.js`

**Interfaces:**
- Consumes: `__OB.gmail.getToolbar/SELECTORS`, `__OB.settings`, `__OB.ui.toast`.
- Produces `__OB.quickViews.init()`.

- [ ] **Step 1: Implement `features/quick-views/quick-views.js`**
```js
(function () {
  'use strict';
  const BAR_ID = 'ob-quick-views';
  const VIEWS = [
    { label: 'Unread', q: 'is:unread' },
    { label: 'Flagged', q: 'is:starred' },
    { label: 'Today', q: 'newer_than:1d' },
    { label: 'Attachments', q: 'has:attachment' }
  ];
  function ensureBar() {
    const OB = window.__OB;
    const toolbar = OB.gmail.getToolbar();
    if (!toolbar || document.getElementById(BAR_ID)) return;
    const bar = document.createElement('div');
    bar.id = BAR_ID;
    bar.style.cssText = 'display:inline-flex;gap:6px;margin-left:8px;';
    for (const v of VIEWS) {
      const chip = document.createElement('button');
      chip.textContent = v.label;
      chip.style.cssText = 'border:1px solid rgba(0,0,0,.2);border-radius:12px;padding:2px 10px;' +
        'background:transparent;cursor:pointer;font:12px system-ui;';
      chip.addEventListener('click', () => runSearch(v.q));
      bar.appendChild(chip);
    }
    toolbar.appendChild(bar);
  }
  function runSearch(query) {
    // Navigate Gmail's hash to a search — the most robust way to trigger a saved view.
    location.hash = '#search/' + encodeURIComponent(query);
  }
  function initConfirmDelete() {
    window.__OB.settings.get('confirmBeforeDelete').then((on) => {
      if (!on) return;
      document.addEventListener('click', (e) => {
        const t = e.target.closest('[aria-label="Delete forever"]');
        if (t && !confirm('Permanently delete? This cannot be undone.')) {
          e.preventDefault(); e.stopPropagation();
        }
      }, true);
    });
  }
  function initDensity() {
    window.__OB.settings.get('compactDensity').then((on) => {
      document.documentElement.toggleAttribute('data-ob-compact', !!on);
    });
  }
  function init() {
    window.__OB.settings.get('quickViews').then((on) => { if (on) ensureBar(); });
    initDensity();
  }
  const api = { init, initConfirmDelete };
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).quickViews = api;
})();
```
(Optional density CSS: add a `html[data-ob-compact] tr[role="row"]{line-height:1.1}` rule to a small `features/quick-views/quick-views.css` and register it in the `document_start` css entry. Keep it light; defer if it fights Gmail's own density setting.)

- [ ] **Step 2: Wire manifest + bootstrap** — add the js file; in bootstrap onNavigate: `window.__OB.safe('quickViews', () => window.__OB.quickViews.init());` and once at load: `window.__OB.quickViews.initConfirmDelete();`

- [ ] **Step 3: Manual verification**
1. Reload + hard-refresh Gmail. Chips (Unread/Flagged/Today/Attachments) appear near the toolbar.
2. Click "Unread" → the list filters to unread (URL hash becomes a search).
3. With confirm-before-delete on, permanently deleting from Trash prompts a confirm dialog; Cancel aborts.
4. Toggle compact density in options → row height tightens (if the density CSS was added).

- [ ] **Step 4: Commit**
```bash
git add features/quick-views/quick-views.js manifest.json core/bootstrap.js
git commit -m "feat: quick-view chips, density toggle, confirm-before-delete

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final: README + distribution notes

- [ ] **Step 1: Write `README.md`** with: what it does, how coworkers install it (Load unpacked), how to update, the per-feature options, and a "if a feature stops working, check the console for `[OB] self-test` warnings — Gmail probably changed its HTML; ping Matt" note. Add a maintainer section: enterprise force-install path (`ExtensionInstallForcelist` + self-hosted `.crx`) for later org-wide rollout.

- [ ] **Step 2: Full test sweep** — `node --test` → all suites pass (settings, label-tree, reply-with-meeting, categories).

- [ ] **Step 3: Commit + open PR / merge the feature branch** per your workflow.
```bash
git add README.md
git commit -m "docs: README install + maintenance notes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Notes on known limits (carry into execution — do not treat as bugs)

- **Guest prefill in Reply-with-Meeting** relies on the undocumented `add=` param. If it stops adding guests, the event still opens with title/time — acceptable per spec.
- **Create Rule** intentionally opens Gmail's native filter builder (sender prefilled) rather than creating a filter silently — no-auth constraint.
- **Selectors WILL drift.** The self-test warning is the tripwire. Fixing a broken feature = update one selector in the relevant adapter's `SELECTORS`, nothing else.
- **`selectFromNativeDropdown`** and the exact message-body classes (`.ii`/`.a3s`) are the two spots most likely to need live tuning; they are called out at their tasks.
