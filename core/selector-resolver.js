(function () {
  'use strict';

  // Self-tuning selector resolver (2026-07-14). Gmail ships no stable API for a
  // content-script extension, so hardcoded class/aria selectors rot when Gmail
  // changes markup. Instead of relying on a human re-tuning selectors against
  // each Gmail build, every fragile lookup goes through three tiers:
  //
  //   1. STATIC  — the known-good candidate selectors (fast path).
  //   2. LEARNED — a selector this extension derived from a previous successful
  //                probe, cached in chrome.storage.local (survives restarts).
  //   3. PROBE   — a semantic finder that locates the element by MEANING
  //                (aria-label/data-tooltip text patterns, role + structure)
  //                rather than exact markup. On success the live node is turned
  //                back into a selector and cached for tier 2.
  //
  // core/self-test.js reports which tier satisfied each role, so selector drift
  // is visible in the console instead of silently breaking features.

  const STORAGE_KEY = 'obLearnedSelectors';

  function qa(sel, root) {
    try { return Array.from((root || document).querySelectorAll(sel)); } catch (e) { return []; }
  }

  function isVisible(el) {
    return !!el && el.offsetWidth > 0 && el.offsetHeight > 0;
  }

  // --- pure helpers (unit-tested in test/selector-resolver.test.js) ---

  // Does an element's accessible label match any of the given patterns?
  function labelMatches(value, patterns) {
    if (!value) return false;
    return patterns.some((p) => (p instanceof RegExp ? p.test(value) : String(value).toLowerCase() === String(p).toLowerCase()));
  }

  function labelOf(el) {
    return (el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('data-tooltip'))) || '';
  }

  // Turn a live element back into a reusable selector (most stable attribute first).
  function deriveSelector(el) {
    if (!el || !el.tagName) return null;
    const tag = el.tagName.toLowerCase();
    const aria = el.getAttribute('aria-label');
    if (aria) return tag + '[aria-label=' + JSON.stringify(aria) + ']';
    const tip = el.getAttribute('data-tooltip');
    if (tip) return tag + '[data-tooltip=' + JSON.stringify(tip) + ']';
    const gh = el.getAttribute('gh');
    if (gh) return tag + '[gh=' + JSON.stringify(gh) + ']';
    const cls = el.className && typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 3) : [];
    return cls.length ? tag + '.' + cls.join('.') : null;
  }

  // --- probe building blocks (DOM) ---

  // Find a control by its accessible-label meaning. Scans buttons and Gmail's
  // div-buttons; prefers a visible match so hidden template copies don't win.
  function findByLabel(patterns, root) {
    const candidates = qa('[aria-label], [data-tooltip]', root);
    const hits = candidates.filter((el) => labelMatches(labelOf(el), patterns));
    return hits.find(isVisible) || hits[0] || null;
  }

  // Smallest visible container holding every visible [role="menuitem"] — how we
  // find an open native dropdown without knowing Gmail's container classes.
  function findOpenMenuContainer(root) {
    const items = qa('[role="menuitem"], [role="option"]', root).filter(isVisible);
    if (!items.length) return null;
    let c = items[0].parentElement;
    while (c && c !== document.body && !items.every((m) => c.contains(m))) c = c.parentElement;
    return c && c !== document.body ? c : null;
  }

  // Smallest ancestor of the first download link containing all download links —
  // a semantic stand-in for Gmail's attachment tray.
  function findAttachmentTray(root) {
    const dls = qa('a[download]', root);
    if (!dls.length) return null;
    let c = dls[0].parentElement;
    while (c && c !== root && !dls.every((d) => c.contains(d))) c = c.parentElement;
    return c === root ? dls[0].parentElement : c;
  }

  // --- role registry ---
  // pickVisible: prefer a visible match among static/learned hits.
  // verify: sanity-check a learned-selector hit before trusting the cache.

  const ROLES = {
    toolbar: {
      static: ['div[gh="mtb"]'],
      probe(root) {
        const anchor = findByLabel([/^archive$/i, /^refresh$/i, /^report spam$/i], root);
        return anchor ? anchor.closest('[gh], [role="toolbar"]') : null;
      }
    },
    searchInput: {
      static: ['input[aria-label="Search mail"]', 'input[name="q"]'],
      probe(root) {
        const el = findByLabel([/search mail/i], root);
        return el && el.tagName === 'INPUT' ? el : (el ? el.querySelector('input') : null);
      }
    },
    searchOptions: {
      static: ['button[aria-label="Advanced search options"]', 'button[aria-label="Show search options"]'],
      probe(root) { return findByLabel([/search options/i], root); },
      verify(el) { return labelMatches(labelOf(el), [/search options/i]); }
    },
    moveToButton: {
      static: ['div[aria-label="Move to"], div[data-tooltip="Move to"]'],
      pickVisible: true,
      probe(root) { return findByLabel([/^move to$/i, /move to/i], root); },
      verify(el) { return labelMatches(labelOf(el), [/move to/i]); }
    },
    labelsButton: {
      static: ['div[aria-label="Labels"], div[data-tooltip="Labels"]'],
      pickVisible: true,
      probe(root) { return findByLabel([/^labels?$/i, /label as/i], root); },
      verify(el) { return labelMatches(labelOf(el), [/^labels?$/i, /label as/i]); }
    },
    markUnread: {
      static: ['div[aria-label="Mark as unread"], div[data-tooltip="Mark as unread"]'],
      pickVisible: true,
      probe(root) { return findByLabel([/mark as unread/i], root); },
      verify(el) { return labelMatches(labelOf(el), [/mark as unread/i]); }
    },
    markRead: {
      static: ['div[aria-label="Mark as read"], div[data-tooltip="Mark as read"]'],
      pickVisible: true,
      probe(root) { return findByLabel([/mark as read/i], root); },
      verify(el) { return labelMatches(labelOf(el), [/mark as read/i]); }
    },
    archiveButton: {
      static: ['div[aria-label="Archive"], div[data-tooltip="Archive"]'],
      pickVisible: true,
      probe(root) { return findByLabel([/^archive$/i], root); },
      verify(el) { return labelMatches(labelOf(el), [/^archive$/i]); }
    },
    deleteButton: {
      static: ['div[aria-label="Delete"], div[data-tooltip="Delete"]'],
      pickVisible: true,
      probe(root) { return findByLabel([/^delete$/i], root); },
      verify(el) { return labelMatches(labelOf(el), [/^delete$/i]); }
    },
    snoozeButton: {
      static: ['div[aria-label="Snooze"], div[data-tooltip="Snooze"]'],
      pickVisible: true,
      probe(root) { return findByLabel([/^snooze/i], root); },
      verify(el) { return labelMatches(labelOf(el), [/^snooze/i]); }
    },
    // Native Move-to / Labels dropdown, once opened. `.J-M` is the current
    // container class (live-verified 2026-07-14, several exist — only one
    // visible); the probe finds any visible menu container by its menuitems.
    moveDropdown: {
      static: ['div.J-M'],
      pickVisible: true,
      requireVisible: true, // an invisible dropdown container is useless
      probe(root) { return findOpenMenuContainer(root); }
    },
    attachmentTray: {
      static: ['.aQH'],
      probe(root) { return findAttachmentTray(root || document); }
    }
  };

  // --- learned-selector cache ---

  const learned = {};   // role -> selector (in-memory; hydrated from storage.local)
  let saveTimer = null;

  function hydrate() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      if (chrome.runtime && chrome.runtime.lastError) return;
      const saved = (result && result[STORAGE_KEY]) || {};
      Object.keys(saved).forEach((role) => {
        if (!(role in learned) && saved[role] && saved[role].selector) learned[role] = saved[role].selector;
      });
    });
  }

  function persist() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const out = {};
      Object.keys(learned).forEach((role) => { out[role] = { selector: learned[role], learnedAt: Date.now() }; });
      chrome.storage.local.set({ [STORAGE_KEY]: out }, () => { void (chrome.runtime && chrome.runtime.lastError); });
    }, 500);
  }

  function learn(role, el) {
    const sel = deriveSelector(el);
    if (sel && learned[role] !== sel) {
      learned[role] = sel;
      console.log('[OB] resolver: learned selector for "' + role + '":', sel);
      persist();
    }
  }

  // --- resolution ---

  const lastTier = {};  // role -> 'static' | 'learned' | 'probe' | 'miss' (for self-test)

  function pick(els, def) {
    if (!els.length) return null;
    if (def.requireVisible) return els.find(isVisible) || null;
    if (def.pickVisible) return els.find(isVisible) || els[0];
    return els[0];
  }

  function resolve(role, root) {
    const def = ROLES[role];
    if (!def) return null;
    for (const sel of def.static) {
      const el = pick(qa(sel, root), def);
      if (el) { lastTier[role] = 'static'; return el; }
    }
    if (learned[role]) {
      const el = pick(qa(learned[role], root), def);
      if (el && (!def.verify || def.verify(el))) { lastTier[role] = 'learned'; return el; }
    }
    const el = def.probe ? def.probe(root || document) : null;
    if (el) {
      lastTier[role] = 'probe';
      learn(role, el);
      return el;
    }
    lastTier[role] = 'miss';
    return null;
  }

  // Diagnostic snapshot for self-test: try every role once, report the tier.
  function report(root) {
    return Object.keys(ROLES).map((role) => {
      const el = resolve(role, root);
      return { role, tier: lastTier[role], ok: !!el };
    });
  }

  hydrate();

  const api = { resolve, report, roles: Object.keys(ROLES), labelMatches, deriveSelector, isVisible, findOpenMenuContainer };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).resolver = api;
})();
