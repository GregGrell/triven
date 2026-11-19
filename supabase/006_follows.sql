-- Follows, profile privacy, a "followers" visibility level, the Following feed, and per-activity training load.

-- profile privacy
alter table public.profiles add column if not exists searchable boolean not null default true;        -- show up in athlete search
alter table public.profiles add column if not exists approve_followers boolean not null default false; -- new followers wait for approval

-- visibility levels: private = only you; followers = your followers and club mates; club = club mates; public = everyone on Triven
alter table public.profiles drop constraint if exists profiles_default_visibility_check;
alter table public.profiles add constraint profiles_default_visibility_check check (default_visibility in ('private','followers','club','public'));
alter table public.activities drop constraint if exists activities_visibility_check;
alter table public.activities add constraint activities_visibility_check check (visibility in ('private','followers','club','public'));

create table if not exists public.follows (
  follower uuid not null references auth.users(id) on delete cascade default auth.uid(),
  followee uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  primary key (follower, followee),
  check (follower <> followee)
);
create index if not exists follows_followee on public.follows(followee, status);
alter table public.follows enable row level security;
create policy follows_read on public.follows for select to authenticated using (follower = auth.uid() or followee = auth.uid());
create policy follows_insert on public.follows for insert to authenticated with check (follower = auth.uid());
create policy follows_update on public.follows for update to authenticated using (followee = auth.uid()) with check (followee = auth.uid());
create policy follows_delete on public.follows for delete to authenticated using (follower = auth.uid() or followee = auth.uid());

-- the server decides the status: accepted straight away unless the person approves followers
create or replace function public.follows_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.status := case when coalesce((select approve_followers from profiles where id = new.followee), false) then 'pending' else 'accepted' end;
    new.created_at := now();
  else
    if new.follower <> old.follower or new.followee <> old.followee then raise exception 'cannot change who a follow is between'; end if;
  end if;
  return new;
end $$;
drop trigger if exists follows_guard on public.follows;
create trigger follows_guard before insert or update on public.follows for each row execute function public.follows_guard();

create or replace function public.is_following(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from follows where follower = a and followee = b and status = 'accepted');
$$;

-- who can see an activity
create or replace function public.can_view_activity(aid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from activities a where a.id = aid and (
      a.owner = auth.uid()
      or a.visibility = 'public'
      or (a.visibility = 'club' and public.shares_club(a.owner, auth.uid()))
      or (a.visibility = 'followers' and (public.is_following(auth.uid(), a.owner) or public.shares_club(a.owner, auth.uid())))));
$$;
revoke execute on function public.can_view_activity(uuid) from anon;

-- you can see the name of people you follow or who follow you, as well as club mates
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_club(id, auth.uid())
         or exists (select 1 from follows f where (f.follower = auth.uid() and f.followee = profiles.id) or (f.followee = auth.uid() and f.follower = profiles.id)));

