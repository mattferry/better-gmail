# Outlook-Bridge — Design Spec

**Date:** 2026-07-08
**Author:** Matt Ferry (mferr) + Claude
**Status:** Approved design — implementation plan to follow

## Problem

Matt's workplace is migrating from Outlook to Gmail, and the Gmail/Google Calendar
web experience frustrates Outlook-trained users. A Chrome extension (developer mode is
approved by IT — Matt *is* IT) will bridge the biggest UX gaps so coworkers feel at home.

## Locked decisions (from brainstorming)

| Decision | Choice | Why |
|---|---|---|
| Audience | Matt + a few coworkers now; scalable to org-wide later | Loaded unpacked; Matt (IT) can force-install via Chrome enterprise policy later without changing architecture. |
| Manifest | MV3, content-script only | No background network, no OAuth, no remote code. |
| Action engine | Pure content-script (no auth) | Zero consent friction, works the instant it loads. Cost: rides on Gmail's DOM, so selector resilience is the core engineering effort. |
| Dark mode style | Invert (like Outlook) | Bulletproof coverage; matches coworkers' existing Outlook muscle memory. Smart re-color deferred as a possible later toggle. |
| Tooling | Plain modern JS, no build step | Most inspectable (the shipped folder *is* the readable source — matters for an email-touching tool + IT review); fastest hot-reload. TypeScript+esbuild is a later graduation if it earns it. |

## Grounded technical facts (verified 2026-07-08)

- **Gmail "Move to"** is a single native action that applies a label **and** removes the
  thread from the Inbox (true archive). The Folder Illusionist leverages this rather than
  reimplementing archive logic. (support.google.com/mail/answer/2473038)
- **Google Calendar now ships a real native dark theme** (fully rolled out to Workspace by
  Apr 2025). The extension's Calendar job is therefore small: enforce the native dark theme
  and invert only leftover white surfaces (event editor, popups) — not rebuild it.
  Matt can alternatively flip this org-wide as IT. (support.google.com/calendar/answer/15240542)
- **"Reply with Meeting"** opens `calendar.google.com/calendar/render?action=TEMPLATE` with
  title/time/notes prefilled reliably. **Guest prefill is best-effort** via the undocumented
  `add=email` param — usually works, not guaranteed. This limit is accepted for v1.
- **"Create Rule"** maps to Gmail's native "Filter messages like these," which auto-prefills
  the sender. The extension invokes that native flow. (support.google.com/mail/answer/6579)

## Architecture

MV3 extension, content scripts injected into `mail.google.com` and `calendar.google.com`.
Permissions kept minimal: those two host permissions + `storage`. No external hosts, no
background network requests — makes IT review trivial and keeps the tool obviously benign.

### Module structure

```
outlook-bridge/
  manifest.json
  core/
    gmail-adapter.js     ← ALL Gmail DOM selectors live here (the one fragile place)
    calendar-adapter.js  ← Calendar DOM/theme access
    settings.js          ← chrome.storage.sync wrapper + defaults
    ui.js                ← toasts, popovers, shared styled components
    self-test.js         ← on load, verifies each selector resolves; logs early warning
    router.js            ← SPA navigation handling (MutationObserver + history hooks)
  features/
    dark-mode/
    folder-illusionist/
    context-menu/
    categories/
    quick-views/
  options/
    options.html / options.js / options.css
  assets/                ← icons
```

**Content scripts can't be ES modules directly.** v1 uses ordered plain-JS files sharing a
single global namespace object (`window.__OB`), listed in `manifest.json` in dependency order
(core before features). No bundler.

### The core risk & mitigation (the whole ballgame for a content-script approach)

Gmail's HTML is obfuscated and changes without notice. Mitigations, all mandatory:

1. **Single source of DOM truth.** Every Gmail/Calendar selector lives in the adapter files.
   Features never query the DOM directly — they call adapter methods. When Gmail changes,
   there is exactly one place to fix.
2. **Feature-detection + graceful degradation.** Each feature's init is wrapped in try/catch;
   on failure it disables itself silently and **never breaks Gmail**.
3. **Self-test on load.** `self-test.js` checks each critical selector resolves and
   `console.warn`s (namespaced) which ones broke — so Matt learns Gmail changed *before*
   coworkers file tickets.
