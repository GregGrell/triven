// Edit an activity: name, description, visibility, shared fields, gear (per section for multisport), delete. Plus comments.
import { sb, state, toast, loadAll, renderActHeader } from './main.js';
import { shareStreams } from './process.js';

const $ = id => document.getElementById(id);
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); kids.forEach(k => e.append(k)); return e; };
const SHARE = [['map', 'Map and route'], ['pace', 'Pace and speed'], ['hr', 'Heart rate'], ['power', 'Power'], ['cadence', 'Cadence'], ['dynamics', 'Running dynamics (ground contact, balance, oscillation)'], ['description', 'Description']];
const SPORTNAME = { run: 'Run', bike: 'Bike', swim: 'Swim' };
let cur = null;

export function openModal(build) {
  const ov = $('modal'), body = $('modalBody'); body.replaceChildren(); build(body, () => ov.classList.remove('open')); ov.classList.add('open');
}
document.addEventListener('DOMContentLoaded', () => {});
const ov = $('modal');
ov.addEventListener('click', e => { if (e.target === ov) ov.classList.remove('open'); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') ov.classList.remove('open'); });

document.addEventListener('triven:activity', e => {
  cur = e.detail;
  const mine = cur.act.owner === state.user.id;
  const tools = $('actTools'); tools.replaceChildren();
  if (mine) tools.append(el('button', { className: 'btn sm', textContent: 'Edit', onclick: openEditor }));
  renderComments();
});

function gearSelect(kind, value) {
  const s = el('select');
  s.append(el('option', { value: '', textContent: kind === 'bike' ? 'No bike' : 'No shoes' }));
  state.gear.filter(g => g.kind === kind && (!g.retired || g.id === value)).forEach(g => s.append(el('option', { value: g.id, textContent: g.name + (g.retired ? ' (retired)' : ''), selected: g.id === value })));
  return s;
}

function openEditor() {
  const { act, sections } = cur;
  openModal((body, close) => {
    body.append(el('h3', { textContent: 'Edit activity' }));
    const name = el('input', { value: act.name, maxLength: 120 });
    const desc = el('textarea', { rows: 4, value: act.description || '' });
    const vis = el('select');
    [['private', 'Only me'], ['club', 'My clubs'], ['public', 'Anyone with Triven']].forEach(([v, t]) => vis.append(el('option', { value: v, textContent: t, selected: act.visibility === v })));
    const sec1 = el('section', {}, el('label', { className: 'f' }, 'Name', name), el('label', { className: 'f', style: 'margin-top:10px' }, 'Description', desc));
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
    body.append(sec1, gearSec, shareSec, msg, el('div', { className: 'actions' }, del, el('div', { style: 'display:flex;gap:8px' }, cancel, save)));

    save.onclick = async () => {
      save.disabled = true; msg.textContent = 'Saving…';
      const share = Object.fromEntries(SHARE.map(([k]) => [k, boxes[k].checked]));
      const upd = { name: name.value.trim() || act.name, description: desc.value.trim() || null, visibility: vis.value, share };
      const single = gearInputs.find(g => !g.sec); if (single) upd.gear_id = single.sel.value || null;
      const r = await sb.from('activities').update(upd).eq('id', act.id);
      if (r.error) { msg.textContent = r.error.message; save.disabled = false; return; }
      for (const g of gearInputs.filter(g => g.sec)) {
        const v = g.sel.value || null; if (v === g.sec.gear_id) continue;
        const q = await sb.from('activity_sections').update({ gear_id: v }).eq('activity_id', act.id).eq('idx', g.sec.idx); if (q.error) { msg.textContent = q.error.message; save.disabled = false; return; }
        g.sec.gear_id = v;
      }
      // the shared copy of the data is rebuilt whenever sharing choices change
      if (JSON.stringify(share) !== JSON.stringify(act.share) && cur.streams && act.streams_path) {
        const blob = new Blob([JSON.stringify(shareStreams(cur.streams, share))], { type: 'application/json' });
        const u = await sb.storage.from('activity-streams').upload(act.streams_path, blob, { upsert: true });
        if (u.error) { msg.textContent = 'Saved, but the shared copy could not be updated: ' + u.error.message; }
      }
      Object.assign(act, upd);
      renderActHeader(act, cur.sections);
      document.getElementById('tab-activity').textContent = act.name;
      await loadAll(); close(); toast('Activity saved');
    };
    del.onclick = () => {
      if (del.dataset.armed) return doDelete();
      del.dataset.armed = '1'; del.textContent = 'Click again to delete for good'; del.style.borderColor = 'var(--warn)';
      setTimeout(() => { delete del.dataset.armed; del.textContent = 'Delete activity'; del.style.borderColor = ''; }, 4000);
    };
    async function doDelete() {
      del.disabled = true; msg.textContent = 'Deleting…';
      const files = [act.streams_path, act.streams_path?.replace(/\.json$/, '.full.json')].filter(Boolean);
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
