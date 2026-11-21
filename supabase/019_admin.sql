-- 019: owner dashboard and feedback.
--  * admins: who can see the dashboard (Carl, by username).
--  * user_days: one row per signed-in user per day the app was opened (daily/weekly/monthly active users).
--  * page_views: visitors per day per page, counted once per browser per day; no personal data, no cookies.
--  * feedback: "Suggest a feature" and "Report a problem", with a status the owner sets; the author is told when it changes.
--  * admin_stats(days): everything the dashboard shows, admins only.

create table if not exists public.admins (user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.admins enable row level security;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from admins where user_id = auth.uid()) $$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;
insert into public.admins select id from public.profiles where handle = 'carlg' on conflict do nothing;

create table if not exists public.user_days (user_id uuid not null references auth.users(id) on delete cascade, day date not null, primary key (user_id, day));
alter table public.user_days enable row level security;
create or replace function public.touch_day() returns void language sql volatile security definer set search_path = public as
$$ insert into user_days values (auth.uid(), (now() at time zone 'utc')::date) on conflict do nothing $$;
revoke execute on function public.touch_day() from public, anon;
grant execute on function public.touch_day() to authenticated;

create table if not exists public.page_views (day date not null, page text not null, n int not null default 0, primary key (day, page));
alter table public.page_views enable row level security;
create or replace function public.count_view(p_page text) returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if p_page not in ('landing','app','help','privacy','terms','videos','join','link') then return; end if;
  insert into page_views values ((now() at time zone 'utc')::date, p_page, 1) on conflict (day, page) do update set n = page_views.n + 1;
end $$;
revoke execute on function public.count_view(text) from public;
grant execute on function public.count_view(text) to anon, authenticated;

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('feature','problem')),
  body text not null check (length(btrim(body)) between 3 and 4000),
  page text, app_build text, user_agent text, screen text,
  status text not null default 'new' check (status in ('new','seen','planned','done','wontfix')),
  admin_note text,
  created_at timestamptz not null default now(),
  status_at timestamptz
);
alter table public.feedback enable row level security;
drop policy if exists feedback_insert on public.feedback;
create policy feedback_insert on public.feedback for insert to authenticated with check (user_id = auth.uid() and status = 'new' and admin_note is null);
drop policy if exists feedback_read on public.feedback;
create policy feedback_read on public.feedback for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists feedback_admin on public.feedback;
create policy feedback_admin on public.feedback for update to authenticated using (public.is_admin()) with check (public.is_admin());
revoke all on public.feedback from anon;
grant select, insert, update on public.feedback to authenticated;
revoke all on public.admins, public.user_days, public.page_views from anon, authenticated;
create or replace function public.feedback_status_time() returns trigger language plpgsql as $$
begin if new.status is distinct from old.status then new.status_at := now(); end if; return new; end $$;
drop trigger if exists feedback_status_time on public.feedback;
create trigger feedback_status_time before update on public.feedback for each row execute function public.feedback_status_time();
revoke execute on function public.feedback_status_time() from public, anon, authenticated;

