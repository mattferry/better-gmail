// MV3 service worker — owns the browser-level UI the content scripts can't:
// context-menu items and keyboard commands — and forwards them into the Gmail
// tab as runtime messages. Menu items exist only while their feature is enabled
// (rebuilt live on settings changes).
importScripts('settings.js');

const S = globalThis.__OB.settings;
const GMAIL_URL = 'https://mail.google.com/*';

// Menu ids double as the message types the content scripts listen for.
const MENUS = [
  { id: 'OB_ADD_CUSTOM_WORD', setting: 'autoCapitalize', title: 'Add to Auto Capitalizer dictionary', contexts: ['selection', 'editable'] },
  { id: 'OB_FORMAT_COPY', setting: 'formatPainter', title: 'Copy format', contexts: ['selection'] },
  { id: 'OB_FORMAT_PASTE', setting: 'formatPainter', title: 'Paste format', contexts: ['selection'] }
];

function rebuildMenus() {
  chrome.contextMenus.removeAll(() => {
    S.getAll().then((s) => {
      MENUS.filter((m) => s[m.setting]).forEach((m) => {
        chrome.contextMenus.create({
          id: m.id,
          title: m.title,
          contexts: m.contexts,
          documentUrlPatterns: [GMAIL_URL]
        });
      });
    });
  });
}

chrome.runtime.onInstalled.addListener(rebuildMenus);
chrome.runtime.onStartup.addListener(rebuildMenus);
S.onChange((changes) => {
  if (changes.autoCapitalize || changes.formatPainter) rebuildMenus();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || !tab.id) return;
  chrome.tabs.sendMessage(tab.id, {
    type: info.menuItemId,
    selectedText: info.selectionText || ''
  }).catch(() => { /* tab closed / no content script — nothing to do */ });
});

// Alt+C / Alt+V (see "commands" in manifest.json) → format-painter content script.
chrome.commands.onCommand.addListener((command) => {
  const type = command === 'format-copy' ? 'OB_FORMAT_COPY'
    : command === 'format-paste' ? 'OB_FORMAT_PASTE' : null;
  if (!type) return;
  chrome.tabs.query({ active: true, currentWindow: true, url: GMAIL_URL }, (tabs) => {
    if (tabs && tabs[0] && tabs[0].id) {
      chrome.tabs.sendMessage(tabs[0].id, { type }).catch(() => {});
    }
  });
});
