// Demo athlete for the how-to videos: ~16 weeks of made-up training around London parks
// (runs, rides with power, pool swims, and a sprint triathlon). Nothing here is anyone's real data.
// Usage: node demo/make_demo.mjs <outdir>
import { Encoder, Profile } from '@garmin/fitsdk';
import fs from 'fs';
import { execFileSync } from 'child_process';

const M = Profile.MesgNum, deg = 2 ** 31 / 180, OUT = process.argv[2] || '/tmp/demo';
fs.mkdirSync(OUT, { recursive: true });
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const walk = (k = .985) => { let x = 0; return () => (x = x * k + (rnd() - .5) * (1 - k) * 6); };

// closed loops (centre, radius m, wobble) -> point at fraction f of the loop
const LOOPS = {
  hyde: { c: [51.5073, -0.1657], r: 720, k: [[3, .10, .4], [5, .05, 1.3], [2, .08, 2.1]], sx: 1.6 },   // ~5.6 km
  regents: { c: [51.5313, -0.1570], r: 560, k: [[4, .08, .2], [3, .06, 2.4]], sx: 1.2 },               // ~4.1 km
  richmond: { c: [51.4440, -0.2750], r: 1700, k: [[3, .12, 1.0], [5, .05, .2], [7, .03, 2.9]], sx: 1.25 }, // ~12 km
  surrey: { c: [51.2600, -0.3600], r: 7600, k: [[2, .18, .5], [3, .10, 1.7], [6, .05, 2.2]], sx: 1.4 },  // ~55 km
  tri_swim: { c: [51.5052, -0.1690], r: 160, k: [[2, .35, 0]], sx: 2.2 },
};
function loopFn(L) {
  const pts = []; const n = 720;
  for (let i = 0; i <= n; i++) { const th = i / n * 2 * Math.PI; let rr = 1; L.k.forEach(([h, a, p]) => rr += a * Math.sin(h * th + p));
    pts.push([L.r * rr * Math.cos(th) * L.sx, L.r * rr * Math.sin(th)]); }
  const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const len = cum[cum.length - 1];
  const at = d => { d = ((d % len) + len) % len; let i = 1; while (cum[i] < d) i++; const t = (d - cum[i - 1]) / (cum[i] - cum[i - 1]);
    const x = pts[i - 1][0] + t * (pts[i][0] - pts[i - 1][0]), y = pts[i - 1][1] + t * (pts[i][1] - pts[i - 1][1]);
    return [L.c[0] + y / 111320, L.c[1] + x / (111320 * Math.cos(L.c[0] * Math.PI / 180))]; };
  return { len, at };
}
const terrain = (lat, lon, amp) => amp * (Math.sin(lat * 260) * .6 + Math.cos(lon * 180) * .4);

