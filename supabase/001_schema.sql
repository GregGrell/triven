-- Triven schema v1
-- Ownership on every row, multisport as sections, sharing per activity and per field.

create extension if not exists pgcrypto;

-- ---------- profiles & athlete settings ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Athlete',
  avatar_url text,
  settings jsonb not null default '{
    "lthrRun":163,"lthrBike":158,"maxHr":175,"restHr":50,
    "zones":[85,90,95,100,103],
    "balLo":48.5,"balHi":51.5,"balMin":10,
    "ftp":null,"mass":75,"bikeMass":9,"cda":0.27,"crr":0.004
  }'::jsonb,
  default_visibility text not null default 'club' check (default_visibility in ('private','club','public')),
  default_share jsonb not null default '{"map":true,"hr":true,"power":true,"pace":true,"cadence":true,"dynamics":true,"description":true}'::jsonb,
  created_at timestamptz not null default now()
);

-- create a profile automatically for each new user
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email,'@',1)));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- clubs ----------
create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default encode(gen_random_bytes(6),'hex'),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table public.club_members (
  club_id uuid not null references public.clubs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  joined_at timestamptz not null default now(),
  primary key (club_id, user_id)
);

-- ---------- gear ----------
create table public.gear (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade default auth.uid(),
  kind text not null check (kind in ('shoe','bike')),
  name text not null,
  brand text, model text,
  start_km numeric not null default 0,       -- distance already on it when added
  replace_km numeric,                        -- per-item replacement guide
  retired boolean not null default false,
  is_default_for text,                       -- e.g. 'run' or 'bike'
  created_at timestamptz not null default now()
);

-- ---------- activities ----------
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  description text,
  sport text not null check (sport in ('run','bike','swim','multi','other')),
  multisport_profile text check (multisport_profile in ('triathlon','duathlon','aquathlon','other')),
  start_time timestamptz not null,
  utc_offset_min int not null default 0,
  distance_m numeric not null default 0,
  elapsed_s numeric not null default 0,
  moving_s numeric,
  ascent_m numeric, descent_m numeric,
  calories numeric, avg_hr numeric, max_hr numeric,
  indoor boolean not null default false,
  device text,
  gear_id uuid references public.gear(id) on delete set null,
  source text not null default 'upload' check (source in ('upload','garmin_export','strava','manual')),
  source_id text,
  file_path text,       -- raw file in storage bucket activity-files
  streams_path text,    -- processed streams JSON in storage bucket activity-streams
  summary jsonb not null default '{}'::jsonb,   -- zones, FTP estimate, balance flags, etc.
  visibility text not null default 'club' check (visibility in ('private','club','public')),
  share jsonb not null default '{"map":true,"hr":true,"power":true,"pace":true,"cadence":true,"dynamics":true,"description":true}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner, source, source_id)
);
create index activities_owner_time on public.activities(owner, start_time desc);

create table public.activity_sections (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  idx int not null,
  sport text not null check (sport in ('run','bike','swim','transition','other')),
  start_offset_s numeric not null,
  elapsed_s numeric not null,
  timer_s numeric,
  distance_m numeric,
  ascent_m numeric,
  avg_hr numeric, max_hr numeric,
  avg_speed numeric, avg_power numeric, avg_cadence numeric,
  gear_id uuid references public.gear(id) on delete set null,
  summary jsonb not null default '{}'::jsonb,
  unique (activity_id, idx)
);

create table public.activity_laps (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  idx int not null,
  sport text,
  start_offset_s numeric not null,
  elapsed_s numeric not null,
  distance_m numeric, ascent_m numeric,
  avg_hr numeric, max_hr numeric, avg_speed numeric, avg_power numeric,
  unique (activity_id, idx)
);

-- best efforts found inside each activity; PB tables are a query over these
create table public.best_efforts (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade default auth.uid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  sport text not null check (sport in ('run','bike','swim')),
  effort text not null,          -- '1 km', '10 mile TT', 'power 20 min', 'longest ride', ...
  value numeric not null,        -- seconds for distances, watts for power, metres for records
  unit text not null check (unit in ('s','W','m')),
  start_offset_s numeric,
  measured boolean not null default true,
  achieved_at timestamptz not null,
  unique (activity_id, effort)
);
create index best_efforts_owner on public.best_efforts(owner, sport, effort);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  author uuid not null references auth.users(id) on delete cascade default auth.uid(),
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table public.kudos (
  activity_id uuid not null references public.activities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (activity_id, user_id)
);

-- ---------- access helpers ----------
create or replace function public.shares_club(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from club_members m1 join club_members m2 on m1.club_id = m2.club_id
                 where m1.user_id = a and m2.user_id = b);
$$;

create or replace function public.can_view_activity(aid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from activities a where a.id = aid and (
      a.owner = auth.uid()
      or a.visibility = 'public'
      or (a.visibility = 'club' and public.shares_club(a.owner, auth.uid()))));
$$;

create or replace function public.is_club_member(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from club_members where club_id = cid and user_id = auth.uid());
$$;

-- ---------- row level security ----------
alter table public.profiles enable row level security;
alter table public.clubs enable row level security;
alter table public.club_members enable row level security;
alter table public.gear enable row level security;
alter table public.activities enable row level security;
alter table public.activity_sections enable row level security;
alter table public.activity_laps enable row level security;
alter table public.best_efforts enable row level security;
alter table public.comments enable row level security;
alter table public.kudos enable row level security;

