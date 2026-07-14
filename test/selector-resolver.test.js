const test = require('node:test');
const assert = require('node:assert');
const resolver = require('../core/selector-resolver.js');

// Pure parts of the self-tuning selector resolver.

test('labelMatches: regex patterns, case-insensitive string equality', () => {
  assert.ok(resolver.labelMatches('Move to', [/move to/i]));
  assert.ok(resolver.labelMatches('Advanced search options', [/search options/i]));
  assert.ok(resolver.labelMatches('LABELS', ['labels']));
  assert.ok(!resolver.labelMatches('Delete forever', [/^delete$/i]));
  assert.ok(!resolver.labelMatches('', [/anything/]));
  assert.ok(!resolver.labelMatches(null, [/anything/]));
});

function fakeEl(tag, attrs, className) {
  return {
    tagName: tag,
    className: className || '',
    getAttribute(name) { return (attrs && name in attrs) ? attrs[name] : null; }
  };
}

test('deriveSelector prefers aria-label, then data-tooltip, then gh, then classes', () => {
  assert.strictEqual(
    resolver.deriveSelector(fakeEl('DIV', { 'aria-label': 'Move to' })),
    'div[aria-label="Move to"]');
  assert.strictEqual(
    resolver.deriveSelector(fakeEl('DIV', { 'data-tooltip': 'Archive' })),
    'div[data-tooltip="Archive"]');
  assert.strictEqual(
    resolver.deriveSelector(fakeEl('DIV', { gh: 'mtb' })),
    'div[gh="mtb"]');
  assert.strictEqual(
    resolver.deriveSelector(fakeEl('DIV', {}, 'J-M agd aYO jQjAxd')),
    'div.J-M.agd.aYO');
  assert.strictEqual(resolver.deriveSelector(fakeEl('DIV', {}, '')), null);
});

test('deriveSelector escapes quotes safely via JSON encoding', () => {
  const sel = resolver.deriveSelector(fakeEl('DIV', { 'aria-label': 'Say "hi"' }));
  assert.strictEqual(sel, 'div[aria-label="Say \\"hi\\""]');
});

test('resolver exposes the roles the adapter depends on', () => {
  for (const role of ['toolbar', 'moveToButton', 'labelsButton', 'searchOptions',
    'markUnread', 'markRead', 'archiveButton', 'deleteButton', 'snoozeButton',
    'moveDropdown', 'attachmentTray', 'searchInput']) {
    assert.ok(resolver.roles.includes(role), 'missing role: ' + role);
  }
});
