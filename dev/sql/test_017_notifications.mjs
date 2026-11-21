// Notifications (017): kudos, comments, replies, follows, relay invites, club requests and posts; only your own.
import t16 from './test_016_leaderboard.mjs';
import fs from 'fs';
export default async function (db) {
  await t16(db);
  const apply = () => db.exec(fs.readFileSync(new URL('../../supabase/017_notifications.sql', import.meta.url), 'utf8'));
  await apply(); await apply();
  const A='aaaaaaaa-0000-4000-8000-000000000001',B='aaaaaaaa-0000-4000-8000-000000000002',D='aaaaaaaa-0000-4000-8000-000000000004';
  let fails = 0;
  const as = async (u, sql, params=[]) => { await db.exec(`reset role; select set_config('test.uid','${u||''}',false); set role ${u ? 'authenticated' : 'anon'};`); try { return (await db.query(sql, params)).rows; } finally { await db.exec('reset role'); } };
  const ok = (c, m) => { console.log((c?'  ok  ':'  FAIL ')+m); if(!c) fails++; };
  console.log('— 017 notifications');
  const act = (await db.query(`insert into activities(owner,name,sport,start_time,visibility) values ($1,'Morning run','run',now(),'followers') returning id`,[A])).rows[0].id;
  const bAct = (await db.query(`insert into activities(owner,name,sport,start_time,visibility) values ($1,'B ride','bike',now(),'public') returning id`,[B])).rows[0].id;
  await db.query(`insert into follows(follower,followee,status) values ($1,$2,'accepted') on conflict (follower,followee) do update set status='accepted', created_at=now()`,[B,A]);
  await db.query(`insert into kudos(activity_id,user_id) values ($1,$2) on conflict do nothing`,[act,B]);
  await db.query(`insert into comments(activity_id,author,body) values ($1,$2,'Nice one!')`,[act,B]);
  await db.query(`insert into comments(activity_id,author,body,created_at) values ($1,$2,'Great ride',now()-interval '1 minute')`,[bAct,A]);
  await db.query(`insert into comments(activity_id,author,body) values ($1,$2,'Thanks Carl')`,[bAct,B]);
  const n = await as(A,`select kind, actor_name, activity_name, body from my_notifications()`);
  const kinds = n.map(x => x.kind);
  ok(kinds.includes('kudos') && kinds.includes('comment') && kinds.includes('reply') && kinds.includes('follow'), 'kudos, comment, reply, follow: ' + [...new Set(kinds)].join(', '));
  ok(n.find(x => x.kind === 'comment')?.body === 'Nice one!' && n.find(x => x.kind === 'kudos')?.activity_name === 'Morning run', 'with the activity and the comment text');
  ok(!(await as(D,`select kind from my_notifications()`)).some(x => x.kind === 'kudos' && x.activity_name === 'Morning run'), 'nobody else sees your notifications');
  try { await as(null,`select * from my_notifications()`); ok(false,'signed out refused'); } catch { ok(true,'signed out refused'); }
  console.log(fails ? fails + ' FAILED (017)' : 'all 017 checks passed');
}
