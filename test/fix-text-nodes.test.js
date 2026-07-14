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

test('no caret guard on non-caret nodes (word boundary at the seam)', () => {
  const c = createCapitalizer(['Google']);
  // trailing space on node 0 -> "google" is a whole word, not a fragment
  const r = c.fixTextNodes(['hi google ', 'x'], 1, 1); // caret in node 1
  assert.strictEqual(r.newValues[0], 'Hi Google ');
});

test('caret moves with a contraction expansion before it', () => {
  const c = createCapitalizer([]);
  const r = c.fixTextNodes(['im here'], 0, 7); // caret at end: "here" skipped, im -> I'm (+1)
  assert.strictEqual(r.newValues[0], "I'm here");
  assert.strictEqual(r.caretOffset, 8); // end of "I'm here"
});

test('caret does NOT drift when the fix is after it (QA repro)', () => {
  const c = createCapitalizer([]);
  // caret after the comma (offset 6); "hello"->"Hello" is length-neutral,
  // "im"->"I'm" (+1) happens after the caret and must not move it.
  const r = c.fixTextNodes(['hello, im here'], 0, 6);
  assert.strictEqual(r.newValues[0], "Hello, I'm here");
  assert.strictEqual(r.caretOffset, 6);
});

test('word fragments straddling a node seam are never contraction-fixed (QA repro)', () => {
  const c = createCapitalizer([]);
  // "im" is the leading fragment of "important" split across nodes — the old
  // behavior produced "I'mportant".
  const r = c.fixTextNodes(['this is im', 'portant stuff '], 1, 14);
  assert.strictEqual(r.newValues[0], 'This is im');   // sentence fixed, fragment "im" untouched
  assert.strictEqual(r.newValues[1], 'portant stuff ');
});

test('leading fragment of a straddled word is not sentence-capitalized', () => {
  const c = createCapitalizer([]);
  const r = c.fixTextNodes(['goo', 'gle rocks'], -1, -1);
  assert.strictEqual(r.newValues[0], 'goo');  // fragment, not a word
  assert.strictEqual(r.newValues[1], 'gle rocks');
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
  // domain/filename dots are not sentence ends; a text-final dot is
  assert.strictEqual(sentenceStartAfter('see corp.com and', true), false);
  assert.strictEqual(sentenceStartAfter('done.', true), true);
});

// --- tribunal (Grok) findings, verified with repros before fixing ---

test('domains and filenames are not treated as sentence boundaries (tribunal repro)', () => {
  const c = createCapitalizer([]);
  assert.strictEqual(c.fixBlockText('sent to bob@corp.com today', -1), 'Sent to bob@corp.com today');
  assert.strictEqual(c.fixBlockText('see report.pdf attached', -1), 'See report.pdf attached');
  // real sentence breaks still work
  assert.strictEqual(c.fixBlockText('done. next item', -1), 'Done. Next item');
});

test('the word "ill" is never contraction-rewritten (tribunal repro)', () => {
  const c = createCapitalizer([]);
  assert.strictEqual(c.fixBlockText('the patient is ill today', -1), 'The patient is ill today');
});

test('caret at the end of an expanded token lands after the replacement (tribunal repro)', () => {
  const c = createCapitalizer([]);
  const r = c.fixTextNodes(['im going'], 0, 2); // caret right after "im"
  assert.strictEqual(r.newValues[0], "I'm going");
  assert.strictEqual(r.caretOffset, 3); // after "I'm", not inside it
});
