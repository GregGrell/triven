-- 011: security hardening after the 20 Nov 2026 review.

-- 1. Internal helpers can't be called directly. join_club_row would let anyone join an approval-only club;
--    relay_json skips the relay visibility check; the two-person checks reveal who follows whom / who is in which club.
revoke execute on function public.join_club_row(public.clubs) from public, anon, authenticated;
revoke execute on function public.relay_json(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.audience_ok(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.mutual_follow(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.is_following(uuid, uuid) from public, anon, authenticated;

-- profiles_read used shares_club(id, auth.uid()); a one-person version answers only about yourself
create or replace function public.is_club_mate(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.shares_club(other, auth.uid());
$$;
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_club_mate(id)
         or exists (select 1 from follows f where (f.follower = auth.uid() and f.followee = profiles.id) or (f.followee = auth.uid() and f.follower = profiles.id)));
revoke execute on function public.shares_club(uuid, uuid) from public, anon, authenticated;

-- trigger functions are only ever run by their triggers
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.follows_guard() from public, anon, authenticated;
revoke execute on function public.club_member_gone() from public, anon, authenticated;
revoke execute on function public.relay_leg_gone() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
alter function public.touch_updated_at() set search_path = public;

-- 2. Nothing works signed out: no function or table access for the anon role (now or for new ones).
do $$ declare r record; begin
  for r in select p.oid::regprocedure sig from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' loop
    execute format('revoke execute on function %s from public, anon', r.sig);
  end loop;
end $$;
alter default privileges in schema public revoke execute on functions from public, anon;
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
-- the sync server (service role) keeps what it uses
do $$ begin
  if to_regprocedure('public.sync_secret_ok(text)') is not null then grant execute on function public.sync_secret_ok(text) to service_role; end if;
end $$;

-- 3. Your files stay yours. An activity can only point at files in its owner's folder, and its shared streams copy can't be
--    the owner-only full file; photos and videos can only be attached to your own activities, from your own folder.
--    (Before this, someone could point their own public activity at another person's unmasked .full.json and read it.)
alter table public.activities drop constraint if exists activities_paths_own;
alter table public.activities add constraint activities_paths_own check (
  (streams_path is null or (streams_path like owner::text || '/%' and streams_path not like '%.full.json'))
  and (file_path is null or file_path like owner::text || '/%'));
alter table public.activity_media drop constraint if exists activity_media_path_own;
alter table public.activity_media add constraint activity_media_path_own check (path like owner::text || '/%');
drop policy if exists media_owner on public.activity_media;
create policy media_owner on public.activity_media for all to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid() and exists (select 1 from activities a where a.id = activity_id and a.owner = auth.uid()));

drop policy if exists streams_shared on storage.objects;
create policy streams_shared on storage.objects for select to authenticated
  using (bucket_id = 'activity-streams' and name not like '%.full.json' and exists (
    select 1 from public.activities a where a.streams_path = storage.objects.name and (storage.foldername(storage.objects.name))[1] = a.owner::text
      and public.can_view_activity(a.id)));
drop policy if exists media_files_read on storage.objects;
create policy media_files_read on storage.objects for select to authenticated
  using (bucket_id = 'activity-media' and exists (
    select 1 from public.activity_media m where m.path = storage.objects.name and (storage.foldername(storage.objects.name))[1] = m.owner::text
      and public.can_view_activity(m.activity_id)));

select 'security ok' as done;
