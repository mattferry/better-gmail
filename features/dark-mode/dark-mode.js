(function () {
  'use strict';
  function currentPref(mode) {
    if (mode === 'system') return matchMedia('(prefers-color-scheme: dark)').matches ? 'on' : 'off';
    return mode; // 'on' | 'off'
  }
  function apply(mode) {
    const host = location.host === 'calendar.google.com' ? 'calendar' : 'gmail';
    document.documentElement.setAttribute('data-ob-host', host);
    document.documentElement.setAttribute('data-ob-dark', currentPref(mode));
  }
  let wired = false;
  function applyFromSettings() {
    const OB = window.__OB;
    if (!OB || !OB.settings) return;
    OB.settings.getAll().then((s) => {
      const enabledHere = location.host === 'calendar.google.com' ? s.darkModeCalendar : s.darkModeGmail;
      apply(enabledHere ? s.darkMode : 'off');
    }).catch((e) => console.log('[OB] dark-mode: settings read failed', e));
  }
  function init() {
    const OB = window.__OB;
    if (!OB || !OB.settings) { console.log('[OB] dark-mode: __OB.settings unavailable, skipping init'); return; }
    applyFromSettings();
    if (wired) return;
    wired = true;
    if (typeof OB.settings.onChange === 'function') {
      OB.settings.onChange((changes) => {
        if (changes.darkMode || changes.darkModeGmail || changes.darkModeCalendar) applyFromSettings();
      });
    }
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyFromSettings);
  }
  const api = { apply, init };
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).darkMode = api;
})();
