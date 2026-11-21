-- 017: notifications, worked out from what's already stored (nothing new to keep in step):
-- kudos and comments on your activities, replies where you commented, new followers and follow requests,
-- relay invitations, join requests for clubs you run, and new posts in your clubs. Last 60 days, newest first.
-- Read state lives in your settings (settings.notifSeen), so it follows you across devices.
create or replace function public.my_notifications(lim int default 40)
returns table (kind text, at timestamptz, actor uuid, actor_name text, actor_handle text, actor_avatar text,
               activity_id uuid, activity_name text, club_id uuid, club_name text, relay_id uuid, body text)
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() id), since as (select now() - interval '60 days' t),
  n as (
    select 'kudos' kind, k.created_at at, k.user_id actor, a.id activity_id, a.name activity_name, null::uuid club_id, null::text club_name, null::uuid relay_id, null::text body
      from kudos k join activities a on a.id = k.activity_id where a.owner = (select id from me) and k.user_id <> a.owner and k.created_at > (select t from since)
    union all
    select 'comment', c.created_at, c.author, a.id, a.name, null, null, null, left(c.body, 140)
      from comments c join activities a on a.id = c.activity_id where a.owner = (select id from me) and c.author <> a.owner and c.created_at > (select t from since)
    union all   -- someone else commented after you on an activity that isn't yours
    select 'reply', c.created_at, c.author, a.id, a.name, null, null, null, left(c.body, 140)
      from comments c join activities a on a.id = c.activity_id
      where a.owner <> (select id from me) and c.author <> (select id from me) and c.created_at > (select t from since) and public.can_view_activity(a.id)
        and exists (select 1 from comments mine where mine.activity_id = a.id and mine.author = (select id from me) and mine.created_at < c.created_at)
    union all
    select case when f.status = 'pending' then 'follow_request' else 'follow' end, f.created_at, f.follower, null, null, null, null, null, null
      from follows f where f.followee = (select id from me) and f.created_at > (select t from since)
    union all
    select 'relay_invite', l.created_at, l.invited_by, null, null, null, r.name, l.relay_id, null
      from relay_legs l join relays r on r.id = l.relay_id where l.owner = (select id from me) and l.status = 'pending' and l.invited_by is not null
    union all
    select 'club_request', m.joined_at, m.user_id, null, null, c.id, c.name, null, null
      from club_members m join clubs c on c.id = m.club_id
      where m.status = 'pending' and exists (select 1 from club_members x where x.club_id = c.id and x.user_id = (select id from me) and x.status = 'active' and x.role in ('owner','admin'))
    union all
    select 'club_post', p.created_at, p.author, null, null, c.id, c.name, null, left(p.body, 140)
      from club_posts p join clubs c on c.id = p.club_id
      where p.author <> (select id from me) and p.created_at > (select t from since) and public.is_club_member(c.id)
  )
  select n.kind, n.at, n.actor, pr.display_name, pr.handle, pr.avatar_path, n.activity_id, n.activity_name, n.club_id, n.club_name, n.relay_id, n.body
  from n left join profiles pr on pr.id = n.actor
  order by n.at desc limit least(lim, 100);
$$;
revoke execute on function public.my_notifications(int) from public, anon;
grant execute on function public.my_notifications(int) to authenticated;
