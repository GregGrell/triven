-- 013: ignored bests and yearly trophies.
-- An ignored effort (a spurious power spike, say) stops counting anywhere: best lists, trophies, profile bests.
-- Kept in its own table so it survives an activity being re-processed (trim, edit), which rewrites best_efforts.

create table if not exists public.best_ignores (
  owner uuid not null references auth.users(id) on delete cascade default auth.uid(),
  activity_id uuid not null references public.activities(id) on delete cascade,
  sport text not null,
  effort text not null,
  created_at timestamptz not null default now(),
  primary key (activity_id, sport, effort)
);
alter table public.best_ignores enable row level security;
drop policy if exists best_ignores_own on public.best_ignores;
create policy best_ignores_own on public.best_ignores for all to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid() and exists (select 1 from public.activities a where a.id = activity_id and a.owner = auth.uid()));
revoke all on public.best_ignores from anon;
grant select, insert, delete on public.best_ignores to authenticated;

create or replace function public.effort_ignored(aid uuid, sp text, ef text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from best_ignores i where i.activity_id = aid and i.sport = sp and i.effort = ef);
$$;
revoke execute on function public.effort_ignored(uuid, text, text) from public, anon, authenticated;

-- local calendar year of an activity
create or replace function public.activity_year(a public.activities) returns int
language sql immutable set search_path = public as $$
  select extract(year from a.start_time + make_interval(mins => coalesce(a.utc_offset_min, 0)))::int;
$$;
revoke execute on function public.activity_year(public.activities) from public, anon;

-- trophies: all-time rank and rank within that year, as things stood on the day; ignored efforts don't count
drop function if exists public.activity_trophies(uuid);
create function public.activity_trophies(aid uuid)
returns table (sport text, effort text, unit text, value numeric, start_offset_s numeric, rank int, year_rank int, yr int)
language sql stable security definer set search_path = public as $$
  select t.sport, t.effort, t.unit, t.value, t.start_offset_s, t.rk, t.yrk, t.yr from (
    select b.sport, b.effort, b.unit, b.value, b.start_offset_s, public.activity_year(a) yr,
      1 + (select count(*)::int from best_efforts o
           where o.owner = b.owner and o.sport = b.sport and o.effort = b.effort and o.activity_id <> b.activity_id
             and o.achieved_at <= b.achieved_at and not public.effort_ignored(o.activity_id, o.sport, o.effort)
             and case when b.unit = 'W' then o.value > b.value else o.value < b.value end) rk,
      1 + (select count(*)::int from best_efforts o join activities oa on oa.id = o.activity_id
           where o.owner = b.owner and o.sport = b.sport and o.effort = b.effort and o.activity_id <> b.activity_id
             and o.achieved_at <= b.achieved_at and public.activity_year(oa) = public.activity_year(a)
             and not public.effort_ignored(o.activity_id, o.sport, o.effort)
             and case when b.unit = 'W' then o.value > b.value else o.value < b.value end) yrk
    from best_efforts b join activities a on a.id = b.activity_id
    where b.activity_id = aid and public.can_view_activity(aid) and not public.effort_ignored(b.activity_id, b.sport, b.effort)
      and ((b.sport in ('run','swim') and b.unit = 's' and (a.owner = auth.uid() or coalesce((a.share->>'pace')::boolean, true)))
        or (b.unit = 'W' and (a.owner = auth.uid() or coalesce((a.share->>'power')::boolean, true))))
  ) t where t.rk <= 3 or t.yrk <= 3
  order by t.sport, t.unit, t.rk;
$$;
revoke execute on function public.activity_trophies(uuid) from public, anon;
grant execute on function public.activity_trophies(uuid) to authenticated;

-- profile page bests: ignored efforts left out (otherwise as in 012)
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
                      where be.owner = uid and be.unit in ('s', 'W') and not public.effort_ignored(be.activity_id, be.sport, be.effort)
                        and (uid = auth.uid() or case when be.unit = 'W' then coalesce((a.share->>'power')::boolean, true) else coalesce((a.share->>'pace')::boolean, true) end)
                      order by be.sport, be.effort, case when be.unit = 'W' then -be.value else be.value end, be.achieved_at) b), '[]'::jsonb)
  ) end
  from profiles p where p.id = uid;
$$;
revoke execute on function public.athlete_page(uuid) from public, anon;
grant execute on function public.athlete_page(uuid) to authenticated;
