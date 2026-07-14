const test = require('node:test');
const assert = require('node:assert');
const { createCapitalizer, sentenceStartAfter } = require('../features/auto-capitalize/capitalizer-engine.js');

// fixTextNodes is the audit-fix replacement for the whole-block rewrite that
// destroyed inline formatting: each text node is rewritten in place.

test('multi-node block keeps its structure (link scenario)', () => {
  const c = createCapitalizer([]);
  const r = c.fixTextNodes(['check out ', 'our website', ' for details'], -1, -1);
  assert.ok(r.changed);
  assert.strictEqual(r.newValues[0], 'Check out ');       // sentence start fixed
  assert.strictEqual(r.newValues[1], 'our website');      // link text untouched
  assert.strictEqual(r.newValues[2], ' for details');     // tail untouched
});

test('node beginning mid-sentence is NOT treated as a sentence start', () => {
  const c = createCapitalizer([]);
  const r = c.fixTextNodes(['hello ', 'world'], -1, -1);
  assert.strictEqual(r.newValues[1], 'world');
});

test('sentence break carries across nodes', () => {
  const c = createCapitalizer([]);
  const r = c.fixTextNodes(['done. ', 'next up'], -1, -1);
  assert.strictEqual(r.newValues[1], 'Next up');
});

test('caret guard protects the word still being typed in the caret node', () => {
  const c = createCapitalizer(['Google']);
  const r = c.fixTextNodes(['hi googl'], 0, 8); // caret at end of node 0
  assert.strictEqual(r.newValues[0], 'Hi googl'); // "googl" left alone, "hi" fixed
});

test('no caret guard on non-caret nodes', () => {
  const c = createCapitalizer(['Google']);
  const r = c.fixTextNodes(['hi google', 'x'], 1, 1); // caret in node 1
  assert.strictEqual(r.newValues[0], 'Hi Google');
});

test('caretDelta reflects a contraction expansion in the caret node', () => {
  const c = createCapitalizer([]);
  const r = c.fixTextNodes(['im here'], 0, 7); // caret at end: "here" skipped, im -> I'm (+1)
  assert.strictEqual(r.newValues[0], "I'm here");
  assert.strictEqual(r.caretDelta, 1);
});

test('unchanged input reports changed=false', () => {
  const c = createCapitalizer([]);
  const r = c.fixTextNodes(['Already Fine.'], -1, -1);
  assert.strictEqual(r.changed, false);
});

test('sentenceStartAfter walks tokens like the block fixer', () => {
  assert.strictEqual(sentenceStartAfter('hello world', true), false);
  assert.strictEqual(sentenceStartAfter('hello world. ', true), true);
  assert.strictEqual(sentenceStartAfter('   ', false), false);
  assert.strictEqual(sentenceStartAfter('', true), true);
});