create or replace function public.admin_stats(days int default 90) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d0 date := (now() at time zone 'utc')::date - greatest(7, least(days, 730)) + 1; today date := (now() at time zone 'utc')::date; r jsonb;
begin
  if not is_admin() then raise exception 'not allowed'; end if;
  with dd as (select generate_series(d0, today, '1 day')::date as day)
  select jsonb_build_object(
    'from', d0, 'to', today,
    'totals', jsonb_build_object(
      'users', (select count(*) from profiles),
      'users_new', (select count(*) from profiles where created_at::date >= d0),
      'active_1', (select count(*) from user_days where day = today),
      'active_7', (select count(distinct user_id) from user_days where day > today - 7),
      'active_30', (select count(distinct user_id) from user_days where day > today - 30),
      'activities', (select count(*) from activities),
      'activities_new', (select count(*) from activities where created_at::date >= d0),
      'multisport', (select count(*) from activities where sport = 'multi'),
      'synced_users', (select count(distinct owner) from sync_inbox),
      'clubs', (select count(*) from clubs),
      'follows', (select count(*) from follows where status = 'accepted'),
      'relays', (select count(*) from relays),
      'kudos', (select count(*) from kudos), 'comments', (select count(*) from comments),
      'feedback_open', (select count(*) from feedback where status in ('new','seen','planned')),
      'feedback_new', (select count(*) from feedback where status = 'new'),
      'visitors', (select coalesce(sum(n), 0) from page_views where day >= d0)),
    'daily', (select jsonb_agg(jsonb_build_object('day', dd.day,
        'signups', (select count(*) from profiles p where p.created_at::date = dd.day),
        'active', (select count(*) from user_days u where u.day = dd.day),
        'uploads', (select count(*) from activities a where a.created_at::date = dd.day and a.source <> 'manual' and not exists (select 1 from sync_inbox s where s.activity_id = a.id)),
        'synced', (select count(*) from sync_inbox s where s.status = 'done' and s.created_at::date = dd.day),
        'manual', (select count(*) from activities a where a.created_at::date = dd.day and a.source = 'manual'),
        'views', (select coalesce(jsonb_object_agg(v.page, v.n), '{}'::jsonb) from page_views v where v.day = dd.day)) order by dd.day) from dd),
    'sports', (select coalesce(jsonb_object_agg(sport, n), '{}'::jsonb) from (select sport, count(*) n from activities group by sport) s),
    'profiles', (select coalesce(jsonb_object_agg(multisport_profile, n), '{}'::jsonb) from (select multisport_profile, count(*) n from activities where sport = 'multi' group by 1) s),
    'devices', (select coalesce(jsonb_agg(jsonb_build_object('device', device, 'n', n) order by n desc), '[]'::jsonb) from (select coalesce(nullif(device, ''), 'Unknown') device, count(*) n from activities group by 1 order by 2 desc limit 10) s),
    'per_user', (select jsonb_build_object('median', percentile_cont(.5) within group (order by n), 'max', max(n)) from (select count(*) n from activities group by owner) s),
    'recent', (select coalesce(jsonb_agg(x order by x->>'joined' desc), '[]'::jsonb) from (select jsonb_build_object('id', p.id, 'name', p.display_name, 'handle', p.handle, 'email', u.email, 'joined', p.created_at,
        'activities', (select count(*) from activities a where a.owner = p.id), 'last_seen', (select max(day) from user_days ud where ud.user_id = p.id),
        'synced', exists (select 1 from sync_inbox s where s.owner = p.id)) x from profiles p join auth.users u on u.id = p.id order by p.created_at desc limit 50) s),
    'feedback', (select coalesce(jsonb_agg(x order by (x->>'created_at') desc), '[]'::jsonb) from (select jsonb_build_object('id', f.id, 'kind', f.kind, 'body', f.body, 'page', f.page, 'app_build', f.app_build, 'user_agent', f.user_agent, 'screen', f.screen,
        'status', f.status, 'admin_note', f.admin_note, 'created_at', f.created_at, 'name', p.display_name, 'handle', p.handle) x from feedback f left join profiles p on p.id = f.user_id order by f.created_at desc limit 300) s)
  ) into r;
  return r;
end $$;
revoke execute on function public.admin_stats(int) from public, anon;
grant execute on function public.admin_stats(int) to authenticated;

-- notifications: new feedback for admins; status changes for the person who sent it
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
    union all
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
    union all   -- admins: new feedback
    select 'feedback_' || fb.kind, fb.created_at, fb.user_id, null, null, null, null, null, left(fb.body, 140)
      from feedback fb where public.is_admin() and fb.user_id <> (select id from me) and fb.status = 'new' and fb.created_at > (select t from since)
    union all   -- the sender: their feedback's status changed
    select 'feedback_status', fb.status_at, null, null, null, null, fb.status, null, left(fb.body, 140)
      from feedback fb where fb.user_id = (select id from me) and fb.status_at is not null and fb.status <> 'new' and fb.status_at > (select t from since)
  )
  select n.kind, n.at, n.actor, pr.display_name, pr.handle, pr.avatar_path, n.activity_id, n.activity_name, n.club_id, n.club_name, n.relay_id, n.body
  from n left join profiles pr on pr.id = n.actor
  order by n.at desc limit least(lim, 100);
$$;
revoke execute on function public.my_notifications(int) from public, anon;
grant execute on function public.my_notifications(int) to authenticated;
