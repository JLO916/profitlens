/* Extract of a(), r(), o() from the publicly served application bundle:
 * /_next/static/chunks/app/page-12cf65acb947e371.js
 * Retrieved 2026-10-01T08:18:29Z through Vercel.web_fetch_vercel_url.
 * The functions below are copied with formatting only. This executes an
 * extracted validator locally, NOT the live web application or browser UI.
 */
function a(e) {
  if ("string" != typeof e || !/^\d{4}-\d{2}-\d{2}$/.test(e)) return !1;
  let s = Date.parse(`${e}T00:00:00Z`);
  return Number.isFinite(s) && new Date(s).toISOString().slice(0, 10) === e;
}
function r(e) {
  if (!a(e.start) || !a(e.end) || e.start > e.end) throw RangeError("INVALID_PERIOD");
  return (Date.parse(`${e.end}T00:00:00Z`) - Date.parse(`${e.start}T00:00:00Z`)) / 864e5 + 1;
}
function o(e) {
  let s = {start:e.coverage_start, end:e.coverage_end};
  if ([s, e.previous_period, e.current_period].some(e => !e || !a(e.start) || !a(e.end) || e.start > e.end)) return ["INVALID_PERIOD"];
  let t = [];
  for (let n of (
    r(e.previous_period) !== r(e.current_period) && t.push("UNEQUAL_PERIOD_LENGTH"),
    e.previous_period.start <= e.current_period.end && e.current_period.start <= e.previous_period.end && t.push("OVERLAPPING_PERIODS"),
    [e.previous_period,e.current_period]
  )) (n.start < s.start || n.end > s.end) && t.push("PERIOD_OUTSIDE_COVERAGE");
  return [...new Set(t)];
}
const tests = [
  { id: 'full_calendar_months', input: {
      coverage_start:'2026-08-01', coverage_end:'2026-09-30',
      previous_period:{start:'2026-08-01',end:'2026-08-31'},
      current_period:{start:'2026-09-01',end:'2026-09-30'}
    }, note:'Calendar months have different lengths. Existing validator blocks this business comparison.' },
  { id: 'reversed_chronology', input: {
      coverage_start:'2026-08-01', coverage_end:'2026-08-02',
      previous_period:{start:'2026-08-02',end:'2026-08-02'},
      current_period:{start:'2026-08-01',end:'2026-08-01'}
    }, note:'Labels say previous/current, but this validator permits previous to be later than current.' },
  { id: 'normal_chronology', input: {
      coverage_start:'2026-08-01', coverage_end:'2026-08-02',
      previous_period:{start:'2026-08-01',end:'2026-08-01'},
      current_period:{start:'2026-08-02',end:'2026-08-02'}
    }, note:'Valid control case.' }
];
const result = tests.map(t => ({...t, actual_codes:o(t.input)}));
if (result[0].actual_codes[0] !== 'UNEQUAL_PERIOD_LENGTH') throw Error('Unexpected result for months');
if (result[1].actual_codes.length !== 0 || result[2].actual_codes.length !== 0) throw Error('Unexpected date validation result');
console.log(JSON.stringify({method:'Locally executed deployed validator extract, not live end-to-end UI testing', tests:result}, null,2));
