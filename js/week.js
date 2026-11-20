// Feed sidebar: you (photo, follows, latest activity) and this week: days trained, load against a suggested range,
// a 12-week chart, and weekly goals per sport.
//
// Suggested weekly load range: your chronic load (fitness x 7) times 0.8 to 1.3, the acute:chronic workload ratio
// band sports science treats as the "sweet spot" (below it fitness drifts, well above it injury risk climbs).
import { sb, state, toast, avatarEl, raceFlag } from './main.js?v=1795170896';
import { DEFAULTS } from './settings.js?v=1795170896';
import { loadOf, pmc } from './load.js?v=1795170896';
import { openModal } from './edit.js?v=1795170896';

const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); kids.forEach(k => k != null && e.append(k)); return e; };
const DAY = 864e5, MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SPV = { run: '--run', bike: '--bike', swim: '--swim' }, SPN = { all: 'All', run: 'Run', bike: 'Ride', swim: 'Swim' };
const fmtHM = s => { const h = Math.floor(s / 3600), m = Math.round(s % 3600 / 60); return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`; };
const localDay = a => { const d = new Date(Date.parse(a.start_time) + (a.utc_offset_min || 0) * 60000); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };
const now = new Date(), TODAY = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
const mondayOf = t => t - ((new Date(t).getUTCDay() + 6) % 7) * DAY;
let tab = 'all';

// per-sport distance/time for one activity (multisport legs split out)
function legs(a) {
  if (a.sport === 'multi' && a.activity_sections?.length) return a.activity_sections.filter(s => SPV[s.sport]).map(s => ({ sp: s.sport, d: +s.distance_m || 0, t: +s.elapsed_s || 0, e: +s.ascent_m || 0 }));
  return SPV[a.sport] ? [{ sp: a.sport, d: +a.distance_m || 0, t: +(a.moving_s || a.elapsed_s) || 0, e: +a.ascent_m || 0 }] : [];
}

export async function mountWeek(host) {
  host.replaceChildren();
  const cfg = Object.assign({}, DEFAULTS, state.profile?.settings || {});
  const acts = state.activities;
  host.append(youCard(acts), weekCard(acts, cfg));
}

function youCard(acts) {
  const p = state.profile || {};
  const c = el('div', { className: 'card sidecard' });
  c.append(el('div', { className: 'youhead' }, avatarEl(p.display_name, p.avatar_path, 56), el('div', {}, el('b', { textContent: p.display_name || 'You' }),
    el('button', { className: 'linkbtn', type: 'button', textContent: 'Edit profile', style: 'font-size:12px;display:block', onclick: () => document.getElementById('openSettings').click() }))));
  const counts = el('div', { className: 'youcounts' });
  const cell = (n, t, href) => el('a', { href, className: 'ycount' }, el('b', { textContent: n }), el('span', { textContent: t }));
  counts.append(cell('…', 'Following', '#club'), cell('…', 'Followers', '#club'), cell(acts.length.toLocaleString(), 'Activities', '#log'));
  c.append(counts);
  sb.rpc('my_network').then(({ data }) => { if (!data) return; const f = data.filter(n => n.direction === 'following' && n.status === 'accepted').length, fl = data.filter(n => n.direction === 'follower' && n.status === 'accepted').length;
    counts.children[0].querySelector('b').textContent = f; counts.children[1].querySelector('b').textContent = fl; });
  const last = acts.slice().sort((a, b) => Date.parse(b.start_time) - Date.parse(a.start_time))[0];
  if (last) { const d = new Date(Date.parse(last.start_time) + (last.utc_offset_min || 0) * 60000);
    c.append(el('div', { className: 'youlast' }, el('span', { className: 'muted', textContent: 'Latest activity' }),
      el('a', { href: '#a/' + last.id }, el('b', { textContent: last.name }), last.is_race ? raceFlag(13) : null, ` · ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`))); }
  return c;
}

function weekCard(acts, cfg) {
  const c = el('div', { className: 'card sidecard' });
  const tabs = el('div', { className: 'wtabs', role: 'tablist' });
  ['all', 'run', 'bike', 'swim'].forEach(k => { const b = el('button', { type: 'button', role: 'tab', className: 'wtab', textContent: SPN[k] }); b.setAttribute('aria-selected', k === tab);
    if (SPV[k]) b.prepend(el('i', { className: 'sw', style: `background:var(${SPV[k]})` }));
    b.onclick = () => { tab = k; c.replaceWith(weekCard(acts, cfg)); }; tabs.append(b); });
  c.append(tabs);

  const wk0 = mondayOf(TODAY), weeks = 12, first = wk0 - (weeks - 1) * 7 * DAY;
  const W = Array.from({ length: weeks }, (_, i) => ({ t: first + i * 7 * DAY, load: 0, d: 0, time: 0, e: 0 }));
  const days = Array(7).fill(0);
  for (const a of acts) {
    const day = localDay(a); if (day < first || day > TODAY) continue;
    const wi = Math.floor((day - first) / (7 * DAY)), L = legs(a).filter(l => tab === 'all' || l.sp === tab);
    if (!L.length) continue;
    const w = W[wi]; L.forEach(l => { w.d += l.d; w.time += l.t; w.e += l.e; });
    const ld = loadOf(a, cfg); w.load += tab === 'all' ? ld.value : (ld.bySport[tab] || 0);
    if (day >= wk0) days[(day - wk0) / DAY] = 1;
  }
  const cur = W[W.length - 1];
  // week dots
  const dots = el('div', { className: 'wdots' });
  'MTWTFSS'.split('').forEach((ch, i) => dots.append(el('div', {}, el('i', { className: days[i] ? 'on' : '', style: days[i] ? `background:var(${SPV[tab] || '--accent'})` : '' }), el('span', { textContent: ch }))));

  let range = null;
  if (tab === 'all') {
    const series = pmc(acts, cfg, TODAY - 7 * DAY);   // fitness as of the start of this week
    const ctl = series.at(-1)?.ctl || 0;
    if (ctl > 3) range = [Math.round(ctl * 7 * 0.8), Math.round(ctl * 7 * 1.3)];
  }
  const head = el('div', { className: 'whead' }, dots);
  if (tab === 'all') head.append(el('div', { className: 'wnum' }, el('small', { textContent: 'Load' }), el('b', { textContent: Math.round(cur.load) })),
    el('div', { className: 'wnum' }, el('small', { textContent: 'Suggested' }), el('b', { textContent: range ? `${range[0]}–${range[1]}` : '—' })));
  else head.append(el('div', { className: 'wnum' }, el('small', { textContent: 'Distance' }), el('b', { textContent: `${(cur.d / 1000).toFixed(cur.d >= 100000 ? 0 : 1)} km` })),
    el('div', { className: 'wnum' }, el('small', { textContent: 'Time' }), el('b', { textContent: fmtHM(cur.time) })));
  c.append(el('div', { className: 'sec wtitle', textContent: 'This week' }), head);
  if (tab === 'all' && range) {
    const r = cur.load / ((range[0] + range[1]) / 2), msg = cur.load < range[0] ? `${range[0] - Math.round(cur.load)} to go to reach your range` : cur.load > range[1] ? 'Above your usual range: big week, watch the recovery' : 'In your range';
    c.append(el('div', { className: 'muted', style: 'font-size:12px;margin-top:2px', textContent: msg }));
  }
  c.append(chart(W, tab, range));

  // goals
  const goals = cfg.goals || {};
  const gl = el('div', { className: 'goals' });
  const sports = tab === 'all' ? ['swim', 'bike', 'run', 'all'] : [tab];
  const weekActs = acts.filter(a => localDay(a) >= wk0 && localDay(a) <= TODAY);
  const tot = sp => { let d = 0, t = 0, e = 0; weekActs.forEach(a => legs(a).forEach(l => { if (sp === 'all' || l.sp === sp) { d += l.d; t += l.t; e += l.e; } })); return { distance: d, time: t, elevation: e }; };
  const left = 7 - (TODAY - wk0) / DAY - 1;
  sports.forEach(sp => { const g = goals[sp]; if (!g?.target) return; const have = tot(sp)[g.metric] || 0, want = g.metric === 'distance' ? g.target * 1000 : g.metric === 'time' ? g.target * 3600 : g.target;
    const f = Math.min(1, have / want), show = v => g.metric === 'distance' ? `${(v / 1000).toFixed(1)} km` : g.metric === 'time' ? fmtHM(v) : `${Math.round(v)} m`;
    const bar = el('div', { className: 'gbar' }, el('i', { style: `width:${f * 100}%;background:var(${SPV[sp] || '--accent'})` }));
    gl.append(el('div', { className: 'goal' }, el('div', { className: 'gtop' }, el('b', { textContent: sp === 'all' ? 'All sports' : SPN[sp] }), el('span', { textContent: `${show(have)} / ${show(want)}` })), bar,
      el('div', { className: 'muted', style: 'font-size:11px', textContent: have >= want ? 'Goal done this week' : `${show(want - have)} to go · ${left} ${left === 1 ? 'day' : 'days'} left after today` }))); });
  if (!gl.children.length) gl.append(el('div', { className: 'muted', style: 'font-size:12px', textContent: tab === 'all' ? 'No weekly goals yet.' : `No weekly ${SPN[tab].toLowerCase()} goal yet.` }));
  c.append(el('div', { className: 'sec wtitle', textContent: 'Weekly goals' }), gl,
    el('button', { className: 'linkbtn', type: 'button', textContent: 'Set weekly goals', style: 'margin-top:8px', onclick: () => editGoals(() => mountWeek(c.parentElement)) }));
  return c;
}

// 12 weekly bars (load for All, distance for a sport) with this week's suggested range shaded
function chart(W, tab, range) {
  const d3 = window.d3, w = 264, h = 110, m = { l: 4, r: 4, t: 8, b: 18 };
  const val = x => tab === 'all' ? x.load : x.d / 1000;
  const max = Math.max(1, d3.max(W, val), range ? range[1] : 0) * 1.1;
  const x = i => m.l + i * (w - m.l - m.r) / W.length, bw = (w - m.l - m.r) / W.length - 4, y = v => h - m.b - v / max * (h - m.t - m.b);
  const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.setAttribute('width', '100%'); svg.setAttribute('class', 'wchart'); svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Last 12 weeks of ${tab === 'all' ? 'training load' : SPN[tab].toLowerCase() + ' distance'}`);
  const add = (tag, at) => { const e = document.createElementNS(ns, tag); for (const k in at) e.setAttribute(k, at[k]); svg.append(e); return e; };
  if (range) add('rect', { x: x(W.length - 1) - 2, width: bw + 4, y: y(range[1]), height: y(range[0]) - y(range[1]), rx: 3, class: 'wrange' });
  W.forEach((wk, i) => { const v = val(wk); const r = add('rect', { x: x(i), width: bw, y: y(v), height: Math.max(v ? 2 : 0, h - m.b - y(v)), rx: 3, class: i === W.length - 1 ? 'wbar cur' : 'wbar' });
    if (SPV[tab]) r.style.fill = `var(${SPV[tab]})`; if (i !== W.length - 1) r.style.opacity = .45;
    const t = document.createElementNS(ns, 'title'); const dd = new Date(wk.t); t.textContent = `Week of ${dd.getUTCDate()} ${MON[dd.getUTCMonth()]}: ${tab === 'all' ? Math.round(wk.load) + ' load' : (wk.d / 1000).toFixed(1) + ' km'} · ${fmtHM(wk.time)}`; r.append(t); });
  [0, 4, 8, 11].forEach(i => { const dd = new Date(W[i].t); const t = add('text', { x: i === 0 ? x(i) : i === 11 ? x(i) + bw : x(i) + bw / 2, y: h - 4, 'text-anchor': i === 0 ? 'start' : i === 11 ? 'end' : 'middle', class: 'wlab' }); t.textContent = `${dd.getUTCDate()} ${MON[dd.getUTCMonth()]}`; });
  return svg;
}

