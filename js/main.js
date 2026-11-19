import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.1/+esm';
import { decodeFit } from './fit.js?v=1795084432';
import JSZip from 'https://cdn.jsdelivr.net/npm/jszip@3.10.2/+esm';
import { processFit, shareStreams, rows, makeTrack, detectDriving } from './process.js?v=1795084432';
import { vo2FromActivity } from './vo2.js?v=1795084432';
import { mountActivity } from './activity.js?v=1795084432';
import { mountLog } from './log.js?v=1795084432';
import { mountGear } from './gear.js?v=1795084432';
import { mountClub } from './club.js?v=1795084432';
import { mountFeed } from './feed.js?v=1795084432';
import { initSettings } from './settings.js?v=1795084432';
import './edit.js';

// Public project settings. The publishable key is safe in the browser: row level security decides what each user can read or write.
const SUPABASE_URL = 'https://ksubeokekwflqnmzsune.supabase.co';
const SUPABASE_KEY = 'sb_publishable_gBU60hkphcU9T97Cn1Bvmw_QMIFFy3i';
export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = id => document.getElementById(id);
const VIEWS = ['auth', 'loading', 'feed', 'log', 'activity', 'upload', 'gear', 'club'];
export const state = { user: null, profile: null, activities: [], gear: [], bests: [], loaded: false };

export function toast(msg, ms = 3200) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => t.hidden = true, ms); }
function show(v) {
  VIEWS.forEach(x => { const el = $('view-' + x); if (el) el.hidden = x !== v; });
  ['feed', 'log', 'upload', 'gear', 'club', 'activity'].forEach(x => $('tab-' + x)?.setAttribute('aria-selected', x === v));
  $('tabs').hidden = v === 'auth' || v === 'loading'; $('acct').hidden = !state.user;
}

// ---------- auth ----------
let signUp = false;
$('authSwitch').onclick = e => { e.preventDefault(); signUp = !signUp; $('nameRow').hidden = !signUp; $('authTitle').textContent = signUp ? 'Create your account' : 'Sign in';
  $('authGo').textContent = signUp ? 'Create account' : 'Sign in'; $('authSwitch').textContent = signUp ? 'Already have an account? Sign in' : 'New to Triven? Create an account';
  $('authPass').autocomplete = signUp ? 'new-password' : 'current-password'; $('authMsg').textContent = ''; };
$('authForm').onsubmit = async e => {
  e.preventDefault(); $('authGo').disabled = true; $('authMsg').textContent = '';
  const email = $('authEmail').value.trim(), password = $('authPass').value;
  const res = signUp ? await sb.auth.signUp({ email, password, options: { data: { display_name: $('authName').value.trim() || undefined } } })
                     : await sb.auth.signInWithPassword({ email, password });
  $('authGo').disabled = false;
  if (res.error) { $('authMsg').textContent = res.error.message; return; }
  $('authPass').value = '';
};
$('signOut').onclick = async () => { await sb.auth.signOut(); };

sb.auth.onAuthStateChange((_evt, session) => {
  const u = session?.user || null;
  if (u?.id === state.user?.id) return;
  state.user = u; state.loaded = false;
  if (!u) { show('auth'); return; }
  boot();
});

async function boot() {
  show('loading');
  await loadAll();
  $('acctName').textContent = state.profile?.display_name || state.user.email;
  route();
  backfill();
}
let backfilled = false;
async function backfill() {
  if (backfilled) return; backfilled = true;
  const todo = state.activities.filter(a => !a.summary || !('track' in a.summary));
  for (const a of todo) {
    try { const d = await fetchActivity(a.id); if (!d.streams) continue;
      const sm = { ...d.act.summary, track: makeTrack(d.streams, d.sections), driving: detectDriving(d.sections, d.streams) };
      await sb.from('activities').update({ summary: sm }).eq('id', a.id); a.summary = sm; } catch (e) { /* try again next visit */ }
  }
}

