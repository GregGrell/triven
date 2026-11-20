export default async function (db) {
  const A='aaaaaaaa-0000-4000-8000-000000000001',B='aaaaaaaa-0000-4000-8000-000000000002',C='aaaaaaaa-0000-4000-8000-000000000003',D='aaaaaaaa-0000-4000-8000-000000000004';
  await db.exec(`grant usage on schema public, storage, auth to authenticated; grant all on all tables in schema public to authenticated; grant all on storage.objects to authenticated; grant usage on all sequences in schema storage to authenticated; grant execute on all functions in schema public to authenticated; grant execute on all functions in schema auth to authenticated;`);
  for (const [u,n] of [[A,'Carl'],[B,'Bea'],[C,'Cat'],[D,'Dan']]) await db.query(`insert into auth.users(id,email,raw_user_meta_data) values ($1,$2,jsonb_build_object('display_name',$3::text))`,[u,n+'@x',n]);
  let fails=0;
  const as = async (u, sql, params=[]) => { await db.exec(`reset role; select set_config('test.uid','${u}',false); set role authenticated;`); try { return (await db.query(sql, params)).rows; } finally { await db.exec('reset role'); } };
  const ok = (c, m) => { console.log((c?'  ok  ':'  FAIL ')+m); if(!c) fails++; };
  const err = async (u, sql, m, params=[]) => { try { await as(u, sql, params); ok(false, m+' (expected an error)'); } catch(e){ ok(true, m+' → '+e.message); } };
  const act = async (u, name, t, vis='followers', sport='run') => (await db.query(`insert into activities(owner,name,sport,start_time,distance_m,elapsed_s,visibility,summary) values ($1,$2,$7,$3,$4,$5,$6,'{"track":[[25.3,51.5,0],[25.31,51.51,0]]}') returning id`,[u,name,t,5000,1500,vis,sport])).rows[0].id;

  console.log('— profile privacy');
  const a1 = await act(A,'Carl public run','2026-11-01T06:00Z','public');
  ok((await as(D,`select can_view_activity($1) v`,[a1]))[0].v === true, 'stranger sees public activity when audience=everyone');
  await db.query(`update profiles set feed_audience='followers' where id=$1`,[A]);
  ok((await as(D,`select can_view_activity($1) v`,[a1]))[0].v === false, 'stranger blocked when audience=followers');
  ok((await as(D,`select count(*)::int n from feed('everyone')`))[0].n === 0, 'not in Everyone feed either');
  await as(B,`insert into follows(followee) values ($1)`,[A]);
  ok((await as(B,`select can_view_activity($1) v`,[a1]))[0].v === true, 'follower sees it');
  await db.query(`update profiles set feed_audience='everyone', searchable=false where id=$1`,[A]);
  ok((await as(D,`select can_view_activity($1) v`,[a1]))[0].v === false, 'hidden profile: stranger blocked even with everyone');
  await db.query(`update profiles set searchable=true where id=$1`,[A]);

  console.log('— clubs');
  const club = (await as(A,`select (create_club('Doha Tri','Swim bike run',true,'approval')).id`))[0].id;
  ok((await as(D,`select count(*)::int n from search_clubs('doha')`))[0].n === 1, 'listed club found in search');
  const j = (await as(D,`select join_listed_club($1) r`,[club]))[0].r; ok(j.status === 'pending', 'approval club: join is a request');
  ok((await as(D,`select club_page($1) p`,[club]))[0].p.members === null, 'pending member can\'t see members');
  ok((await as(D,`select shares_club($1,$2) v`,[A,D]))[0].v === false, 'pending is not a club mate');
  const pg = (await as(A,`select club_page($1) p`,[club]))[0].p; ok(pg.pending.length === 1 && pg.my_role === 'owner', 'admin sees the request');
  await err(D,`select review_member($1,$2,true)`, 'non-admin can\'t approve', [club, D]);
  await as(A,`select review_member($1,$2,true)`,[club,D]);
  ok((await as(D,`select shares_club($1,$2) v`,[A,D]))[0].v === true, 'approved → club mate');
  await err(D,`insert into club_posts(club_id, body) values ($1,'hi')`, 'member can\'t post', [club]);
  await as(A,`insert into club_posts(club_id, body) values ($1,'Sunday ride 6am')`,[club]);
  ok((await as(D,`select club_page($1) p`,[club]))[0].p.posts.length === 1, 'member reads the post');
  await err(D,`select update_club($1,'Hacked')`, 'member can\'t rename', [club]);
  const upd = await as(D,`update clubs set name='x' where id=$1 returning id`,[club]); ok(upd.length===0,'direct update changes nothing');
  await as(A,`select update_club($1, p_listed => false)`,[club]);
  ok((await as(C,`select club_page($1) p`,[club]))[0].p === null, 'unlisted club hidden from outsiders');
  const code = (await as(A,`select invite_code from clubs where id=$1`,[club]))[0].invite_code;
  ok((await as(C,`select club_preview($1) p`,[code]))[0].p.name === 'Doha Tri', 'invite link preview works');
  await as(A,`select update_club($1, p_policy => 'open')`,[club]);
  ok((await as(C,`select join_club($1) r`,[code.toUpperCase()]))[0].r.status === 'active', 'open club: invite link joins straight away');
  await err(C,`select remove_member($1,$2)`, 'member can\'t remove others', [club, D]);
  await as(A,`select set_member_role($1,$2,'admin')`,[club,C]);
  await as(C,`select remove_member($1,$2)`,[club,D]); ok((await as(A,`select club_page($1) p`,[club]))[0].p.members_count === 2, 'admin removes a member');
  await as(A,`insert into storage.objects(bucket_id,name) values ('avatars', 'clubs/'||$1||'/a.jpg')`,[club]); ok(true,'admin uploads club photo');
  await err(D,`insert into storage.objects(bucket_id,name) values ('avatars', 'clubs/'||$1||'/b.jpg')`, 'non-member can\'t upload club photo', [club]);
  await as(A,`delete from club_members where club_id=$1 and user_id=$2`,[club,A]);
  const after = await db.query(`select user_id, role from club_members where club_id=$1`,[club]); ok(after.rows.length===1 && after.rows[0].role==='owner' && after.rows[0].user_id===C, 'owner leaves → admin takes over');
  await as(C,`delete from club_members where club_id=$1 and user_id=$2`,[club,C]);
  ok((await db.query(`select count(*)::int n from clubs where id=$1`,[club])).rows[0].n === 0, 'last member leaves → club deleted');
  const my = await as(A,`select * from my_clubs()`); ok(Array.isArray(my), 'my_clubs runs');

  console.log('— club feed');
  const club2 = (await as(A,`select (create_club('Run club')).id`))[0].id;
  const code2 = (await as(A,`select invite_code from clubs where id=$1`,[club2]))[0].invite_code;
  await as(C,`select join_club($1)`,[code2]);
  const c1 = await act(C,'Cat club run','2026-11-02T06:00Z','club');
  ok((await as(A,`select count(*)::int n from feed('club', now(), 20, $1) where id=$2`,[club2,c1]))[0].n === 1, 'club feed shows club mate');
  ok((await as(D,`select count(*)::int n from feed('club', now(), 20, $1)`,[club2]))[0].n === 0, 'outsider gets nothing for that club');

  console.log('— relays');
  await as(A,`insert into follows(followee) values ($1)`,[B]);   // B already follows A → mutual
  const ra = await act(A,'Carl swim leg','2026-11-10T06:00Z','followers','swim');
  const rb = await act(B,'Bea bike leg','2026-11-10T06:25Z','followers','bike');
  const rbPriv = await act(B,'Bea private','2026-11-10T07:00Z','private','run');
  const rc = await act(C,'Cat run leg','2026-11-10T07:30Z','club','run');
  const cand = await as(A,`select activity_id from relay_candidates($1)`,[ra]);
  ok(cand.some(c=>c.activity_id===rb) && !cand.some(c=>c.activity_id===rbPriv), 'candidates: mutual follower\'s visible activities only');
  ok(!cand.some(c=>c.activity_id===rc), 'candidates: not a mutual follower → excluded');
  await err(A,`select start_relay($1,$2,$3)`, 'can\'t pick an activity you can\'t see', [ra,B,rbPriv]);
  await err(A,`select start_relay($1,$2)`, 'can\'t invite a non-mutual follower', [ra,C]);
  const rid = (await as(A,`select start_relay($1,$2,$3,'Doha relay') r`,[ra,B,rb]))[0].r;
  ok((await as(A,`select count(*)::int n from feed('me') where relay is not null`))[0].n === 0, 'not shown as relay until accepted');
  const inv = await as(B,`select * from my_relay_invites()`); ok(inv.length===1 && inv[0].activity_id===rb, 'Bea sees the invitation with her activity suggested');
  await err(B,`select respond_relay($1,true,$2)`, 'can\'t accept with someone else\'s activity', [rid, ra]);
  await as(B,`select respond_relay($1,true)`,[rid]);
  const fr = await as(A,`select relay from feed('me') where id=$1`,[ra]); ok(fr[0].relay?.legs?.length===2, 'relay on Carl\'s feed with both legs');
  const fb = await as(B,`select relay from feed('me') where id=$1`,[rb]); ok(fb[0].relay?.id===rid, 'and on Bea\'s feed');
  // stranger D: Carl's audience everyone, Bea's activity followers-only
  await db.query(`update activities set visibility='public' where id=$1`,[ra]);
  const v = (await as(D,`select relay_view($1) r`,[rid]))[0].r; const bl = v.legs.find(l=>l.owner===B);
  ok(v && bl.activity_id===null && bl.name===null && bl.track===null && bl.elapsed_s!=null, 'stranger: Bea\'s leg shows time only, no link/name/route');
  ok((await as(D,`select relay_view($1) r`,[rid]))[0].r.legs.length===2, 'pending legs hidden from non-members');
  await as(B,`select leave_relay($1)`,[rid]);
  ok((await db.query(`select count(*)::int n from relays where id=$1`,[rid])).rows[0].n===0, 'one leaves a 2-leg relay → relay gone');
  ok((await db.query(`select count(*)::int n from activities where id in ($1,$2)`,[ra,rb])).rows[0].n===2, 'both activities untouched');
  // invite without picking; decline
  const rid2 = (await as(A,`select start_relay($1,$2) r`,[ra,B]))[0].r;
  await err(B,`select respond_relay($1,true)`, 'accept needs an activity when none suggested', [rid2]);
  await as(B,`select respond_relay($1,false)`,[rid2]);
  ok((await db.query(`select count(*)::int n from relays where id=$1`,[rid2])).rows[0].n===0, 'decline → relay gone');
  const far = await act(B,'Bea next day','2026-11-11T10:00Z','followers','bike');
  const rid3 = (await as(A,`select start_relay($1,$2) r`,[ra,B]))[0].r;
  await err(B,`select respond_relay($1,true,$2)`, '12-hour window enforced', [rid3, far]);
  await db.query(`delete from activities where id=$1`,[ra]);
  ok((await db.query(`select count(*)::int n from relays where id=$1`,[rid3])).rows[0].n===0, 'deleting the activity removes the relay');

  console.log('— trophies');
  const t = [];
  for (const [d,v] of [['2026-01-01',1300],['2026-02-01',1250],['2026-03-01',1280],['2026-04-01',1240],['2026-05-01',1290],['2026-05-15',1260]]) {
    const id = await act(A,'5k '+d,d+'T06:00Z','public'); t.push(id);
    await db.query(`insert into best_efforts(owner,activity_id,sport,effort,value,unit,achieved_at) values ($1,$2,'run','5 km',$3,'s',$4)`,[A,id,v,d+'T06:00Z']);
  }
  const rk = async (i,u=A) => (await as(u,`select rank from activity_trophies($1) where effort='5 km'`,[t[i]]))[0]?.rank ?? null;
  ok(await rk(0)===1 && await rk(1)===1 && await rk(2)===2 && await rk(3)===1 && await rk(4)===null && await rk(5)===3, 'ranks as of the day: gold, gold, silver, gold, none (4th), bronze');
  await db.query(`update activities set share = share || '{"pace":false}' where id=$1`,[t[3]]);
  ok(await rk(3,B)===null && await rk(3)===1, 'pace not shared: others don\'t see the trophy, owner does');
  const bk = await act(A,'power ride','2026-06-01T06:00Z','public','bike');
  await db.query(`insert into best_efforts(owner,activity_id,sport,effort,value,unit,achieved_at) values ($1,$2,'bike','power 20 min',300,'W','2026-06-01T06:00Z'),($1,$2,'bike','10 mile TT',1500,'s','2026-06-01T06:00Z')`,[A,bk]);
  const tb = await as(A,`select effort from activity_trophies($1)`,[bk]); ok(tb.length===1 && tb[0].effort==='power 20 min', 'power trophy yes, bike TT distance no');
  console.log(fails ? `${fails} FAILED` : 'all passed');
}
