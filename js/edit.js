// Edit an activity: name, description, visibility, shared fields, gear (per section for multisport), delete. Plus comments.
import { sb, state, toast, loadAll, renderActHeader, fetchActivity } from './main.js?v=1795084583';
import { shareStreams } from './process.js?v=1795084583';
import { openTrim } from './trim.js?v=1795084583';
import { openIg } from './ig.js?v=1795084583';

const $ = id => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); kids.forEach(k => e.append(k)); return e; };
const SHARE = [['map', 'Map and route'], ['pace', 'Pace and speed'], ['hr', 'Heart rate'], ['power', 'Power'], ['cadence', 'Cadence'], ['dynamics', 'Running dynamics (ground contact, balance, oscillation)'], ['description', 'Description']];
const SPORTNAME = { run: 'Run', bike: 'Bike', swim: 'Swim' };
let cur = null;

export function openModal(build) {
  const ov = $('modal'), body = $('modalBody'); body.replaceChildren(); body.className = 'sheet'; build(body, () => { ov.classList.remove('open'); body.querySelectorAll('video').forEach(v => v.pause()); }); ov.classList.add('open');
}
document.addEventListener('DOMContentLoaded', () => {});
const ov = $('modal');
ov.addEventListener('click', e => { if (e.target === ov) ov.classList.remove('open'); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') ov.classList.remove('open'); });

document.addEventListener('triven:activity', e => {
  cur = e.detail;
  const mine = cur.act.owner === state.user.id;
  const reopen = () => { location.hash = '#a/' + cur.act.id + '?' + Date.now(); };
  const tools = $('actTools'); tools.replaceChildren();
  if (mine) tools.append(el('button', { className: 'btn sm', textContent: 'Edit', onclick: () => openEditor(cur, reopen) }));
  if (mine && cur.streams) tools.append(el('button', { className: 'btn sm', textContent: 'Trim', onclick: () => openTrim(cur, reopen) }));
  if (mine) tools.append(el('button', { className: 'btn sm primary', textContent: 'Instagram post', onclick: () => igFor(cur) }));
  // driving warning
  const warn = $('actWarn'); warn.replaceChildren(); warn.hidden = true;
  const drv = cur.act.summary?.driving || [];
  if (mine && drv.length) {
    warn.hidden = false;
    const d = drv[drv.length - 1];
    warn.append(el('span', { className: 'ic', textContent: '!' }), el('div', {}, el('b', { textContent: 'This looks like it includes driving. ' }),
      document.createTextNode(`${drv.length === 1 ? 'One stretch' : drv.length + ' stretches'} at car speed, up to ${Math.max(...drv.map(x => x.maxKmh))} km/h${d.atEnd ? ', at the end' : d.atStart ? ', at the start' : ''}. Forgot to stop the watch?`)),
      el('button', { className: 'btn sm', textContent: 'Trim it', onclick: () => openTrim(cur, reopen) }),
      el('button', { className: 'linkbtn', textContent: 'It was fine', onclick: async () => { const sm = { ...cur.act.summary, driving: [] }; await sb.from('activities').update({ summary: sm }).eq('id', cur.act.id); cur.act.summary = sm; warn.hidden = true; } }));
  }
  // private notes (owner only)
  const nb = $('actNotes'); nb.hidden = !(mine && cur.act.notes); nb.replaceChildren();
  if (mine && cur.act.notes) nb.append(el('div', { className: 'sec', style: 'font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em', textContent: 'Private notes · only you see these' }), el('div', { className: 'cbody', textContent: cur.act.notes }));
  renderGallery(cur.media || []);
  renderComments();
});

export async function mediaUrls(list) {
  if (!list.length) return [];
  const { data } = await sb.storage.from('activity-media').createSignedUrls(list.map(m => m.path), 3600);
  return list.map((m, i) => ({ ...m, url: data?.[i]?.signedUrl || null }));
}
async function igFor(d) {
  const photos = (await mediaUrls((d.media || []).filter(m => m.kind === 'photo'))).filter(p => p.url);
  const { data: comp } = await sb.rpc('companions', { aid: d.act.id });
  openIg({ ...d.act, sections: d.sections, track: d.act.summary?.track || null }, photos, comp || [],
    () => openEditor(d, () => { location.hash = '#a/' + d.act.id + '?' + Date.now(); }));
}
async function renderGallery(list) {
  const box = $('mediacard'); box.replaceChildren(); box.hidden = !list.length; if (!list.length) return;
  const items = await mediaUrls(list);
  const grid = el('div', { className: 'gallery' });
  items.forEach(m => {
    const t = m.kind === 'video' ? el('video', { src: m.url, muted: true, playsInline: true, preload: 'metadata' }) : el('img', { src: m.url, alt: '', loading: 'lazy' });
    grid.append(el('button', { className: 'gitem' + (m.kind === 'video' ? ' vid' : ''), type: 'button', onclick: () => lightbox(m) }, t));
  });
  box.append(grid);
}
export function lightbox(m) {
  openModal((body, close) => { body.classList.add('lb'); body.append(m.kind === 'video' ? el('video', { src: m.url, controls: true, autoplay: true, playsInline: true }) : el('img', { src: m.url, alt: '' }), el('div', { className: 'actions' }, el('span'), el('button', { className: 'btn', textContent: 'Close', onclick: close }))); });
}

function gearSelect(kind, value) {
  const s = el('select');
  s.append(el('option', { value: '', textContent: kind === 'bike' ? 'No bike' : 'No shoes' }));
  state.gear.filter(g => g.kind === kind && (!g.retired || g.id === value)).forEach(g => s.append(el('option', { value: g.id, textContent: g.name + (g.retired ? ' (retired)' : ''), selected: g.id === value })));
  return s;
}

export function openEditor(data, onSaved) {
  const { act, sections } = data;
  openModal((body, close) => {
    body.append(el('h3', { textContent: 'Edit activity' }));
    const name = el('input', { value: act.name, maxLength: 120 });
    const desc = el('textarea', { rows: 4, value: act.description || '' });
    const vis = el('select');
    [['private', 'Only me'], ['club', 'My clubs'], ['public', 'Anyone with Triven']].forEach(([v, t]) => vis.append(el('option', { value: v, textContent: t, selected: act.visibility === v })));
    const notes = el('textarea', { rows: 3, value: act.notes || '', placeholder: 'How it felt, niggles, fuelling, conditions…' });
    const sec1 = el('section', {}, el('label', { className: 'f' }, 'Name', name), el('label', { className: 'f', style: 'margin-top:10px' }, 'Description (shown to people who can see it)', desc),
      el('label', { className: 'f', style: 'margin-top:10px' }, 'Private notes (only you)', notes));
    // photos and videos
    const mediaSec = el('section', {}, el('h2', { textContent: 'Photos and videos' }));
    const mgrid = el('div', { className: 'gallery small' });
    const fin = el('input', { type: 'file', accept: 'image/*,video/*', multiple: true, hidden: true });
    const addBtn = el('button', { className: 'btn sm', type: 'button', textContent: 'Add photos or videos', onclick: () => fin.click() });
    const mmsg = el('div', { className: 'note' });
    mediaSec.append(mgrid, el('div', { style: 'margin-top:8px' }, addBtn, fin), mmsg);
    let media = (data.media || []).slice();
    const drawMedia = async () => { mgrid.replaceChildren(); for (const m of await mediaUrls(media)) {
      const t = m.kind === 'video' ? el('video', { src: m.url, muted: true, preload: 'metadata' }) : el('img', { src: m.url, alt: '' });
      const rm = el('button', { className: 'gx', type: 'button', textContent: '×', title: 'Remove', onclick: async () => { await sb.storage.from('activity-media').remove([m.path]); await sb.from('activity_media').delete().eq('id', m.id); media = media.filter(x => x.id !== m.id); data.media = media; drawMedia(); } });
      mgrid.append(el('div', { className: 'gitem' }, t, rm)); } };
    drawMedia();
    fin.onchange = async () => { const files = [...fin.files]; fin.value = '';
      for (const f of files) { mmsg.textContent = `Uploading ${f.name}…`;
        try { media.push(await uploadMedia(act, f, media.length)); data.media = media; await drawMedia(); }
        catch (e) { mmsg.textContent = `${f.name}: ${e.message || e}`; continue; } }
      mmsg.textContent = ''; };
    // gear
    const gearSec = el('section', {}, el('h2', { textContent: 'Gear' }));
    const gearInputs = [];
    if (act.sport === 'multi') {
      const real = sections.filter(s => s.sport === 'run' || s.sport === 'bike');
      let n = { run: 0, bike: 0 };
      const total = { run: real.filter(s => s.sport === 'run').length, bike: real.filter(s => s.sport === 'bike').length };
      real.forEach(s => { n[s.sport]++; const sel = gearSelect(s.sport === 'run' ? 'shoe' : 'bike', s.gear_id);
        gearInputs.push({ sec: s, sel }); gearSec.append(el('label', { className: 'f', style: 'margin-top:8px' }, `${SPORTNAME[s.sport]}${total[s.sport] > 1 ? ' ' + n[s.sport] : ''} · ${(s.distance_m / 1000).toFixed(2)} km`, sel)); });
    } else if (act.sport === 'run' || act.sport === 'bike') {
      const sel = gearSelect(act.sport === 'run' ? 'shoe' : 'bike', act.gear_id); gearInputs.push({ sec: null, sel });
      gearSec.append(el('label', { className: 'f', style: 'margin-top:8px' }, act.sport === 'run' ? 'Shoes' : 'Bike', sel));
    } else gearSec.append(el('div', { className: 'note', textContent: 'Gear can be assigned to runs and rides.' }));
    if (!state.gear.length) gearSec.append(el('div', { className: 'note', textContent: 'Add shoes and bikes on the Gear tab first.' }));
    // sharing
    const shareSec = el('section', {}, el('h2', { textContent: 'Who can see it' }), el('label', { className: 'f', style: 'margin-top:8px' }, 'Visible to', vis));
    const boxes = {};
    const grid = el('div', { className: 'checks' });
    SHARE.forEach(([k, t]) => { const c = el('input', { type: 'checkbox', checked: act.share?.[k] !== false }); boxes[k] = c; grid.append(el('label', { className: 'chk' }, c, ' ' + t)); });
    shareSec.append(el('div', { className: 'note', textContent: 'Data shown to other people. You always see everything.' }), grid);
    // actions
    const msg = el('div', { className: 'note' });
    const del = el('button', { className: 'btn', textContent: 'Delete activity', type: 'button' });
    const save = el('button', { className: 'btn primary', textContent: 'Save', type: 'button' });
    const cancel = el('button', { className: 'btn', textContent: 'Cancel', type: 'button', onclick: close });
    body.append(sec1, mediaSec, gearSec, shareSec, msg, el('div', { className: 'actions' }, del, el('div', { style: 'display:flex;gap:8px' }, cancel, save)));

    save.onclick = async () => {
      save.disabled = true; msg.textContent = 'Saving…';
      const share = Object.fromEntries(SHARE.map(([k]) => [k, boxes[k].checked]));
      const upd = { name: name.value.trim() || act.name, description: desc.value.trim() || null, notes: notes.value.trim() || null, visibility: vis.value, share };
      const single = gearInputs.find(g => !g.sec); if (single) upd.gear_id = single.sel.value || null;
      const r = await sb.from('activities').update(upd).eq('id', act.id);
      if (r.error) { msg.textContent = r.error.message; save.disabled = false; return; }
      for (const g of gearInputs.filter(g => g.sec)) {
        const v = g.sel.value || null; if (v === g.sec.gear_id) continue;
        const q = await sb.from('activity_sections').update({ gear_id: v }).eq('activity_id', act.id).eq('idx', g.sec.idx); if (q.error) { msg.textContent = q.error.message; save.disabled = false; return; }
        g.sec.gear_id = v;
      }
      // the shared copy of the data is rebuilt whenever sharing choices change
      if (JSON.stringify(share) !== JSON.stringify(act.share) && data.streams && act.streams_path) {
        const blob = new Blob([JSON.stringify(shareStreams(data.streams, share))], { type: 'application/json' });
        const u = await sb.storage.from('activity-streams').upload(act.streams_path, blob, { upsert: true });
        if (u.error) { msg.textContent = 'Saved, but the shared copy could not be updated: ' + u.error.message; }
      }
      Object.assign(act, upd);
      await loadAll(); close(); toast('Activity saved'); onSaved && onSaved();
    };
    del.onclick = () => {
      if (del.dataset.armed) return doDelete();
      del.dataset.armed = '1'; del.textContent = 'Click again to delete for good'; del.style.borderColor = 'var(--warn)';
      setTimeout(() => { delete del.dataset.armed; del.textContent = 'Delete activity'; del.style.borderColor = ''; }, 4000);
    };
    async function doDelete() {
      del.disabled = true; msg.textContent = 'Deleting…';
      const files = [act.streams_path, act.streams_path?.replace(/\.json$/, '.full.json')].filter(Boolean);
      if ((data.media || []).length) await sb.storage.from('activity-media').remove(data.media.map(m => m.path));
      if (files.length) await sb.storage.from('activity-streams').remove(files);
      if (act.file_path) await sb.storage.from('activity-files').remove([act.file_path]);
      const r = await sb.from('activities').delete().eq('id', act.id);
      if (r.error) { msg.textContent = r.error.message; del.disabled = false; return; }
      await loadAll(); close(); toast('Activity deleted'); location.hash = '#log';
    }
  });
}

// ---------- comments ----------
async function renderComments() {
  const box = $('comments'); if (!box) return; box.replaceChildren(el('h2', { textContent: 'Comments' }));
  const { act } = cur;
  const r = await sb.from('comments').select('*').eq('activity_id', act.id).order('created_at');
  const list = r.data || [];
  const ids = [...new Set(list.map(c => c.author))];
  const names = {};
  if (ids.length) { const p = await sb.from('profiles').select('id,display_name').in('id', ids); (p.data || []).forEach(x => names[x.id] = x.display_name); }
  const ul = el('div', { className: 'clist' });
  if (!list.length) ul.append(el('div', { className: 'note', textContent: 'No comments yet.' }));
  list.forEach(c => {
    const when = new Date(c.created_at);
    const row = el('div', { className: 'crow' }, el('b', { textContent: names[c.author] || 'Athlete' }), el('span', { className: 'muted', textContent: ' · ' + when.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) }), el('div', { className: 'cbody', textContent: c.body }));
    if (c.author === state.user.id || act.owner === state.user.id) row.append(el('button', { className: 'linkbtn', textContent: 'Delete', onclick: async () => { await sb.from('comments').delete().eq('id', c.id); renderComments(); } }));
    ul.append(row);
  });
  const inp = el('textarea', { rows: 2, placeholder: 'Add a comment', maxLength: 2000 });
  const go = el('button', { className: 'btn sm primary', textContent: 'Post', type: 'button' });
  go.onclick = async () => { const body = inp.value.trim(); if (!body) return; go.disabled = true;
    const q = await sb.from('comments').insert({ activity_id: act.id, body }); go.disabled = false;
    if (q.error) { toast(q.error.message); return; } renderComments(); };
  box.append(ul, el('div', { className: 'cform' }, inp, go));
}

// photos are resized to 2048 px JPEG; videos up to 50 MB go up as they are
async function uploadMedia(act, f, position) {
  const isVid = f.type.startsWith('video/'), isImg = f.type.startsWith('image/');
  if (!isVid && !isImg) throw new Error('not a photo or video');
  let blob = f, ext = (f.name.split('.').pop() || 'bin').toLowerCase(), w = null, h = null, dur = null;
  if (isImg) {
    const bmp = await createImageBitmap(f).catch(() => null);
    if (bmp) { const k = Math.min(1, 2048 / Math.max(bmp.width, bmp.height)); w = Math.round(bmp.width * k); h = Math.round(bmp.height * k);
      const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(bmp, 0, 0, w, h);
      blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.86)); ext = 'jpg'; }
  } else {
    if (f.size > 50 * 1024 * 1024) throw new Error('videos must be under 50 MB');
    await new Promise(res => { const v = document.createElement('video'); v.preload = 'metadata'; v.onloadedmetadata = () => { w = v.videoWidth; h = v.videoHeight; dur = v.duration; URL.revokeObjectURL(v.src); res(); }; v.onerror = res; v.src = URL.createObjectURL(f); });
  }
  const path = `${state.user.id}/${act.id}/${crypto.randomUUID()}.${ext}`;
  const up = await sb.storage.from('activity-media').upload(path, blob, { contentType: isImg ? 'image/jpeg' : f.type });
  if (up.error) throw up.error;
  const r = await sb.from('activity_media').insert({ activity_id: act.id, path, kind: isVid ? 'video' : 'photo', width: w, height: h, duration_s: dur, position }).select('*').single();
  if (r.error) throw r.error;
  return r.data;
}
