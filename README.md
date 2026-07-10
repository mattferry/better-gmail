# Better Gmail

**Outlook-style upgrades for Gmail and Google Calendar — for people who are stuck migrating off Outlook and don't have Gmail API access to do it "properly."**

Better Gmail is a Chrome/Edge extension (Manifest V3) that makes the Gmail and Google
Calendar web apps behave the way ex-Outlook users expect: real dark mode on email bodies, a
**Move to Folder** button that actually moves mail out of the inbox, attachments shown at
the **top** of the message, Outlook-style reply headers, an Outlook-style right-click menu,
a format painter, compose-window table tools, and more — with an on/off switch for every
feature on the options page.

It merges the original Better Gmail features with a pack of standalone extensions built and
battle-tested by colleagues during the same Outlook→Gmail migration — see
[Credits](#credits).

## Why it works the way it does (read this first)

The "correct" way to build a lot of this would be with the **Gmail API** — OAuth, a Google
Cloud project, `labels.modify`, `settings.filters`, the works.

**This extension is deliberately built for the situation where you do *not* have that.**

In a lot of locked-down workplaces you cannot:

- register an OAuth app or a Google Cloud project,
- get admin/API access to the Workspace,
- or install anything that phones home to a server.

So Better Gmail **works around the lack of API access entirely**. It is a pure
**content script**: it runs inside the Gmail/Calendar tab and drives the web UI directly —
no OAuth, no consent screen, no Cloud project, no backend, no network calls of its own. You
load the folder in developer mode and it just works.

That workaround is the whole point of the project, and it comes with one honest tradeoff:
because it rides Gmail's HTML instead of a stable API, Google can change their markup and
temporarily break a feature. Better Gmail is built to fail *safely* when that happens (it
never breaks Gmail itself) and to tell you in the console when a selector needs updating —
see [Maintenance](#maintenance).

## Features

### Reading & organizing

- **Real dark mode** — inverts email bodies (the white HTML emails Gmail leaves bright even
  in its own dark theme), the way Outlook does it. Photos and logos are un-inverted so they
  still look right. Calendar relies on Google's own native dark theme; Better Gmail's
  cleanup of any residual white surfaces there is best-effort and pending a verified
  selector (see [Maintenance](#maintenance)). *(Featureset by Yancy P.)*
- **Attachments on top** — moves a message's real attachments into a bar right below the
  subject, above the body, like Outlook — instead of buried at the bottom. Signature/logo
  images are excluded: Gmail's own attachment tray never contains most of them, and the
  Outlook edge case (signature logos attached as real files) is caught by cross-referencing
  tray items against the images rendered inline in the body. *(Rework by Narendra S. of
  Mehul Siddhpura's original.)*
- **Folder Illusionist** — a **Move to Folder** button that shows your labels as a folder
  tree and, on click, applies the label *and* archives the mail in one action — mimicking
  Outlook's "move" instead of Gmail's "label but leave it in the inbox."
- **Outlook-style right-click menu** — Mark read/unread, Categorize (color categories),
  Create rule (opens Gmail's native filter builder with the sender prefilled), Reply with
  meeting (opens a Calendar invite), Move to folder, Archive/Delete/Snooze.
- **Color categories** — Outlook-style colored categories, backed by real Gmail labels so
  they persist and show up on mobile.
- **Quick views** — one-click chips for Unread / Flagged / Today / Attachments, a compact
  density toggle, and a confirm-before-permanent-delete guard.

### Composing & replying

- **Outlook-style reply headers** — when you hit Reply, replaces Gmail's one-line
  "On … wrote:" attribution with the classic Outlook block: `-----Original Message-----`
  plus From / Sent / To / Subject. Automatic on reply; an optional toolbar button converts
  a reply manually. *(By Mehul Siddhpura.)*
- **Auto-capitalize** — fixes capitalization live while you type a draft: sentence starts,
  standalone "i", common contractions (`dont` → `don't`), and proper nouns / acronyms /
  multi-word phrases from offline dictionaries (products, places, names, enterprise terms).
  Add your own words via right-click → *Add to Auto Capitalizer dictionary* or
  **Ctrl+Shift+A** in a draft. Never touches signatures, quotes, or code blocks.
  *(By Mehul Siddhpura.)*
- **Format painter** — copy the formatting of selected text and paste it onto another
  selection, Outlook style: right-click → *Copy format* / *Paste format*, or **Alt+C** /
  **Alt+V**. *(By Mehul Siddhpura.)*
- **Table tools** — Gmail compose has no real table support; this adds it: a grid picker to
  insert a table, add/delete rows and columns, cell & gridline colors from the native
  Google palette, column/row sizing, undo/redo, and a smart paste that spreads
  tab-separated (spreadsheet) data across cells. *(By Mehul Siddhpura.)*

Every feature has an on/off switch on the options page, applied live — no reload needed.

## Install (developer mode)

1. Download / clone this repo.
2. Go to `chrome://extensions` (or `edge://extensions`).
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select this folder.
5. Open Gmail — you're done. Configure features via the extension's **Options** page.

To update: `git pull`, then hit the ↻ reload icon on the Better Gmail card in
`chrome://extensions` and refresh your Gmail tab.

## Development

No build step, no dependencies. Plain JavaScript.

```bash
node --test              # run the unit tests (pure logic: settings, label tree, capitalizer, attachment matching)
node --check core/*.js   # syntax-check
```

Architecture in one paragraph: everything lives on the `window.__OB` namespace. `core/`
holds the settings store, shared UI (toasts/menus), the SPA router, and the DOM adapters;
each feature is a folder under `features/` exposing an idempotent, reversible `init()`
that `core/bootstrap.js` re-runs on navigation and on settings changes (that's what makes
the options toggles live). `core/background.js` is the only non-content-script piece — a
service worker that owns the browser context-menu items and the Alt+C/Alt+V commands and
forwards them into the tab.

## Maintenance

Because Better Gmail works around the missing API by driving Gmail's DOM, a Gmail HTML change
can break a feature. When that happens:

- Open Gmail, open DevTools → Console, filter for `[OB]`.
- A `[OB] self-test: selectors not found …` warning tells you exactly which selector broke.
- Fix is almost always a one-line update in the relevant adapter's `SELECTORS` map
  (`core/gmail-adapter.js` / `core/calendar-adapter.js`) — features never hardcode selectors
  anywhere else.

**Rolling it out to a team:** you can force-install this for a whole org via Chrome
enterprise policy (`ExtensionInstallForcelist` pointing at a self-hosted `.crx` or a private
Web Store listing) — no per-user setup, and still no Gmail API access required.

## Credits

The composing/reply feature pack was born as standalone extensions written by colleagues
during the same Outlook→Gmail migration, and merged into Better Gmail with their features
intact:

- **Mehul S.** — authored the original standalone extensions this pack is ported
  from: *Gmail Auto Capitalizer* (including its offline dictionaries, kept verbatim),
  *Local Gmail Format Painter*, *Gmail Table Inserter*, *Gmail Outlook Reply Header*, and
  the first version of *Gmail Attachments on Top*.
- **Narendra S.** — reworked *Gmail Attachments on Top* with the signature-image
  cross-reference heuristic and safety fallback; his version is the implementation that
  ships here.
- **Yancy P.** — came up with the full dark-mode featureset: real dark email bodies with
  photos/logos left un-inverted, plus the Calendar cleanup — the spec Better Gmail's dark
  mode implements.

The merged versions are adapted to Better Gmail's feature contract (central selector maps,
live per-feature toggles, shared toast UI) — any bugs introduced in the porting are ours,
not theirs.

## License

MIT — see [LICENSE](LICENSE).
