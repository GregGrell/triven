-- 010: profile privacy (who can see your feed), clubs (pages, posts, photos, listing, approval), relays, PB trophies.

-- =====================================================================
-- Profile privacy
-- =====================================================================
-- feed_audience caps who can see any of your activities, whatever each activity's own setting says:
--   everyone         = no extra limit (only applies while you are searchable; hidden profiles act as followers_clubs)
--   followers        = only people you've accepted as followers
--   followers_clubs  = followers and club mates
alter table public.profiles add column if not exists feed_audience text not null default 'everyone';
alter table public.profiles drop constraint if exists profiles_feed_audience_check;
alter table public.profiles add constraint profiles_feed_audience_check check (feed_audience in ('everyone','followers','followers_clubs'));
alter table public.profiles add column if not exists privacy_set boolean not null default false;   -- false until the person has made the first-time choice

-- =====================================================================
-- Clubs
-- =====================================================================
alter table public.clubs add column if not exists description text;
alter table public.clubs add column if not exists avatar_path text;
alter table public.clubs add column if not exists listed boolean not null default false;          -- shows in club search
alter table public.clubs add column if not exists join_policy text not null default 'open';
alter table public.clubs drop constraint if exists clubs_join_policy_check;
alter table public.clubs add constraint clubs_join_policy_check check (join_policy in ('open','approval'));
alter table public.club_members add column if not exists status text not null default 'active';
alter table public.club_members drop constraint if exists club_members_status_check;
alter table public.club_members add constraint club_members_status_check check (status in ('active','pending'));

-- only active members count as club mates
create or replace function public.shares_club(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from club_members m1 join club_members m2 on m1.club_id = m2.club_id
                 where m1.user_id = a and m2.user_id = b and m1.status = 'active' and m2.status = 'active');
$$;
create or replace function public.is_club_member(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from club_members where club_id = cid and user_id = auth.uid() and status = 'active');
$$;
create or replace function public.is_club_admin(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from club_members where club_id = cid and user_id = auth.uid() and status = 'active' and role in ('owner','admin'));
$$;
revoke execute on function public.is_club_admin(uuid) from anon;

