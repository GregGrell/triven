// Club tab: create or join clubs, invite codes, members, and the feed of club mates' activities.
import { sb, state, toast } from './main.js';

const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); kids.forEach(k => e.append(k)); return e; };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDur = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
const SPC = { run: 'var(--run)', bike: 'var(--bike)', swim: 'var(--swim)', transition: 'var(--trans)' };
const SPN = { run: 'Run', bike: 'Ride', swim: 'Swim', multi: 'Multisport', other: 'Workout' };
let feedCursor = null;

export async function mountClub() {
  const v = document.getElementById('view-club'); v.replaceChildren(el('div', { className: 'note', textContent: 'Loading…' }));
  const { data: clubs, error } = await sb.rpc('my_clubs');
  v.replaceChildren();
  if (error) { v.append(el('div', { className: 'card', textContent: 'Could not load clubs: ' + error.message })); return; }
  const grid = el('div', { className: 'clubgrid' });
  const feedCol = el('div'), side = el('div');
  grid.append(feedCol, side); v.append(grid);
  side.append(clubsCard(clubs || []));
  if (!clubs?.length) { feedCol.append(el('div', { className: 'card empty' }, el('h2', { textContent: 'Club feed' }), el('p', { className: 'sec', textContent: 'Create a club and share its invite code with your club mates, or join one with a code. Their activities appear here, showing only what each person has chosen to share.' }))); return; }
  const feed = el('div', { className: 'feed' }); feedCol.append(feed);
  feedCursor = null; await loadFeed(feed);
}

function clubsCard(clubs) {
  const c = el('div', { className: 'card' }, el('h2', { textContent: 'Your clubs' }));
  clubs.forEach(k => {
    const code = el('code', { textContent: k.invite_code });
    const copy = el('button', { className: 'linkbtn', textContent: 'Copy', onclick: async () => { try { await navigator.clipboard.writeText(k.invite_code); toast('Invite code copied'); } catch { toast('Copy failed: the code is ' + k.invite_code); } } });
    const leave = el('button', { className: 'linkbtn', textContent: 'Leave', style: 'color:var(--text-muted)' });
    leave.onclick = async () => { if (!leave.dataset.armed) { leave.dataset.armed = 1; leave.textContent = 'Click again to leave'; return; }
      const r = await sb.from('club_members').delete().eq('club_id', k.id).eq('user_id', state.user.id); if (r.error) toast(r.error.message); else mountClub(); };
    c.append(el('div', { className: 'clubrow' }, el('b', { textContent: k.name }), el('div', { className: 'muted', textContent: `${k.members} ${k.members === 1 ? 'member' : 'members'}${k.role === 'owner' ? ' · you run it' : ''}` }),
      el('div', { className: 'sec', style: 'margin-top:4px;font-size:12px' }, 'Invite code ', code, ' ', copy, ' · ', leave)));
  });
  const name = el('input', { placeholder: 'Club name' }), code = el('input', { placeholder: 'Invite code' });
  const mk = el('button', { className: 'btn sm', textContent: 'Create club', type: 'button' }), jn = el('button', { className: 'btn sm', textContent: 'Join', type: 'button' });
  mk.onclick = async () => { const n = name.value.trim(); if (!n) return; mk.disabled = true; const r = await sb.rpc('create_club', { club_name: n }); mk.disabled = false; if (r.error) toast(r.error.message); else { toast('Club created'); mountClub(); } };
  jn.onclick = async () => { const n = code.value.trim().toLowerCase(); if (!n) return; jn.disabled = true; const r = await sb.rpc('join_club', { code: n }); jn.disabled = false; if (r.error) toast(r.error.message.includes('not found') ? 'That invite code was not found' : r.error.message); else { toast('Joined ' + r.data.name); mountClub(); } };
  c.append(el('div', { className: 'clubform' }, name, mk), el('div', { className: 'clubform' }, code, jn));
  c.append(el('div', { className: 'note', textContent: 'Your activities default to visible to your clubs. Change the default or any single activity from its Edit button.' }));
  return c;
}

