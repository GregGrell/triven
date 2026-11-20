-- 012: usernames and short links. triven.fit/<handle> is a profile, triven.fit/<handle>/<n> is that person's nth activity.
-- Links only open for signed-in members, and only what the viewer is already allowed to see.

-- ---------- usernames ----------
alter table public.profiles add column if not exists handle text;

create or replace function public.handle_ok(h text) returns boolean
language sql immutable set search_path = public as $$
  select h ~ '^[a-z0-9][a-z0-9_-]{2,29}$' and h !~ '^[0-9]+$'
     and h not in ('about','admin','api','app','activities','activity','assets','auth','blog','club','clubs','dev','everyone','feed','gear',
                   'hello','help','home','img','index','join','js','log','login','logout','me','noreply','null','offline','official','people',
                   'privacy','relay','relays','reset','root','search','settings','signin','signup','staff','static','support','system','team',
                   'terms','triven','undefined','upload','user','users','www');
$$;
do $$ begin
  alter table public.profiles add constraint profiles_handle_ok check (handle is null or public.handle_ok(handle));
exception when duplicate_object then null; end $$;
create unique index if not exists profiles_handle on public.profiles(handle);

-- old usernames keep pointing at their owner, and nobody else can take one for 90 days
create table if not exists public.handle_history (
  handle text primary key,
  owner uuid not null references public.profiles(id) on delete cascade,
  changed_at timestamptz not null default now()
);
alter table public.handle_history enable row level security;   -- read only through the functions below

create or replace function public.handle_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.handle is distinct from old.handle then
    if new.handle is null then raise exception 'Everyone needs a username'; end if;
    if exists (select 1 from handle_history h where h.handle = new.handle and h.owner <> new.id and h.changed_at > now() - interval '90 days') then
      raise exception 'That username was in use recently. Try another.';
    end if;
    delete from handle_history where handle = new.handle;
    if old.handle is not null then
      insert into handle_history(handle, owner) values (old.handle, new.id)
      on conflict (handle) do update set owner = excluded.owner, changed_at = now();
    end if;
  end if;
  return new;
end $$;
drop trigger if exists handle_guard on public.profiles;
create trigger handle_guard before update of handle on public.profiles for each row execute function public.handle_guard();

-- a free username built from a name: "Carl Smith" -> carlsmith, then carlsmith2, carlsmith3…
create or replace function public.suggest_handle(base text, me uuid default null) returns text
language plpgsql stable security definer set search_path = public as $$
declare b text; h text; n int := 1;
begin
  b := left(regexp_replace(lower(translate(coalesce(base,''), 'áàâäãåçéèêëíìîïñóòôöõøúùûüýÿ', 'aaaaaaceeeeiiiinoooooouuuuyy')), '[^a-z0-9]+', '', 'g'), 26);
  if length(b) < 3 or b ~ '^[0-9]+$' then b := 'athlete' || coalesce(nullif(b, ''), ''); end if;
  h := b;
  while not public.handle_ok(h)
     or exists (select 1 from profiles p where p.handle = h and p.id is distinct from me)
     or exists (select 1 from handle_history x where x.handle = h and x.owner is distinct from me and x.changed_at > now() - interval '90 days') loop
    n := n + 1; h := b || n;
  end loop;
  return h;
end $$;

-- live check while typing in Settings: ok, taken or invalid
create or replace function public.check_handle(h text) returns text
language sql stable security definer set search_path = public as $$
  select case
    when not public.handle_ok(lower(h)) or h <> lower(h) then 'invalid'
    when exists (select 1 from profiles p where p.handle = h and p.id <> auth.uid()) then 'taken'
    when exists (select 1 from handle_history x where x.handle = h and x.owner <> auth.uid() and x.changed_at > now() - interval '90 days') then 'taken'
    else 'ok' end;
$$;

-- new members get one straight away
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare nm text := coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1));
begin
  insert into public.profiles (id, display_name, handle) values (new.id, nm, public.suggest_handle(nm));
  return new;
end $$;

