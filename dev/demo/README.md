# How-to videos

Made-up athlete ("Sam Carter"), made-up club mates and a drawn base map; nothing from a real account.

1. `node demo/make_demo.mjs /tmp/demo` writes ~26 weeks of FIT files (London parks, a sprint triathlon, a 10K race).
2. `python3 demo/import_demo.py && python3 demo/finish_snapshot.py` imports them through the real app (mock backend) into `snapshot_final.json` (not committed, ~90 MB).
3. `python3 demo/run.py v05_activity [film|preview|render|all]` films one video in the app (`film.py`: 1280×720 at 1.5×, clock fixed at 22 Nov 2026 17:30 London) and renders it (`compose.py`). Output goes to `/tmp/vid/out/`.
4. `python3 demo/finish.py` makes thumbnails and YouTube notes; `python3 demo/make_page.py` rebuilds `/videos.html`. Put YouTube IDs in `demo/youtube_ids.json` as `{"1": "abc123", ...}` and run it again to link the cards.
