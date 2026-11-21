// Bike distance trophies (014).
import t13 from './test_013_bests.mjs';
import fs from 'fs';
export default async function (db) {
  await t13(db);
  await db.exec(fs.readFileSync(new URL('../../supabase/014_bike_trophies.sql', import.meta.url), 'utf8'));
  const A='aaaaaaaa-0000-4000-8000-000000000001';
  let fails = 0;
  const as = async (u, sql, params=[]) => { await db.exec(`reset role; select set_config('test.uid','${u||''}',false); set role ${u ? 'authenticated' : 'anon'};`); try { return (await db.query(sql, params)).rows; } finally { await db.exec('reset role'); } };
  const ok = (c, m) => { console.log((c?'  ok  ':'  FAIL ')+m); if(!c) fails++; };
  console.log('— 014 bike trophies');
  const id = (await db.query(`insert into activities(owner,name,sport,start_time,utc_offset_min,visibility,share) values ($1,'70.3','bike','2026-03-01T05:00Z',180,'followers','{"pace":true}') returning id`,[A])).rows[0].id;
  await db.query(`insert into best_efforts(owner,activity_id,sport,effort,value,unit,achieved_at) values ($1,$2,'bike','90 km',9000,'s','2026-03-01T07:30Z')`,[A,id]);
  const t = await as(A,`select effort, rank, year_rank from activity_trophies($1)`,[id]);
  ok(t.length === 1 && t[0].effort === '90 km' && t[0].rank === 1 && t[0].year_rank === 1, 'a 90 km ride gets a trophy');
  console.log(fails ? fails + ' FAILED (014)' : 'all 014 checks passed');
}