-- everyone already here
do $$ declare r record; begin
  for r in select id, display_name from profiles where handle is null order by created_at loop
    update profiles set handle = public.suggest_handle(r.display_name, r.id) where id = r.id;
  end loop;
end $$;

-- ---------- activity numbers: 1, 2, 3… per person ----------
alter table public.activities add column if not exists num int;
do $$ begin
  if exists (select 1 from activities where num is null) then
    update activities a set num = x.rn + coalesce((select max(num) from activities m where m.owner = x.owner), 0)
    from (select id, owner, row_number() over (partition by owner order by start_time, id) rn from activities where num is null) x
    where a.id = x.id;
  end if;
end $$;
create unique index if not exists activities_owner_num on public.activities(owner, num);

create or replace function public.activity_num() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then new.num := old.num; return new; end if;   -- a link never changes
  perform pg_advisory_xact_lock(hashtext('num' || new.owner::text));   -- bulk imports insert in parallel
  new.num := coalesce((select max(num) from activities where owner = new.owner), 0) + 1;
  return new;
end $$;
drop trigger if exists activity_num on public.activities;
create trigger activity_num before insert or update of num on public.activities for each row execute function public.activity_num();

-- ---------- who can see whose profile page ----------
-- you, club mates, anyone you follow or who follows you, and anyone who shows up in athlete search
create or replace function public.profile_visible(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select uid = auth.uid() or public.shares_club(uid, auth.uid())
      or exists (select 1 from follows f where (f.follower = auth.uid() and f.followee = uid) or (f.followee = auth.uid() and f.follower = uid))
      or coalesce((select searchable from profiles where id = uid), false);
$$;

-- triven.fit/<handle>[/<n>] -> where to go. Old usernames still work.
create or replace function public.resolve_link(p_handle text, p_num int default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare uid uuid; cur text; aid uuid;
begin
  select id, handle into uid, cur from profiles where handle = lower(p_handle);
  if uid is null then
    select h.owner into uid from handle_history h where h.handle = lower(p_handle);
    select handle into cur from profiles where id = uid;
  end if;
  if uid is null then return jsonb_build_object('found', false); end if;
  if p_num is null then
    return jsonb_build_object('found', true, 'handle', cur, 'person', case when public.profile_visible(uid) then uid end);
  end if;
  select id into aid from activities where owner = uid and num = p_num;
  return jsonb_build_object('found', aid is not null, 'handle', cur, 'activity', case when aid is not null and public.can_view_activity(aid) then aid end);
end $$;

-- the short link for an activity you can see
create or replace function public.activity_link(aid uuid) returns text
language sql stable security definer set search_path = public as $$
  select p.handle || '/' || a.num from activities a join profiles p on p.id = a.owner
  where a.id = aid and public.can_view_activity(aid);
$$;

-- ---------- profile page ----------
create or replace function public.athlete_page(uid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with seen as (
    select a.* from activities a where a.owner = uid and (a.owner = auth.uid() or public.can_view_activity(a.id))
  )
  select case when not public.profile_visible(uid) then null else jsonb_build_object(
    'id', p.id, 'name', p.display_name, 'handle', p.handle, 'avatar', p.avatar_path, 'me', p.id = auth.uid(),
    'since', p.created_at, 'approve_followers', p.approve_followers,
    'you_follow', (select f.status from follows f where f.follower = auth.uid() and f.followee = uid),
    'follows_you', exists (select 1 from follows f where f.follower = uid and f.followee = auth.uid() and f.status = 'accepted'),
    'clubs', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) order by c.name) from clubs c
                where exists (select 1 from club_members m where m.club_id = c.id and m.user_id = uid and m.status = 'active')
                  and (uid = auth.uid() or exists (select 1 from club_members m where m.club_id = c.id and m.user_id = auth.uid() and m.status = 'active'))), '[]'::jsonb),
    'count', (select count(*) from seen),
    'year', coalesce((select jsonb_object_agg(sport, t) from (
                select sport, jsonb_build_object('n', count(*), 'km', round(sum(distance_m) / 1000, 1),
                       's', round(sum(case when sport = 'multi' then elapsed_s else coalesce(moving_s, elapsed_s) end)), 'up', round(sum(coalesce(ascent_m, 0)))) t
                from seen where start_time >= date_trunc('year', now()) group by sport) y), '{}'::jsonb),
    'bests', coalesce((select jsonb_agg(jsonb_build_object('sport', b.sport, 'effort', b.effort, 'unit', b.unit, 'value', b.value, 'activity', b.activity_id, 'at', b.achieved_at))
                from (select distinct on (be.sport, be.effort) be.* from best_efforts be join seen a on a.id = be.activity_id
                      where be.owner = uid and be.unit in ('s', 'W')
                        and (uid = auth.uid() or case when be.unit = 'W' then coalesce((a.share->>'power')::boolean, true) else coalesce((a.share->>'pace')::boolean, true) end)
                      order by be.sport, be.effort, case when be.unit = 'W' then -be.value else be.value end, be.achieved_at) b), '[]'::jsonb)
  ) end
  from profiles p where p.id = uid;
