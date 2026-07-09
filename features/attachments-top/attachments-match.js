(function () {
  'use strict';

  // Pure matching logic for attachments-top (no DOM) — decides whether a tray item
  // is a signature/logo image that should stay put. Ported from Narendra S.'s
  // "Gmail Attachments on Top" rework; see attachments-top.js for how the three
  // signals combine.

  function normalizeName(name) {
    return (name || '').trim().toLowerCase();
  }

  // Pull out any long, identifier-looking strings from a URL — query values and
  // path segments over a minimum length. Two URLs that share one of these are very
  // likely referencing the same underlying file, even if the parameter names Gmail
  // uses differ (e.g. "attid" vs some other key).
  function extractTokens(url, baseHref) {
    const tokens = [];
    if (!url) return tokens;
    try {
      const base = baseHref || (typeof location !== 'undefined' ? location.href : 'https://mail.google.com/');
      const u = new URL(url, base);
      for (const val of u.searchParams.values()) {
        if (val && val.length >= 8) tokens.push(val);
      }
      u.pathname.split('/').forEach((seg) => {
        if (seg && seg.length >= 12) tokens.push(seg);
      });
    } catch (e) { /* malformed URL — no signals */ }
    return tokens;
  }

  function namesLikelyMatch(filename, inlineNames) {
    const norm = normalizeName(filename);
    if (!norm) return false;
    for (const inlineName of inlineNames) {
      if (!inlineName) continue;
      if (norm === inlineName || norm.includes(inlineName) || inlineName.includes(norm)) {
        return true;
      }
    }
    return false;
  }

  // Outlook/Exchange (and several signature-management add-ins) auto-name embedded
  // signature/logo images sequentially — image001.png, img002.jpg, signature.png,
  // logo1.png. A person deliberately attaching a real file essentially never uses
  // this generic naming, so it's a strong signal on its own, independent of
  // anything found in the body.
  const AUTO_INLINE_FILENAME_PATTERN = /(image|img|signature|logo|pasted[\s_-]?image)[\s_-]?\d{0,4}\.(png|jpe?g|gif|bmp|tiff?|webp)/i;

  function looksLikeAutoInlineFilename(filename) {
    return AUTO_INLINE_FILENAME_PATTERN.test(normalizeName(filename));
  }

  const api = { normalizeName, extractTokens, namesLikelyMatch, looksLikeAutoInlineFilename };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).attachmentsMatch = api;
})();
