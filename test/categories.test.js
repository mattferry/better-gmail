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
