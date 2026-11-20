// Usernames and short links: members only, nothing beyond what the viewer may already see.
import t11 from './test_011_security.mjs';
import fs from 'fs';
export default async function (db) {
  await t11(db);
  const apply = () => db.exec(fs.readFileSync(new URL('../../supabase/012_links.sql', import.meta.url), 'utf8'));
  await apply(); await apply();   // rerunnable
  const A='aaaaaaaa-0000-4000-8000-000000000001',B='aaaaaaaa-0000-4000-8000-000000000002',C='aaaaaaaa-0000-4000-8000-000000000003',D='aaaaaaaa-0000-4000-8000-000000000004',E='aaaaaaaa-0000-4000-8000-000000000005';
  let fails = 0;
  const as = async (u, sql, params=[]) => { await db.exec(`reset role; select set_config('test.uid','${u||''}',false); set role ${u ? 'authenticated' : 'anon'};`); try { return (await db.query(sql, params)).rows; } finally { await db.exec('reset role'); } };
  const ok = (c, m) => { console.log((c?'  ok  ':'  FAIL ')+m); if(!c) fails++; };
  const err = async (u, sql, m, params=[]) => { try { await as(u, sql, params); ok(false, m+' (expected an error)'); } catch(e){ ok(true, m+' → '+e.message.slice(0,70)); } };
  console.log('— 012 links');
  const h = async u => (await db.query(`select handle from profiles where id=$1`,[u])).rows[0].handle;
  ok(await h(A) === 'carl' && await h(B) === 'bea', 'existing members got usernames from their names');
  await db.query(`insert into auth.users(id,email,raw_user_meta_data) values ($1,'carl2@x','{"display_name":"Carl"}')`,[E]);
  ok(await h(E) === 'carl2', 'new member with a taken name gets carl2');
  // numbers: in date order for existing, then counting on
  const nums = (await db.query(`select num from activities where owner=$1 order by start_time`,[A])).rows.map(r => r.num);
  ok(nums.length > 0 && nums.every((n, i) => n === i + 1), 'existing activities numbered 1, 2, 3… in date order');
  const nx = (await as(A,`insert into activities(name,sport,start_time,visibility,num) values ('new','run','2020-01-01','private',999) returning num`))[0].num;
  ok(nx === nums.length + 1, 'new upload gets the next number (can’t pick your own)');
  await as(A,`update activities set num=1 where num=$1`,[nx]);
  ok((await db.query(`select count(*)::int n from activities where owner=$1 and num=$2`,[A,nx])).rows[0].n === 1, 'numbers can’t be changed');
  // usernames
  ok((await as(B,`select check_handle('carl') r`))[0].r === 'taken' && (await as(B,`select check_handle('Bea!') r`))[0].r === 'invalid' && (await as(B,`select check_handle('settings') r`))[0].r === 'invalid', 'check: taken / invalid / reserved');
  await err(B,`update profiles set handle='carl' where id=$1`, 'can’t take someone’s username', [B]);
  await err(B,`update profiles set handle='Bad Name' where id=$1`, 'invalid username refused', [B]);
  await as(B,`update profiles set handle='beatri' where id=$1`,[B]);
  ok((await as(C,`select resolve_link('bea') r`))[0].r.handle === 'beatri', 'old username still leads to the new one');
  await err(D,`update profiles set handle='bea' where id=$1`, 'old username can’t be grabbed by someone else', [D]);
  await err(D,`update profiles set handle='bea' where id=$1`, '…for 90 days', [D]);
  await as(B,`update profiles set handle='bea' where id=$1`,[B]);
  ok(await h(B) === 'bea', 'you can switch back to your own old one');
  // links respect visibility
  const priv = (await db.query(`insert into activities(owner,name,sport,start_time,visibility) values ($1,'secret','run','2026-11-10','private') returning num, id`,[A])).rows[0];
  const r1 = (await as(D,`select resolve_link('carl', $1) r`,[priv.num]))[0].r;
  ok(r1.found && r1.activity === null, 'private activity: link resolves but gives nothing away');
  ok((await as(A,`select resolve_link('carl', $1) r`,[priv.num]))[0].r.activity === priv.id, 'owner opens own private activity');
  ok((await as(D,`select activity_link($1) l`,[priv.id]))[0].l === null && (await as(A,`select activity_link($1) l`,[priv.id]))[0].l === 'carl/' + priv.num, 'share link only for activities you can see');
  ok((await as(D,`select resolve_link('nobody') r`))[0].r.found === false, 'unknown username');
  await err(null,`select resolve_link('carl')`, 'signed out: links refused');
  await err(null,`select athlete_page($1)`, 'signed out: profile refused', [A]);
  await err(D,`select * from handle_history`, 'username history not readable');
  await err(D,`select suggest_handle('x')`, 'internal helper not callable');
  // profile page
  const pg = (await as(A,`select athlete_page($1) p`,[A]))[0].p;
  ok(pg.me && pg.handle === 'carl' && pg.count >= nums.length + 2, 'own profile shows everything');
  const pgD = (await as(D,`select athlete_page($1) p`,[A]))[0].p;
  ok(pgD && pgD.count < pg.count, 'others see only what they may');
  await db.query(`update profiles set searchable=false where id=$1`,[C]);
  ok((await as(E,`select athlete_page($1) p`,[C]))[0].p === null && (await as(E,`select resolve_link('cat') r`))[0].r.person === null, 'hidden profile stays hidden to strangers');
  const fa = await as(D,`select handle, num from feed('athlete', person => $1::uuid)`,[A]);
  ok(fa.length === pgD.count && fa.every(r => r.handle === 'carl' && r.num > 0), 'athlete feed matches the profile count and carries short links');
  ok((await as(A,`select count(*)::int n from feed('me')`))[0].n > 0, 'other feeds still work');
  console.log(fails ? fails + ' FAILED (012)' : 'all 012 checks passed');
}
