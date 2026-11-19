-- a triathlon can have a swim '400 m' and a run '400 m'; make the key include the sport
alter table public.best_efforts drop constraint best_efforts_activity_id_effort_key;
alter table public.best_efforts add constraint best_efforts_activity_sport_effort_key unique (activity_id, sport, effort);
