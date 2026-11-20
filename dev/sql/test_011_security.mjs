// Security fixes: the attacks found in the 20 Nov 2026 review must fail; normal use must still work.
import t1 from './test_010_social.mjs';
import fs from 'fs';
export default async function (db) {
  await t1(db);   // everything from 010 still passes with 011 applied
  await db.exec(fs.readFileSync(new URL('../../supabase/011_security.sql', import.meta.url), 'utf8'));   // t1's setup re-grants everything, as Supabase's defaults do
  const A='aaaaaaaa-0000-4000-8000-000000000001',B='aaaaaaaa-0000-4000-8000-000000000002',D='aaaaaaaa-0000-4000-8000-000000000004';
  let fails = 0;
  const as = async (u, sql, params=[]) => { await db.exec(`reset role; select set_config('test.uid','${u||''}',false); set role ${u ? 'authenticated' : 'anon'};`); try { return (await db.query(sql, params)).rows; } finally { await db.exec('reset role'); } };
  const ok = (c, m) => { console.log((c?'  ok  ':'  FAIL ')+m); if(!c) fails++; };
  const err = async (u, sql, m, params=[]) => { try { await as(u, sql, params); ok(false, m+' (expected an error)'); } catch(e){ ok(true, m+' → '+e.message.slice(0,80)); } };
  console.log('— 011 security');
  // join an approval-only club by calling the internal helper with a forged row
  const club = (await as(A,`select (create_club('Locked club','',true,'approval')).id`))[0].id;
  await err(D,`select join_club_row(row($1::uuid,'x','zzz',$2::uuid,now(),null,null,true,'open')::clubs)`, 'forged join_club_row is refused', [club, A]);
  ok((await as(D,`select join_listed_club($1) r`,[club]))[0].r.status === 'pending', 'normal join still waits for approval');
  await err(D,`select relay_json(gen_random_uuid())`, 'relay_json not callable directly');
  await err(D,`select is_following($1,$2)`, 'follow graph oracle closed', [A,B]);
  await err(D,`select shares_club($1,$2)`, 'club membership oracle closed', [A,B]);
  // hijack someone's full streams file / media
  const victim = (await db.query(`insert into activities(owner,name,sport,start_time,visibility,streams_path) values ($1::uuid,'v','run',now(),'followers',$1::text||'/v.json') returning id`,[B])).rows[0].id;
  await err(D,`insert into activities(name,sport,start_time,visibility,streams_path) values ('x','run',now(),'public',$1||'/'||$2||'.full.json')`, 'own activity pointing at someone else’s full streams is refused', [B, victim]);
  await err(D,`insert into activities(name,sport,start_time,visibility,streams_path) values ('x','run',now(),'public',$1::text||'/x.json')`, 'own activity pointing into someone else’s folder is refused', [B]);
  const mine = (await as(D,`insert into activities(name,sport,start_time,visibility,streams_path) values ('x','run',now(),'public',$1::text||'/x.json') returning id`,[D]))[0]?.id;
  ok(!!mine, 'normal activity with your own path still saves');
  await err(D,`insert into activity_media(activity_id,path,kind) values ($1::uuid,$2::text||'/'||$1::text||'/p.jpg','photo')`, 'can’t attach media to someone else’s activity', [victim, D]);
  await err(D,`insert into activity_media(activity_id,path,kind) values ($1::uuid,$2::text||'/p.jpg','photo')`, 'can’t point media at someone else’s file', [mine, B]);
  // signed out: nothing
  await err(null,`select * from feed('everyone')`, 'signed out: feed refused');
  await err(null,`select * from profiles`, 'signed out: tables refused');
  await err(null,`select club_preview('abc')`, 'signed out: club preview refused');
  // signed-in features still work
  ok((await as(A,`select count(*)::int n from feed('me')`))[0].n >= 0 && (await as(B,`select display_name from profiles where id=$1`,[A])).length === 1, 'feed and follower profile reads still work');
  console.log(fails ? fails + ' FAILED (011)' : 'all 011 checks passed');
}
