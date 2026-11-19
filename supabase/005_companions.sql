-- Who you trained with: club mates' activities (visible to the club or public) that started within 20 min of yours,
-- overlap at least 60% of your elapsed time, and follow the same route for at least 60% of your track (points within 200 m).
-- Only answers for your own activity; returns names only, never the other person's route.
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
      and a.visibility in ('club', 'public')
      and jsonb_typeof(a.summary->'track') = 'array'
      and a.start_time between me.start_time - interval '20 minutes' and me.start_time + interval '20 minutes'
      and public.shares_club(a.owner, me.owner)
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
select 'companions ok';
