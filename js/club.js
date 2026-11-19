// Club tab: create or join clubs, invite codes, members, and the feed of club mates' activities.
import { sb, state, toast } from './main.js';

const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); kids.forEach(k => e.append(k)); return e; };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDur = s => { s = Math.round(s); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
const SPC = { run: 'var(--run)', bike: 'var(--bike)', swim: 'var(--swim)', transition: 'var(--trans)' };
const SPN = { run: 'Run', bike: 'Ride', swim: 'Swim', multi: 'Multisport', other: 'Workout' };

export async function mountClub() {
  const v = document.getElementById('view-club'); v.replaceChildren(el('div', { className: 'note', textContent: 'Loading…' }));
  const { data: clubs, error } = await sb.rpc('my_clubs');
  v.replaceChildren();
  if (error) { v.append(el('div', { className: 'card', textContent: 'Could not load clubs: ' + error.message })); return; }
  const wrap = el('div', { style: 'max-width:620px' });
  wrap.append(clubsCard(clubs || []));
  wrap.append(el('div', { className: 'card', style: 'margin-top:16px' }, el('h2', { textContent: 'Club feed' }),
    el('p', { className: 'sec', textContent: 'Your club mates’ activities are on the Feed tab under Club, showing only what each person has chosen to share.' }),
    el('a', { className: 'btn', href: '#feed/club', textContent: 'Open the club feed', style: 'text-decoration:none' })));
  v.append(wrap);
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

