const test = require('node:test');
const assert = require('node:assert');

// dictionary-acronyms.js must MERGE with dictionary.js's base acronyms, not
// replace them (the audit found IVR/URL/SOP silently dropped by reassignment).

test('acronym dictionaries merge instead of overwrite', () => {
  global.window = {};
  require('../features/auto-capitalize/dictionaries/dictionary.js');
  require('../features/auto-capitalize/dictionaries/dictionary-acronyms.js');
  const acr = global.window.GMAIL_CAPITALIZER_DICTIONARY.acronyms;
  for (const fromBase of ['IVR', 'URL', 'SOP', 'HTML', 'API']) {
    assert.ok(acr.includes(fromBase), fromBase + ' (base list) must survive the merge');
  }
  for (const fromOverlay of ['ITSM', 'CMDB', 'BRM']) {
    assert.ok(acr.includes(fromOverlay), fromOverlay + ' (overlay list) must be present');
  }
  assert.strictEqual(new Set(acr).size, acr.length, 'merged list must be deduplicated');
  delete global.window;
});