// ---------- data ----------
export async function loadAll() {
  const uid = state.user.id;
  const [p, a, g, b] = await Promise.all([
    sb.from('profiles').select('*').eq('id', uid).single(),
    sb.from('activities').select('id,name,description,sport,multisport_profile,start_time,utc_offset_min,distance_m,elapsed_s,moving_s,ascent_m,calories,avg_hr,indoor,gear_id,source,visibility,share,summary,activity_sections(idx,sport,elapsed_s,distance_m,ascent_m,gear_id)').eq('owner', uid).order('start_time'),
    sb.from('gear').select('*').eq('owner', uid).order('created_at'),
    sb.from('best_efforts').select('*').eq('owner', uid),
  ]);
  for (const r of [p, a, g, b]) if (r.error) { toast('Could not load your data: ' + r.error.message, 6000); }
  state.profile = p.data; state.activities = a.data || []; state.gear = g.data || []; state.bests = b.data || []; state.loaded = true;
}
initSettings(() => state.profile?.settings, async cfg => { await saveSettings(cfg); if (!$('view-activity').hidden && window.__actApply) window.__actApply(cfg); });
export async function saveSettings(cfg) {
  state.profile.settings = cfg;
  const { error } = await sb.from('profiles').update({ settings: cfg }).eq('id', state.user.id);
  toast(error ? 'Settings not saved: ' + error.message : 'Settings saved');
}

// usage per gear item: whole activities plus multisport sections assigned to it
export function gearUsage() {
  return state.gear.map(g => {
    let m = 0, uses = 0;
    for (const a of state.activities) {
      const secs = (a.activity_sections || []).filter(s => s.gear_id === g.id);
      if (secs.length) { m += secs.reduce((x, s) => x + (+s.distance_m || 0), 0); uses++; }
      else if (a.gear_id === g.id) { m += +a.distance_m || 0; uses++; }
    }
    return { ...g, used_m: m, uses };
  });
}

function logData() {
  const acts = state.activities.map(a => {
    const local = new Date(Date.parse(a.start_time) + a.utc_offset_min * 60000).toISOString().slice(0, 19);
    const secs = (a.activity_sections || []).slice().sort((x, y) => x.idx - y.idx);
    return { id: a.id, name: a.name, start: local, sport: a.sport === 'other' ? 'run' : a.sport, dist: +a.distance_m, moving: +(a.moving_s ?? a.elapsed_s), elapsed: +a.elapsed_s,
      elev: +(a.ascent_m || 0), indoor: a.indoor, gear: a.gear_id, cal: a.calories, source: a.source === 'upload' ? 'Upload' : a.source, detail: true, profile: a.multisport_profile, vo2: a.summary?.vo2 || null,
      sections: secs.map(s => ({ sport: s.sport === 'transition' ? 'trans' : s.sport, dist: +s.distance_m || 0, elapsed: +s.elapsed_s, elev: +s.ascent_m || 0 })) };
  });
  return { activities: acts, gear: gearUsage(), bests: state.bests, mass: state.profile?.settings?.mass, age: state.profile?.settings?.age };
}

// ---------- routing ----------
async function route() {
  if (!state.user) return show('auth');
  if (!state.loaded) return;
  const h = location.hash || '#feed';
  $('tab-activity').hidden = true;
  if (h.startsWith('#a/')) return openActivity(h.slice(3).split('?')[0]);
  if (h === '#feed' || h.startsWith('#feed/')) { show('feed'); return mountFeed(h.split('/')[1] || 'me'); }
  if (h === '#upload') { show('upload'); return; }
  if (h === '#gear') { show('gear'); mountGear(); return; }
  if (h === '#club') { show('club'); mountClub(); return; }
  show('log');
  mountLog(logData());
  emptyHint();
}
function emptyHint() {
  let el = $('emptyHint');
  if (state.activities.length) { el?.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'emptyHint'; el.className = 'card empty'; el.style.marginBottom = '16px';
    el.innerHTML = '<h2>No activities yet</h2><p class="sec">Add your first .fit file, or a whole Garmin export, to fill your log.</p><a class="btn primary" href="#upload" style="text-decoration:none">Upload activities</a>';
    $('view-log').prepend(el); }
}
window.addEventListener('hashchange', route);

