// Pool swimming from the watch's lengths: swim time (rest excluded), intervals, SWOLF, strokes, and bests over continuous swimming.
// A length is { t: start (s from file start), dur, type: 'active' | 'idle', strokes, stroke }. Idle lengths are rests.
// Pace is always worked out on time spent swimming, never on elapsed time, and intervals come from the lengths themselves,
// so watches that bundle lengths into one lap still get the right pace.

export const STROKE_NAME = { freestyle: 'Freestyle', backstroke: 'Backstroke', breaststroke: 'Breaststroke', butterfly: 'Butterfly', drill: 'Drill', mixed: 'Mixed', im: 'IM' };

export function lengthsIn(section, lengths) {
  if (!Array.isArray(lengths)) return [];
  const a = +section.start_offset_s - 0.5, b = +section.start_offset_s + +section.elapsed_s + 0.5;
  return lengths.filter(l => l.t >= a && l.t < b);
}
const isActive = l => l.type !== 'idle' && l.dur > 0;

// summary for one pool swim section
export function poolStats(lens, poolLength) {
  const L = +poolLength || 25, act = lens.filter(isActive);
  if (!act.length) return null;
  const swimTime = act.reduce((p, l) => p + l.dur, 0);
  const rest = lens.filter(l => !isActive(l)).reduce((p, l) => p + (l.dur || 0), 0);
  const counted = act.filter(l => l.strokes > 0 && l.stroke !== 'drill');
  const strokes = counted.reduce((p, l) => p + l.strokes, 0), strokeTime = counted.reduce((p, l) => p + l.dur, 0);
  const byStroke = {};
  for (const l of act) { const k = l.stroke || 'freestyle'; (byStroke[k] ||= { lengths: 0, dist: 0, time: 0 }); byStroke[k].lengths++; byStroke[k].dist += L; byStroke[k].time += l.dur; }
  return {
    poolLength: L, lengths: act.length, distance: act.length * L, swimTime: Math.round(swimTime * 10) / 10, rest: Math.round(rest),
    pace100: swimTime / (act.length * L) * 100,
    swolf: counted.length ? counted.reduce((p, l) => p + l.dur + l.strokes, 0) / counted.length : null,
    strokeRate: strokeTime ? strokes / strokeTime * 60 : null,           // strokes per minute, as the watch counts them
    strokesPerLength: counted.length ? strokes / counted.length : null,
    byStroke,
  };
}

// intervals: runs of active lengths separated by rests
export function poolIntervals(lens, poolLength) {
  const L = +poolLength || 25, out = []; let cur = null;
  for (const l of lens) {
    if (isActive(l)) {
      if (!cur) { cur = { start: l.t, lengths: [], rest: 0 }; out.push(cur); }
      cur.lengths.push(l);
    } else if (cur) { cur.rest += l.dur || 0; cur = null; }
    else if (out.length) out[out.length - 1].rest += l.dur || 0;
  }
  return out.map((iv, i) => {
    const time = iv.lengths.reduce((p, l) => p + l.dur, 0), dist = iv.lengths.length * L;
    const kinds = [...new Set(iv.lengths.map(l => l.stroke || 'freestyle'))];
    const counted = iv.lengths.filter(l => l.strokes > 0 && l.stroke !== 'drill');
    return { n: i + 1, start: iv.start, lengths: iv.lengths, dist, time, pace100: time / dist * 100, rest: Math.round(iv.rest),
      stroke: kinds.length === 1 ? kinds[0] : 'mixed',
      swolf: counted.length ? counted.reduce((p, l) => p + l.dur + l.strokes, 0) / counted.length : null,
      strokes: counted.reduce((p, l) => p + l.strokes, 0) || null };
  });
}

// fastest time over a distance, using only continuous swimming (consecutive active lengths, no rest in between).
// Pools that don't divide the distance exactly (e.g. 25 yd) use the next whole length and scale the time down.
export function poolBests(lens, poolLength, distances) {
  const L = +poolLength || 25, runs = []; let cur = [];
  for (const l of lens) { if (isActive(l) && l.stroke !== 'drill') cur.push(l); else { if (cur.length) runs.push(cur); cur = []; } }
  if (cur.length) runs.push(cur);
  const out = {};
  for (const [name, d] of distances) {
    const n = Math.ceil(d / L - 1e-9); let best = null;
    for (const run of runs) {
      if (run.length < n) continue;
      let sum = 0; for (let k = 0; k < n; k++) sum += run[k].dur;
      let min = sum, at = 0;
      for (let k = n; k < run.length; k++) { sum += run[k].dur - run[k - n].dur; if (sum < min) { min = sum; at = k - n + 1; } }
      const t = min * d / (n * L);
      if (!best || t < best.t) best = { t, start: run[at].t };
    }
    if (best) out[name] = best;
  }
  return out;
}

export const fmtPace = s => { if (!isFinite(s)) return '–'; s = Math.round(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
