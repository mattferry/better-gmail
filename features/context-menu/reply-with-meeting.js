(function () {
  'use strict';
  function buildMeetingUrl(opts) {
    const { title = '', guests = [], details = '', dates = '' } = opts || {};
    const params = new URLSearchParams();
    params.set('action', 'TEMPLATE');
    if (title) params.set('text', title);
    if (details) params.set('details', details);
    if (dates) params.set('dates', dates);
    let url = 'https://calendar.google.com/calendar/render?' + params.toString();
    for (const g of guests) if (g) url += '&add=' + encodeURIComponent(g);
    return url;
  }
  function open(opts) { if (typeof window !== 'undefined') window.open(buildMeetingUrl(opts), '_blank'); }
  const api = { buildMeetingUrl, open };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') (window.__OB = window.__OB || {}).replyWithMeeting = api;
})();
