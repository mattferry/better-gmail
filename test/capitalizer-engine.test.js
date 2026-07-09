const test = require('node:test');
const assert = require('node:assert');
const { createCapitalizer, titleCaseCustomWord } = require('../features/auto-capitalize/capitalizer-engine.js');

test('capitalizes sentence starts and standalone i', () => {
  const cap = createCapitalizer([]);
  assert.strictEqual(cap.fixBlockText('hello there. i was out.', 0), 'Hello there. I was out.');
});

test('fixes contractions', () => {
  const cap = createCapitalizer([]);
  assert.strictEqual(cap.fixBlockText('im sure dont worry.', 0), "I'm sure don't worry.");
});

test('applies dictionary words and phrases', () => {
  const cap = createCapitalizer(['Gmail', 'Google Workspace']);
  assert.strictEqual(cap.fixBlockText('check gmail now.', 0), 'Check Gmail now.');
  assert.strictEqual(cap.fixBlockText('use google workspace daily.', 0), 'Use Google Workspace daily.');
});

test('leaves the word still being typed alone (caret at end of text)', () => {
  const cap = createCapitalizer(['Gmail']);
  const text = 'check gmail';
  assert.strictEqual(cap.fixBlockText(text, text.length), 'Check gmail');
});

test('blocked common words never enter the dictionary', () => {
  const cap = createCapitalizer(['The']);
  assert.strictEqual(cap.fixBlockText('put it in the box.', 0), 'Put it in the box.');
  assert.strictEqual(cap.addCustomWord('the'), null);
});

test('addCustomWord registers words and phrases for future fixes', () => {
  const cap = createCapitalizer([]);
  assert.strictEqual(cap.addCustomWord('acme corp'), 'Acme Corp');
  assert.strictEqual(cap.fixBlockText('email acme corp today.', 0), 'Email Acme Corp today.');
});

test('titleCaseCustomWord preserves acronyms and mixed case', () => {
  assert.strictEqual(titleCaseCustomWord('hello WORLD'), 'Hello WORLD');
  assert.strictEqual(titleCaseCustomWord('iPhone'), 'iPhone');
  assert.strictEqual(titleCaseCustomWord('acme'), 'Acme');
});
