// First-time privacy choice (also changeable in Settings): searchable or not, and who can see your activities at all.
import { sb, state, toast } from './main.js?v=1795169468';
import { openModal } from './edit.js?v=1795169468';

const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); kids.forEach(k => k != null && e.append(k)); return e; };
export const AUDIENCE = [
  ['everyone', 'Everyone', 'Each activity’s own setting decides. Ones set to Everyone are public.'],
  ['followers_clubs', 'Followers and club mates', 'Nobody else sees any of your activities, whatever an activity is set to.'],
  ['followers', 'Just followers', 'Only people you’ve let follow you. Club mates who don’t follow you see nothing.'],
];
// a hidden profile can't be open to everyone: it behaves as followers and club mates
export const effectiveAudience = p => (p.searchable === false && (p.feed_audience || 'everyone') === 'everyone') ? 'followers_clubs' : (p.feed_audience || 'everyone');

export function openPrivacySetup() {
  const p = state.profile || {};
  openModal((body, close) => {
    const radio = (group, val, label, sub, on) => el('label', { className: 'ropt' + (on ? ' sel' : '') }, el('input', { type: 'radio', name: group, value: val, checked: on }),
      el('span', { style: 'flex:1' }, el('b', { textContent: label }), el('div', { className: 'muted', style: 'font-size:12px', textContent: sub })));
    const search = el('div', { className: 'rpick' }, radio('srch', 'yes', 'Yes, let people find me', 'Other athletes can search your name and follow you', p.searchable !== false), radio('srch', 'no', 'No, keep me hidden', 'People can only find you through a club or an invite', p.searchable === false));
    const aud = el('div', { className: 'rpick' }, ...AUDIENCE.map(([v, t, s]) => radio('aud', v, t, s, effectiveAudience(p) === v)));
    const approve = el('label', { className: 'ck' }, el('input', { type: 'checkbox', checked: !!p.approve_followers }), 'Approve new followers before they can follow me');
    const sync = () => {
      [search, aud].forEach(g => g.querySelectorAll('.ropt').forEach(r => r.classList.toggle('sel', r.querySelector('input').checked)));
      const hidden = search.querySelector('input:checked').value === 'no', ev = aud.querySelector('input[value=everyone]');
      ev.disabled = hidden; ev.closest('.ropt').classList.toggle('off', hidden);
      if (hidden && ev.checked) { aud.querySelector('input[value=followers_clubs]').checked = true; sync(); }
    };
    [search, aud].forEach(g => g.addEventListener('change', sync));
    const go = el('button', { className: 'btn primary', textContent: 'Save' });
    go.onclick = async () => {
      const upd = { searchable: search.querySelector('input:checked').value === 'yes', feed_audience: aud.querySelector('input:checked').value, approve_followers: approve.querySelector('input').checked, privacy_set: true };
      go.disabled = true; const { error } = await sb.from('profiles').update(upd).eq('id', state.user.id); go.disabled = false;
      if (error) { toast('Could not save: ' + error.message); return; }
      Object.assign(state.profile, upd); toast('Privacy saved. You can change it any time in Settings.'); close();
      document.dispatchEvent(new Event('triven:settings'));
    };
    body.append(el('h3', { textContent: 'Your privacy' }),
      el('p', { className: 'sec', style: 'margin-top:0', textContent: 'Choose how other Triven athletes can find you and see your training. You can change this any time in Settings.' }),
      el('div', { className: 'sec', style: 'margin:12px 0 6px;font-weight:600', textContent: 'Can people find you in search?' }), search,
      el('div', { className: 'sec', style: 'margin:14px 0 6px;font-weight:600', textContent: 'Who can see your activities?' }), aud, approve,
      el('div', { className: 'note', textContent: 'This is an upper limit. Each activity also has its own setting (Only me, Followers, Club, Everyone), which you can change with one click on its page.' }),
      el('div', { className: 'actions', style: 'margin-top:14px' }, el('span'), go));
    sync();
  });
}
