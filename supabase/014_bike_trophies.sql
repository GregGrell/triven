-- 014: trophies for bike distances too (10 mile TT … 90 km, 180 km), gated by the 'pace and speed' sharing like runs and swims.
-- Otherwise as in 013.

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
      and ((b.unit = 's' and (a.owner = auth.uid() or coalesce((a.share->>'pace')::boolean, true)))
        or (b.unit = 'W' and (a.owner = auth.uid() or coalesce((a.share->>'power')::boolean, true))))
  ) t where t.rk <= 3 or t.yrk <= 3
  order by t.sport, t.unit, t.rk;
$$;
revoke execute on function public.activity_trophies(uuid) from public, anon;
grant execute on function public.activity_trophies(uuid) to authenticated;

