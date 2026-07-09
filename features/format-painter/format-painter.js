(function () {
  'use strict';

  // Format painter — copy the text formatting at the selection, paste it onto
  // another selection, Outlook style. Triggered from the browser context menu
  // ("Copy format" / "Paste format") or Alt+C / Alt+V — both live in
  // core/background.js, which messages this module. The copied style persists in
  // chrome.storage.local so it survives navigation and works across tabs.
  //
  // Ported from Mehul Siddhpura's "Local Gmail Format Painter" v1.1.

  const STORAGE_KEY = 'obFormatPainter';

  let enabled = false;
  let bound = false;

  function toast(msg) { window.__OB.ui.toast(msg); }

  // Walk from the document root down to the selection, letting each ancestor's
  // computed style overwrite — the result is the effective style at the caret.
  function getFullStyle(node) {
    const fullStyle = {};
    const nodesPath = [];

    while (node) {
      if (node.nodeType !== Node.TEXT_NODE && node.nodeType !== Node.DOCUMENT_NODE) {
        nodesPath.push(node);
      }
      node = node.parentNode;
    }
    nodesPath.reverse();

    nodesPath.forEach(function (element) {
      const style = window.getComputedStyle(element);
      fullStyle['font-family'] = style.fontFamily;
      fullStyle['font-size'] = style.fontSize;
      fullStyle['font-weight'] = style.fontWeight;
      fullStyle['font-style'] = style.fontStyle;
      fullStyle['color'] = style.color;
      if (style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)') {
        fullStyle['background-color'] = style.backgroundColor;
      }
      if (style.textDecorationLine) {
        fullStyle['text-decoration'] = style.textDecorationLine;
      }
    });

    let marker = '';
    nodesPath.forEach(function (element) {
      switch (element.nodeName) {
        case 'OL': marker = 'OL'; break;
        case 'UL': marker = 'UL'; break;
      }
    });

    return { style: fullStyle, marker };
  }

  // If the copied selection sat in an OL/UL and the paste target sits in the other
  // kind of list, convert the target list to match (children move wholesale).
  function setMarkerStyle(node, markerStyle) {
    if (!markerStyle) return;
    let current = node;
    while (current) {
      switch (current.nodeName) {
        case 'OL':
          if (markerStyle === 'UL' && current.parentNode) {
            const ul = document.createElement('ul');
            while (current.firstChild) ul.appendChild(current.firstChild);
            current.parentNode.replaceChild(ul, current);
          }
          return;
        case 'UL':
          if (markerStyle === 'OL' && current.parentNode) {
            const ol = document.createElement('ol');
            while (current.firstChild) ol.appendChild(current.firstChild);
            current.parentNode.replaceChild(ol, current);
          }
          return;
      }
      current = current.parentNode;
    }
  }

  function copyStyle() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      toast('Select some formatted text first');
      return;
    }
    const result = getFullStyle(selection.getRangeAt(0).startContainer);
    chrome.storage.local.set({ [STORAGE_KEY]: result }, function () {
      toast('Format copied');
    });
  }

  function pasteStyle() {
    chrome.storage.local.get([STORAGE_KEY], function (data) {
      const saved = (data && data[STORAGE_KEY]) || {};
      const copiedStyle = saved.style || {};
      const markerStyle = saved.marker || '';

      if (!Object.keys(copiedStyle).length) {
        toast('No format copied yet — Copy format first');
        return;
      }
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        toast('Select the text to paste the format onto');
        return;
      }

      const range = selection.getRangeAt(0);
      const span = document.createElement('span');
      Object.keys(copiedStyle).forEach(function (property) {
        span.style.setProperty(property, copiedStyle[property]);
      });
      span.textContent = selection.toString();
      range.deleteContents();
      range.insertNode(span);
      setMarkerStyle(span, markerStyle);
      toast('Format pasted');
    });
  }

  function bindOnce() {
    if (bound) return;
    bound = true;
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.onMessage) return;
    chrome.runtime.onMessage.addListener(function (request) {
      if (!enabled || !request) return;
      try {
        if (request.type === 'OB_FORMAT_COPY') copyStyle();
        if (request.type === 'OB_FORMAT_PASTE') pasteStyle();
      } catch (e) { console.warn('[OB] format-painter:', e); }
    });
  }

  // Idempotent: message listener binds once; the live `enabled` flag gates it.
  // (The background worker also drops the context-menu items when disabled.)
  function init() {
    if (location.host !== 'mail.google.com') return;
    bindOnce();
    return window.__OB.settings.get('formatPainter')
      .then(function (on) { enabled = !!on; })
      .catch(function (e) { console.log('[OB] format-painter: init failed', e); });
  }

  const api = { init };
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).formatPainter = api;
})();
