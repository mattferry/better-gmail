const test = require('node:test');
const assert = require('node:assert');
const { buildLabelTree } = require('../features/folder-illusionist/label-tree.js');

test('flat labels become root nodes', () => {
  const t = buildLabelTree(['Work', 'Personal']);
  assert.deepStrictEqual(t.map(n => n.name), ['Personal', 'Work']); // sorted
});

test('nested labels build a tree', () => {
  const t = buildLabelTree(['Clients/Acme', 'Clients/Beta', 'Work']);
  const clients = t.find(n => n.name === 'Clients');
  assert.ok(clients);
  assert.deepStrictEqual(clients.children.map(c => c.name), ['Acme', 'Beta']);
  assert.strictEqual(clients.children[0].fullName, 'Clients/Acme');
});

test('missing intermediate parents are synthesized', () => {
  const t = buildLabelTree(['A/B/C']);
  assert.strictEqual(t[0].name, 'A');
  assert.strictEqual(t[0].children[0].name, 'B');
  assert.strictEqual(t[0].children[0].children[0].fullName, 'A/B/C');
});