-- who can see someone's activities at all (their feed audience)
create or replace function public.audience_ok(owner_id uuid, viewer uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select owner_id = viewer or coalesce((
    select case
      when p.feed_audience = 'everyone' and p.searchable then true
      when p.feed_audience = 'followers' then public.is_following(viewer, owner_id)
      else public.is_following(viewer, owner_id) or public.shares_club(owner_id, viewer) end
    from profiles p where p.id = owner_id), false);
$$;
revoke execute on function public.audience_ok(uuid, uuid) from anon;

create or replace function public.can_view_activity(aid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from activities a where a.id = aid and (
      a.owner = auth.uid()
      or (public.audience_ok(a.owner, auth.uid()) and (
            a.visibility = 'public'
         or (a.visibility = 'club' and public.shares_club(a.owner, auth.uid()))
         or (a.visibility = 'followers' and (public.is_following(auth.uid(), a.owner) or public.shares_club(a.owner, auth.uid())))))));
$$;
revoke execute on function public.can_view_activity(uuid) from anon;

drop policy if exists clubs_read on public.clubs;
create policy clubs_read on public.clubs for select to authenticated
  using (listed or created_by = auth.uid() or exists (select 1 from club_members m where m.club_id = id and m.user_id = auth.uid()));
drop policy if exists clubs_update on public.clubs;          -- changes go through update_club()
drop policy if exists clubs_insert on public.clubs;          -- and create_club()
drop policy if exists members_read on public.club_members;
create policy members_read on public.club_members for select to authenticated using (user_id = auth.uid() or public.is_club_member(club_id));

-- admin messages on the club page
create table if not exists public.club_posts (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  author uuid not null references auth.users(id) on delete cascade default auth.uid(),
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists club_posts_club on public.club_posts(club_id, created_at desc);
alter table public.club_posts enable row level security;
drop policy if exists club_posts_read on public.club_posts;
create policy club_posts_read on public.club_posts for select to authenticated using (public.is_club_member(club_id));
drop policy if exists club_posts_write on public.club_posts;
create policy club_posts_write on public.club_posts for insert to authenticated with check (author = auth.uid() and public.is_club_admin(club_id));
drop policy if exists club_posts_delete on public.club_posts;
create policy club_posts_delete on public.club_posts for delete to authenticated using (author = auth.uid() or public.is_club_admin(club_id));

-- club photos live in the public avatars bucket under clubs/<club id>/, written by that club's admins
create or replace function public.can_edit_club_file(path text) returns boolean
language sql stable security definer set search_path = public as $$
  select (storage.foldername(path))[1] = 'clubs' and exists (
    select 1 from club_members where club_id::text = (storage.foldername(path))[2] and user_id = auth.uid() and status = 'active' and role in ('owner','admin'));
$$;
revoke execute on function public.can_edit_club_file(text) from anon;
drop policy if exists club_avatar_insert on storage.objects;
create policy club_avatar_insert on storage.objects for insert to authenticated with check (bucket_id = 'avatars' and public.can_edit_club_file(name));
drop policy if exists club_avatar_update on storage.objects;
create policy club_avatar_update on storage.objects for update to authenticated using (bucket_id = 'avatars' and public.can_edit_club_file(name));
drop policy if exists club_avatar_delete on storage.objects;
create policy club_avatar_delete on storage.objects for delete to authenticated using (bucket_id = 'avatars' and public.can_edit_club_file(name));

-- when the owner leaves, the longest-serving admin (else member) takes over; an empty club is deleted
create or replace function public.club_member_gone() returns trigger
language plpgsql security definer set search_path = public as $$
declare nxt uuid;
begin
  if not exists (select 1 from clubs where id = old.club_id) then return null; end if;
  if old.role = 'owner' and old.status = 'active' then
    select user_id into nxt from club_members where club_id = old.club_id and status = 'active'
      order by (role = 'admin') desc, joined_at limit 1;
    if nxt is null then delete from clubs where id = old.club_id; return null; end if;
    update club_members set role = 'owner' where club_id = old.club_id and user_id = nxt;
    update clubs set created_by = nxt where id = old.club_id;
  end if;
  if not exists (select 1 from club_members where club_id = old.club_id and status = 'active') then delete from clubs where id = old.club_id; end if;
  return null;
end $$;
drop trigger if exists club_member_gone on public.club_members;
create trigger club_member_gone after delete on public.club_members for each row execute function public.club_member_gone();

drop function if exists public.create_club(text);
create or replace function public.create_club(club_name text, p_description text default null, p_listed boolean default false, p_policy text default 'open')
returns public.clubs language plpgsql security definer set search_path = public as $$
declare c clubs; n text := trim(coalesce(club_name, ''));
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if length(n) < 2 or length(n) > 80 then raise exception 'Club names are 2 to 80 characters'; end if;
  if p_policy not in ('open','approval') then raise exception 'Unknown join setting'; end if;
  insert into clubs(name, created_by, description, listed, join_policy)
    values (n, auth.uid(), nullif(left(trim(coalesce(p_description, '')), 1000), ''), coalesce(p_listed, false), p_policy) returning * into c;
  insert into club_members(club_id, user_id, role, status) values (c.id, auth.uid(), 'owner', 'active');
  return c;
end $$;

-- joining: open clubs let you straight in; approval clubs add a request for the admins
create or replace function public.join_club_row(c public.clubs) returns jsonb
language plpgsql security definer set search_path = public as $$
declare st text;
begin
  select status into st from club_members where club_id = c.id and user_id = auth.uid();
  if st is null then
    st := case when c.join_policy = 'approval' then 'pending' else 'active' end;
    insert into club_members(club_id, user_id, role, status) values (c.id, auth.uid(), 'member', st);
  end if;
  return jsonb_build_object('id', c.id, 'name', c.name, 'status', st);
end $$;
revoke execute on function public.join_club_row(public.clubs) from anon, public;

drop function if exists public.join_club(text);
create or replace function public.join_club(code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c clubs;
begin
  select * into c from clubs where invite_code = lower(trim(code));
  if c.id is null then raise exception 'Invite code not found'; end if;
  return public.join_club_row(c);
end $$;
create or replace function public.join_listed_club(cid uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c clubs;
begin
  select * into c from clubs where id = cid and listed;
  if c.id is null then raise exception 'That club is invite only'; end if;
  return public.join_club_row(c);
end $$;

-- what someone with an invite link sees before joining
create or replace function public.club_preview(code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', c.id, 'name', c.name, 'description', c.description, 'avatar', c.avatar_path, 'join_policy', c.join_policy,
    'members', (select count(*) from club_members m where m.club_id = c.id and m.status = 'active'),
    'my_status', (select status from club_members m where m.club_id = c.id and m.user_id = auth.uid()))
  from clubs c where c.invite_code = lower(trim(code));
$$;

create or replace function public.search_clubs(q text default '')
returns table (id uuid, name text, description text, avatar text, join_policy text, members int, my_status text)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.description, c.avatar_path, c.join_policy,
         (select count(*)::int from club_members m where m.club_id = c.id and m.status = 'active') n,
         (select m.status from club_members m where m.club_id = c.id and m.user_id = auth.uid())
  from clubs c
  where c.listed and (length(trim(coalesce(q, ''))) < 2 or c.name ilike '%' || trim(q) || '%')
  order by n desc, c.name limit 30;
$$;

create or replace function public.club_page(cid uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c clubs; me club_members; member boolean; admin boolean;
begin
  select * into c from clubs where id = cid;
  if c.id is null then return null; end if;
  select * into me from club_members where club_id = cid and user_id = auth.uid();
  member := me.status = 'active'; admin := member and me.role in ('owner','admin');
  if not (c.listed or me.user_id is not null) then return null; end if;
  return jsonb_build_object(
    'id', c.id, 'name', c.name, 'description', c.description, 'avatar', c.avatar_path, 'listed', c.listed, 'join_policy', c.join_policy,
    'members_count', (select count(*) from club_members m where m.club_id = cid and m.status = 'active'),
    'my_role', case when member then me.role end, 'my_status', me.status,
    'invite_code', case when member then c.invite_code end,
    'members', case when member then (select coalesce(jsonb_agg(jsonb_build_object('id', m.user_id, 'name', p.display_name, 'avatar', p.avatar_path, 'role', m.role)
        order by case m.role when 'owner' then 0 when 'admin' then 1 else 2 end, p.display_name), '[]'::jsonb)
      from club_members m join profiles p on p.id = m.user_id where m.club_id = cid and m.status = 'active') end,
    'pending', case when admin then (select coalesce(jsonb_agg(jsonb_build_object('id', m.user_id, 'name', p.display_name, 'avatar', p.avatar_path, 'since', m.joined_at) order by m.joined_at), '[]'::jsonb)
      from club_members m join profiles p on p.id = m.user_id where m.club_id = cid and m.status = 'pending') end,
    'posts', case when member then (select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) from (
        select jsonb_build_object('id', cp.id, 'author', cp.author, 'name', p.display_name, 'avatar', p.avatar_path, 'body', cp.body, 'created_at', cp.created_at) x
        from club_posts cp join profiles p on p.id = cp.author where cp.club_id = cid order by cp.created_at desc limit 50) t) end);
end $$;

-- admin changes; null leaves a field as it is, '' clears the description or photo
create or replace function public.update_club(cid uuid, p_name text default null, p_description text default null, p_listed boolean default null,
  p_policy text default null, p_avatar text default null, p_new_code boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_club_admin(cid) then raise exception 'Only club admins can change the club'; end if;
  if p_name is not null and (length(trim(p_name)) < 2 or length(trim(p_name)) > 80) then raise exception 'Club names are 2 to 80 characters'; end if;
  if p_policy is not null and p_policy not in ('open','approval') then raise exception 'Unknown join setting'; end if;
  if p_avatar is not null and p_avatar <> '' and p_avatar not like 'clubs/' || cid::text || '/%' then raise exception 'Bad photo path'; end if;
  update clubs set
    name = coalesce(nullif(trim(p_name), ''), name),
    description = case when p_description is null then description else nullif(left(trim(p_description), 1000), '') end,
    listed = coalesce(p_listed, listed),
    join_policy = coalesce(p_policy, join_policy),
    avatar_path = case when p_avatar is null then avatar_path else nullif(p_avatar, '') end,
    invite_code = case when p_new_code then encode(gen_random_bytes(6), 'hex') else invite_code end
  where id = cid;
  -- switching to open lets waiting requests in
  if p_policy = 'open' then update club_members set status = 'active' where club_id = cid and status = 'pending'; end if;
  return public.club_page(cid);
end $$;

create or replace function public.review_member(cid uuid, uid uuid, approve boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_club_admin(cid) then raise exception 'Only club admins can approve members'; end if;
  if approve then update club_members set status = 'active', joined_at = now() where club_id = cid and user_id = uid and status = 'pending';
  else delete from club_members where club_id = cid and user_id = uid and status = 'pending'; end if;
end $$;

create or replace function public.remove_member(cid uuid, uid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare mine text := (select role from club_members where club_id = cid and user_id = auth.uid() and status = 'active');
        theirs text := (select role from club_members where club_id = cid and user_id = uid);
begin
  if uid = auth.uid() then raise exception 'Use Leave to leave a club'; end if;
  if theirs is null then return; end if;
  if not (mine = 'owner' or (mine = 'admin' and theirs = 'member')) then raise exception 'You can''t remove this member'; end if;
  delete from club_members where club_id = cid and user_id = uid;
end $$;

-- the owner makes members admins (or back), or hands the club over
create or replace function public.set_member_role(cid uuid, uid uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if (select role from club_members where club_id = cid and user_id = auth.uid() and status = 'active') is distinct from 'owner' then raise exception 'Only the club owner can change roles'; end if;
  if uid = auth.uid() then raise exception 'Choose someone else'; end if;
  if not exists (select 1 from club_members where club_id = cid and user_id = uid and status = 'active') then raise exception 'Not a member'; end if;
  if p_role = 'owner' then
    update club_members set role = 'admin' where club_id = cid and user_id = auth.uid();
    update club_members set role = 'owner' where club_id = cid and user_id = uid;
    update clubs set created_by = uid where id = cid;
  elsif p_role in ('admin','member') then update club_members set role = p_role where club_id = cid and user_id = uid;
  else raise exception 'Unknown role'; end if;
end $$;

drop function if exists public.my_clubs();
create or replace function public.my_clubs()
returns table (id uuid, name text, invite_code text, role text, status text, members int, avatar text, listed boolean, join_policy text, pending int)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, case when m.status = 'active' then c.invite_code end, m.role, m.status,
         (select count(*)::int from club_members x where x.club_id = c.id and x.status = 'active'), c.avatar_path, c.listed, c.join_policy,
         case when m.status = 'active' and m.role in ('owner','admin') then (select count(*)::int from club_members x where x.club_id = c.id and x.status = 'pending') end
  from clubs c join club_members m on m.club_id = c.id and m.user_id = auth.uid()
  order by m.status, c.name;
$$;

-- =====================================================================
-- Relays: activities from mutual followers shown as one race. Each person's activity stays theirs (totals, bests, load).
-- =====================================================================
create table if not exists public.relays (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Relay' check (length(name) between 1 and 120),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.relay_legs (
  relay_id uuid not null references public.relays(id) on delete cascade,
  owner uuid not null references auth.users(id) on delete cascade,
  activity_id uuid unique references public.activities(id) on delete cascade,   -- null until an invited person picks their activity
  status text not null default 'pending' check (status in ('pending','accepted')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (relay_id, owner)
);
create index if not exists relay_legs_owner on public.relay_legs(owner, status);
alter table public.relays enable row level security;
alter table public.relay_legs enable row level security;
create or replace function public.is_relay_member(rid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from relay_legs where relay_id = rid and owner = auth.uid());
$$;
revoke execute on function public.is_relay_member(uuid) from anon;
drop policy if exists relays_read on public.relays;
create policy relays_read on public.relays for select to authenticated using (public.is_relay_member(id));
drop policy if exists relay_legs_read on public.relay_legs;
create policy relay_legs_read on public.relay_legs for select to authenticated using (public.is_relay_member(relay_id));
-- all changes go through the functions below

-- a relay needs two people: when a leg goes (left, declined, activity deleted) and fewer than two remain, the relay goes too
create or replace function public.relay_leg_gone() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from relays where id = old.relay_id) and (select count(*) from relay_legs where relay_id = old.relay_id) < 2 then
    delete from relays where id = old.relay_id;
  end if;
  return null;
end $$;
drop trigger if exists relay_leg_gone on public.relay_legs;
create trigger relay_leg_gone after delete on public.relay_legs for each row execute function public.relay_leg_gone();

create or replace function public.mutual_follow(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_following(a, b) and public.is_following(b, a);
$$;
revoke execute on function public.mutual_follow(uuid, uuid) from anon;

drop function if exists public.relay_candidates(uuid);
-- your mutual followers' activities within 12 hours of yours that you're allowed to see and that aren't in a relay yet
create or replace function public.relay_candidates(aid uuid)
returns table (activity_id uuid, owner uuid, athlete text, avatar text, name text, sport text, multisport_profile text, start_time timestamptz, utc_offset_min int, elapsed_s numeric, distance_m numeric)
language sql stable security definer set search_path = public as $$
  select a.id, a.owner, p.display_name, p.avatar_path, a.name, a.sport, a.multisport_profile, a.start_time, a.utc_offset_min, a.elapsed_s, a.distance_m
  from activities me join activities a on a.start_time between me.start_time - interval '12 hours' and me.start_time + interval '12 hours'
  join profiles p on p.id = a.owner
  where me.id = aid and me.owner = auth.uid() and a.owner <> me.owner
    and public.mutual_follow(me.owner, a.owner) and public.can_view_activity(a.id)
    and not exists (select 1 from relay_legs l where l.activity_id = a.id)
    and not exists (select 1 from relay_legs l join relay_legs l2 on l2.relay_id = l.relay_id where l.activity_id = aid and l2.owner = a.owner)
  order by abs(extract(epoch from a.start_time - me.start_time)) limit 40;
$$;

-- invite a mutual follower to make a relay from your activity (or add them to the relay it's already in).
-- other_aid: their activity, if you can see it; null lets them pick it themselves.
create or replace function public.start_relay(aid uuid, other uuid, other_aid uuid default null, p_name text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare me activities; rid uuid; myleg relay_legs; o activities;
begin
  select * into me from activities where id = aid and owner = auth.uid();
  if me.id is null then raise exception 'Not your activity'; end if;
  if other = auth.uid() or not public.mutual_follow(auth.uid(), other) then raise exception 'Relays are between people who follow each other'; end if;
  if other_aid is not null then
    select * into o from activities where id = other_aid and owner = other;
    if o.id is null or not public.can_view_activity(o.id) then raise exception 'You can''t see that activity'; end if;
    if abs(extract(epoch from o.start_time - me.start_time)) > 12 * 3600 then raise exception 'Relay legs must be within 12 hours of each other'; end if;
    if exists (select 1 from relay_legs where activity_id = other_aid) then raise exception 'That activity is already in a relay'; end if;
  end if;
  select * into myleg from relay_legs where activity_id = aid;
  if myleg.relay_id is not null then
    if myleg.status <> 'accepted' then raise exception 'Accept the relay first'; end if;
    rid := myleg.relay_id;
    if exists (select 1 from relay_legs where relay_id = rid and owner = other) then raise exception 'They are already in this relay'; end if;
    if (select count(*) from relay_legs where relay_id = rid) >= 6 then raise exception 'A relay can have up to 6 legs'; end if;
  else
    insert into relays(name, created_by) values (coalesce(nullif(left(trim(p_name), 120), ''), 'Relay'), auth.uid()) returning id into rid;
    insert into relay_legs(relay_id, owner, activity_id, status, invited_by) values (rid, auth.uid(), aid, 'accepted', auth.uid());
  end if;
  insert into relay_legs(relay_id, owner, activity_id, status, invited_by) values (rid, other, other_aid, 'pending', auth.uid());
  return rid;
end $$;

-- accept (with your activity for the leg) or decline an invitation
create or replace function public.respond_relay(rid uuid, accept boolean, p_activity uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare leg relay_legs; a activities; anchor timestamptz;
begin
  select * into leg from relay_legs where relay_id = rid and owner = auth.uid();
  if leg.relay_id is null then raise exception 'No invitation'; end if;
  if not accept then delete from relay_legs where relay_id = rid and owner = auth.uid(); return; end if;
  select * into a from activities where id = coalesce(p_activity, leg.activity_id) and owner = auth.uid();
  if a.id is null then raise exception 'Pick one of your activities for your leg'; end if;
  if exists (select 1 from relay_legs where activity_id = a.id and relay_id <> rid) then raise exception 'That activity is already in another relay'; end if;
  select min(x.start_time) into anchor from relay_legs l join activities x on x.id = l.activity_id where l.relay_id = rid and l.status = 'accepted';
  if anchor is not null and abs(extract(epoch from a.start_time - anchor)) > 12 * 3600 then raise exception 'Relay legs must be within 12 hours of each other'; end if;
  update relay_legs set activity_id = a.id, status = 'accepted' where relay_id = rid and owner = auth.uid();
end $$;

create or replace function public.leave_relay(rid uuid) returns void
language sql security definer set search_path = public as $$
  delete from relay_legs where relay_id = rid and owner = auth.uid();
$$;

create or replace function public.rename_relay(rid uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from relay_legs where relay_id = rid and owner = auth.uid() and status = 'accepted') then raise exception 'Not in this relay'; end if;
  if length(trim(coalesce(p_name, ''))) < 1 then raise exception 'Give it a name'; end if;
  update relays set name = left(trim(p_name), 120) where id = rid;
end $$;

-- the relay as one race. Every accepted leg shows athlete, sport, time and distance (members agreed to that by joining);
-- the leg's activity link, route and name only for people allowed to see that activity. Pending legs only for members.
create or replace function public.relay_json(rid uuid, with_tracks boolean default true) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', r.id, 'name', r.name, 'member', public.is_relay_member(r.id),
    'legs', coalesce((select jsonb_agg(leg order by leg->>'start_time' nulls last) from (
      select jsonb_build_object(
        'owner', l.owner, 'athlete', p.display_name, 'avatar', p.avatar_path, 'status', l.status,
        'activity_id', case when public.can_view_activity(a.id) then a.id end,
        'name', case when public.can_view_activity(a.id) then a.name end,
        'sport', a.sport, 'multisport_profile', a.multisport_profile, 'start_time', a.start_time, 'utc_offset_min', a.utc_offset_min,
        'elapsed_s', a.elapsed_s, 'distance_m', a.distance_m, 'is_race', a.is_race,
        'sections', (select coalesce(jsonb_agg(jsonb_build_object('sport', s.sport, 'elapsed_s', s.elapsed_s, 'distance_m', s.distance_m, 'env', s.summary->>'env') order by s.idx), '[]'::jsonb)
                     from activity_sections s where s.activity_id = a.id),
        'track', case when with_tracks and public.can_view_activity(a.id) and (a.owner = auth.uid() or (a.share->>'map')::boolean) then a.summary->'track' end) leg
      from relay_legs l join profiles p on p.id = l.owner left join activities a on a.id = l.activity_id
      where l.relay_id = r.id and (l.status = 'accepted' or public.is_relay_member(r.id))) t), '[]'::jsonb))
  from relays r where r.id = rid;
$$;
revoke execute on function public.relay_json(uuid, boolean) from anon, public;
grant execute on function public.relay_json(uuid, boolean) to authenticated;

create or replace function public.relay_view(rid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public.is_relay_member(rid) or exists (
      select 1 from relay_legs l where l.relay_id = rid and l.status = 'accepted' and public.can_view_activity(l.activity_id))
    then public.relay_json(rid, true) end;
$$;

create or replace function public.my_relay_invites()
returns table (relay_id uuid, relay_name text, invited_by text, invited_by_avatar text, activity_id uuid, created_at timestamptz, relay jsonb)
language sql stable security definer set search_path = public as $$
  select l.relay_id, r.name, p.display_name, p.avatar_path, l.activity_id, l.created_at, public.relay_json(l.relay_id, false)
  from relay_legs l join relays r on r.id = l.relay_id left join profiles p on p.id = l.invited_by
  where l.owner = auth.uid() and l.status = 'pending'
  order by l.created_at desc;
$$;

-- =====================================================================
-- Feed: audience limits, one club only (club pages), relays
-- =====================================================================
drop function if exists public.feed(text, timestamptz, int);
drop function if exists public.feed(text, timestamptz, int, uuid);
create or replace function public.feed(scope text default 'club', before timestamptz default now(), lim int default 20, club uuid default null)
returns table (
  id uuid, owner uuid, athlete text, name text, description text, sport text, multisport_profile text,
  start_time timestamptz, utc_offset_min int, distance_m numeric, elapsed_s numeric, moving_s numeric,
  ascent_m numeric, avg_hr numeric, sections jsonb, share jsonb, visibility text, track jsonb, flags jsonb,
  media jsonb, kudos int, comments int, you_kudoed boolean, is_race boolean, avatar text, relay jsonb)
language sql stable security definer set search_path = public as $$
  select a.id, a.owner, p.display_name, a.name,
         case when a.owner = auth.uid() or (a.share->>'description')::boolean then a.description end,
         a.sport, a.multisport_profile, a.start_time, a.utc_offset_min,
         a.distance_m, a.elapsed_s, a.moving_s, a.ascent_m,
         case when a.owner = auth.uid() or (a.share->>'hr')::boolean then a.avg_hr end,
         (select coalesce(jsonb_agg(jsonb_build_object('sport',s.sport,'elapsed_s',s.elapsed_s,'distance_m',s.distance_m,'env',s.summary->>'env') order by s.idx),'[]'::jsonb)
            from activity_sections s where s.activity_id = a.id),
         a.share, a.visibility,
         case when a.owner = auth.uid() or (a.share->>'map')::boolean then a.summary->'track' end,
         case when a.owner = auth.uid() then a.summary->'driving' end,
         (select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'path',m.path,'kind',m.kind,'width',m.width,'height',m.height) order by m.position, m.created_at),'[]'::jsonb)
            from activity_media m where m.activity_id = a.id),
         (select count(*)::int from kudos k where k.activity_id = a.id),
         (select count(*)::int from comments c where c.activity_id = a.id),
         exists (select 1 from kudos k where k.activity_id = a.id and k.user_id = auth.uid()),
         a.is_race, p.avatar_path,
         (select public.relay_json(l.relay_id, true) from relay_legs l
            where l.activity_id = a.id and l.status = 'accepted'
              and (select count(*) from relay_legs l2 where l2.relay_id = l.relay_id and l2.status = 'accepted') >= 2)
  from activities a join profiles p on p.id = a.owner
  where a.start_time < before
    and case scope
          when 'me' then a.owner = auth.uid()
          when 'following' then public.is_following(auth.uid(), a.owner) and public.can_view_activity(a.id)
          when 'everyone' then a.owner <> auth.uid() and a.visibility = 'public' and public.can_view_activity(a.id)
          else (case when club is null then a.owner = auth.uid() or public.shares_club(a.owner, auth.uid())
                     else public.is_club_member(club) and exists (select 1 from club_members m where m.club_id = club and m.user_id = a.owner and m.status = 'active') end)
               and public.can_view_activity(a.id)
        end
  order by a.start_time desc
  limit least(lim, 50);
$$;
revoke execute on function public.feed(text, timestamptz, int, uuid) from anon;

-- =====================================================================
-- PB trophies: 1st, 2nd or 3rd best ever at that distance (runs, swims) or power duration, as it stood on the day
-- =====================================================================
create or replace function public.activity_trophies(aid uuid)
returns table (sport text, effort text, unit text, value numeric, start_offset_s numeric, rank int)
language sql stable security definer set search_path = public as $$
  select t.sport, t.effort, t.unit, t.value, t.start_offset_s, t.rk from (
    select b.sport, b.effort, b.unit, b.value, b.start_offset_s,
      1 + (select count(*)::int from best_efforts o
           where o.owner = b.owner and o.sport = b.sport and o.effort = b.effort and o.activity_id <> b.activity_id
             and o.achieved_at <= b.achieved_at
             and case when b.unit = 'W' then o.value > b.value else o.value < b.value end) rk
    from best_efforts b join activities a on a.id = b.activity_id
    where b.activity_id = aid and public.can_view_activity(aid)
      and ((b.sport in ('run','swim') and b.unit = 's' and (a.owner = auth.uid() or coalesce((a.share->>'pace')::boolean, true)))
        or (b.unit = 'W' and (a.owner = auth.uid() or coalesce((a.share->>'power')::boolean, true))))
  ) t where t.rk <= 3
  order by t.sport, t.unit, t.rk;
$$;

revoke execute on function public.create_club(text, text, boolean, text) from anon;
revoke execute on function public.join_club(text) from anon;
revoke execute on function public.join_listed_club(uuid) from anon;
revoke execute on function public.club_preview(text) from anon;
revoke execute on function public.search_clubs(text) from anon;
revoke execute on function public.club_page(uuid) from anon;
revoke execute on function public.update_club(uuid, text, text, boolean, text, text, boolean) from anon;
revoke execute on function public.review_member(uuid, uuid, boolean) from anon;
revoke execute on function public.remove_member(uuid, uuid) from anon;
revoke execute on function public.set_member_role(uuid, uuid, text) from anon;
revoke execute on function public.my_clubs() from anon;
revoke execute on function public.relay_candidates(uuid) from anon;
revoke execute on function public.start_relay(uuid, uuid, uuid, text) from anon;
revoke execute on function public.respond_relay(uuid, boolean, uuid) from anon;
revoke execute on function public.leave_relay(uuid) from anon;
revoke execute on function public.rename_relay(uuid, text) from anon;
revoke execute on function public.relay_view(uuid) from anon;
revoke execute on function public.my_relay_invites() from anon;
revoke execute on function public.activity_trophies(uuid) from anon;

select 'social ok' as done;
