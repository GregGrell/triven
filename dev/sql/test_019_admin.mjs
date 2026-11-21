// Owner dashboard and feedback (019): only admins see stats; counters; feedback permissions and notifications.
import t18 from './test_018_delete.mjs';
import fs from 'fs';
export default async function (db) {
  await t18(db);
  const B='aaaaaaaa-0000-4000-8000-000000000002',C='aaaaaaaa-0000-4000-8000-000000000003',D='aaaaaaaa-0000-4000-8000-000000000004';
  await db.query(`update profiles set handle='carlg' where id=$1`,[B]);           // B plays the owner here (A was deleted by 018)
  const apply = () => db.exec(fs.readFileSync(new URL('../../supabase/019_admin.sql', import.meta.url), 'utf8'));
  // 008 (sync) isn't in the test schema; admin_stats only needs this much of its table
  await db.exec(`create table if not exists public.sync_inbox (id uuid primary key default gen_random_uuid(), owner uuid, provider text, external_id text, status text, activity_id uuid, created_at timestamptz default now())`);
  await apply(); await apply();
  let fails = 0;
  const as = async (u, sql, params=[]) => { await db.exec(`reset role; select set_config('test.uid','${u||''}',false); set role ${u ? 'authenticated' : 'anon'};`); try { return (await db.query(sql, params)).rows; } finally { await db.exec('reset role'); } };
  const ok = (c, m) => { console.log((c?'  ok  ':'  FAIL ')+m); if(!c) fails++; };
  const refused = async (u, sql, p=[]) => { try { await as(u, sql, p); return false; } catch { return true; } };
  console.log('— 019 admin and feedback');
  ok((await as(B,`select is_admin() a`))[0].a === true && (await as(C,`select is_admin() a`))[0].a === false, 'the owner (by username) is the admin; others are not');
  await as(C,`select touch_day()`); await as(C,`select touch_day()`); await as(D,`select touch_day()`);
  await as(null,`select count_view('landing')`); await as(null,`select count_view('landing')`); await as(null,`select count_view('nonsense')`); await as(C,`select count_view('app')`);
  const views = (await db.query(`select page, n from page_views order by page`)).rows;
  ok(JSON.stringify(views) === JSON.stringify([{page:'app',n:1},{page:'landing',n:2}]), 'visits counted per page per day, unknown pages ignored: ' + JSON.stringify(views));
  ok((await db.query(`select count(*)::int n from user_days`)).rows[0].n === 2, 'one active-day row per person per day');
  ok(await refused(null, `select * from user_days`) && await refused(C, `select * from page_views`), 'counters are not readable by anyone directly');
  await as(C,`insert into feedback(kind, body, page) values ('feature','Please add a turbo trainer mode','#feed')`);
  await as(D,`insert into feedback(kind, body) values ('problem','Upload stuck at 90%')`);
  ok(await refused(C, `insert into feedback(kind, body, user_id) values ('feature','pretend',$1)`, [D]), "can't send feedback as someone else");
  ok(await refused(C, `insert into feedback(kind, body, status) values ('feature','sneaky','done')`), "can't set your own status");
  ok((await as(C,`select body from feedback`)).length === 1, 'people see only their own feedback');
  ok((await as(B,`select body from feedback`)).length === 2, 'the admin sees all of it');
  await as(C,`update feedback set status='done'`);
  ok((await db.query(`select count(*)::int n from feedback where status='done'`)).rows[0].n === 0, "people can't change the status");
  const nb = await as(B,`select kind from my_notifications()`);
  ok(nb.filter(x => x.kind.startsWith('feedback_')).length === 2, 'the admin is notified of new feedback: ' + nb.map(x=>x.kind).join(','));
  await as(B,`update feedback set status='planned', admin_note='On the list' where kind='feature'`);
  const nc = await as(C,`select kind, club_name, body from my_notifications()`);
  ok(nc.some(x => x.kind === 'feedback_status' && x.club_name === 'planned'), 'the sender hears when its status changes');
  const s = (await as(B,`select admin_stats(30) s`))[0].s;
  ok(s.totals.active_7 === 2 && s.totals.feedback_new === 1 && s.daily.length === 30 && s.feedback.length === 2 && s.recent.length > 0, 'admin_stats: ' + JSON.stringify(s.totals).slice(0, 200));
  ok(await refused(C, `select admin_stats(30)`) && await refused(null, `select admin_stats(30)`), 'nobody else can read the stats');
  console.log(fails ? fails + ' FAILED (019)' : 'all 019 checks passed');
}