-- search athletes who allow it
create or replace function public.search_athletes(q text)
returns table (id uuid, athlete text, approve_followers boolean, you_follow text, follows_you boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name, p.approve_followers,
         (select f.status from follows f where f.follower = auth.uid() and f.followee = p.id),
         public.is_following(p.id, auth.uid())
  from profiles p
  where p.searchable and p.id <> auth.uid() and length(trim(q)) >= 2 and p.display_name ilike '%' || trim(q) || '%'
  order by p.display_name limit 25;
$$;
revoke execute on function public.search_athletes(text) from anon;

-- your followers, requests and who you follow
create or replace function public.my_network()
returns table (other uuid, athlete text, direction text, status text, since timestamptz)
language sql stable security definer set search_path = public as $$
  select f.followee, p.display_name, 'following', f.status, f.created_at from follows f join profiles p on p.id = f.followee where f.follower = auth.uid()
  union all
  select f.follower, p.display_name, 'follower', f.status, f.created_at from follows f join profiles p on p.id = f.follower where f.followee = auth.uid()
  order by 4 desc, 2;
$$;
revoke execute on function public.my_network() from anon;

-- feeds: me, following, club, everyone
drop function if exists public.feed(text, timestamptz, int);
create or replace function public.feed(scope text default 'club', before timestamptz default now(), lim int default 20)
returns table (
  id uuid, owner uuid, athlete text, name text, description text, sport text, multisport_profile text,
  start_time timestamptz, utc_offset_min int, distance_m numeric, elapsed_s numeric, moving_s numeric,
  ascent_m numeric, avg_hr numeric, sections jsonb, share jsonb, visibility text, track jsonb, flags jsonb,
  media jsonb, kudos int, comments int, you_kudoed boolean)
language sql stable security definer set search_path = public as $$
  select a.id, a.owner, p.display_name, a.name,
         case when a.owner = auth.uid() or (a.share->>'description')::boolean then a.description end,
         a.sport, a.multisport_profile, a.start_time, a.utc_offset_min,
         a.distance_m, a.elapsed_s, a.moving_s, a.ascent_m,
         case when a.owner = auth.uid() or (a.share->>'hr')::boolean then a.avg_hr end,
         (select coalesce(jsonb_agg(jsonb_build_object('sport',s.sport,'elapsed_s',s.elapsed_s,'distance_m',s.distance_m) order by s.idx),'[]'::jsonb)
            from activity_sections s where s.activity_id = a.id),
         a.share, a.visibility,
         case when a.owner = auth.uid() or (a.share->>'map')::boolean then a.summary->'track' end,
         case when a.owner = auth.uid() then a.summary->'driving' end,
         (select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'path',m.path,'kind',m.kind,'width',m.width,'height',m.height) order by m.position, m.created_at),'[]'::jsonb)
            from activity_media m where m.activity_id = a.id),
         (select count(*)::int from kudos k where k.activity_id = a.id),
         (select count(*)::int from comments c where c.activity_id = a.id),
         exists (select 1 from kudos k where k.activity_id = a.id and k.user_id = auth.uid())
  from activities a join profiles p on p.id = a.owner
  where a.start_time < before
    and case scope
          when 'me' then a.owner = auth.uid()
          when 'following' then public.is_following(auth.uid(), a.owner) and public.can_view_activity(a.id)
          when 'everyone' then a.visibility = 'public' and a.owner <> auth.uid()
          else (a.owner = auth.uid() or public.shares_club(a.owner, auth.uid())) and public.can_view_activity(a.id)
        end
  order by a.start_time desc
  limit least(lim, 50);
$$;
revoke execute on function public.feed(text, timestamptz, int) from anon;

-- "ran with": club mates or people you follow, on an activity you can see
create or replace function public.companions(aid uuid)
returns table (activity_id uuid, owner uuid, athlete text, sport text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare me public.activities;
begin
  select * into me from activities where id = aid and activities.owner = auth.uid();
  if not found or jsonb_typeof(me.summary->'track') is distinct from 'array' then return; end if;
  return query
  with mine as (
    select (p->>0)::float8 lat, (p->>1)::float8 lon from jsonb_array_elements(me.summary->'track') p),
  cand as (
    select a.id, a.owner, p.display_name, a.sport, a.summary->'track' tr
    from activities a join profiles p on p.id = a.owner
    where a.owner <> me.owner
      and jsonb_typeof(a.summary->'track') = 'array'
      and a.start_time between me.start_time - interval '20 minutes' and me.start_time + interval '20 minutes'
      and (public.shares_club(a.owner, me.owner) or public.is_following(me.owner, a.owner))
      and public.can_view_activity(a.id)
      and extract(epoch from least(a.start_time + make_interval(secs => a.elapsed_s::float8), me.start_time + make_interval(secs => me.elapsed_s::float8))
                            - greatest(a.start_time, me.start_time)) >= 0.6 * me.elapsed_s)
  select c.id, c.owner, c.display_name, c.sport
  from cand c
  where (select avg(case when exists (
            select 1 from jsonb_array_elements(c.tr) q
            where ((q->>0)::float8 - m.lat)^2 + (((q->>1)::float8 - m.lon) * cos(radians(m.lat)))^2 < (200 / 111320.0)^2)
          then 1.0 else 0 end) from mine m) >= 0.6
  order by c.display_name;
end $$;
revoke execute on function public.companions(uuid) from anon, public;
grant execute on function public.companions(uuid) to authenticated;

select proname from pg_proc where pronamespace = 'public'::regnamespace order by 1;
