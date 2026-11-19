-- More multisport kinds: aquabike, swimrun, brick (and linked activities built from separate files)
alter table public.activities drop constraint if exists activities_multisport_profile_check;
alter table public.activities add constraint activities_multisport_profile_check
  check (multisport_profile in ('triathlon','duathlon','aquathlon','aquabike','swimrun','brick','other'));
