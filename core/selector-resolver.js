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
  // SAFETY MODEL (hardened after QA on the first version): a role's verify()
  // gate applies to EVERY tier — static matches, learned-cache hits, and probe
  // results alike — so a lookalike (e.g. a row-hover "Delete" icon with the same
  // aria-label as the toolbar button) is rejected no matter which tier produced
  // it. Destructive button roles additionally require the element to live inside
  // the toolbar. Probes only ever return VISIBLE elements. learn() persists a
  // selector only when it passes verify() AND round-trips to the same element,
  // and a learned selector that matches only verify-failing elements is EVICTED.
  // Diagnostics (self-test's report()) run with learning disabled, so a weird
  // transient UI state can never poison the cache.
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

  // Turn a live element back into a reusable selector (most stable attribute
  // first). Class tokens are CSS-escaped so a hostile/odd class can't produce a
  // selector that throws.
  function deriveSelector(el) {
    if (!el || !el.tagName) return null;
    const tag = el.tagName.toLowerCase();
    const aria = el.getAttribute('aria-label');
    if (aria) return tag + '[aria-label=' + JSON.stringify(aria) + ']';
    const tip = el.getAttribute('data-tooltip');
    if (tip) return tag + '[data-tooltip=' + JSON.stringify(tip) + ']';
    const gh = el.getAttribute('gh');
    if (gh) return tag + '[gh=' + JSON.stringify(gh) + ']';
    const esc = (typeof CSS !== 'undefined' && CSS.escape) ? CSS.escape : (s) => s;
    const cls = el.className && typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 3).map(esc) : [];
    return cls.length ? tag + '.' + cls.join('.') : null;
  }

  // --- probe building blocks (DOM) ---

  // Find a control by its accessible-label meaning. VISIBLE matches only — a
  // hidden lookalike (row-hover action icons, template copies) must never be
  // returned, let alone learned.
  function findByLabel(patterns, root) {
    const candidates = qa('[aria-label], [data-tooltip]', root);
    return candidates.find((el) => isVisible(el) && labelMatches(labelOf(el), patterns)) || null;
  }

  // Gmail's toolbar action buttons live in the list toolbar; the same labels
  // also appear on per-row hover icons. Containment in the toolbar is what
  // separates the real button from a lookalike.
  function inToolbar(el) {
    return !!(el && el.closest && el.closest('[gh="mtb"], [role="toolbar"]'));
  }

  // Smallest visible container holding every visible [role="menuitem"] — how we
  // find an open native dropdown without knowing Gmail's container classes.
  // The climb is bounded by `root`/document.body; reaching the bound means the
  // items aren't one coherent menu, so return null rather than a giant ancestor.
  function findOpenMenuContainer(root) {
    const scope = root || document;
    const items = qa('[role="menuitem"], [role="option"]', scope).filter(isVisible);
    if (!items.length) return null;
    const bound = scope === document ? document.body : scope;
    let c = items[0].parentElement;
    while (c && c !== bound && !items.every((m) => c.contains(m))) c = c.parentElement;
    return c && c !== bound && c !== document.body ? c : null;
  }

  // Smallest ancestor (strictly inside root) of the first download link that
  // contains all of root's download links — a semantic stand-in for Gmail's
  // attachment tray. Returns null when the only common ancestor is root itself
  // ("the whole message" is never a tray) and null for a SINGLE download link:
  // with one sample the containment walk stops inside the attachment card
  // itself, and relocating a card's internals would dismember it (QA finding).
  function findAttachmentTray(root) {
    const scope = root || document;
    const dls = qa('a[download]', scope);
    if (dls.length < 2) return null;
    let c = dls[0].parentElement;
    while (c && c !== scope && !dls.every((d) => c.contains(d))) c = c.parentElement;
    return c && c !== scope && c !== document.body ? c : null;
  }

  // --- role registry ---
  // pickVisible: prefer a visible match among candidate-selector hits.
  // requireVisible: only a visible match will do.
  // verify: gate applied to EVERY tier's candidate before it is returned.

  const ROLES = {
    toolbar: {
      static: ['div[gh="mtb"]'],
      probe(root) {
        const anchor = findByLabel([/^archive$/i, /^refresh$/i, /^report spam$/i], root);
        // gh="mtb" specifically — a bare [gh] would also match e.g. the thread
        // list (gh="tl") and poison everything that injects into the toolbar.
        return anchor ? anchor.closest('[gh="mtb"], [role="toolbar"]') : null;
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
      // EXACT match only — a loose /move to/i also matches Trash/Spam's
      // "Move to Inbox" toolbar button, and learning that would turn every
      // Move-to click into a real mailbox mutation (QA finding).
      static: ['div[aria-label="Move to"], div[data-tooltip="Move to"]'],
      pickVisible: true,
      probe(root) { return findByLabel([/^move to$/i], root); },
      verify(el) { return labelMatches(labelOf(el), [/^move to$/i]) && inToolbar(el); }
    },
    labelsButton: {
      static: ['div[aria-label="Labels"], div[data-tooltip="Labels"]'],
      pickVisible: true,
      probe(root) { return findByLabel([/^labels?$/i, /^label as$/i], root); },
      verify(el) { return labelMatches(labelOf(el), [/^labels?$/i, /^label as$/i]) && inToolbar(el); }
    },
    markUnread: {
      static: ['div[aria-label="Mark as unread"], div[data-tooltip="Mark as unread"]'],
      pickVisible: true,
      probe(root) { return findByLabel([/mark as unread/i], root); },
      verify(el) { return labelMatches(labelOf(el), [/mark as unread/i]) && inToolbar(el); }
    },
    markRead: {
      static: ['div[aria-label="Mark as read"], div[data-tooltip="Mark as read"]'],
      pickVisible: true,
      probe(root) { return findByLabel([/mark as read/i], root); },
      verify(el) { return labelMatches(labelOf(el), [/mark as read/i]) && inToolbar(el); }
    },
    archiveButton: {
      static: ['div[aria-label="Archive"], div[data-tooltip="Archive"]'],
      pickVisible: true,
      probe(root) { return findByLabel([/^archive$/i], root); },
      verify(el) { return labelMatches(labelOf(el), [/^archive$/i]) && inToolbar(el); }
    },
    deleteButton: {
      static: ['div[aria-label="Delete"], div[data-tooltip="Delete"]'],
      pickVisible: true,
      probe(root) { return findByLabel([/^delete$/i], root); },
      verify(el) { return labelMatches(labelOf(el), [/^delete$/i]) && inToolbar(el); }
    },
    snoozeButton: {
      // Exact — /^snooze/i would also match the left-nav "Snoozed" link.
      static: ['div[aria-label="Snooze"], div[data-tooltip="Snooze"]'],
      pickVisible: true,
      probe(root) { return findByLabel([/^snooze$/i], root); },
      verify(el) { return labelMatches(labelOf(el), [/^snooze$/i]) && inToolbar(el); }
    },
    // Native Move-to / Labels dropdown, once opened. `.J-M` is the current
    // container class (live-verified 2026-07-14, several exist — only one
    // visible); the probe finds any visible menu container by its menuitems.
    moveDropdown: {
      static: ['div.J-M'],
      pickVisible: true,
      requireVisible: true, // an invisible dropdown container is useless
      probe(root) { return findOpenMenuContainer(root); },
      verify(el) { return isVisible(el) && !!el.querySelector('[role="menuitem"], [role="option"]'); }
    },
    attachmentTray: {
      static: ['.aQH'],
      probe(root) { return findAttachmentTray(root); },
      verify(el) { return !!el.querySelector('a[download], [download]'); }
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

  // Merge-on-write: another tab (or this tab pre-hydration) may have learned
  // roles we don't hold in memory — never clobber them with a partial snapshot.
  function persist() {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        if (chrome.runtime && chrome.runtime.lastError) return;
        const out = (result && result[STORAGE_KEY]) || {};
        Object.keys(learned).forEach((role) => {
          if (learned[role]) out[role] = { selector: learned[role], learnedAt: Date.now() };
          else delete out[role]; // evicted
        });
        chrome.storage.local.set({ [STORAGE_KEY]: out }, () => { void (chrome.runtime && chrome.runtime.lastError); });
      });
    }, 500);
  }

  function learn(role, el, def) {
    const sel = deriveSelector(el);
    if (!sel || learned[role] === sel) return;
    // Only persist a selector that (a) passes the role's own verify gate and
    // (b) round-trips: its first document match is the element we probed. A
    // non-unique selector (e.g. a label shared with row icons) is not cached.
    if (def && def.verify && !def.verify(el)) return;
    if (qa(sel, document)[0] !== el) return;
    learned[role] = sel;
    console.log('[OB] resolver: learned selector for "' + role + '":', sel);
    persist();
  }

  function evict(role) {
    if (!learned[role]) return;
    console.log('[OB] resolver: evicting poisoned learned selector for "' + role + '":', learned[role]);
    learned[role] = null;
    persist();
  }

  // --- resolution ---

  const lastTier = {};  // role -> 'static' | 'learned' | 'probe' | 'miss' (for self-test)

  // Order candidates by the role's visibility rule, then return the first that
  // passes verify. verify applies to every tier (see SAFETY MODEL above).
  function pick(els, def) {
    if (!els.length) return null;
    let ordered = els;
    if (def.requireVisible) ordered = els.filter(isVisible);
    else if (def.pickVisible) ordered = els.filter(isVisible).concat(els.filter((e) => !isVisible(e)));
    return ordered.find((el) => !def.verify || def.verify(el)) || null;
  }

  function resolve(role, root, opts) {
    const def = ROLES[role];
    if (!def) return null;
    const noLearn = !!(opts && opts.noLearn);

    for (const sel of def.static) {
      const el = pick(qa(sel, root), def);
      if (el) { lastTier[role] = 'static'; return el; }
    }

    if (learned[role]) {
      const hits = qa(learned[role], root);
      const el = pick(hits, def);
      if (el) { lastTier[role] = 'learned'; return el; }
      // The cached selector matches elements but every one fails verify: that is
      // a poisoned entry (e.g. learned from a lookalike) — evict so the probe
      // can re-learn. No matches at all just means the UI isn't open (keep it).
      if (hits.length && def.verify && !noLearn) evict(role);
    }

    const el = def.probe ? def.probe(root || document) : null;
    if (el && (!def.verify || def.verify(el))) {
      lastTier[role] = 'probe';
      if (!noLearn) learn(role, el, def);
      return el;
    }
    lastTier[role] = 'miss';
    return null;
  }

  // Diagnostic snapshot for self-test: try every role once and report the tier.
  // Runs with learning DISABLED — a diagnostic must never write the cache from
  // whatever transient UI state a navigation left behind.
  function report(root) {
    return Object.keys(ROLES).map((role) => {
      const el = resolve(role, root, { noLearn: true });
      return { role, tier: lastTier[role], ok: !!el };
    });
  }

  hydrate();

  const api = { resolve, report, roles: Object.keys(ROLES), labelMatches, deriveSelector, isVisible, findOpenMenuContainer };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).resolver = api;
})();
