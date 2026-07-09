(function () {
  'use strict';

  // Auto-capitalize — fixes capitalization live while composing: sentence starts,
  // standalone "i", contractions, and dictionary proper nouns / acronyms / phrases
  // (offline dictionaries in ./dictionaries, kept verbatim from the original).
  // Users extend the dictionary via right-click → "Add to Auto Capitalizer
  // dictionary" (wired in core/background.js) or Ctrl+Shift+A in a draft.
  //
  // Ported from Mehul Siddhpura's "Gmail Auto Capitalizer" v4. The pure text
  // engine lives in capitalizer-engine.js; this file is the DOM/caret glue.

  const SKIP_SELECTORS = ".gmail_signature,.gmail_quote,[aria-label='Signature'],blockquote,code,pre";
  // Storage key kept from the original extension so anyone migrating from it
  // keeps their custom words.
  const STORAGE_KEY = 'gmailCapitalizerCustomWords';

  let enabled = false;
  let bound = false;
  let engine = null;
  let processTimer = null;

  function buildEngine() {
    const DICT = window.GMAIL_CAPITALIZER_DICTIONARY || {};
    engine = window.__OB.capitalizerEngine.createCapitalizer([
      ...(DICT.properNouns || []),
      ...(DICT.indianNames || []),
      ...(DICT.indiaLocations || []),
      ...(DICT.enterprise || []),
      ...(DICT.acronyms || []),
      ...(DICT.custom || [])
    ]);
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get([STORAGE_KEY], function (result) {
        const saved = (result && result[STORAGE_KEY]) || {};
        Object.keys(saved).forEach(function (key) { engine.addCustomWord(saved[key]); });
      });
    }
  }

  function getEditor(target) {
    return target && target.closest
      ? target.closest(window.__OB.gmail.SELECTORS.composeBody)
      : null;
  }

  function shouldSkipNode(node) {
    return !node || !node.parentElement || !!node.parentElement.closest(SKIP_SELECTORS);
  }

  function getCurrentBlock(node, editor) {
    let el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    while (el && el !== editor) {
      if (['DIV', 'P', 'LI'].includes(el.tagName)) return el;
      el = el.parentElement;
    }
    return editor;
  }

  function getTextNodes(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (shouldSkipNode(node)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) nodes.push(node);
    return nodes;
  }

  function getCaretOffset(root) {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    if (!root.contains(range.startContainer)) return null;
    const before = document.createRange();
    before.selectNodeContents(root);
    before.setEnd(range.startContainer, range.startOffset);
    return before.toString().length;
  }

  function restoreCaret(root, offset) {
    if (offset === null) return;
    const nodes = getTextNodes(root);
    let count = 0;
    for (const node of nodes) {
      const next = count + node.nodeValue.length;
      if (offset <= next) {
        const range = document.createRange();
        const selection = window.getSelection();
        range.setStart(node, Math.max(0, offset - count));
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        return;
      }
      count = next;
    }
  }

  function setBlockTextPreservingSingleNode(block, newText) {
    const nodes = getTextNodes(block);
    if (!nodes.length) return false;
    nodes[0].nodeValue = newText;
    for (let i = 1; i < nodes.length; i++) nodes[i].nodeValue = '';
    return true;
  }

  function processCurrentBlock() {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    const activeNode = range.startContainer;
    const editor = getEditor(
      activeNode.nodeType === Node.TEXT_NODE ? activeNode.parentElement : activeNode
    );
    if (!editor || shouldSkipNode(activeNode)) return;

    const block = getCurrentBlock(activeNode, editor);
    const caretOffset = getCaretOffset(block);
    if (caretOffset === null) return;

    const oldText = block.innerText || block.textContent || '';
    const newText = engine.fixBlockText(oldText, caretOffset);
    if (oldText === newText) return;

    setBlockTextPreservingSingleNode(block, newText);

    const delta = newText.length - oldText.length;
    restoreCaret(block, Math.min(caretOffset + delta, newText.length));
  }

  function scheduleProcessCurrentBlock(delay) {
    clearTimeout(processTimer);
    processTimer = setTimeout(function () {
      try { processCurrentBlock(); } catch (e) { console.warn('[OB] auto-capitalize:', e); }
    }, delay || 120);
  }

  function isCompletionKey(key) {
    return (
      key === ' ' || key === 'Enter' || key === 'Tab' || key === ',' || key === '.' ||
      key === '?' || key === '!' || key === ';' || key === ':'
    );
  }

  function getSelectedOrCurrentWord() {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount) return '';

    const selected = selection.toString().trim();
    if (selected) return selected;

    const range = selection.getRangeAt(0);
    const node = range.startContainer;
    if (!node || node.nodeType !== Node.TEXT_NODE) return '';

    const text = node.nodeValue;
    const pos = range.startOffset;
    const left = text.slice(0, pos).match(/[A-Za-z0-9+#/-]+$/);
    const right = text.slice(pos).match(/^[A-Za-z0-9+#/-]+/);
    return (left ? left[0] : '') + (right ? right[0] : '');
  }

  function saveCustomWord(rawValue) {
    const fixed = engine && engine.addCustomWord(rawValue);
    if (!fixed) {
      window.__OB.ui.toast('No valid word selected');
      return;
    }
    chrome.storage.local.get([STORAGE_KEY], function (result) {
      const saved = (result && result[STORAGE_KEY]) || {};
      saved[fixed.toLowerCase()] = fixed;
      chrome.storage.local.set({ [STORAGE_KEY]: saved }, function () {
        window.__OB.ui.toast('Added "' + fixed + '" to the Auto Capitalizer dictionary');
        scheduleProcessCurrentBlock(120);
      });
    });
  }

  function bindOnce() {
    if (bound) return;
    bound = true;

    // From the background service worker's context-menu item.
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener(function (message) {
        if (!enabled || !message || message.type !== 'OB_ADD_CUSTOM_WORD') return;
        saveCustomWord(message.selectedText || getSelectedOrCurrentWord());
      });
    }

    document.addEventListener('keydown', function (event) {
      if (!enabled) return;
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'a') {
        if (!getEditor(event.target)) return;
        event.preventDefault();
        saveCustomWord(getSelectedOrCurrentWord());
      }
    }, true);

    document.addEventListener('input', function (event) {
      if (!enabled || !getEditor(event.target)) return;
      const data = event.data || '';
      const inputType = event.inputType || '';
      if (/[\s.,!?;:]/.test(data) || inputType === 'insertParagraph' || inputType === 'insertLineBreak') {
        scheduleProcessCurrentBlock(120);
      }
    }, true);

    document.addEventListener('keyup', function (event) {
      if (!enabled || !getEditor(event.target)) return;
      if (isCompletionKey(event.key)) scheduleProcessCurrentBlock(120);
    }, true);

    document.addEventListener('blur', function (event) {
      if (!enabled || !getEditor(event.target)) return;
      scheduleProcessCurrentBlock(120);
    }, true);
  }

  // Idempotent: listeners bind once; the live `enabled` flag (refreshed here from
  // settings) turns the feature on/off, so toggles apply without a reload.
  function init() {
    if (location.host !== 'mail.google.com') return;
    if (!engine) buildEngine();
    bindOnce();
    return window.__OB.settings.get('autoCapitalize')
      .then(function (on) { enabled = !!on; })
      .catch(function (e) { console.log('[OB] auto-capitalize: init failed', e); });
  }

  const api = { init };
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).autoCapitalize = api;
})();
