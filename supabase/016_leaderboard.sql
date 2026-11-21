-- 016: club leaderboard. Each active member's totals over a period, counting only activities the viewer may see.
-- Multisport legs count towards their own sport; walks, gym and other sports are left out. Members only.
create or replace function public.club_leaderboard(p_club uuid, p_from timestamptz, p_to timestamptz, p_sport text default 'all')
returns table (user_id uuid, name text, handle text, avatar text, n int, dist numeric, secs numeric, elev numeric)
language sql stable security definer set search_path = public as $$
  with mem as (select m.user_id from club_members m where m.club_id = p_club and m.status = 'active'),
  acts as (
    select a.* from activities a join mem on mem.user_id = a.owner
    where a.start_time >= p_from and a.start_time < p_to and a.visibility <> 'private' and (a.owner = auth.uid() or public.can_view_activity(a.id))   -- private activities never count
  ),
  legs as (
    select a.owner, a.id, a.sport sp, a.distance_m d, coalesce(a.moving_s, a.elapsed_s) t, coalesce(a.ascent_m, 0) e from acts a where a.sport in ('swim', 'bike', 'run')
    union all
    select a.owner, a.id, s.sport, s.distance_m, s.elapsed_s, coalesce(s.ascent_m, 0) from acts a join activity_sections s on s.activity_id = a.id
    where a.sport = 'multi' and s.sport in ('swim', 'bike', 'run')
  )
  select p.id, p.display_name, p.handle, p.avatar_path, count(distinct l.id)::int, coalesce(sum(l.d), 0), coalesce(sum(l.t), 0), coalesce(sum(l.e), 0)
  from mem join profiles p on p.id = mem.user_id
  left join legs l on l.owner = mem.user_id and (p_sport = 'all' or l.sp = p_sport)
  where public.is_club_member(p_club)
  group by p.id, p.display_name, p.handle, p.avatar_path;
$$;
revoke execute on function public.club_leaderboard(uuid, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.club_leaderboard(uuid, timestamptz, timestamptz, text) to authenticated;
