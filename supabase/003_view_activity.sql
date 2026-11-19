-- Read someone else's activity (club mate or public) with unshared fields removed.
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
      'indoor', a.indoor, 'device', a.device, 'streams_path', a.streams_path, 'visibility', a.visibility, 'share', a.share,
      'summary', jsonb_build_object('lthr', case when (sh->>'hr')::boolean then a.summary->'lthr' end, 'maxHr', case when (sh->>'hr')::boolean then a.summary->'maxHr' end),
      'athlete', (select display_name from profiles where id = a.owner)),
    'sections', coalesce((select jsonb_agg(jsonb_build_object(
      'idx', s.idx, 'sport', s.sport, 'start_offset_s', s.start_offset_s, 'elapsed_s', s.elapsed_s, 'timer_s', s.timer_s,
      'distance_m', s.distance_m, 'ascent_m', s.ascent_m,
      'avg_hr', case when (sh->>'hr')::boolean then s.avg_hr end, 'max_hr', case when (sh->>'hr')::boolean then s.max_hr end,
      'avg_speed', case when (sh->>'pace')::boolean then s.avg_speed end,
      'avg_power', case when (sh->>'power')::boolean then s.avg_power end,
      'avg_cadence', case when (sh->>'cadence')::boolean then s.avg_cadence end,
      'summary', case when (sh->>'dynamics')::boolean then s.summary else s.summary - 'avgGct' - 'avgGctBal' - 'avgVo' - 'avgStride' end
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

-- club list with member counts for the current user
create or replace function public.my_clubs() returns table (id uuid, name text, invite_code text, role text, members int)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.invite_code, m.role, (select count(*)::int from club_members x where x.club_id = c.id)
  from clubs c join club_members m on m.club_id = c.id and m.user_id = auth.uid()
  order by c.created_at;
$$;
revoke execute on function public.my_clubs() from anon;
