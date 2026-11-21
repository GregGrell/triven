// Ignored bests and yearly trophies.
import t12 from './test_012_links.mjs';
import fs from 'fs';
export default async function (db) {
  await t12(db);
  const apply = () => db.exec(fs.readFileSync(new URL('../../supabase/013_bests.sql', import.meta.url), 'utf8'));
  await apply(); await apply();
  const A='aaaaaaaa-0000-4000-8000-000000000001',B='aaaaaaaa-0000-4000-8000-000000000002',D='aaaaaaaa-0000-4000-8000-000000000004';
  let fails = 0;
  const as = async (u, sql, params=[]) => { await db.exec(`reset role; select set_config('test.uid','${u||''}',false); set role ${u ? 'authenticated' : 'anon'};`); try { return (await db.query(sql, params)).rows; } finally { await db.exec('reset role'); } };
  const ok = (c, m) => { console.log((c?'  ok  ':'  FAIL ')+m); if(!c) fails++; };
  const err = async (u, sql, m, params=[]) => { try { await as(u, sql, params); ok(false, m+' (expected an error)'); } catch(e){ ok(true, m+' → '+e.message.slice(0,70)); } };
  console.log('— 013 bests');
  // four rides with 20-min power: 2025: 280, 300; 2026: 900 (spike), 290
  const mk = async (day, w) => { const id = (await db.query(`insert into activities(owner,name,sport,start_time,utc_offset_min,visibility,share) values ($1,'ride','bike',$2,180,'followers','{"power":true}') returning id`,[A, day+'T05:00Z'])).rows[0].id;
    await db.query(`insert into best_efforts(owner,activity_id,sport,effort,value,unit,achieved_at) values ($1,$2,'bike','power 20 min',$3,'W',$4)`,[A,id,w,day+'T06:00Z']); return id; };
  const r1 = await mk('2025-03-01',280), r2 = await mk('2025-09-01',300), spike = await mk('2026-02-01',900), r4 = await mk('2026-05-01',290);
  const tro = async (id, u=A) => (await as(u,`select rank, year_rank, yr from activity_trophies($1) where effort='power 20 min'`,[id]))[0] || null;
  let t = await tro(r4);
  ok(t && t.rank === 3 && t.year_rank === 2 && t.yr === 2026, '290 W in 2026 with the spike counted: 3rd all-time, 2nd of 2026');
  await err(D,`insert into best_ignores(owner,activity_id,sport,effort) values ($1,$2,'bike','power 20 min')`, 'can’t ignore someone else’s effort', [D, spike]);
  await as(A,`insert into best_ignores(activity_id,sport,effort) values ($1,'bike','power 20 min')`,[spike]);
  t = await tro(r4);
  ok(t && t.rank === 2 && t.year_rank === 1, 'spike ignored: 290 W becomes 2nd all-time and best of 2026');
  ok(await tro(spike) === null, 'the ignored spike gets no trophy');
  await db.query(`insert into follows(follower,followee,status) values ($1,$2,'accepted') on conflict (follower,followee) do update set status='accepted'`,[D,A]);
  ok((await tro(r4, D))?.year_rank === 1, 'a follower sees the same (power shared)');
  const pb = (await as(A,`select athlete_page($1) p`,[A]))[0].p.bests.find(b => b.effort === 'power 20 min');
  ok(pb && +pb.value === 300, 'profile best skips the ignored spike: 300 W');
  ok((await as(D,`select count(*)::int n from best_ignores`))[0].n === 0, 'others can’t see your ignores');
  await as(A,`delete from best_ignores where activity_id=$1`,[spike]);
  ok((await tro(r4)).rank === 3, 'restoring brings it back');
  // re-processing an activity rewrites its bests; the ignore stays
  await as(A,`insert into best_ignores(activity_id,sport,effort) values ($1,'bike','power 20 min')`,[spike]);
  await db.query(`delete from best_efforts where activity_id=$1`,[spike]);
  await db.query(`insert into best_efforts(owner,activity_id,sport,effort,value,unit,achieved_at) values ($1,$2,'bike','power 20 min',900,'W','2026-02-01T06:00Z')`,[A,spike]);
  ok((await tro(r4)).rank === 2, 'ignore survives the bests being rewritten');
  await err(null,`select * from activity_trophies($1)`, 'signed out: refused', [r4]);
  console.log(fails ? fails + ' FAILED (013)' : 'all 013 checks passed');
}