// one activity: legs [{sport, loop, dist, speed(km/h or pace), hr, power, ...}], start Date
function write(file, start, legs, { name } = {}) {
  const enc = new Encoder(), t0 = +start, at = s => new Date(t0 + s * 1000);
  enc.onMesg(M.FILE_ID, { type: 'activity', manufacturer: 'garmin', product: 4315, serialNumber: 5550123, timeCreated: at(0) });
  let s = 0, dist = 0; const laps = [], sessions = [];
  for (const L of legs) {
    const s0 = s, d0 = dist, lap = { start: s, d: dist }, sp = SPORT[L.sport];
    if (L.sport === 'transition') {
      for (let k = 0; k < L.secs; k++, s++) enc.onMesg(M.RECORD, { timestamp: at(s), heartRate: Math.round(L.hr + 4 * Math.sin(k / 9)) });
      laps.push({ startTime: at(s0), timestamp: at(s), totalElapsedTime: L.secs, totalTimerTime: L.secs, totalDistance: 0, sport: 'transition' });
      sessions.push({ startTime: at(s0), timestamp: at(s), totalElapsedTime: L.secs, totalTimerTime: L.secs, totalDistance: 0, sport: 'transition', avgHeartRate: L.hr }); continue;
    }
    const lf = loopFn(LOOPS[L.loop]); const nH = walk(.995), nC = walk(.97), nG = walk(.98), nV = walk(.98), nB = walk(.995), nP = walk(.93); let d = 0, hrNow = L.hr - 25, alt0 = null, ascent = 0, lastAlt = null, hrSum = 0, n = 0, pw = 0, lapAsc = 0, lapHr = 0, lapN = 0, lapPw = 0;
    const lapLen = L.lapLen || (L.sport === 'run' ? 1000 : L.sport === 'bike' ? 5000 : 400);
    while (d < L.dist) {
      const [lat, lon] = lf.at(d + (L.offset || 0)), alt = 20 + terrain(lat, lon, L.amp ?? 8);
      const grade = lastAlt == null ? 0 : (alt - lastAlt) / Math.max(1, (L.v || 3));
      const ivl = L.ivl ? L.ivl(s - s0, d) : 1;                 // interval factor
      let v = (L.v) * ivl * (1 - (L.sport === 'bike' ? 3.5 : 1.8) * grade) * (1 + .02 * Math.sin((s - s0) / 37) + .015 * (rnd() - .5));
      if (L.sport === 'bike' && (s - s0) % 900 > 880) v *= .35;   // a junction now and then
      v = Math.max(.5, v);
      const target = L.hr * (.985 + .35 * (ivl - 1) + .25 * grade);
      hrNow += (target - hrNow) * (s - s0 < 300 ? .012 : .03); hrNow += .0012 * (L.hr) * ((s - s0) / 3600) * .2;
      const rec = { timestamp: at(s), positionLat: Math.round(lat * deg), positionLong: Math.round(lon * deg), distance: dist + v, enhancedSpeed: v, enhancedAltitude: alt, heartRate: Math.round(hrNow + 3 * nH()) };
      if (L.sport === 'run') Object.assign(rec, { cadence: Math.round(85 + 5 * (v - L.v) + 1.2 * nC()), fractionalCadence: 0, stepLength: Math.round(v / ((84 + 4 * (v - L.v)) * 2 / 60) * 1000),
        verticalOscillation: 84 + 3 * nV() - 2 * (v - L.v), stanceTime: 248 - 14 * (v - L.v) + 4 * nG(), stanceTimeBalance: 49.7 + .5 * Math.sin((s - s0) / 700) + .35 * nB() });
      if (L.sport === 'bike') { pw = Math.max(0, Math.round(L.power * ivl * (1 + 6 * grade) * (1 + .08 * nP()) * (v < 3 ? .1 : 1))); Object.assign(rec, { power: pw, cadence: Math.round(pw ? 86 + (rnd() - .5) * 8 : 0), leftRightBalance: 128 + 49 }); }
      if (L.sport === 'swim') Object.assign(rec, { cadence: 30 });
      enc.onMesg(M.RECORD, rec);
      if (lastAlt != null && alt > lastAlt) { ascent += alt - lastAlt; lapAsc += alt - lastAlt; } lastAlt = alt;
      hrSum += rec.heartRate; n++; lapHr += rec.heartRate; lapN++; lapPw += pw || 0;
      d += v; dist += v; s++;
      if (d - (lap.d - d0) >= lapLen || d >= L.dist) {
        const el = s - lap.start, ld = dist - lap.d;
        laps.push({ startTime: at(lap.start), timestamp: at(s), totalElapsedTime: el, totalTimerTime: el, totalDistance: ld, enhancedAvgSpeed: ld / el, avgHeartRate: Math.round(lapHr / lapN), totalAscent: Math.round(lapAsc), sport: sp, ...(L.sport === 'bike' ? { avgPower: Math.round(lapPw / lapN) } : {}) });
        lap.start = s; lap.d = dist; lapAsc = 0; lapHr = 0; lapN = 0; lapPw = 0;
      }
    }
    sessions.push({ startTime: at(s0), timestamp: at(s), totalElapsedTime: s - s0, totalTimerTime: s - s0, totalDistance: dist - d0, sport: sp,
      subSport: L.sport === 'swim' ? 'openWater' : 'generic', enhancedAvgSpeed: (dist - d0) / (s - s0), avgHeartRate: Math.round(hrSum / n), maxHeartRate: Math.round(L.hr + 12), totalAscent: Math.round(ascent) });
  }
  laps.forEach((l, i) => enc.onMesg(M.LAP, { ...l, messageIndex: i }));
  let li = 0; sessions.forEach((x, i) => { const nl = laps.filter(l => +l.startTime >= +x.startTime && +l.startTime < +x.timestamp).length;
    enc.onMesg(M.SESSION, { ...x, messageIndex: i, firstLapIndex: li, numLaps: nl }); li += nl; });
  enc.onMesg(M.ACTIVITY, { timestamp: at(s), totalTimerTime: s, numSessions: sessions.length, type: 'manual', event: 'activity', eventType: 'stop', localTimestamp: Math.round((t0 + s * 1000) / 1000) - 631065600 });
  fs.writeFileSync(`${OUT}/${file}`, enc.close());
  return s;
}
const SPORT = { run: 'running', bike: 'cycling', swim: 'swimming', transition: 'transition' };

