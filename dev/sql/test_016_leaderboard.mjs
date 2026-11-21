// Club leaderboard (016): members' totals, multisport legs by sport, only what the viewer may see, members only.
import t14 from './test_014_bike_trophies.mjs';
import fs from 'fs';
export default async function (db) {
  await t14(db);
  const apply = () => db.exec(fs.readFileSync(new URL('../../supabase/016_leaderboard.sql', import.meta.url), 'utf8'));
  await apply(); await apply();
  const A='aaaaaaaa-0000-4000-8000-000000000001',B='aaaaaaaa-0000-4000-8000-000000000002',D='aaaaaaaa-0000-4000-8000-000000000004';
  let fails = 0;
  const as = async (u, sql, params=[]) => { await db.exec(`reset role; select set_config('test.uid','${u||''}',false); set role ${u ? 'authenticated' : 'anon'};`); try { return (await db.query(sql, params)).rows; } finally { await db.exec('reset role'); } };
  const ok = (c, m) => { console.log((c?'  ok  ':'  FAIL ')+m); if(!c) fails++; };
  console.log('— 016 leaderboard');
  const club = (await as(A,`select (create_club('LB club')).id`))[0].id;
  await db.query(`insert into club_members(club_id,user_id,role,status) values ($1,$2,'member','active') on conflict (club_id,user_id) do update set status='active'`,[club,B]);
  const add = async (u, sport, km, vis, prof=null) => (await db.query(`insert into activities(owner,name,sport,multisport_profile,start_time,utc_offset_min,visibility,distance_m,elapsed_s,moving_s,ascent_m) values ($1,'x',$2,$5,'2030-06-10T05:00Z',180,$3,$4,3600,3600,10) returning id`,[u,sport,vis,km*1000,prof])).rows[0].id;
  await add(A,'run',10,'club'); await add(A,'run',5,'private');
  await add(B,'run',8,'club'); await add(B,'bike',40,'club');
  const tri = await add(B,'multi',25.75,'club','triathlon');
  await db.query(`insert into activity_sections(activity_id,idx,sport,start_offset_s,elapsed_s,distance_m) values ($1,0,'swim',0,900,750),($1,1,'transition',900,60,0),($1,2,'bike',960,2400,20000),($1,3,'run',3360,1500,5000)`,[tri]);
  const lb = async (u, sp='all') => Object.fromEntries((await as(u,`select user_id, n, dist from club_leaderboard($1,'2030-06-01','2030-07-01',$2)`,[club,sp])).map(r => [r.user_id, r]));
  let r = await lb(A, 'run');
  ok(+r[A].dist === 10000 && +r[B].dist === 13000, `runs: A 10 km (private 5 km left out), B 8 km + 5 km tri run leg: ${r[A].dist}, ${r[B].dist}`);
  r = await lb(B, 'run');
  ok(+r[A].dist === 10000, 'B doesn’t see A’s private run');
  r = await lb(B, 'bike'); ok(+r[B].dist === 60000 && r[B].n === 2, 'bike: 40 km ride + 20 km tri bike leg, 2 activities');
  r = await lb(B, 'all'); ok(+r[B].dist === 8000 + 40000 + 25750, `all sports: ${r[B].dist}`);
  ok((await as(D,`select count(*)::int n from club_leaderboard($1,'2030-06-01','2030-07-01','all')`,[club]))[0].n === 0, 'non-members get nothing');
  console.log(fails ? fails + ' FAILED (016)' : 'all 016 checks passed');
}
