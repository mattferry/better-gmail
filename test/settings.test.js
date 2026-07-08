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