4. **Per-feature kill switches** in the options page.
5. **SPA-aware.** Gmail/Calendar are single-page apps; `router.js` re-runs feature hooks on
   view changes via MutationObserver + history/hashchange listeners.

## Feature designs

### 1. Dark mode (invert) — Phase 1
- Inject CSS at `document_start` (avoids white flash).
- Email body: `filter: invert(1) hue-rotate(180deg)` on the body container/iframe; a
  counter-filter (`invert(1) hue-rotate(180deg)`) on `img`, attachments, and known-media
  elements so photos/logos render normally.
- Gmail chrome: prefer Gmail's native dark theme where present; invert residual white areas.
- Calendar: enforce native dark theme; invert only leftover white panels (event editor, popups).
- Options: on / off / follow-system; per-host toggle (Gmail vs Calendar).

### 2. Folder Illusionist — Phase 2
- Custom "Move to Folder" button injected into the Gmail toolbar (adapter-located anchor).
- On click → folder-tree popover built by reading the user's label list from the left nav.
  Nested labels (`Clients/Acme`) render as a real expandable tree; Outlook-folder styling.
- On pick → trigger Gmail's native **Move to** action (label + archive, one action).
- "New folder…" entry at the bottom (drives Gmail's native create-label flow).
- Works on an open thread and on multi-selected rows in the list.

### 3. Enhanced right-click context menu — Phase 3
- `contextmenu` listener on message rows (adapter-located); `preventDefault`, render a custom
  styled Outlook-like menu positioned at the cursor. Dismiss on outside-click / Esc.
- Items:
  - **Mark Read / Unread**
  - **Categorize** → color submenu (see Categories)
  - **Create Rule** → invokes native "Filter messages like these" (sender prefilled)
  - **Reply with Meeting** → opens Calendar TEMPLATE URL prefilled from the thread's
    participants (guests best-effort via `add=`), title = `Re: <subject>`
  - **Move to Folder** → reuses the Folder Illusionist picker
  - **Archive / Delete / Snooze**
- Falls back to Gmail's own behavior if the row can't be identified.

### 4. Categories (Outlook color categories) — Phase 3
- Backed by colored Gmail labels under a `Categories/` parent, applied via the native label
  mechanism → they persist server-side and show on mobile/other clients.
- Colored swatch chips rendered on message rows to *look* like Outlook categories.
- Default category set + colors seeded on first run; editable in options.

### 5. Quick views / minor niceties — Phase 4
- **View chips** above the message list, each a saved Gmail search: Unread, Flagged (Starred),
  Today, By-sender grouping. (v1-lite)
- **Compact density** toggle. (v1-lite)
- **Confirm before permanent delete.** (v1-lite)
- **Sender column** emphasis. (later)
- Anything heavier is explicitly deferred to keep scope sane.

## Cross-cutting concerns

- **Settings:** `chrome.storage.sync` (roams across a coworker's Chrome profiles); typed
  defaults in `core/settings.js`; options page with per-feature toggles + kill switches.
- **Never break Gmail:** all feature init guarded; degrade silently + namespaced logging.
- **No external network / minimal permissions:** host permissions for the two Google hosts +
  `storage` only.
- **Testing:** per-feature manual test checklist for v1 (DOM-coupled code resists cheap unit
  tests); a Playwright smoke test is a later add, not a v1 blocker.
- **Distribution:** zipped unpacked folder or a GitHub repo coworkers load via
  `chrome://extensions` → Load unpacked. Later: self-hosted `.crx` + enterprise
  `ExtensionInstallForcelist` policy for org-wide push.

## Build phasing

1. **Skeleton + dark mode** — highest value, lowest DOM risk. Establishes core/, adapter,
   self-test, options shell, manifest.
2. **Folder Illusionist.**
3. **Context menu + categories.**
4. **Quick views + options polish.**

## Out of scope (v1)

- OAuth / Gmail API integration (explicitly rejected in favor of content-script).
- Smart per-element dark re-color (invert only for v1).
- Silent programmatic filter creation (native dialog only).
- Chrome Web Store publishing (unpacked distribution for now).
- Automated end-to-end test suite (manual checklist for v1).
