// Thresholds as they were on the day: every activity is worked out with the athlete's settings in effect then.
//
// settings.history holds dated changes: [{ from: 'YYYY-MM-DD' | null, lthrRun, ftp, ... }] (each entry sets only the
// fields that changed). For a field on a given day the value comes from, in order:
//   1. the latest dated change on or before that day,
//   2. what the watch recorded in that activity's file (threshold HR for that sport, max HR, FTP, weight),
//   3. the value from before the first change (the entry with from = null), or else the current setting.
// Preferences that aren't physiology (zone percentages, balance flags, bike weight, riding position) always use current values.

export const PHYS = ['lthrRun', 'lthrBike', 'maxHr', 'restHr', 'ftp', 'mass', 'css'];   // css: swim threshold pace, seconds per 100 m
export const PHYS_LABEL = { lthrRun: 'Run threshold HR', lthrBike: 'Bike threshold HR', maxHr: 'Max HR', restHr: 'Resting HR', ftp: 'FTP', mass: 'Weight', css: 'Swim threshold (CSS)' };
export const PHYS_UNIT = { lthrRun: 'bpm', lthrBike: 'bpm', maxHr: 'bpm', restHr: 'bpm', ftp: 'W', mass: 'kg', css: '/100 m' };
const OK = { lthr: v => v >= 100 && v <= 220, maxHr: v => v >= 120 && v <= 230, ftp: v => v >= 50 && v <= 700, mass: v => v >= 30 && v <= 200 };

// the local calendar day of an activity, or of a timestamp
export const dayKey = (iso, offMin = 0) => new Date(Date.parse(iso) + offMin * 60000).toISOString().slice(0, 10);
export const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// values the watch recorded in the file, for the fields they can stand in for
function watchValues(sm, sport) {
  const w = {};
  if (!sm) return w;
  if (sm.lthr && OK.lthr(+sm.lthr)) { if (sport === 'run') w.lthrRun = +sm.lthr; else if (sport === 'bike') w.lthrBike = +sm.lthr; }
  if (sm.maxHr && OK.maxHr(+sm.maxHr)) w.maxHr = +sm.maxHr;
  // FTP from the watch is not used: watches often carry a default or stale figure (Carl's said 400 W), which skewed the FTP card and power-based load
  if (sm.weight && OK.mass(+sm.weight)) w.mass = +sm.weight;
  return w;
}

// settings for one activity: cfg (current settings, with history) on activity a ({ start_time, utc_offset_min, sport, summary })
// returns a copy with the physiology fields resolved, plus _src: { field: 'date:YYYY-MM-DD' | 'watch' | 'before' | 'current' }
export function settingsAt(cfg, a) {
  const out = { ...cfg }, src = {};
  const day = a?.start_time ? dayKey(a.start_time, a.utc_offset_min || 0) : todayKey();
  const hist = Array.isArray(cfg.history) ? cfg.history : [];
  const watch = a?.summary?.manual ? {} : watchValues(a?.summary, a?.sport);
  for (const f of PHYS) {
    let best = null;
    for (const e of hist) if (e.from && e.from <= day && e[f] !== undefined && (!best || e.from > best.from)) best = e;
    if (best) { out[f] = best[f]; src[f] = 'date:' + best.from; continue; }
    if (watch[f] != null) { out[f] = watch[f]; src[f] = 'watch'; continue; }
    const base = hist.find(e => !e.from && e[f] !== undefined);
    if (base) { out[f] = base[f]; src[f] = 'before'; continue; }
    src[f] = 'current';
  }
  out._src = src; out._day = day;
  return out;
}

// record changed values. from: 'YYYY-MM-DD' (applies from that day on) or null (for past activities too: replaces the
// standing value used before any dated change, where the watch didn't record one). Returns the new settings object,
// with the top-level fields set to whatever is in effect today.
export function applyChange(cfg, patch, from) {
  const next = { ...cfg }, hist = (Array.isArray(cfg.history) ? cfg.history : []).map(e => ({ ...e }));
  const changed = Object.keys(patch).filter(f => PHYS.includes(f) && patch[f] !== cfg[f]);
  for (const f of changed) {
    const has = hist.some(e => e[f] !== undefined);
    // the first time a field changes, keep its old value as the one used before the change
    if (!has && from && cfg[f] != null) { let base = hist.find(e => !e.from); if (!base) { base = { from: null }; hist.push(base); } base[f] = cfg[f]; }
    let e = hist.find(x => x.from === (from || null)); if (!e) { e = { from: from || null }; hist.push(e); }
    e[f] = patch[f];
  }
  Object.keys(patch).filter(f => !PHYS.includes(f)).forEach(f => { next[f] = patch[f]; });
  next.history = hist.filter(e => PHYS.some(f => e[f] !== undefined)).sort((a, b) => (a.from || '').localeCompare(b.from || ''));
  const now = settingsAt({ ...next, history: next.history }, null);   // today's values (no watch file)
  PHYS.forEach(f => { if (now[f] !== undefined) next[f] = now[f]; });
  return next;
}

// remove one field from one dated entry (or the whole entry when field is omitted)
export function removeChange(cfg, from, field) {
  let hist = (cfg.history || []).map(e => ({ ...e }));
  const e = hist.find(x => x.from === from); if (!e) return cfg;
  if (field) delete e[field]; else hist = hist.filter(x => x !== e);
  hist = hist.filter(x => PHYS.some(f => x[f] !== undefined));
  const next = { ...cfg, history: hist };
  const now = settingsAt(next, null); PHYS.forEach(f => { if (now[f] !== undefined) next[f] = now[f]; });
  return next;
}

// one line for notes: "your setting from 3 Mar 2026", "recorded by your watch", ...
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function srcText(s) {
  if (!s || s === 'current') return 'your setting';
  if (s === 'watch') return 'recorded by your watch';
  if (s === 'before') return 'your earlier setting';
  const [y, m, d] = s.slice(5).split('-'); return `your setting from ${+d} ${MON[+m - 1]} ${y}`;
}