if (process.env.UPLOAD_ONLY) {   // two fresh files for the upload video
  write('evening_run.fit', new Date(Date.UTC(2026, 10, 22, 16, 5)), [{ sport: 'run', loop: 'hyde', dist: 6000, v: 1000 / (5.5 * 60), hr: 142, offset: 900 }]);
  write('turbo.fit', new Date(Date.UTC(2026, 10, 21, 17, 0)), [{ sport: 'bike', loop: 'richmond', dist: 30000, v: 9.2, power: 205, hr: 140, amp: 20 }]);
  process.exit(0);
}
// plan: 16 weeks ending Fri 20 Nov 2026; sprint triathlon on Sun 13 Sep
const END = Date.UTC(2026, 10, 20), DAY = 864e5, files = [];
const pace = mk => 1000 / (mk * 60);   // min/km -> m/s
for (let w = 25; w >= 0; w--) {
  const mon = END - (w * 7 + 4) * DAY, build = 1 + (25 - w) * .012;
  const t = (dd, h, m = 0) => new Date(mon + dd * DAY + (h * 60 + m) * 6e4);
  const tag = d => new Date(d).toISOString().slice(0, 10);
  const add = (when, legs) => { const f = `${tag(when)}_${files.length}.fit`; const day = 1 + .045 * (rnd() - .5) + .004 * (25 - w); write(f, when, legs.map(l => l.v ? { ...l, v: l.v * day } : l)); files.push(f); };
  if (w === 5) continue;   // a rest week (holiday)
  // Tue intervals run
  add(t(1, 6, 30), [{ sport: 'run', loop: 'regents', dist: 9000, v: pace(5.15), hr: 152, ivl: (ss) => ss > 900 && ss < 2700 && (ss % 360) < 240 ? 1.18 : 1 }]);
  // Wed swim (pool)
  { const when = t(2, 6, 15); const f = `${tag(when)}_${files.length}.fit`; execFileSync('node', ['node/make_pool_swim.mjs', `${OUT}/${f}`], { env: { ...process.env, T0: when.toISOString(), TZH: '0' } }); files.push(f); }
  // Thu easy run
  add(t(3, 6, 45), [{ sport: 'run', loop: 'hyde', dist: 8000 + 1000 * (w % 3), v: pace(5.6), hr: 141, offset: 300 * w }]);
  // Sat long ride
  if (w !== 9) add(t(5, 7, 30), [{ sport: 'bike', loop: 'surrey', dist: Math.round(Math.min(95000, 45000 + 2600 * (25 - w)) * (w % 4 === 0 ? .7 : 1)), v: 8.2, power: 185 * build, hr: 136, amp: 28 }]);
  // Sun long run (not race week)
  if (w === 6) add(t(6, 9, 0), [{ sport: 'run', loop: 'regents', dist: 10060, v: pace(4.42), hr: 171, offset: 120 }]);
  if (w !== 10 && w !== 6) add(t(6, 8, 0), [{ sport: 'run', loop: 'hyde', dist: Math.round(Math.min(21000, 12000 + 450 * (25 - w)) * (w % 4 === 0 ? .7 : 1)), v: pace(5.45), hr: 145 }]);
  // Fri swim every other week
  if (w % 2 === 0) { const when = t(4, 6, 15); const f = `${tag(when)}_${files.length}.fit`; execFileSync('node', ['node/make_pool_swim.mjs', `${OUT}/${f}`], { env: { ...process.env, T0: when.toISOString(), TZH: '0' } }); files.push(f); }
  // Mon recovery spin on alternate weeks (Richmond loop)
  if (w % 2 === 1) add(t(0, 18, 0), [{ sport: 'bike', loop: 'richmond', dist: 36000, v: 8.6, power: 165, hr: 128, amp: 35 }]);
  // race: sprint triathlon Sun of week 10
  if (w === 10) add(t(6, 7, 0), [
    { sport: 'swim', loop: 'tri_swim', dist: 750, v: .95, hr: 150, amp: 0 },
    { sport: 'transition', secs: 118, hr: 158 },
    { sport: 'bike', loop: 'hyde', dist: 20000, v: 10.2, power: 228, hr: 160, amp: 8 },
    { sport: 'transition', secs: 64, hr: 162 },
    { sport: 'run', loop: 'hyde', dist: 5000, v: pace(4.55), hr: 168 }]);
}
fs.writeFileSync(`${OUT}/files.json`, JSON.stringify(files));
console.log(files.length, 'files in', OUT);
