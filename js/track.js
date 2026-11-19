// Snap GPS points from a run on a 400 m athletics track onto the track itself.
// A standard track's line of running in lane 1 (30 cm out from the kerb) is two 84.39 m straights joined by
// semicircles of radius 36.80 m: 2 x 84.39 + 2 x pi x 36.80 = 400.0 m.
// We find the track from the points: start from the centre of the densest cluster, take its long axis from the
// spread of the points, then search position and angle for the best-fitting oval. Points within 25 m of the oval
// are moved onto it (their position round the lap is smoothed so GPS jitter doesn't add distance);
// points further away (warm-up off the track, the walk to the car) are left alone.

const STRAIGHT = 84.39, RADIUS = 36.80, HALF = STRAIGHT / 2;
const M_PER_DEG = 111320;

const LAP = 2 * STRAIGHT + 2 * Math.PI * RADIUS;
// distance from a point (x, y), in the oval's own frame, to the line of running, and how far round the lap it is (u, metres)
function nearest(x, y) {
  if (Math.abs(x) <= HALF) return y < 0 ? { d: Math.abs(y + RADIUS), u: x + HALF } : { d: Math.abs(y - RADIUS), u: STRAIGHT + Math.PI * RADIUS + (HALF - x) };
  const cx = x > 0 ? HALF : -HALF, dx = x - cx, r = Math.hypot(dx, y) || 1e-9;
  let a = Math.atan2(y, dx);
  if (x > 0) return { d: Math.abs(r - RADIUS), u: STRAIGHT + (a + Math.PI / 2) * RADIUS };
  if (a < Math.PI / 2) a += 2 * Math.PI;
  return { d: Math.abs(r - RADIUS), u: 2 * STRAIGHT + Math.PI * RADIUS + (a - Math.PI / 2) * RADIUS };
}
// point on the line of running at u metres round the lap
function posAt(u) {
  u = ((u % LAP) + LAP) % LAP;
  if (u < STRAIGHT) return [-HALF + u, -RADIUS];
  if (u < STRAIGHT + Math.PI * RADIUS) { const a = -Math.PI / 2 + (u - STRAIGHT) / RADIUS; return [HALF + RADIUS * Math.cos(a), RADIUS * Math.sin(a)]; }
  if (u < 2 * STRAIGHT + Math.PI * RADIUS) return [HALF - (u - STRAIGHT - Math.PI * RADIUS), RADIUS];
  const a = Math.PI / 2 + (u - 2 * STRAIGHT - Math.PI * RADIUS) / RADIUS; return [-HALF + RADIUS * Math.cos(a), RADIUS * Math.sin(a)];
}

// fit the oval to points given in metres; returns { cx, cy, th, fit } where fit is the median distance off the oval
function fitOval(P) {
  if (P.length < 20) return null;
  // densest area: median, then keep points within 110 m of it and take the median again
  const med = a => { const s = a.slice().sort((p, q) => p - q); return s[s.length >> 1]; };
  let cx = med(P.map(p => p[0])), cy = med(P.map(p => p[1]));
  for (let k = 0; k < 2; k++) {
    const near = P.filter(p => Math.hypot(p[0] - cx, p[1] - cy) < 110);
    if (near.length < 20) return null;
    cx = near.reduce((s, p) => s + p[0], 0) / near.length; cy = near.reduce((s, p) => s + p[1], 0) / near.length;
  }
  const near = P.filter(p => Math.hypot(p[0] - cx, p[1] - cy) < 110);
  // long axis from the covariance of the points
  let sxx = 0, syy = 0, sxy = 0; for (const [x, y] of near) { sxx += (x - cx) ** 2; syy += (y - cy) ** 2; sxy += (x - cx) * (y - cy); }
  let th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  // sample to keep the search quick
  const S = near.length > 400 ? near.filter((_, i) => i % Math.ceil(near.length / 400) === 0) : near;
  const cost = (ox, oy, t) => { const c = Math.cos(t), s = Math.sin(t); let e = 0;
    for (const [x, y] of S) { const dx = x - ox, dy = y - oy, d = nearest(dx * c + dy * s, -dx * s + dy * c).d; e += Math.min(d, 15) ** 2; } return e; };
  // coarse-to-fine search over position and angle
  let best = { ox: cx, oy: cy, t: th, e: cost(cx, cy, th) };
  for (const [step, astep, n] of [[4, 0.06, 5], [1.5, 0.02, 4], [0.5, 0.007, 3]]) {
    const b0 = best;
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) for (let k = -3; k <= 3; k++) {
      const ox = b0.ox + i * step, oy = b0.oy + j * step, t = b0.t + k * astep, e = cost(ox, oy, t);
      if (e < best.e) best = { ox, oy, t, e };
    }
  }
  const c = Math.cos(best.t), s = Math.sin(best.t);
  const ds = S.map(([x, y]) => { const dx = x - best.ox, dy = y - best.oy; return nearest(dx * c + dy * s, -dx * s + dy * c).d; }).sort((a, b) => a - b);
  return { cx: best.ox, cy: best.oy, th: best.t, fit: ds[ds.length >> 1] };
}

