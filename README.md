# Outlook-Bridge

Make Gmail + Google Calendar behave like Outlook.

A Manifest V3 Chrome extension providing feature parity with Outlook's key UX patterns.

## Development

```bash
npm test                    # Run tests
node --check core/*.js      # Check syntax
```

## Architecture

- `core/namespace.js` — Global namespace setup
- `core/settings.js` — Settings management (sync storage, defaults)
- `core/bootstrap.js` — Content script entry point
- `test/settings.test.js` — Unit tests

No build step; plain JavaScript.
