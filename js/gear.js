// Gear tab: shoes and bikes, distance, replacement guide, defaults, retire, bulk-assign.
import { sb, state, toast, loadAll, gearUsage, GEAR_ROLES, gearRoles } from './main.js?v=1795169942';
import { openModal } from './edit.js?v=1795169942';

const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); kids.forEach(k => e.append(k)); return e; };
const km = m => (m / 1000).toFixed(m >= 100000 ? 0 : 1);

export function mountGear() {
  const v = document.getElementById('view-gear'); v.replaceChildren();
  const usage = gearUsage();
  for (const kind of ['shoe', 'bike']) {
    const items = usage.filter(g => g.kind === kind);
    const card = el('div', { className: 'card', style: 'margin-bottom:16px' });
    const head = el('div', { className: 'calhead' }, el('h2', { textContent: kind === 'shoe' ? 'Shoes' : 'Bikes' }),
      el('button', { className: 'btn sm', textContent: kind === 'shoe' ? 'Add shoes' : 'Add bike', onclick: () => editGear({ kind }) }));
    card.append(head);
    if (!items.length) card.append(el('div', { className: 'note', textContent: kind === 'shoe' ? 'No shoes yet.' : 'No bikes yet.' }));
    for (const retired of [false, true]) {
      const list = items.filter(g => !!g.retired === retired); if (!list.length) continue;
      if (retired) card.append(el('div', { className: 'sec', style: 'margin-top:14px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em', textContent: 'Retired' }));
      list.forEach(g => {
        const total = g.used_m + (+g.start_km || 0) * 1000, limit = +g.replace_km || null;
        const row = el('div', { className: 'gearrow' + (retired ? ' retired' : '') });
        const name = el('div', {}, el('b', { textContent: g.name }), el('div', { className: 'muted', textContent: [[g.brand, g.model].filter(Boolean).join(' '), `${g.uses} ${g.uses === 1 ? 'activity' : 'activities'}`, gearRoles(g).length ? 'default for ' + gearRoles(g).map(r => (GEAR_ROLES[g.kind].find(x => x[0] === r) || [, r])[1].toLowerCase()).join(', ') : ''].filter(Boolean).join(' · ') }));
        const bar = el('div', { className: 'bar' });
        if (limit) { const f = el('div'); f.style.width = Math.min(100, total / 1000 / limit * 100) + '%'; if (total / 1000 >= limit) f.style.background = 'var(--warn)'; else if (kind === 'bike') f.style.background = 'var(--bike)'; bar.append(f); }
        const val = el('div', { className: 'val' }, el('div', { textContent: limit ? `${km(total)} of ${limit} km` : `${km(total)} km` }),
          el('button', { className: 'linkbtn', textContent: 'Edit', onclick: () => editGear(g) }));
        if (limit && total / 1000 >= limit && !retired) name.append(el('div', { className: 'warnline', textContent: 'Past its replacement distance' }));
        row.append(name, bar, val); card.append(row);
      });
    }
    v.append(card);
  }
  // unassigned helper
  const runs = state.activities.filter(a => a.sport === 'run' && !a.gear_id).length, rides = state.activities.filter(a => a.sport === 'bike' && !a.gear_id).length;
  if ((runs || rides) && state.gear.some(g => !g.retired)) {
    const card = el('div', { className: 'card' }, el('h2', { textContent: 'Unassigned activities' }),
      el('div', { className: 'sec', style: 'margin-top:6px', textContent: `${runs} runs and ${rides} rides have no gear. You can assign them to one item in one go; multisport sections are set on each activity.` }));
    const row = el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:10px' });
    for (const [sport, kind, n] of [['run', 'shoe', runs], ['bike', 'bike', rides]]) {
      if (!n) continue;
      const sel = el('select', { className: 'inline' }); state.gear.filter(g => g.kind === kind && !g.retired).forEach(g => sel.append(el('option', { value: g.id, textContent: g.name })));
      if (!sel.options.length) continue;
      const go = el('button', { className: 'btn sm', textContent: `Assign ${n} ${sport === 'run' ? 'runs' : 'rides'}` });
      go.onclick = async () => { go.disabled = true; const ids = state.activities.filter(a => a.sport === sport && !a.gear_id).map(a => a.id);
        const r = await sb.from('activities').update({ gear_id: sel.value }).in('id', ids); if (r.error) { toast(r.error.message); go.disabled = false; return; }
        await loadAll(); mountGear(); toast(`${ids.length} ${sport === 'run' ? 'runs' : 'rides'} assigned`); };
      row.append(sel, go);
    }
    card.append(row); v.append(card);
  }
}

