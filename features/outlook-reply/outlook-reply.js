(function () {
  'use strict';

  // Outlook reply headers — when you hit Reply, replaces Gmail's one-line
  // "On ... wrote:" attribution with Outlook's classic block:
  //
  //   -----Original Message-----
  //   From: ... / Sent: ... / To: ... / Subject: ...
  //
  // Runs automatically after a native Reply click (outlookReply setting); an
  // optional compose-toolbar button (outlookReplyButton setting) converts a
  // reply manually.
  //
  // Ported from Mehul S.'s "Gmail Outlook Reply Header" v1.1.

  const MARKER = '-----Original Message-----';
  const BUTTON_CLASS = 'ob-outlook-reply-btn';
  const ICON_TITLE = 'Convert to Outlook Reply';
  const WAIT_TIMEOUT_MS = 5000;

  let autoOn = false;
  let buttonOn = false;
  let bound = false;
  let scanObserver = null;
  let scanTimer = null;

  function S() { return window.__OB.gmail.SELECTORS; }
  function toast(msg) { window.__OB.ui.toast(msg); }

  function clean(v) {
    return (v || '').replace(/\s+/g, ' ').trim();
  }

  function esc(v) {
    return clean(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function getComposeRoot(el) {
    return el.closest(S().composeDialog);
  }

  function getToolbar(compose) {
    return compose?.querySelector(S().composeSendBar);
  }

  function findReplyAttr(compose) {
    return compose?.querySelector(S().replyAttribution);
  }

  function getSubject() {
    // Tab-title fallback: Gmail's title is "Subject - account@host - Gmail"
    // (suffixes, not a prefix — audit fix 2026-07-14).
    return clean(
      document.querySelector(S().threadSubject)?.innerText ||
      document.title
        .replace(/\s*-\s*[^\s@-]+@[^\s-]+\s*-\s*Gmail\s*$/i, '')
        .replace(/\s*-\s*Gmail\s*$/i, '')
        .replace(/^Gmail\s*-\s*/i, '')
    );
  }

  function getOriginalMessageBeforeCompose(compose) {
    const messages = Array.from(document.querySelectorAll(S().messageAny));
    if (!messages.length) return null;

    const composeTop = compose.getBoundingClientRect().top;
    const before = messages.filter(m => m.getBoundingClientRect().top < composeTop);

    return before.length ? before[before.length - 1] : messages[messages.length - 1];
  }

  function getFrom(message) {
    const sender =
      message?.querySelector(S().senderChip) ||
      message?.querySelector(S().senderChipFallback);

    if (!sender) return '';

    const name = clean(sender.getAttribute('name') || sender.innerText);
    const email = clean(sender.getAttribute('email'));

    return name && email && !name.includes(email)
      ? `${name} <${email}>`
      : name || email;
  }

  function getSentDate(attr, message) {
    // Last-resort [title] fallback must actually look like a date — any icon's
    // tooltip used to win here (audit fix 2026-07-14).
    const dateEl =
      message?.querySelector(S().messageDate) ||
      message?.querySelector('[title][alt]') ||
      Array.from(message?.querySelectorAll('[title]') || [])
        .find((el) => !isNaN(Date.parse(el.getAttribute('title'))));

    if (dateEl) {
      const title = clean(dateEl.getAttribute('title'));
      if (title) return title;

      const text = clean(dateEl.innerText);
      if (text) return text;
    }

    const text = clean(attr?.innerText || '');
    const match = text.match(/^On\s+(.+?)\s+.+?<[^>]+>\s+wrote:?$/i);

    return match ? clean(match[1]) : '';
  }

  function getTo(message) {
    const recipients = [];

    message?.querySelectorAll(S().toRecipientChips).forEach(el => {
      const email = clean(el.getAttribute('email'));
      const name = clean(el.getAttribute('name') || el.innerText);

      if (!email) return;

      const value =
        name && !name.includes(email)
          ? `${name} <${email}>`
          : email;

      if (!recipients.includes(value)) recipients.push(value);
    });

    return recipients.join('; ');
  }

  function buildHeaderHtml(attr, message) {
    return `
${MARKER}<br>
From: ${esc(getFrom(message))}<br>
Sent: ${esc(getSentDate(attr, message))}<br>
To: ${esc(getTo(message))}<br>
Subject: ${esc(getSubject())}<br>
<div><br></div>
`;
  }

  function findTrimmedContentButtonNearCompose(compose) {
    const candidates = Array.from(document.querySelectorAll(S().trimmedContent));
    const composeRect = compose.getBoundingClientRect();

    const valid = candidates.filter(el => {
      const text = clean(
        el.getAttribute('aria-label') ||
        el.getAttribute('data-tooltip') ||
        el.getAttribute('title') ||
        el.innerText
      ).toLowerCase();

      return (
        text.includes('show trimmed content') ||
        text.includes('trimmed content') ||
        text.includes('show quoted text') ||
        text === '...' ||
        el.classList.contains('ajR') ||
        el.classList.contains('ajT')
      );
    });

    if (!valid.length) return null;

    valid.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return Math.abs(ar.top - composeRect.top) - Math.abs(br.top - composeRect.top);
    });

    return valid[0];
  }

  async function ensureReplyBlockVisible(compose) {
    let attr = findReplyAttr(compose);
    if (attr) return attr;

    const btn = findTrimmedContentButtonNearCompose(compose);

    if (btn) {
      btn.scrollIntoView({ block: 'center', inline: 'nearest' });
      await sleep(300);
      btn.click();
      await sleep(900);
    }

    return findReplyAttr(compose) || null;
  }

  async function convert(compose, silent = false) {
    const message = getOriginalMessageBeforeCompose(compose);

    if (!message) {
      if (!silent) toast('Original message not found');
      return false;
    }

    if (!getTo(message)) {
      if (!silent) toast('To field not found — expand the original email details first, then click again');
      return false;
    }

    const attr = await ensureReplyBlockVisible(compose);

    if (!attr) {
      if (!silent) toast('Reply block not found — scroll to the three dots once, then click again');
      return false;
    }

    const current = clean(attr.innerText || '');

    if (current.includes(MARKER)) return true;

    if (!current.includes('wrote:')) {
      if (!silent) toast('This does not look like a Gmail reply block');
      return false;
    }

    attr.innerHTML = buildHeaderHtml(attr, message);
    return true;
  }

  function createButton(compose) {
    const btn = document.createElement('div');

    btn.className = BUTTON_CLASS;
    btn.title = ICON_TITLE;
    btn.setAttribute('role', 'button');
    btn.setAttribute('aria-label', ICON_TITLE);

    btn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="2.5" y="4.5" width="19" height="15" rx="3" fill="#E8F0FE"></rect>
        <rect x="5" y="7" width="14" height="10" rx="1.5" fill="#0A64D6"></rect>
        <path d="M5.8 8.2l6.2 4.7 6.2-4.7" fill="none" stroke="#ffffff" stroke-width="1.7"></path>
        <circle cx="10" cy="12" r="3.1" fill="#ffffff"></circle>
        <text x="10" y="14.1" text-anchor="middle" font-size="5.6" font-family="Arial" font-weight="700" fill="#0A64D6">O</text>
      </svg>
    `;

    Object.assign(btn.style, {
      width: '28px',
      height: '24px',
      minWidth: '28px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      borderRadius: '4px',
      margin: '0 3px',
      padding: '2px 4px',
      backgroundColor: '#E8F0FE',
      border: '1px solid #D2E3FC',
      boxSizing: 'border-box',
      verticalAlign: 'middle',
      userSelect: 'none'
    });

    btn.addEventListener('mouseenter', () => {
      btn.style.backgroundColor = '#D2E3FC';
    });

    btn.addEventListener('mouseleave', () => {
      btn.style.backgroundColor = '#E8F0FE';
    });

    btn.addEventListener('click', async e => {
      e.preventDefault();
      e.stopPropagation();
      try { await convert(compose, false); } catch (err) { console.warn('[OB] outlook-reply:', err); }
    });

    return btn;
  }

  function addButtonToCompose(compose) {
    if (!buttonOn) return;
    if (!compose) return;

    const toolbar = getToolbar(compose);
    if (!toolbar) return;

    if (toolbar.querySelector('.' + BUTTON_CLASS)) return;

    const btn = createButton(compose);

    const sendButton =
      toolbar.querySelector("div[role='button'][data-tooltip*='Send']") ||
      toolbar.querySelector("div[aria-label*='Send']");

    if (sendButton?.parentElement?.parentElement) {
      sendButton.parentElement.parentElement.insertAdjacentElement('afterend', btn);
    } else {
      toolbar.insertBefore(btn, toolbar.firstChild);
    }
  }

  function scanForComposes(root = document) {
    root
      .querySelectorAll?.(S().composeBody)
      .forEach(body => {
        addButtonToCompose(getComposeRoot(body));
      });
  }

  function getClickLabel(target) {
    let el = target;

    for (let i = 0; i < 8 && el && el !== document.body; i++, el = el.parentElement) {
      const label = clean(
        el.getAttribute?.('aria-label') ||
        el.getAttribute?.('data-tooltip') ||
        el.getAttribute?.('title') ||
        el.innerText ||
        ''
      );

      if (label) return label.toLowerCase();
    }

    return '';
  }

  function isNativeReplyClick(target) {
    const label = getClickLabel(target);

    if (label === 'reply' || label === 'reply all') return true;
    if (label.includes('reply') && !label.includes('forward')) return true;

    const replyIcon = target.closest?.(".ams.bkH, .bkH, [aria-label='Reply'], [data-tooltip='Reply']");
    if (replyIcon) return true;

    return false;
  }

  function getLatestCompose() {
    const bodies = Array.from(document.querySelectorAll(S().composeBody));
    const latestBody = bodies[bodies.length - 1];
    return latestBody ? getComposeRoot(latestBody) : null;
  }

  function waitForReplyCompose(previousCount) {
    return new Promise(resolve => {
      const started = Date.now();

      const find = () => {
        const bodies = Array.from(document.querySelectorAll(S().composeBody));
        if (bodies.length > previousCount) {
          const latestBody = bodies[bodies.length - 1];
          return getComposeRoot(latestBody);
        }
        return getLatestCompose();
      };

      const observer = new MutationObserver(() => {
        const compose = find();

        if (compose) {
          observer.disconnect();
          resolve(compose);
          return;
        }

        if (Date.now() - started > WAIT_TIMEOUT_MS) {
          observer.disconnect();
          resolve(null);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      setTimeout(() => {
        observer.disconnect();
        resolve(find());
      }, WAIT_TIMEOUT_MS);
    });
  }

  async function triggerAfterNativeReplyClick(previousCount) {
    if (!autoOn) return;

    const compose = await waitForReplyCompose(previousCount);
    if (!compose) return;

    await sleep(250);
    await convert(compose, true);
  }

  function bindOnce() {
    if (bound) return;
    bound = true;

    document.addEventListener(
      'click',
      function (e) {
        if (!autoOn) return;
        try {
          const previousCount = document.querySelectorAll(S().composeBody).length;
          if (!isNativeReplyClick(e.target)) return;
          triggerAfterNativeReplyClick(previousCount);
        } catch (err) { console.warn('[OB] outlook-reply:', err); }
      },
      true
    );
  }

  // The manual button needs continuous compose discovery (compose windows appear
  // without navigation) — observer + slow interval, only while the button option
  // is on.
  function startButtonScanner() {
    if (scanObserver) return;
    scanObserver = new MutationObserver(() => {
      try { scanForComposes(); } catch (e) { console.warn('[OB] outlook-reply:', e); }
    });
    scanObserver.observe(document.body, { childList: true, subtree: true });
    scanTimer = setInterval(() => scanForComposes(), 1000);
    scanForComposes();
  }

  function stopButtonScanner() {
    if (scanObserver) { scanObserver.disconnect(); scanObserver = null; }
    if (scanTimer) { clearInterval(scanTimer); scanTimer = null; }
    document.querySelectorAll('.' + BUTTON_CLASS).forEach(el => el.remove());
  }

  // Idempotent + reversible: click listener binds once gated on live flags; the
  // button scanner starts/stops (and strips its buttons) with its setting.
  function init() {
    if (location.host !== 'mail.google.com') return;
    bindOnce();
    return window.__OB.settings.getAll().then((s) => {
      autoOn = !!s.outlookReply;
      // Independent of autoOn: the button is the manual path, useful precisely
      // when auto-convert is off (audit fix 2026-07-14 — options presents them
      // as independent toggles).
      buttonOn = !!s.outlookReplyButton;
      if (buttonOn) startButtonScanner(); else stopButtonScanner();
    }).catch((e) => console.log('[OB] outlook-reply: init failed', e));
  }

  const api = { init };
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).outlookReply = api;
})();
