// Account deletion (018): your data goes, clubs you ran pass to the next member, other people's things stay.
import t17 from './test_017_notifications.mjs';
import fs from 'fs';
export default async function (db) {
  await t17(db);
  const apply = () => db.exec(fs.readFileSync(new URL('../../supabase/018_delete_account.sql', import.meta.url), 'utf8'));
  await apply(); await apply();
  const A='aaaaaaaa-0000-4000-8000-000000000001',B='aaaaaaaa-0000-4000-8000-000000000002';
  let fails = 0;
  const as = async (u, sql, params=[]) => { await db.exec(`reset role; select set_config('test.uid','${u||''}',false); set role ${u ? 'authenticated' : 'anon'};`); try { return (await db.query(sql, params)).rows; } finally { await db.exec('reset role'); } };
  const ok = (c, m) => { console.log((c?'  ok  ':'  FAIL ')+m); if(!c) fails++; };
  const one = async (sql, p=[]) => (await db.query(sql, p)).rows[0];
  console.log('— 018 delete account');
  const club = (await one(`insert into clubs(name,created_by) values ('Doha Tri',$1) returning id`,[A])).id;
  await db.query(`insert into club_members(club_id,user_id,role,status) values ($1,$2,'owner','active') on conflict (club_id,user_id) do update set role='owner', status='active'`,[club,A]);
  await db.query(`insert into club_members(club_id,user_id,role,status) values ($1,$2,'member','active') on conflict do nothing`,[club,B]);
  const solo = (await one(`insert into clubs(name,created_by) values ('Just me',$1) returning id`,[A])).id;
  await db.query(`insert into club_members(club_id,user_id,role,status) values ($1,$2,'owner','active')`,[solo,A]);
  const bActs = (await one(`select count(*)::int n from activities where owner=$1`,[B])).n;
  try { await as(null,`select delete_my_account()`); ok(false,'signed out refused'); } catch { ok(true,'signed out refused'); }
  await as(A,`select delete_my_account()`);
  ok(!(await one(`select 1 x from auth.users where id=$1`,[A])), 'account gone');
  ok((await one(`select count(*)::int n from activities where owner=$1`,[A])).n === 0 && (await one(`select count(*)::int n from profiles where id=$1`,[A])).n === 0, 'activities and profile gone');
  ok((await one(`select count(*)::int n from comments where author=$1`,[A])).n === 0 && (await one(`select count(*)::int n from kudos where user_id=$1`,[A])).n === 0, 'comments and kudos gone');
  const c = await one(`select created_by, (select role from club_members where club_id=$1 and user_id=$2) role from clubs where id=$1`,[club,B]);
  ok(c && c.created_by === B && c.role === 'owner', 'club handed to the remaining member');
  ok(!(await one(`select 1 x from clubs where id=$1`,[solo])), 'a club with nobody left is deleted');
  ok((await one(`select count(*)::int n from activities where owner=$1`,[B])).n === bActs, "other people's activities untouched");
  console.log(fails ? fails + ' FAILED (018)' : 'all 018 checks passed');
}
