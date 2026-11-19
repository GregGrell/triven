-- Private notes, photos/videos, route thumbnails in feeds, a public feed.

alter table public.activities add column if not exists notes text;          -- owner only, never returned to others

-- photos and videos attached to an activity
create table if not exists public.activity_media (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  owner uuid not null references auth.users(id) on delete cascade default auth.uid(),
  path text not null,              -- in bucket activity-media: <owner>/<activity>/<file>
  kind text not null check (kind in ('photo','video')),
  width int, height int, duration_s numeric,
  position int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.activity_media enable row level security;
create policy media_owner on public.activity_media for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy media_read on public.activity_media for select to authenticated using (public.can_view_activity(activity_id));
create index if not exists activity_media_act on public.activity_media(activity_id, position);

insert into storage.buckets (id, name, public, file_size_limit) values ('activity-media','activity-media',false, 52428800) on conflict do nothing;
create policy media_files_owner on storage.objects for all to authenticated
  using (bucket_id = 'activity-media' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'activity-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy media_files_read on storage.objects for select to authenticated
  using (bucket_id = 'activity-media' and exists (
    select 1 from public.activity_media m where m.path = storage.objects.name and public.can_view_activity(m.activity_id)));

-- one feed function for all three feeds: 'me', 'club' (club mates + you), 'everyone' (other people's public activities)
drop function if exists public.club_feed(timestamptz, int);
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
          when 'everyone' then a.visibility = 'public' and a.owner <> auth.uid()
          else a.owner = auth.uid() or a.visibility = 'public' and public.shares_club(a.owner, auth.uid())
               or (a.visibility = 'club' and public.shares_club(a.owner, auth.uid()))
        end
  order by a.start_time desc
  limit least(lim, 50);
$$;
revoke execute on function public.feed(text, timestamptz, int) from anon;

-- view_activity: add the route thumbnail and media (notes never leave the owner)
create or replace function public.activity_extras(aid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public.can_view_activity(aid) then jsonb_build_object(
    'media', (select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'path',m.path,'kind',m.kind,'width',m.width,'height',m.height) order by m.position, m.created_at),'[]'::jsonb)
               from activity_media m where m.activity_id = aid)) end;
$$;
revoke execute on function public.activity_extras(uuid) from anon;