function editGear(g) {
  const isNew = !g.id, kind = g.kind;
  openModal((body, close) => {
    body.append(el('h3', { textContent: isNew ? (kind === 'shoe' ? 'Add shoes' : 'Add bike') : `Edit ${g.name}` }));
    const f = {
      name: el('input', { value: g.name || '', placeholder: kind === 'shoe' ? 'e.g. Race shoes' : 'e.g. TT bike', required: true }),
      brand: el('input', { value: g.brand || '' }), model: el('input', { value: g.model || '' }),
      start_km: el('input', { type: 'number', min: 0, step: 1, value: g.start_km ?? 0 }),
      replace_km: el('input', { type: 'number', min: 0, step: 50, value: g.replace_km ?? (kind === 'shoe' ? 700 : '') , placeholder: kind === 'bike' ? 'optional, e.g. chain at 3000' : '' }),
    };
    // default for: everyday / trail / track / treadmill / races (bikes: everyday / indoor / gravel / MTB / races)
    const mine = new Set(gearRoles(g));
    const roleRow = el('div', { className: 'segrow', style: 'margin-top:6px' });
    GEAR_ROLES[kind].forEach(([v, t]) => { const b = el('button', { type: 'button', className: 'chip', textContent: t }); b.setAttribute('aria-pressed', mine.has(v));
      const owner = state.gear.find(x => x.id !== g.id && !x.retired && gearRoles(x).includes(v));
      if (owner) b.title = `Currently ${owner.name}`;
      b.onclick = () => { mine.has(v) ? mine.delete(v) : mine.add(v); b.setAttribute('aria-pressed', mine.has(v)); }; roleRow.append(b); });
    const grid = el('div', { className: 'frow' },
      el('label', { className: 'f' }, 'Name', f.name), el('label', { className: 'f' }, 'Brand', f.brand), el('label', { className: 'f' }, 'Model', f.model),
      el('label', { className: 'f' }, 'Distance already done (km)', f.start_km), el('label', { className: 'f' }, kind === 'shoe' ? 'Replace at (km)' : 'Service reminder at (km)', f.replace_km));
    body.append(el('section', {}, grid, el('div', { className: 'f', style: 'margin-top:14px' }, `Use automatically for`, roleRow),
      el('div', { className: 'note', textContent: `New ${kind === 'shoe' ? 'runs' : 'rides'} get the gear set for their type, and races get your race ${kind === 'shoe' ? 'shoes' : 'bike'} when you flag them. Anything without its own default uses the everyday one. Each role belongs to one ${kind === 'shoe' ? 'pair' : 'bike'}, so picking it here moves it from the other.` })));
    const msg = el('div', { className: 'note' });
    const save = el('button', { className: 'btn primary', textContent: 'Save', type: 'button' });
    const left = el('div', { style: 'display:flex;gap:8px' });
    if (!isNew) {
      left.append(el('button', { className: 'btn', type: 'button', textContent: g.retired ? 'Bring back' : 'Retire', onclick: async () => {
        await sb.from('gear').update({ retired: !g.retired, is_default_for: null }).eq('id', g.id); await loadAll(); close(); mountGear(); toast(g.retired ? 'Back in use' : 'Retired'); } }));
      const del = el('button', { className: 'btn', type: 'button', textContent: 'Delete' });
      del.onclick = async () => { if (!del.dataset.armed) { del.dataset.armed = 1; del.textContent = g.uses ? `Delete (unassigns ${g.uses})` : 'Click again to delete'; return; }
        await sb.from('gear').delete().eq('id', g.id); await loadAll(); close(); mountGear(); toast('Deleted'); };
      left.append(del);
    }
    body.append(msg, el('div', { className: 'actions' }, left, el('div', { style: 'display:flex;gap:8px' }, el('button', { className: 'btn', type: 'button', textContent: 'Cancel', onclick: close }), save)));
    save.onclick = async () => {
      const name = f.name.value.trim(); if (!name) { msg.textContent = 'Give it a name.'; return; }
      save.disabled = true;
      const row = { kind, name, brand: f.brand.value.trim() || null, model: f.model.value.trim() || null, start_km: +f.start_km.value || 0, replace_km: f.replace_km.value === '' ? null : +f.replace_km.value,
        is_default_for: mine.size ? [...mine].join(',') : null };
      // each role belongs to one item: take the chosen roles off the others
      for (const x of state.gear.filter(x => x.id !== g.id && x.kind === kind)) {
        const keep = gearRoles(x).filter(r => !mine.has(r)); if (keep.length === gearRoles(x).length) continue;
        await sb.from('gear').update({ is_default_for: keep.length ? keep.join(',') : null }).eq('id', x.id);
      }
      const r = isNew ? await sb.from('gear').insert(row) : await sb.from('gear').update(row).eq('id', g.id);
      if (r.error) { msg.textContent = r.error.message; save.disabled = false; return; }
      await loadAll(); close(); mountGear(); toast(isNew ? 'Added' : 'Saved');
    };
    f.name.focus();
  });
}
