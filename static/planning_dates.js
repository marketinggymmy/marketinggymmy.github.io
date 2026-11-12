/* Calendar arithmetic uses UTC only as a date carrier, never as a scheduling zone. */
(() => {
  'use strict';
  const iso = date => date.toISOString().slice(0, 10);
  const parse = value => new Date(`${value}T12:00:00Z`);
  function add(value, days) { const date = parse(value); date.setUTCDate(date.getUTCDate() + days); return iso(date); }
  // The wall clock in the zone as YYYY-MM-DDTHH:MM, comparable with a post's scheduled_local.
  function now(zone = 'Europe/Berlin') {
    const parts = new Intl.DateTimeFormat('en-CA', {timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).formatToParts(new Date());
    const get = type => parts.find(part => part.type === type).value;
    return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
  }
  const today = zone => now(zone).slice(0, 10);
  function monday(value) { return add(value, -((parse(value).getUTCDay() + 6) % 7)); }
  function days(value, view) {
    const start = view === 'month' ? monday(`${value.slice(0, 7)}-01`) : view === 'week' ? monday(value) : value;
    return Array.from({length: view === 'month' ? 42 : view === 'week' ? 7 : 1}, (_, index) => add(start, index));
  }
  function move(value, view, direction) {
    if (view !== 'month') return add(value, direction * (view === 'week' ? 7 : 1));
    const date = parse(`${value.slice(0, 7)}-01`); date.setUTCMonth(date.getUTCMonth() + direction); return iso(date);
  }
  function label(value, options = {month: 'long', year: 'numeric'}) {
    return new Intl.DateTimeFormat('de-DE', {...options, timeZone: 'UTC'}).format(parse(value));
  }
  window.KlartextPlanningDates = Object.freeze({now, today, days, move, label});
})();
