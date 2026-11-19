-- Races, leg types in feeds (treadmill, track, indoor...), track outlines hidden when the map isn't shared, profile photos.
alter table public.activities add column if not exists is_race boolean not null default false;
alter table public.profiles add column if not exists avatar_path text;

-- profile photos: public bucket (like any athlete avatar), each person writes only their own folder
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('avatars', 'avatars', true, 5242880, array['image/jpeg','image/png','image/webp'])
  on conflict (id) do update set public = true;
drop policy if exists avatars_owner_write on storage.objects;
create policy avatars_owner_write on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_owner_update on storage.objects;
create policy avatars_owner_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists avatars_owner_delete on storage.objects;
create policy avatars_owner_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create or replace function public.view_activity(aid uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a activities; sh jsonb; res jsonb;
begin
  select * into a from activities where id = aid;
  if a.id is null or not public.can_view_activity(aid) then return null; end if;
  sh := a.share;
  res := jsonb_build_object(
    'act', jsonb_build_object(
      'id', a.id, 'owner', a.owner, 'name', a.name,
      'description', case when (sh->>'description')::boolean then a.description end,
      'sport', a.sport, 'multisport_profile', a.multisport_profile, 'start_time', a.start_time, 'utc_offset_min', a.utc_offset_min,
      'distance_m', a.distance_m, 'elapsed_s', a.elapsed_s, 'moving_s', a.moving_s, 'ascent_m', a.ascent_m, 'descent_m', a.descent_m,
      'calories', a.calories,
      'avg_hr', case when (sh->>'hr')::boolean then a.avg_hr end, 'max_hr', case when (sh->>'hr')::boolean then a.max_hr end,
      'indoor', a.indoor, 'is_race', a.is_race, 'device', a.device, 'streams_path', a.streams_path, 'visibility', a.visibility, 'share', a.share,
      'summary', jsonb_build_object('lthr', case when (sh->>'hr')::boolean then a.summary->'lthr' end, 'maxHr', case when (sh->>'hr')::boolean then a.summary->'maxHr' end, 'manual', a.summary->'manual'),
      'athlete', (select display_name from profiles where id = a.owner), 'athlete_avatar', (select avatar_path from profiles where id = a.owner)),
    'sections', coalesce((select jsonb_agg(jsonb_build_object(
      'idx', s.idx, 'sport', s.sport, 'start_offset_s', s.start_offset_s, 'elapsed_s', s.elapsed_s, 'timer_s', s.timer_s,
      'distance_m', s.distance_m, 'ascent_m', s.ascent_m,
      'avg_hr', case when (sh->>'hr')::boolean then s.avg_hr end, 'max_hr', case when (sh->>'hr')::boolean then s.max_hr end,
      'avg_speed', case when (sh->>'pace')::boolean then s.avg_speed end,
      'avg_power', case when (sh->>'power')::boolean then s.avg_power end,
      'avg_cadence', case when (sh->>'cadence')::boolean then s.avg_cadence end,
      'summary', (case when (sh->>'dynamics')::boolean then s.summary else s.summary - 'avgGct' - 'avgGctBal' - 'avgVo' - 'avgStride' end)
                 - (case when (sh->>'map')::boolean then 'none' else 'trackOval' end)
    ) order by s.idx) from activity_sections s where s.activity_id = a.id), '[]'::jsonb),
    'laps', coalesce((select jsonb_agg(jsonb_build_object(
      'idx', l.idx, 'sport', l.sport, 'start_offset_s', l.start_offset_s, 'elapsed_s', l.elapsed_s, 'distance_m', l.distance_m, 'ascent_m', l.ascent_m,
      'avg_hr', case when (sh->>'hr')::boolean then l.avg_hr end, 'max_hr', case when (sh->>'hr')::boolean then l.max_hr end,
      'avg_speed', case when (sh->>'pace')::boolean then l.avg_speed end,
      'avg_power', case when (sh->>'power')::boolean then l.avg_power end
    ) order by l.idx) from activity_laps l where l.activity_id = a.id), '[]'::jsonb)
  );
  return res;
end $$;
revoke execute on function public.view_activity(uuid) from anon;

drop function if exists public.feed(text, timestamptz, int);
create or replace function public.feed(scope text default 'club', before timestamptz default now(), lim int default 20)
returns table (
  id uuid, owner uuid, athlete text, name text, description text, sport text, multisport_profile text,
  start_time timestamptz, utc_offset_min int, distance_m numeric, elapsed_s numeric, moving_s numeric,
  ascent_m numeric, avg_hr numeric, sections jsonb, share jsonb, visibility text, track jsonb, flags jsonb,
  media jsonb, kudos int, comments int, you_kudoed boolean, is_race boolean, avatar text)
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
         a.is_race, p.avatar_path
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

-- people lists with photos
drop function if exists public.search_athletes(text);
create or replace function public.search_athletes(q text)
returns table (id uuid, athlete text, approve_followers boolean, you_follow text, follows_you boolean, avatar text)
language sql stable security definer set search_path = public as $$
  select p.id, p.display_name, p.approve_followers,
         (select f.status from follows f where f.follower = auth.uid() and f.followee = p.id),
         public.is_following(p.id, auth.uid()), p.avatar_path
  from profiles p
  where p.searchable and p.id <> auth.uid() and length(trim(q)) >= 2 and p.display_name ilike '%' || trim(q) || '%'
  order by p.display_name limit 25;
$$;
revoke execute on function public.search_athletes(text) from anon;

drop function if exists public.my_network();
create or replace function public.my_network()
returns table (other uuid, athlete text, direction text, status text, since timestamptz, avatar text)
language sql stable security definer set search_path = public as $$
  select f.followee, p.display_name, 'following', f.status, f.created_at, p.avatar_path from follows f join profiles p on p.id = f.followee where f.follower = auth.uid()
  union all
  select f.follower, p.display_name, 'follower', f.status, f.created_at, p.avatar_path from follows f join profiles p on p.id = f.follower where f.followee = auth.uid()
  order by 4 desc, 2;
$$;
revoke execute on function public.my_network() from anon;

select 'ok' as done;
