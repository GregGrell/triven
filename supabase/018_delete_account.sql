-- 018: delete your own account. The app removes your stored files first (storage won't let SQL do it),
-- then calls this. Leaving your clubs first lets the existing hand-over pass ownership to the next admin
-- or member (an empty club goes); everything else hangs off auth.users and cascades.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  delete from club_members where user_id = me and role <> 'owner';
  delete from club_members where user_id = me;                      -- owner last, so the hand-over sees the others
  delete from clubs where created_by = me and not exists (select 1 from club_members m where m.club_id = clubs.id and m.user_id <> me and m.status = 'active');
  delete from auth.users where id = me;
end $$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
