(function () {
  'use strict';

  const DEFAULTS = {
    darkMode: 'on',            // 'on' | 'off' | 'system'
    darkModeGmail: true,
    darkModeCalendar: true,
    folderIllusionist: true,
    contextMenu: true,
    categories: true,
    quickViews: true,
    confirmBeforeDelete: true,
    compactDensity: false,
    // Team extension pack (ported from Mehul S.'s / Narendra S.'s standalone extensions)
    attachmentsTop: true,
    autoCapitalize: true,
    formatPainter: true,
    tableInserter: true,
    outlookReply: true,
    outlookReplyButton: false,
  };

  function mergeDefaults(stored) {
    return Object.assign({}, DEFAULTS, stored || {});
  }

  // Browser-only async API over chrome.storage.sync
  function get(key) {
    return getAll().then((all) => all[key]);
  }
  function getAll() {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.storage) return resolve(mergeDefaults(null));
      chrome.storage.sync.get(null, (stored) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          console.warn('[OB] settings: read failed, using defaults:', chrome.runtime.lastError.message);
          return resolve(mergeDefaults(null));
        }
        resolve(mergeDefaults(stored));
      });
    });
  }
  function set(key, val) {
    return new Promise((resolve, reject) => {
      if (typeof chrome === 'undefined' || !chrome.storage) return resolve();
      chrome.storage.sync.set({ [key]: val }, () => {
        // Surface write failures (e.g. the sync write-rate limit) instead of
        // silently reporting "Saved." (audit fix 2026-07-14).
        if (chrome.runtime && chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        resolve();
      });
    });
  }
  function onChange(cb) {
    if (typeof chrome === 'undefined' || !chrome.storage) return;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync') cb(changes);
    });
  }

  const api = { DEFAULTS, mergeDefaults, get, getAll, set, onChange };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  // globalThis (not window) so the same file serves the content scripts, the
  // options page, AND core/background.js (a service worker has no window).
  if (typeof globalThis !== 'undefined') (globalThis.__OB = globalThis.__OB || {}).settings = api;
})();