-- profiles: you see yourself and club mates; you edit yourself
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_club(id, auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- clubs
create policy clubs_read on public.clubs for select to authenticated using (public.is_club_member(id) or created_by = auth.uid());
create policy clubs_insert on public.clubs for insert to authenticated with check (created_by = auth.uid());
create policy clubs_update on public.clubs for update to authenticated using (created_by = auth.uid());
create policy members_read on public.club_members for select to authenticated using (public.is_club_member(club_id));
create policy members_leave on public.club_members for delete to authenticated using (user_id = auth.uid());

-- gear: owner only
create policy gear_all on public.gear for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

-- activities: full rows to the owner only; other people read through feed functions that hide unshared fields
create policy act_owner on public.activities for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy sec_owner on public.activity_sections for all to authenticated
  using (exists (select 1 from activities a where a.id = activity_id and a.owner = auth.uid()))
  with check (exists (select 1 from activities a where a.id = activity_id and a.owner = auth.uid()));
create policy lap_owner on public.activity_laps for all to authenticated
  using (exists (select 1 from activities a where a.id = activity_id and a.owner = auth.uid()))
  with check (exists (select 1 from activities a where a.id = activity_id and a.owner = auth.uid()));
create policy be_owner on public.best_efforts for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

-- comments & kudos: anyone who can see the activity
create policy com_read on public.comments for select to authenticated using (public.can_view_activity(activity_id));
create policy com_write on public.comments for insert to authenticated with check (author = auth.uid() and public.can_view_activity(activity_id));
create policy com_delete on public.comments for delete to authenticated
  using (author = auth.uid() or exists (select 1 from activities a where a.id = activity_id and a.owner = auth.uid()));
create policy kudos_read on public.kudos for select to authenticated using (public.can_view_activity(activity_id));
create policy kudos_write on public.kudos for insert to authenticated with check (user_id = auth.uid() and public.can_view_activity(activity_id));
create policy kudos_delete on public.kudos for delete to authenticated using (user_id = auth.uid());

-- ---------- club functions ----------
create or replace function public.create_club(club_name text) returns public.clubs
language plpgsql security definer set search_path = public as $$
declare c clubs;
begin
  insert into clubs(name, created_by) values (club_name, auth.uid()) returning * into c;
  insert into club_members(club_id, user_id, role) values (c.id, auth.uid(), 'owner');
  return c;
end $$;

create or replace function public.join_club(code text) returns public.clubs
language plpgsql security definer set search_path = public as $$
declare c clubs;
begin
  select * into c from clubs where invite_code = code;
  if c.id is null then raise exception 'Invite code not found'; end if;
  insert into club_members(club_id, user_id) values (c.id, auth.uid()) on conflict do nothing;
  return c;
end $$;

-- ---------- feed: club mates' activities with unshared fields removed ----------
create or replace function public.club_feed(before timestamptz default now(), lim int default 30)
returns table (
  id uuid, owner uuid, athlete text, name text, description text, sport text, multisport_profile text,
  start_time timestamptz, utc_offset_min int, distance_m numeric, elapsed_s numeric, moving_s numeric,
  ascent_m numeric, avg_hr numeric, sections jsonb, share jsonb, streams_path text,
  kudos int, comments int, you_kudoed boolean)
language sql stable security definer set search_path = public as $$
  select a.id, a.owner, p.display_name, a.name,
         case when (a.share->>'description')::boolean then a.description end,
         a.sport, a.multisport_profile, a.start_time, a.utc_offset_min,
         a.distance_m, a.elapsed_s, a.moving_s, a.ascent_m,
         case when (a.share->>'hr')::boolean then a.avg_hr end,
         (select coalesce(jsonb_agg(jsonb_build_object('sport',s.sport,'elapsed_s',s.elapsed_s,'distance_m',s.distance_m) order by s.idx),'[]'::jsonb)
            from activity_sections s where s.activity_id = a.id),
         a.share,
         case when (a.share->>'map')::boolean or (a.share->>'hr')::boolean or (a.share->>'pace')::boolean then a.streams_path end,
         (select count(*)::int from kudos k where k.activity_id = a.id),
         (select count(*)::int from comments c where c.activity_id = a.id),
         exists (select 1 from kudos k where k.activity_id = a.id and k.user_id = auth.uid())
  from activities a join profiles p on p.id = a.owner
  where a.start_time < before
    and (a.owner = auth.uid() or a.visibility = 'public'
         or (a.visibility = 'club' and public.shares_club(a.owner, auth.uid())))
  order by a.start_time desc
  limit least(lim, 100);
$$;

-- keep updated_at fresh
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger activities_touch before update on public.activities for each row execute function public.touch_updated_at();

-- ---------- storage ----------
insert into storage.buckets (id, name, public) values ('activity-files','activity-files',false) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('activity-streams','activity-streams',false) on conflict do nothing;

-- files live under <user id>/...; owners manage their own
create policy files_owner on storage.objects for all to authenticated
  using (bucket_id in ('activity-files','activity-streams') and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id in ('activity-files','activity-streams') and (storage.foldername(name))[1] = auth.uid()::text);
-- club mates may read the shared streams file (owner writes a copy with unshared fields removed; full file stays owner-only)
create policy streams_shared on storage.objects for select to authenticated
  using (bucket_id = 'activity-streams' and exists (
    select 1 from public.activities a where a.streams_path = storage.objects.name and public.can_view_activity(a.id)));

revoke execute on function public.shares_club(uuid,uuid) from anon;
revoke execute on function public.can_view_activity(uuid) from anon;
revoke execute on function public.club_feed(timestamptz,int) from anon;
revoke execute on function public.create_club(text) from anon;
revoke execute on function public.join_club(text) from anon;
