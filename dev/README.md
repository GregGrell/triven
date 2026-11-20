# Triven test setup

Everything here runs locally against a **fake Supabase** kept in memory, so tests never touch real data.

## One-off setup (Mac or Linux)
```bash
cd dev
npm install                         # FIT SDK, d3, Leaflet, JSZip
pip3 install playwright && python3 -m playwright install chromium
cp ~/path/to/a/multisport.fit fixtures/multisport.fit   # any multisport FIT of your own
```

## Each time
```bash
cd ..            # repo root
./bump.sh        # stamp module versions (also do this before every push)
dev/build_site.sh
python3 dev/tests/run_test9.py      # e.g. linking separate files into one multisport activity
```
Screenshots go to `dev/out/`.

## What's here
- `mock-supabase.js` — in-memory stand-in for supabase-js (auth, tables, storage, rpc). It exposes `window.__db` and `window.__files` so tests can inspect what the app wrote.
- `jszip-shim.js` — local JSZip.
- `build_site.sh` — copies the app into `dev/site/` and rewrites CDN imports to local copies.
- `tests/*.py` — Playwright browser tests, one per feature batch (run_test9 = link/unlink/combine prompt).
- `node/*.mjs` — pipeline scripts run straight in Node, e.g.
  `node node/test_link.mjs fixtures/multisport.fit` (split a multisport file and re-join it) and
  `node node/split_fit.mjs fixtures/multisport.fit` (write each leg as its own FIT to /tmp/part0..2.fit).

## Running the real app locally
From the repo root: `python3 -m http.server 8000`, then open http://localhost:8000. This uses the **real** Supabase project.

## Database tests (no Supabase needed)
`dev/sql/` runs the real migrations in PGlite (Postgres compiled to WebAssembly) with small stand-ins for Supabase's
`auth` and `storage` schemas, then checks row-level security and the functions as different users:
```bash
cd dev && node sql/run.mjs test_010_social.mjs   # privacy, clubs, relays, trophies
```
Browser test for those features: `python3 dev/tests/run_test10.py` (after `./bump.sh && dev/build_site.sh`).