function editGoals(onDone) {
  openModal((body, close) => {
    const g = Object.assign({}, state.profile?.settings?.goals || {});
    body.append(el('h3', { textContent: 'Weekly goals' }), el('p', { className: 'sec', style: 'margin-top:0', textContent: 'Weeks run Monday to Sunday. Multisport legs count towards their own sport. Leave a target empty for no goal.' }));
    const rows = {};
    [['swim', 'Swim'], ['bike', 'Ride'], ['run', 'Run'], ['all', 'All sports']].forEach(([k, t]) => {
      const metric = el('select'); [['distance', 'Distance (km)'], ['time', 'Time (hours)'], ['elevation', 'Elevation (m)']].forEach(([v, l]) => metric.append(el('option', { value: v, textContent: l, selected: (g[k]?.metric || (k === 'all' ? 'time' : 'distance')) === v })));
      const target = el('input', { type: 'number', min: 0, step: 'any', value: g[k]?.target ?? '', placeholder: 'no goal', style: 'width:110px' });
      rows[k] = { metric, target };
      body.append(el('div', { className: 'goalrow' }, el('b', { textContent: t }), metric, target));
    });
    const save = el('button', { className: 'btn primary', type: 'button', textContent: 'Save goals' });
    body.append(el('div', { className: 'actions', style: 'justify-content:flex-end' }, el('button', { className: 'btn', type: 'button', textContent: 'Cancel', onclick: close }), save));
    save.onclick = async () => {
      const goals = {}; for (const k in rows) { const v = parseFloat(rows[k].target.value); if (v > 0) goals[k] = { metric: rows[k].metric.value, target: v }; }
      const settings = { ...(state.profile.settings || {}), goals };
      const r = await sb.from('profiles').update({ settings }).eq('id', state.user.id);
      if (r.error) { toast(r.error.message); return; }
      state.profile.settings = settings; close(); toast('Goals saved'); onDone && onDone();
    };
  });
}
