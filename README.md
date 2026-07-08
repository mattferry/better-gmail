# Better Gmail

**Outlook-style upgrades for Gmail and Google Calendar — for people who are stuck migrating off Outlook and don't have Gmail API access to do it "properly."**

Better Gmail is a Chrome extension (Manifest V3) that makes the Gmail and Google Calendar
web apps behave the way ex-Outlook users expect: real dark mode on email bodies, a
**Move to Folder** button that actually moves mail out of the inbox, an Outlook-style
right-click menu, and color categories.

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

- **Real dark mode** — inverts email bodies (the white HTML emails Gmail leaves bright even
  in its own dark theme), the way Outlook does it, and cleans up Calendar's residual white
  surfaces. Photos and logos are un-inverted so they still look right.
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

Every feature has an on/off switch on the options page.

## Install (developer mode)

1. Download / clone this repo.
2. Go to `chrome://extensions`.
3. Turn on **Developer mode** (top-right).
4. Click **Load unpacked** and select this folder.
5. Open Gmail — you're done. Configure features via the extension's **Options** page.

To update: `git pull`, then hit the ↻ reload icon on the Better Gmail card in
`chrome://extensions` and refresh your Gmail tab.

## Development

No build step, no dependencies. Plain JavaScript.

```bash
node --test          # run the unit tests (pure logic: settings, label tree, etc.)
node --check core/*.js   # syntax-check
```

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

## License

MIT — see [LICENSE](LICENSE).