// lat/lon arrays (nulls allowed) for the points to consider -> { lat, lon, oval } with snapped copies, or null if no track found
export function snapToTrack(lat, lon) {
  const idx = []; for (let i = 0; i < lat.length; i++) if (lat[i] != null && lon[i] != null) idx.push(i);
  if (idx.length < 20) return null;
  const lat0 = idx.reduce((s, i) => s + lat[i], 0) / idx.length, lon0 = idx.reduce((s, i) => s + lon[i], 0) / idx.length;
  const kx = M_PER_DEG * Math.cos(lat0 * Math.PI / 180), ky = M_PER_DEG;
  const P = idx.map(i => [(lon[i] - lon0) * kx, (lat[i] - lat0) * ky]);
  const f = fitOval(P);
  if (!f || f.fit > 12) return null;
  const c = Math.cos(f.th), s = Math.sin(f.th);
  const toLL = (x, y) => [lat0 + (f.cy + x * s + y * c) / ky, lon0 + (f.cx + x * c - y * s) / kx];
  const N = idx.map((i, j) => { const dx = P[j][0] - f.cx, dy = P[j][1] - f.cy; return nearest(dx * c + dy * s, -dx * s + dy * c); });
  // must look like laps: most points near the oval and the whole lap covered
  const on = N.filter(n => n.d < 25), bins = new Set(on.map(n => Math.floor(n.u / 20)));
  if (on.length < 0.5 * N.length || bins.size < 0.8 * Math.ceil(LAP / 20)) return null;
  const oLat = lat.slice(), oLon = lon.slice();
  // runs of consecutive on-track points: unwrap the lap position, smooth it, put the points back on the oval
  let j = 0;
  while (j < N.length) {
    if (N[j].d >= 25) { j++; continue; }
    let k = j; const us = [N[j].u];
    while (k + 1 < N.length && N[k + 1].d < 25) { k++; let du = N[k].u - N[k - 1].u; du -= Math.round(du / LAP) * LAP; us.push(us[us.length - 1] + du); }
    const W = 3;
    for (let m = j; m <= k; m++) {
      const a = Math.max(0, m - j - W), b = Math.min(us.length - 1, m - j + W);
      let sum = 0; for (let q = a; q <= b; q++) sum += us[q];
      const [x, y] = posAt(sum / (b - a + 1)), [la, lo] = toLL(x, y);
      oLat[idx[m]] = +la.toFixed(6); oLon[idx[m]] = +lo.toFixed(6);
    }
    j = k + 1;
  }
  const oval = []; for (let k = 0; k <= 80; k++) { const [x, y] = posAt(k / 80 * LAP), [la, lo] = toLL(x, y); oval.push([+la.toFixed(6), +lo.toFixed(6)]); }
  return { lat: oLat, lon: oLon, oval, fit: +f.fit.toFixed(1) };
}

// path length in metres along lat/lon points
export function pathLength(lat, lon) {
  let d = 0, pl = null, po = null;
  for (let i = 0; i < lat.length; i++) { if (lat[i] == null) continue;
    if (pl != null) { const kx = M_PER_DEG * Math.cos(lat[i] * Math.PI / 180); d += Math.hypot((lon[i] - po) * kx, (lat[i] - pl) * M_PER_DEG); }
    pl = lat[i]; po = lon[i]; }
  return d;
}
