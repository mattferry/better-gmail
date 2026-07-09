const test = require('node:test');
const assert = require('node:assert');
const m = require('../features/attachments-top/attachments-match.js');

const BASE = 'https://mail.google.com/';

test('extractTokens pulls long query values, ignores short ones', () => {
  const tokens = m.extractTokens('https://mail.google.com/mail/u/0/?view=att&attid=0.1.longtoken123', BASE);
  assert.ok(tokens.includes('0.1.longtoken123'));
  assert.ok(!tokens.includes('att')); // < 8 chars
});

test('extractTokens resolves relative URLs against the base and survives garbage', () => {
  assert.deepStrictEqual(m.extractTokens('?attid=abcdefgh', BASE), ['abcdefgh']);
  assert.deepStrictEqual(m.extractTokens(null, BASE), []);
  assert.deepStrictEqual(m.extractTokens('http://[broken', BASE), []);
});

test('namesLikelyMatch: exact, substring both directions, no false positive', () => {
  assert.strictEqual(m.namesLikelyMatch('logo.png', new Set(['logo.png'])), true);
  assert.strictEqual(m.namesLikelyMatch('company-logo.png', new Set(['logo.png'])), true);
  assert.strictEqual(m.namesLikelyMatch('logo', new Set(['company logo footer'])), true);
  assert.strictEqual(m.namesLikelyMatch('report.pdf', new Set(['logo.png'])), false);
  assert.strictEqual(m.namesLikelyMatch('', new Set(['logo.png'])), false);
});

test('looksLikeAutoInlineFilename flags auto-generated inline image names only', () => {
  assert.strictEqual(m.looksLikeAutoInlineFilename('image001.png'), true);
  assert.strictEqual(m.looksLikeAutoInlineFilename('Signature.PNG'), true);
  assert.strictEqual(m.looksLikeAutoInlineFilename('pasted image 3.png'), true);
  assert.strictEqual(m.looksLikeAutoInlineFilename('Q3-report.pdf'), false);
  assert.strictEqual(m.looksLikeAutoInlineFilename('team-photo-holiday.jpg'), false);
});
