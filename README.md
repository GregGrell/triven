# Triven

Swim, bike and run training log with proper multisport (triathlon, duathlon, aquathlon as one activity), built for club use.

- Static site (no build step): `index.html` + ES modules in `js/`
- Backend: Supabase (auth, Postgres with row level security, storage)
- FIT files are decoded in the browser with Garmin's FIT SDK; raw files and processed streams go to Supabase Storage
- Schema: `supabase/*.sql`, applied in order
