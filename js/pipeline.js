// Turning a decoded FIT file into Triven rows and files. No browser or app state in here, so the same code runs in
// the app (uploads, trims) and on the server (automatic sync from intervals.icu).
import { processFit, shareStreams, makeTrack, detectDriving, rows } from './process.js?v=1795094867';
import { loadData } from './load.js?v=1795094867';
import { perfData } from './perf.js?v=1795094867';
import { vo2FromActivity } from './vo2.js?v=1795094867';
import { DEFAULTS } from './defaults.js?v=1795094867';

// default gear: is_default_for holds roles like "run:road,run:race" (old single values 'run'/'bike' mean everyday)
export const gearRoles = g => !g.is_default_for ? [] : g.is_default_for === 'run' ? ['run:road'] : g.is_default_for === 'bike' ? ['bike:road'] : g.is_default_for.split(',').filter(Boolean);
export function pickGearFrom(gear, sport, env, race) {
  if (sport !== 'run' && sport !== 'bike') return null;
  const live = (gear || []).filter(g => !g.retired), has = role => live.find(g => gearRoles(g).includes(role))?.id;
  const e = env === 'virtual' ? 'indoor' : env;
  return (race && has(`${sport}:race`)) || (e && e !== 'road' && has(`${sport}:${e}`)) || has(`${sport}:road`) || null;
}

// VO2 max per activity (threshold-and-above stretches only); v:2 marks the current method
export function vo2Summary(sections, streams, weight, settings) {
  const FIT = { run: 'running', bike: 'cycling', swim: 'swimming', transition: 'transition', other: 'other' };
  const Sx = sections.map(s => ({ sport: FIT[s.sport], start: +s.start_offset_s, elapsed: +s.elapsed_s, env: s.summary?.env }));
  const c = Object.assign({}, DEFAULTS, settings || {});
  const v = vo2FromActivity(Sx, rows(streams), { maxHr: c.maxHr, restHr: c.restHr, lthrRun: c.lthrRun, lthrBike: c.lthrBike, mass: weight || c.mass }, 'power', false);
  return { run: v.run ? +v.run.value.toFixed(1) : null, bike: v.bike ? +v.bike.value.toFixed(1) : null, v: 2 };
}

// extras worked out for every processed activity: VO2 max, route thumbnail, possible driving, load and threshold data
export function enrichOut(out, settings) {
  try { out.activity.summary.vo2 = vo2Summary(out.sections, out.streams, out.activity.summary.weight, settings); } catch (e) { /* optional */ }
  out.activity.summary.track = makeTrack(out.streams, out.sections);
  out.activity.summary.driving = detectDriving(out.sections, out.streams);
  out.activity.summary.loadData = loadData(out.sections, out.streams);
  out.activity.summary.perf = perfData(out.sections, out.streams);
}

export const DEFAULT_SHARE = { map: true, hr: true, power: true, pace: true, cadence: true, dynamics: true, description: true };
const jsonBlob = o => new Blob([JSON.stringify(o)], { type: 'application/json' });

// streams files, then sections / laps / best efforts (replacing any existing ones)
export async function saveProcessed(sb, uid, id, out, share, gearBySport, replace) {
  const base = `${uid}/${id}`;
  const ups = await Promise.all([
    sb.storage.from('activity-streams').upload(`${base}.full.json`, jsonBlob(out.streams), { upsert: replace }),
    sb.storage.from('activity-streams').upload(`${base}.json`, jsonBlob(shareStreams(out.streams, share)), { upsert: replace }),
  ]);
  const upErr = ups.find(u => u.error); if (upErr) throw upErr.error;
  if (replace) {
    const del = await Promise.all(['activity_sections', 'activity_laps', 'best_efforts'].map(t => sb.from(t).delete().eq('activity_id', id)));
    const e = del.find(x => x.error); if (e) throw e.error;
  }
  const multi = out.activity.sport === 'multi';
  const secs = out.sections.map(s => ({ ...s, activity_id: id, gear_id: multi && (s.sport === 'run' || s.sport === 'bike') ? gearBySport(s.sport, s.idx) : null }));
  const res = await Promise.all([
    sb.from('activity_sections').insert(secs),
    out.laps.length ? sb.from('activity_laps').insert(out.laps.map(l => ({ ...l, activity_id: id }))) : { error: null },
    out.bests.length ? sb.from('best_efforts').insert(out.bests.map(b => ({ ...b, activity_id: id, owner: uid }))) : { error: null },
  ]);
  const err = res.find(x => x.error); if (err) throw err.error;
}

// a whole new activity from a decoded file. profile = the owner's profiles row, gear = their gear rows.
// Returns { status: 'ok' | 'skip' | 'notact', id, activity, settings } (settings is set when the watch filled in thresholds).
export async function importDecoded(sb, { uid, messages, errors, raw, source, profile, gear, extra }) {
  if (!messages.sessionMesgs?.length) return { status: 'notact' };
  if (errors?.length && !messages.recordMesgs?.length) throw new Error('file is damaged');
  const out = processFit(messages, { source });
  // the same file arriving twice (upload and sync, or two syncs) is kept once
  const dup = await sb.from('activities').select('id').eq('owner', uid).eq('source_id', out.activity.source_id).maybeSingle();
  if (dup.data) return { status: 'skip', id: dup.data.id };
  // first activity fills athlete settings from the watch if they were never set
  let st = { ...(profile.settings || {}) }, settingsChanged = false;
  if (!st.fromWatch && out.activity.summary.lthr) {
    const lthr = out.activity.summary.lthr;
    Object.assign(st, { lthrRun: lthr, lthrBike: lthr - 5, maxHr: out.activity.summary.maxHr || st.maxHr, mass: st.massSet ? st.mass : (out.activity.summary.weight || st.mass), fromWatch: true });
    const r = await sb.from('profiles').update({ settings: st }).eq('id', uid); if (!r.error) settingsChanged = true;
  }
  enrichOut(out, st);
  const a = out.activity;
  if (extra) Object.assign(a.summary, extra);
  if (a.sport === 'run' || a.sport === 'bike') a.gear_id = pickGearFrom(gear, a.sport, out.sections.find(s => s.sport === a.sport)?.summary?.env, false);
  a.owner = uid; a.visibility = profile.default_visibility || 'club'; a.share = profile.default_share || DEFAULT_SHARE;
  const ins = await sb.from('activities').insert(a).select('id').single();
  if (ins.error) throw ins.error;
  const id = ins.data.id, base = `${uid}/${id}`;
  const up = await sb.storage.from('activity-files').upload(`${base}.fit`, new Blob([raw], { type: 'application/octet-stream' }), { upsert: true });
  if (up.error) throw up.error;
  await saveProcessed(sb, uid, id, out, a.share, (sp, idx) => pickGearFrom(gear, sp, out.sections[idx]?.summary?.env, false), false);
  const r2 = await sb.from('activities').update({ file_path: `${base}.fit`, streams_path: `${base}.json` }).eq('id', id); if (r2.error) throw r2.error;
  return { status: 'ok', id, activity: a, settings: settingsChanged ? st : null };
}