$$;

-- ---------- feed: one athlete's activities (profile page), plus their username on every card ----------
drop function if exists public.feed(text, timestamptz, int, uuid);
drop function if exists public.feed(text, timestamptz, int, uuid, uuid);
create or replace function public.feed(scope text default 'club', before timestamptz default now(), lim int default 20, club uuid default null, person uuid default null)
returns table (
  id uuid, owner uuid, athlete text, name text, description text, sport text, multisport_profile text,
  start_time timestamptz, utc_offset_min int, distance_m numeric, elapsed_s numeric, moving_s numeric,
  ascent_m numeric, avg_hr numeric, sections jsonb, share jsonb, visibility text, track jsonb, flags jsonb,
  media jsonb, kudos int, comments int, you_kudoed boolean, is_race boolean, avatar text, relay jsonb, handle text, num int)
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
              and (select count(*) from relay_legs l2 where l2.relay_id = l.relay_id and l2.status = 'accepted') >= 2),
         p.handle, a.num
  from activities a join profiles p on p.id = a.owner
  where a.start_time < before
    and case scope
          when 'me' then a.owner = auth.uid()
          when 'athlete' then a.owner = person and (a.owner = auth.uid() or public.can_view_activity(a.id))
          when 'following' then public.is_following(auth.uid(), a.owner) and public.can_view_activity(a.id)
          when 'everyone' then a.owner <> auth.uid() and a.visibility = 'public' and public.can_view_activity(a.id)
          else (case when club is null then a.owner = auth.uid() or public.shares_club(a.owner, auth.uid())
                     else public.is_club_member(club) and exists (select 1 from club_members m where m.club_id = club and m.user_id = a.owner and m.status = 'active') end)
               and public.can_view_activity(a.id)
        end
  order by a.start_time desc
  limit least(lim, 50);
$$;

-- ---------- grants: signed-in members only; internals not callable ----------
revoke execute on function public.handle_ok(text) from public, anon;
grant execute on function public.handle_ok(text) to authenticated;   -- the username check constraint runs it
revoke execute on function public.suggest_handle(text, uuid) from public, anon, authenticated;
revoke execute on function public.handle_guard() from public, anon, authenticated;
revoke execute on function public.activity_num() from public, anon, authenticated;
revoke execute on function public.profile_visible(uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.check_handle(text) from public, anon;
revoke execute on function public.resolve_link(text, int) from public, anon;
revoke execute on function public.activity_link(uuid) from public, anon;
revoke execute on function public.athlete_page(uuid) from public, anon;
revoke execute on function public.feed(text, timestamptz, int, uuid, uuid) from public, anon;
grant execute on function public.check_handle(text), public.resolve_link(text, int), public.activity_link(uuid),
  public.athlete_page(uuid), public.feed(text, timestamptz, int, uuid, uuid) to authenticated;
revoke all on public.handle_history from anon, authenticated;
