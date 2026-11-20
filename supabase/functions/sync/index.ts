// Triven sync: fetch new activities from connected services and import them.
//  - every 10 minutes from pg_cron (header x-sync-secret): check every connection, then process waiting files one per
//    request so each gets its own CPU budget
//  - from the app (signed-in user's token, body {mode:'mine'}): check that user's connection; the app processes the files
// The import code is the same module the app uses, loaded from the GitHub repo at a fixed commit.
import { createClient } from 'npm:@supabase/supabase-js@2.119.1';
import { Decoder, Stream } from 'npm:@garmin/fitsdk@21.222.0';
import { importDecoded } from 'https://cdn.jsdelivr.net/gh/triven-fit/triven@bd09d1edea5932d43cb335e6c2c91024ce016895/js/pipeline.js';

const BASE = Deno.env.get('SUPABASE_URL')!;
const secretKey = (() => { try { return JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}').default; } catch { return null; } })() || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(BASE, secretKey, { auth: { persistSession: false } });
const ICU = 'https://intervals.icu/api/v1';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-secret', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const msg = (e: unknown) => String((e as Error)?.message || e);

function decode(bytes: Uint8Array) {
  const dec = new Decoder(Stream.fromByteArray(bytes));
  if (!dec.isFIT()) throw new Error('not a FIT file');
  return dec.read({ convertDateTimesToDates: true, expandComponents: true, mergeHeartRates: true, applyScaleAndOffset: true, expandSubFields: true, convertTypesToStrings: true });
}
async function gunzipMaybe(buf: Uint8Array) {
  if (buf[0] !== 0x1f || buf[1] !== 0x8b) return buf;
  const out = await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  return new Uint8Array(out);
}
const isFit = (b: Uint8Array | null) => !!b && b.length > 12 && String.fromCharCode(b[8], b[9], b[10], b[11]) === '.FIT';

// list the athlete's recent intervals.icu activities and put any new ones (as FIT files) in the inbox
async function fetchNew(conn: any, key: string) {
  const auth = { Authorization: 'Basic ' + btoa('API_KEY:' + key) };
  const since = conn.last_sync ? Date.parse(conn.last_sync) - 3 * 864e5 : Date.parse(conn.created_at) - 14 * 864e5;
  const oldest = new Date(since).toISOString().slice(0, 10);
  const r = await fetch(`${ICU}/athlete/${encodeURIComponent(conn.athlete_id || '0')}/activities?oldest=${oldest}`, { headers: auth });
  if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? 'intervals.icu refused the athlete ID or API key' : `intervals.icu returned ${r.status}`);
  const list: any[] = await r.json();
  if (!list.length) return 0;
  const { data: seen } = await admin.from('sync_inbox').select('external_id').eq('owner', conn.owner).eq('provider', 'intervals').in('external_id', list.map(a => String(a.id)));
  const have = new Set((seen || []).map((x: any) => x.external_id));
  let added = 0;
  for (const a of list) {
    const ext = String(a.id); if (have.has(ext)) continue;
    const row = { owner: conn.owner, provider: 'intervals', external_id: ext, name: a.name || null, start_time: a.start_date || a.start_date_local || null };
    // Strava's terms stop intervals.icu passing on activities it got from Strava
    if (String(a.source || '').toUpperCase() === 'STRAVA') { await admin.from('sync_inbox').insert({ ...row, status: 'skip', error: 'came from Strava' }); continue; }
    let bytes: Uint8Array | null = null;
    const f = await fetch(`${ICU}/activity/${ext}/file`, { headers: auth });
    if (f.ok) bytes = await gunzipMaybe(new Uint8Array(await f.arrayBuffer()));
    if (!isFit(bytes)) {   // GPX/TCX originals: intervals.icu can give a FIT version
      const g = await fetch(`${ICU}/activity/${ext}/fit-file`, { headers: auth });
      bytes = g.ok ? await gunzipMaybe(new Uint8Array(await g.arrayBuffer())) : null;
    }
    if (!isFit(bytes)) { await admin.from('sync_inbox').insert({ ...row, status: 'notfit', error: 'no activity file available' }); continue; }
    const path = `${conn.owner}/inbox/intervals-${ext}.fit`;
    const up = await admin.storage.from('activity-files').upload(path, new Blob([bytes!]), { upsert: true, contentType: 'application/octet-stream' });
    if (up.error) throw up.error;
    const ins = await admin.from('sync_inbox').insert({ ...row, file_path: path });
    if (!ins.error) added++;
  }
  return added;
}

async function processOne(id: string) {
  const { data: it } = await admin.from('sync_inbox').select('*').eq('id', id).single();
  if (!it || it.status !== 'new') return it?.status || 'missing';
  await admin.from('sync_inbox').update({ attempts: it.attempts + 1 }).eq('id', id);   // counts even if this run is cut off
  const dl = await admin.storage.from('activity-files').download(it.file_path);
  if (dl.error) throw dl.error;
  const raw = new Uint8Array(await dl.data.arrayBuffer());
  const { messages, errors } = decode(raw);
  const [{ data: profile }, { data: gear }] = await Promise.all([
    admin.from('profiles').select('*').eq('id', it.owner).single(),
    admin.from('gear').select('*').eq('owner', it.owner),
  ]);
  const r = await importDecoded(admin, { uid: it.owner, messages, errors, raw, source: 'intervals', profile, gear: gear || [], extra: { external: { intervals: it.external_id } } });
  await admin.from('sync_inbox').update({ status: r.status === 'ok' ? 'done' : r.status === 'skip' ? 'skip' : 'failed', activity_id: r.id || null, error: r.status === 'notact' ? 'not an activity' : null }).eq('id', id);
  if (r.status === 'ok' || r.status === 'skip') await admin.storage.from('activity-files').remove([it.file_path]);
  if (r.status === 'ok') {
    const { data: c } = await admin.from('connections').select('imported').eq('owner', it.owner).eq('provider', 'intervals').single();
    if (c) await admin.from('connections').update({ imported: (c.imported || 0) + 1 }).eq('owner', it.owner).eq('provider', 'intervals');
  }
  return r.status;
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const body = await req.json().catch(() => ({}));
  const secret = req.headers.get('x-sync-secret');
  let cron = false;
  if (secret) {
    const { data } = await admin.rpc('sync_secret_ok', { s: secret });
    if (!data) return json({ error: 'bad secret' }, 401);
    cron = true;
  }
  if (cron && body.mode === 'one') {
    try { return json({ result: await processOne(body.id) }); }
    catch (e) { await admin.from('sync_inbox').update({ error: msg(e) }).eq('id', body.id); return json({ error: msg(e) }, 500); }
  }
  let owners: string[] | null = null;
  if (!cron) {
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: { user } } = await admin.auth.getUser(jwt);
    if (!user) return json({ error: 'sign in first' }, 401);
    owners = [user.id];
  }
  let q = admin.from('connections').select('*').eq('provider', 'intervals');
  if (owners) q = q.in('owner', owners);
  const { data: conns } = await q;
  const report: any[] = [];
  for (const c of conns || []) {
    const { data: sec } = await admin.from('connection_secrets').select('secret').eq('owner', c.owner).eq('provider', 'intervals').single();
    if (!sec) continue;
    try {
      const added = await fetchNew(c, sec.secret);
      await admin.from('connections').update({ last_sync: new Date().toISOString(), last_error: null, status: 'ok' }).eq('owner', c.owner).eq('provider', 'intervals');
      report.push({ added });
    } catch (e) {
      await admin.from('connections').update({ last_error: msg(e), status: 'error', last_sync: new Date().toISOString() }).eq('owner', c.owner).eq('provider', 'intervals');
      report.push({ error: msg(e) });
    }
  }
  if (cron) {
    const { data: items } = await admin.from('sync_inbox').select('id').eq('status', 'new').lt('attempts', 2).order('created_at').limit(8);
    for (const it of items || []) {
      await fetch(`${BASE}/functions/v1/sync`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-sync-secret': secret! }, body: JSON.stringify({ mode: 'one', id: it.id }) }).catch(() => {});
    }
  }
  return json({ ok: true, checked: report.length, report });
});
