const test = require('node:test');
const assert = require('node:assert');
const { buildMeetingUrl } = require('../features/context-menu/reply-with-meeting.js');

test('builds a TEMPLATE url with title', () => {
  const u = buildMeetingUrl({ title: 'Re: Budget' });
  assert.ok(u.startsWith('https://calendar.google.com/calendar/render?'));
  assert.ok(u.includes('action=TEMPLATE'));
  assert.ok(u.includes('text=Re%3A+Budget') || u.includes('text=Re:+Budget'));
});

test('appends each guest as an add= param', () => {
  const u = buildMeetingUrl({ title: 'Sync', guests: ['a@x.com', 'b@y.com'] });
  assert.ok(u.includes('add=a%40x.com'));
  assert.ok(u.includes('add=b%40y.com'));
});

test('empty options still produce a valid template url', () => {
  const u = buildMeetingUrl();
  assert.ok(u.includes('action=TEMPLATE'));
});
