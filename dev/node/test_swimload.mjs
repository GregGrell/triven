// Swim training load from pace against CSS (sTSS: hours × IF³ × 100).
import { loadOf } from '../../js/load.js';
let fails = 0; const ok = (c, m) => { console.log((c ? '  ok  ' : '  FAIL ') + m); if (!c) fails++; };
const swim = (dist, secs, extra = {}) => ({ sport: 'swim', start_time: '2026-11-10T05:00:00Z', utc_offset_min: 180, elapsed_s: secs + 300, moving_s: secs,
  summary: { loadData: { v: 1, hr: {}, t: { swim: secs + 300 }, pw: [] } }, activity_sections: [{ sport: 'swim', distance_m: dist, elapsed_s: secs + 300, summary: { swimTime: secs, env: 'pool', ...extra } }] });
const cfg = { restHr: 50, lthrRun: 163, lthrBike: 158, css: 100 };   // 1:40 /100 m
const atCss = loadOf(swim(3600, 3600), cfg);
ok(atCss.value === 100 && atCss.method === 'pace', `an hour swum at CSS = 100 (${atCss.value}, ${atCss.method})`);
const easy = loadOf(swim(3000, 3600), cfg);
ok(easy.value === Math.round(100 * (100 / 120) ** 3), `an hour at 2:00 /100 m (IF 0.83) = ${easy.value}`);
const noCss = loadOf(swim(3600, 3600), { ...cfg, css: null });
ok(noCss.method !== 'pace', 'without CSS it falls back as before');
const dated = loadOf(swim(3600, 3600), { ...cfg, css: 110, history: [{ from: '2026-12-01', css: 95 }] });
ok(dated.value === Math.round(100 * (1 / (100 / 110)) ** 3), `a CSS dated later doesn't apply; the usual 1:50 does: IF 1.1 → ${dated.value}`);
console.log(fails ? fails + ' FAILED' : 'all passed');
