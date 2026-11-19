-- Automatic sync: connections to other services (intervals.icu first), their keys (server-only), an inbox of files
-- fetched by the server, and a schedule that runs the sync every 10 minutes.

alter table public.activities drop constraint if exists activities_source_check;
alter table public.activities add constraint activities_source_check check (source in ('upload','garmin_export','strava','manual','intervals','garmin','coros'));

create table if not exists public.connections (
  owner uuid not null references auth.users(id) on delete cascade default auth.uid(),
  provider text not null check (provider in ('intervals','garmin','coros')),
  athlete_id text,
  status text not null default 'ok',
  last_sync timestamptz, last_error text, imported int not null default 0,
  created_at timestamptz not null default now(),
  primary key (owner, provider)
);
alter table public.connections enable row level security;
drop policy if exists conn_read on public.connections;
create policy conn_read on public.connections for select to authenticated using (owner = auth.uid());
drop policy if exists conn_delete on public.connections;
create policy conn_delete on public.connections for delete to authenticated using (owner = auth.uid());

-- keys live apart, with no policies at all: only the server (service role) can read them
create table if not exists public.connection_secrets (
  owner uuid not null, provider text not null, secret text not null,
  primary key (owner, provider),
  foreign key (owner, provider) references public.connections(owner, provider) on delete cascade
);
alter table public.connection_secrets enable row level security;

create table if not exists public.sync_inbox (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  external_id text not null,
  name text, start_time timestamptz, file_path text,
  status text not null default 'new' check (status in ('new','done','skip','failed','notfit')),
  attempts int not null default 0, error text,
  activity_id uuid references public.activities(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (owner, provider, external_id)
);
create index if not exists sync_inbox_status on public.sync_inbox(status, created_at);
alter table public.sync_inbox enable row level security;
drop policy if exists inbox_owner on public.sync_inbox;
create policy inbox_owner on public.sync_inbox for all to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

create or replace function public.connect_intervals(p_athlete text, p_key text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'sign in first'; end if;
  insert into connections(owner, provider, athlete_id, status, last_error) values (auth.uid(), 'intervals', trim(p_athlete), 'ok', null)
    on conflict (owner, provider) do update set athlete_id = excluded.athlete_id, status = 'ok', last_error = null;
  insert into connection_secrets(owner, provider, secret) values (auth.uid(), 'intervals', trim(p_key))
    on conflict (owner, provider) do update set secret = excluded.secret;
end $$;
revoke execute on function public.connect_intervals(text, text) from anon, public;
grant execute on function public.connect_intervals(text, text) to authenticated;

-- the schedule authenticates to the sync function with a shared secret kept in Vault
create extension if not exists pg_cron;
create extension if not exists pg_net;
select vault.create_secret('<generated secret, stored only in Vault>', 'sync_secret', 'Shared secret between pg_cron and the sync Edge Function')
  where not exists (select 1 from vault.secrets where name = 'sync_secret');
create or replace function public.sync_secret_ok(s text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'sync_secret' and decrypted_secret = s);
$$;
revoke execute on function public.sync_secret_ok(text) from anon, authenticated, public;
grant execute on function public.sync_secret_ok(text) to service_role;

select cron.unschedule('triven-sync') where exists (select 1 from cron.job where jobname = 'triven-sync');
select cron.schedule('triven-sync', '*/10 * * * *', $cron$
  select net.http_post(
    url := 'https://ksubeokekwflqnmzsune.supabase.co/functions/v1/sync',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sync-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'sync_secret')),
    body := '{"mode":"all"}'::jsonb,
    timeout_milliseconds := 120000);
$cron$);

select jobname, schedule from cron.job;