// ---------- one activity ----------
const SPORT_FIT = { run: 'running', bike: 'cycling', swim: 'swimming', transition: 'transition', other: 'other' };
export async function fetchActivity(id) {
  const [a, s, l] = await Promise.all([
    sb.from('activities').select('*').eq('id', id).single(),
    sb.from('activity_sections').select('*').eq('activity_id', id).order('idx'),
    sb.from('activity_laps').select('*').eq('activity_id', id).order('idx'),
  ]);
  if (a.error || !a.data) {
    // not ours: read it through the sharing-aware function
    const v = await sb.rpc('view_activity', { aid: id });
    if (v.error || !v.data) throw (v.error || new Error('not visible'));
    const { act, sections, laps } = v.data;
    let streams = null;
    if (act.streams_path) { const dl = await sb.storage.from('activity-streams').download(act.streams_path); if (!dl.error) streams = JSON.parse(await dl.data.text()); }
    const ex = await sb.rpc('activity_extras', { aid: id });
    return { act, sections, laps, streams, media: ex.data?.media || [] };
  }
  const act = a.data, path = act.owner === state.user.id ? act.streams_path?.replace(/\.json$/, '.full.json') : act.streams_path;
  let streams = null;
  const [dl, md] = await Promise.all([path ? sb.storage.from('activity-streams').download(path) : { error: true }, sb.from('activity_media').select('*').eq('activity_id', id).order('position')]);
  if (!dl.error) streams = JSON.parse(await dl.data.text());
  return { act, sections: s.data || [], laps: l.data || [], streams, media: md.data || [] };
}
export function toRaw({ act, sections, laps, streams }) {
  const sm = act.summary || {};
  return {
    sessions: sections.map(s => ({ sport: SPORT_FIT[s.sport] || 'other', start: +s.start_offset_s, elapsed: +s.elapsed_s, timer: +s.timer_s, dist: +s.distance_m || 0,
      avgHr: s.avg_hr, maxHr: s.max_hr, ascent: s.ascent_m, descent: s.summary?.descent, avgSpeed: s.avg_speed, maxSpeed: s.summary?.maxSpeed,
      avgPower: s.avg_power, maxPower: s.summary?.maxPower, avgCad: s.avg_cadence, cal: s.summary?.calories, avgGct: s.summary?.avgGct, avgVo: s.summary?.avgVo,
      avgStride: s.summary?.avgStride, te: s.summary?.te, ate: s.summary?.ate, hrZones: [], lthr: sm.lthr, maxHrSet: sm.maxHr })),
    laps: laps.map(l => ({ sport: SPORT_FIT[l.sport] || 'other', start: +l.start_offset_s, elapsed: +l.elapsed_s, dist: +l.distance_m || 0, avgHr: l.avg_hr, maxHr: l.max_hr,
      avgSpeed: l.avg_speed, avgPower: l.avg_power, ascent: l.ascent_m })),
    recordFields: streams ? streams.fields : ['t'],
    records: streams ? rows(streams).map(o => streams.fields.map(f => o[f])) : [],
    meta: { start: act.start_time, device: act.device, sensors: [], utcOffsetH: act.utc_offset_min / 60, weight: act.summary?.weight || null },
  };
}
async function openActivity(id) {
  show('loading');
  let data;
  try { data = await fetchActivity(id); } catch (e) { toast('Could not open that activity'); location.hash = '#log'; return; }
  const { act } = data;
  const tab = $('tab-activity'); tab.hidden = false; tab.href = location.hash;
  const d = new Date(Date.parse(act.start_time) + act.utc_offset_min * 60000);
  tab.textContent = `${act.name} · ${d.getUTCDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  show('activity');
  renderActHeader(act, data.sections);
  if (!data.streams) toast('This activity has no detailed data file.', 4000);
  mountActivity(toRaw(data), state.profile?.settings);
  document.dispatchEvent(new CustomEvent('triven:activity', { detail: data }));
}
export function renderActHeader(act, sections) {
  $('actName').textContent = act.name;
  $('actDesc').textContent = act.description || '';
  const tags = $('actTags'); tags.replaceChildren();
  const T = { run: 'Run', bike: 'Ride', swim: 'Swim', other: 'Workout' };
  const add = t => { const s = document.createElement('span'); s.className = 'tag'; s.textContent = t; tags.append(s); };
  if (act.sport === 'multi') { add(act.multisport_profile === 'other' ? 'Multisport' : act.multisport_profile); add(sections.filter(s => s.sport !== 'transition').map(s => T[s.sport] === 'Ride' ? 'Bike' : T[s.sport]).join(' · ')); }
  else add(T[act.sport] || 'Workout');
  if (act.athlete && act.owner !== state.user.id) add(act.athlete);
  if (act.indoor) add('Indoor');
  add({ private: 'Only you', club: 'Club', public: 'Public' }[act.visibility]);
}

// ---------- upload ----------
const drop = $('drop');
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => handleFiles([...e.dataTransfer.files]));
$('fileIn').onchange = e => { handleFiles([...e.target.files]); e.target.value = ''; };

function upRow(name) {
  const r = document.createElement('div'); r.className = 'uprow'; const n = document.createElement('span'); n.textContent = name;
  const st = document.createElement('span'); st.className = 'st'; st.textContent = 'Waiting'; r.append(n, st); $('upList').prepend(r);
  return { set(t, cls) { st.textContent = t; if (cls) r.className = 'uprow ' + cls; } };
}
async function* fitEntries(files) {
  for (const f of files) {
    if (/\.zip$/i.test(f.name)) yield* zipEntries(await JSZip.loadAsync(f), f.name);
    else if (/\.fit$/i.test(f.name)) yield { name: f.name, data: new Uint8Array(await f.arrayBuffer()) };
  }
}
async function* zipEntries(zip, label) {
  for (const e of Object.values(zip.files)) {
    if (e.dir) continue;
    if (/\.fit$/i.test(e.name)) yield { name: e.name.split('/').pop(), data: await e.async('uint8array') };
    else if (/\.zip$/i.test(e.name)) yield* zipEntries(await JSZip.loadAsync(await e.async('uint8array')), e.name);
  }
}
let busy = false;
async function handleFiles(files) {
  if (busy) { toast('Already importing; wait for it to finish.'); return; }
  busy = true; let added = 0, skipped = 0, failed = 0, notActivity = 0;
  const summaryRow = upRow(`Importing ${files.length} file${files.length > 1 ? 's' : ''}`);
  try {
    for await (const ent of fitEntries(files)) {
      const row = upRow(ent.name);
      try {
        const res = await importFit(ent, row);
        if (res === 'skip') skipped++; else if (res === 'notact') notActivity++; else added++;
      } catch (e) { failed++; row.set('Failed: ' + (e.message || e), 'err'); }
      summaryRow.set(`${added} added · ${skipped} already in Triven · ${failed} failed`);
    }
  } finally { busy = false; }
  summaryRow.set(`Done: ${added} added · ${skipped} already in Triven${notActivity ? ` · ${notActivity} non-activity files ignored` : ''}${failed ? ` · ${failed} failed` : ''}`, failed ? 'err' : 'ok');
  if (added) { await loadAll(); toast(`${added} ${added === 1 ? 'activity' : 'activities'} added`); }
}

// extras worked out for every processed activity: VO2 max, route thumbnail, possible driving
export function enrich(out) {
  try {
    const FIT = { run: 'running', bike: 'cycling', swim: 'swimming', transition: 'transition', other: 'other' };
    const Sx = out.sections.map(s => ({ sport: FIT[s.sport], start: s.start_offset_s, elapsed: s.elapsed_s }));
    const cfgv = state.profile.settings || {};
    const v = vo2FromActivity(Sx, rows(out.streams), { maxHr: cfgv.maxHr || 175, restHr: cfgv.restHr || 50, mass: out.activity.summary.weight || cfgv.mass || 75 }, 'power', false);
    out.activity.summary.vo2 = { run: v.run ? +v.run.value.toFixed(1) : null, bike: v.bike ? +v.bike.value.toFixed(1) : null };
  } catch (e) { /* estimate is optional */ }
  out.activity.summary.track = makeTrack(out.streams, out.sections);
  out.activity.summary.driving = detectDriving(out.sections, out.streams);
}
const jsonBlob = o => new Blob([JSON.stringify(o)], { type: 'application/json' });
// write streams, sections, laps and bests for an activity (new, or replacing after a trim)
export async function writeProcessed(id, out, share, gearBySport, replace) {
  const base = `${state.user.id}/${id}`;
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
    out.bests.length ? sb.from('best_efforts').insert(out.bests.map(b => ({ ...b, activity_id: id }))) : { error: null },
  ]);
  const err = res.find(x => x.error); if (err) throw err.error;
}

export async function importFit(ent, row) {
  const { messages, errors } = decodeFit(ent.data);
  if (!messages.sessionMesgs?.length) { row.set('Not an activity (skipped)'); return 'notact'; }
  if (errors?.length && !messages.recordMesgs?.length) throw new Error('file is damaged');
  const out = processFit(messages, { source: /^\d+_ACTIVITY\.fit$/i.test(ent.name) ? 'garmin_export' : 'upload' });
  const uid = state.user.id;
  // skip duplicates
  const dup = await sb.from('activities').select('id').eq('owner', uid).eq('source_id', out.activity.source_id).maybeSingle();
  if (dup.data) { row.set('Already in Triven', 'ok'); return 'skip'; }
  // first upload fills athlete settings from the watch if they were never set
  const st = state.profile.settings || {};
  if (!st.fromWatch && out.activity.summary.lthr) {
    const lthr = out.activity.summary.lthr;
    Object.assign(st, { lthrRun: lthr, lthrBike: lthr - 5, maxHr: out.activity.summary.maxHr || st.maxHr, mass: st.massSet ? st.mass : (out.activity.summary.weight || st.mass), fromWatch: true });
    await sb.from('profiles').update({ settings: st }).eq('id', uid); state.profile.settings = st;
  }
  enrich(out);
  const defGear = sp => state.gear.find(g => !g.retired && g.is_default_for === sp)?.id || null;
  const a = out.activity;
  if (a.sport === 'run' || a.sport === 'bike') a.gear_id = defGear(a.sport);
  a.visibility = state.profile.default_visibility; a.share = state.profile.default_share;
  row.set('Saving');
  const ins = await sb.from('activities').insert(a).select('id').single();
  if (ins.error) throw ins.error;
  const id = ins.data.id, base = `${uid}/${id}`;
  const up = await sb.storage.from('activity-files').upload(`${base}.fit`, new Blob([ent.data], { type: 'application/octet-stream' }));
  if (up.error) throw up.error;
  await writeProcessed(id, out, a.share, defGear, false);
  const r2 = await sb.from('activities').update({ file_path: `${base}.fit`, streams_path: `${base}.json` }).eq('id', id); if (r2.error) throw r2.error;
  const drv = a.summary.driving?.length ? ' · looks like it includes driving, check it' : '';
  row.set(`Added: ${a.name}, ${(a.distance_m / 1000).toFixed(1)} km${drv}`, 'ok');
  return 'ok';
}

// start
(async () => {
  const { data } = await sb.auth.getSession();
  if (!data.session) show('auth');
})();
