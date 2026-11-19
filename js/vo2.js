// VO2 max estimates.
// 1) Running, from heart rate and speed: oxygen cost of running (Daniels' running-economy equation, plus an uphill term) divided by the
//    share of heart-rate reserve in use, on steady stretches.
// 2) Cycling, the same idea with power (ACSM cycling equation). Lower confidence when power is estimated.
// 3) Running, from performance: Jack Daniels' VDOT from best efforts (independent of heart rate).
// Only stretches at or above threshold count (heart rate at least 95% of threshold HR, allowing for HR lag and drift):
// the heart-rate-reserve extrapolation is least reliable at easy efforts, where small HR errors swing the result.
// Treadmill runs are skipped because wrist/footpod treadmill speed isn't reliable.

const median = a => { const s = a.slice().sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))] : null; };

// resample one section's records to 1 s
function resample(R, t0, t1, keys) {
  const rs = R.filter(r => r.t >= t0 && r.t <= t1);
  if (rs.length < 10) return null;
  const n = Math.floor(rs[rs.length - 1].t - rs[0].t) + 1, out = {}; keys.forEach(k => out[k] = new Float64Array(n).fill(NaN));
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = rs[0].t + i; while (j < rs.length - 2 && rs[j + 1].t < t) j++;
    const a = rs[j], b = rs[j + 1] || a; if (b.t - a.t > 10) continue;
    const f = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
    keys.forEach(k => { const va = a[k], vb = b[k]; if (va != null && vb != null) out[k][i] = va + (vb - va) * f; });
  }
  out.n = n; out.t0 = rs[0].t; return out;
}

// steady windows: windowS long, after warm-up, low speed variation and gentle gradient
function windows(x, key, { warm = 180, win = 60, step = 15, cvMax = 0.08, hrBand = 5 }) {
  const res = [];
  for (let s = warm; s + win <= x.n; s += step) {
    let sv = 0, sv2 = 0, sh = 0, n = 0, ok = true;
    for (let i = s; i < s + win; i++) { const v = x[key][i], h = x.hr[i]; if (!(v > 0) || !(h > 0)) { ok = false; break; } sv += v; sv2 += v * v; sh += h; n++; }
    if (!ok) continue;
    const m = sv / n, cv = Math.sqrt(Math.max(0, sv2 / n - m * m)) / m;
    if (cv > cvMax) continue;
    let grade = 0;
    if (x.alt && x.dist) { const d = x.dist[s + win - 1] - x.dist[s]; const da = x.alt[s + win - 1] - x.alt[s]; if (d > 50 && Number.isFinite(da)) grade = Math.max(-0.1, Math.min(0.1, da / d)); }
    // HR lags effort by roughly 30 s: pair this window's effort with HR from 30 s later
    let hr = 0, hn = 0, hmin = 1e9, hmax = 0; for (let i = s + 30; i < Math.min(x.n, s + win + 30); i++) if (x.hr[i] > 0) { hr += x.hr[i]; hn++; hmin = Math.min(hmin, x.hr[i]); hmax = Math.max(hmax, x.hr[i]); }
    if (hn < win * 0.8 || hmax - hmin > hrBand) continue;   // heart rate must have settled (no warm-up climb)
    res.push({ s, v: m, hr: hr / hn, grade });
  }
  return res;
}

// cfg: { maxHr, restHr, mass }
export function vo2FromActivity(S, R, cfg, bikePowerKey = 'power', bikeEstimated = false) {
  const out = { run: null, bike: null };
  const hrMax = cfg.maxHr, hrRest = cfg.restHr || 50;
  const frac = hr => (hr - hrRest) / (hrMax - hrRest);
  const runVals = [], bikeVals = [];
  // lowest share of HR reserve that counts: 95% of threshold HR (or 80% of reserve if no threshold is known)
  const floor = lthr => lthr ? Math.max(0.6, frac(0.95 * lthr)) : 0.8;
  const fRun = floor(cfg.lthrRun), fBike = floor(cfg.lthrBike);
  S.forEach((s, i) => {
    if (s.sport === 'running' && s.env !== 'treadmill') {
      const x = resample(R, s.start, s.start + s.elapsed, ['speed', 'hr', 'alt', 'dist']); if (!x) return;
      for (const w of windows(x, 'speed', { warm: Math.min(180, x.n * 0.3) })) {
        const f = frac(w.hr); if (f < fRun || f > 0.97) continue;            // threshold and above only
        const vm = w.v * 60, vo2 = -4.60 + 0.182258 * vm + 0.000104 * vm * vm + 0.9 * vm * Math.max(0, w.grade);   // Daniels running cost + ACSM uphill term
        runVals.push(3.5 + (vo2 - 3.5) / f);
      }
    }
    if (s.sport === 'cycling' && !(bikeEstimated && (s.env === 'indoor' || s.env === 'virtual'))) {   // speed-based power means nothing indoors
      const x = resample(R, s.start, s.start + s.elapsed, [bikePowerKey, 'hr']); if (!x) return;
      for (const w of windows(x, bikePowerKey, { warm: 300, cvMax: bikeEstimated ? 0.35 : 0.25 })) {
        const f = frac(w.hr); if (f < fBike || f > 0.97) continue;
        const vo2 = 10.8 * w.v / cfg.mass + 7;
        bikeVals.push(3.5 + (vo2 - 3.5) / f);
      }
    }
  });
  const summarise = (vals, estimated) => vals.length < 3 ? null : {
    value: median(vals), low: pct(vals, 0.25), high: pct(vals, 0.75), windows: vals.length, estimated,
  };
  out.run = summarise(runVals, false);
  out.bike = summarise(bikeVals, bikeEstimated);
  return out;
}

// Daniels & Gilbert VDOT from a race-effort time over a distance
export function vdot(distM, timeS) {
  const t = timeS / 60, v = distM / t;
  const pctMax = 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
  const vo2 = -4.60 + 0.182258 * v + 0.000104 * v * v;
  return vo2 / pctMax;
}
const RUN_M = { '1 mile': 1609.34, '5 km': 5000, '10 km': 10000, '15 km': 15000, '10 mile': 16093.4, 'Half marathon': 21097.5, '30 km': 30000, 'Marathon': 42195 };
// best VDOT among run best efforts of at least a mile (shorter efforts overstate it)
export function vdotFromBests(bests, sinceMs = 0) {
  let best = null;
  for (const b of bests) { if (b.sport !== 'run' || !RUN_M[b.effort] || Date.parse(b.achieved_at) < sinceMs) continue;
    const v = vdot(RUN_M[b.effort], +b.value); if (!best || v > best.value) best = { value: v, effort: b.effort, time: +b.value, activity_id: b.activity_id, achieved_at: b.achieved_at }; }
  return best;
}
// rough guide used for labels (men, ACSM/Cooper-style bands by age)
export function vo2Band(v, age = 50) {
  const b = age < 40 ? [35, 42, 48, 54] : age < 50 ? [33, 39, 45, 51] : age < 60 ? [30, 36, 42, 48] : [27, 33, 39, 45];
  return v < b[0] ? 'Poor' : v < b[1] ? 'Fair' : v < b[2] ? 'Good' : v < b[3] ? 'Excellent' : 'Superior';
}