async function loadFeed(feed) {
  const r = await sb.rpc('club_feed', { before: feedCursor || new Date(Date.now() + 864e5).toISOString(), lim: 20 });
  if (r.error) { feed.append(el('div', { className: 'card', textContent: r.error.message })); return; }
  const rows = r.data || [];
  if (!rows.length && !feedCursor) feed.append(el('div', { className: 'card empty' }, el('p', { className: 'sec', textContent: 'No activities yet. Upload yours, or wait for club mates to upload theirs.' })));
  rows.forEach(a => feed.append(feedCard(a)));
  feed.querySelector('.more')?.remove();
  if (rows.length === 20) { feedCursor = rows[rows.length - 1].start_time; feed.append(el('button', { className: 'btn more', textContent: 'Show older', onclick: () => loadFeed(feed) })); }
}

function feedCard(a) {
  const d = new Date(Date.parse(a.start_time) + a.utc_offset_min * 60000);
  const when = `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()} · ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
  const mine = a.owner === state.user.id;
  const head = el('div', { className: 'fhead' }, el('div', { className: 'avatar', textContent: (a.athlete || '?').slice(0, 1).toUpperCase() }),
    el('div', {}, el('b', { textContent: mine ? 'You' : a.athlete }), el('div', { className: 'muted', style: 'font-size:12px', textContent: when + ' · ' + (a.sport === 'multi' ? (a.multisport_profile === 'other' ? 'Multisport' : a.multisport_profile[0].toUpperCase() + a.multisport_profile.slice(1)) : SPN[a.sport]) })));
  const title = el('a', { href: '#a/' + a.id, className: 'ftitle', textContent: a.name });
  const stats = el('div', { className: 'fstats' });
  const stat = (v, l) => stats.append(el('div', {}, el('b', { textContent: v }), el('small', { textContent: l })));
  stat((a.distance_m / 1000).toFixed(2) + ' km', 'Distance');
  stat(fmtDur(a.sport === 'multi' ? a.elapsed_s : (a.moving_s || a.elapsed_s)), 'Time');
  if (a.sport === 'run' && a.share?.pace !== false) { const p = (a.moving_s || a.elapsed_s) / (a.distance_m / 1000); stat(`${Math.floor(p / 60)}:${String(Math.round(p % 60)).padStart(2, '0')} /km`, 'Pace'); }
  if (a.sport === 'bike' && a.share?.pace !== false) stat(((a.distance_m / (a.moving_s || a.elapsed_s)) * 3.6).toFixed(1) + ' km/h', 'Speed');
  if (a.ascent_m) stat(Math.round(a.ascent_m) + ' m', 'Elevation');
  if (a.avg_hr) stat(Math.round(a.avg_hr) + ' bpm', 'Avg HR');
  const card = el('div', { className: 'card fcard' }, head, title);
  if (a.description) card.append(el('div', { className: 'actdesc', textContent: a.description }));
  card.append(stats);
  if (a.sport === 'multi' && a.sections?.length) {
    const strip = el('div', { className: 'fstrip' });
    a.sections.forEach(s => { const i = el('i'); i.style.flex = String(Math.max(s.elapsed_s, 20)); i.style.background = SPC[s.sport] || 'var(--trans)';
      i.title = `${s.sport === 'transition' ? 'Transition' : SPN[s.sport] || s.sport} · ${fmtDur(s.elapsed_s)}`; strip.append(i); });
    card.append(strip);
  }
  const kudo = el('button', { className: 'btn sm' + (a.you_kudoed ? ' on' : ''), textContent: `👏 ${a.kudos || 0}`, disabled: mine, title: mine ? 'Kudos from your club mates' : 'Give kudos' });
  kudo.onclick = async () => { kudo.disabled = true;
    const r = a.you_kudoed ? await sb.from('kudos').delete().eq('activity_id', a.id).eq('user_id', state.user.id) : await sb.from('kudos').insert({ activity_id: a.id });
    kudo.disabled = false; if (r.error) { toast(r.error.message); return; }
    a.you_kudoed = !a.you_kudoed; a.kudos += a.you_kudoed ? 1 : -1; kudo.textContent = `👏 ${a.kudos}`; kudo.classList.toggle('on', a.you_kudoed); };
  card.append(el('div', { className: 'factions' }, kudo, el('a', { className: 'btn sm', href: '#a/' + a.id, textContent: `💬 ${a.comments || 0}`, style: 'text-decoration:none' })));
  return card;
}
