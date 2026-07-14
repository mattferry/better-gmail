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
  // returned, let alone learned. `accept` lets callers filter INSIDE the scan,
  // so a visible lookalike earlier in document order can't shadow the real
  // control into a miss (tribunal finding).
  function findByLabel(patterns, root, accept) {
    const candidates = qa('[aria-label], [data-tooltip]', root);
    return candidates.find((el) => isVisible(el) && labelMatches(labelOf(el), patterns) && (!accept || accept(el))) || null;
  }

  // Gmail's toolbar action buttons live in the list toolbar; the same labels
  // also appear on per-row hover icons. Containment in the toolbar is what
  // separates the real button from a lookalike.
  function inToolbar(el) {
    return !!(el && el.closest && el.closest('[gh="mtb"], [role="toolbar"]'));
  }

  // Find an open native dropdown without knowing Gmail's container classes:
  // the first FLOATING (absolute/fixed) ancestor of the first visible menuitem.
  // Deliberately NOT "common ancestor of all visible menuitems" — with two
  // menus open at once that walked up to a shared overlay containing both, and
  // the dropdown driver could then click an item from the wrong menu
  // (tribunal finding). One item's floating ancestor is always one coherent menu.
  function findOpenMenuContainer(root) {
    const scope = root || document;
    const item = qa('[role="menuitem"], [role="option"]', scope).find(isVisible);
    if (!item) return null;
    const bound = scope === document ? document.body : scope;
    let c = item.parentElement;
    while (c && c !== bound && c !== document.body) {
      const pos = getComputedStyle(c).position;
      if (pos === 'absolute' || pos === 'fixed') return c;
      c = c.parentElement;
    }
    return null;
  }

  // Semantic stand-in for Gmail's attachment tray (static `.aQH` first — this
  // probe covers drift). Current Gmail renders attachment cards with
  // "Download attachment <name>" BUTTONS and no a[download] anchors
  // (live-verified 2026-07-14): climb from a download button to the wrapper
  // whose parent contains the rendered message body, then take the wrapper's
  // child that contains every download button — that child IS the tray
  // (live-verified to land exactly on .aQH). Controls inside the body itself
  // (inline-image hover overlays) are excluded so an inline-only message can
  // never produce a "tray" made of body content.
  function findAttachmentTray(root) {
    const scope = root || document;
    if (!scope.querySelectorAll) return null;
    const body = scope.querySelector('.a3s.aiL, .a3s');
    // The climb below keys off "parent still contains the body" — without a body
    // it has no stop condition and would run to the top, returning some large
    // message-chrome wrapper (which teardown could then re-home cards into, and
    // learn() would cache). No body anchor -> no probe (QA finding).
    if (!body) return null;
    const btns = qa('a[download], [aria-label]', scope).filter((el) =>
      (el.hasAttribute('download') || /^download attachment/i.test(el.getAttribute('aria-label') || '')) &&
      !body.contains(el) &&
      !el.closest('.ob-attachments-bar')); // never treat OUR OWN relocated bar as the tray (QA finding)
    if (!btns.length) return null;
    // Climb to the highest element whose PARENT still contains the message body
    // (or hits the scope boundary): that element sits beside the body's branch —
    // the tray, or a wrapper directly holding the tray.
    let w = btns[0];
    while (w.parentElement && w.parentElement !== scope && !(body && w.parentElement.contains(body))) w = w.parentElement;
    // If a single child of w already holds ALL the download buttons (Gmail wraps
    // the cards in one .aQH), that child is the tighter tray; otherwise w itself
    // is the container of the (possibly multiple) cards. Either way never the body.
    const child = Array.from(w.children || []).find((ch) =>
      btns.every((b) => ch.contains(b)) && !(body && ch.contains(body)));
    const tray = child || w;
    if (!tray || tray === scope || tray === document.body || (body && tray.contains(body))) return null;
    return tray;
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
      probe(root) { return findByLabel([/^move to$/i], root, inToolbar); },
      verify(el) { return labelMatches(labelOf(el), [/^move to$/i]) && inToolbar(el); }
    },
    labelsButton: {
      static: ['div[aria-label="Labels"], div[data-tooltip="Labels"]'],
      pickVisible: true,
      probe(root) { return findByLabel([/^labels?$/i, /^label as$/i], root, inToolbar); },
      verify(el) { return labelMatches(labelOf(el), [/^labels?$/i, /^label as$/i]) && inToolbar(el); }
    },
    markUnread: {
      static: ['div[aria-label="Mark as unread"], div[data-tooltip="Mark as unread"]'],
      pickVisible: true,
      probe(root) { return findByLabel([/mark as unread/i], root, inToolbar); },
      verify(el) { return labelMatches(labelOf(el), [/mark as unread/i]) && inToolbar(el); }
    },
    markRead: {
      static: ['div[aria-label="Mark as read"], div[data-tooltip="Mark as read"]'],
      pickVisible: true,
      probe(root) { return findByLabel([/mark as read/i], root, inToolbar); },
      verify(el) { return labelMatches(labelOf(el), [/mark as read/i]) && inToolbar(el); }
    },
    archiveButton: {
      static: ['div[aria-label="Archive"], div[data-tooltip="Archive"]'],
      pickVisible: true,
      probe(root) { return findByLabel([/^archive$/i], root, inToolbar); },
      verify(el) { return labelMatches(labelOf(el), [/^archive$/i]) && inToolbar(el); }
    },
    deleteButton: {
      static: ['div[aria-label="Delete"], div[data-tooltip="Delete"]'],
      pickVisible: true,
      probe(root) { return findByLabel([/^delete$/i], root, inToolbar); },
      verify(el) { return labelMatches(labelOf(el), [/^delete$/i]) && inToolbar(el); }
    },
    snoozeButton: {
      // Exact — /^snooze/i would also match the left-nav "Snoozed" link.
      static: ['div[aria-label="Snooze"], div[data-tooltip="Snooze"]'],
      pickVisible: true,
      probe(root) { return findByLabel([/^snooze$/i], root, inToolbar); },
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
      pickVisible: true, // a hidden tray (collapsed message, template copy) is never the right source
      probe(root) { return findAttachmentTray(root); },
      verify(el) {
        // new Gmail: download BUTTONS; old Gmail: a[download] anchors
        if (el.querySelector('a[download], [download]')) return true;
        return Array.from(el.querySelectorAll('[aria-label]'))
          .some((b) => /^download attachment/i.test(b.getAttribute('aria-label') || ''));
      }
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
        const sel = saved[role] && saved[role].selector;
        // Drop any entry poisoned by v0.3.2 field use (our own relocated
        // attachments bar cached as the tray) — verify() would pass it, so it
        // can't self-evict; refuse to load it (QA finding).
        if (!(role in learned) && sel && !/ob-attachments-bar/.test(sel)) learned[role] = sel;
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
