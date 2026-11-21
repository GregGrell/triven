-- 015: gear "in use from" date. Default gear is only assigned to activities on or after it
-- (null = the day the item was added to Triven).
alter table public.gear add column if not exists in_use_from date;
