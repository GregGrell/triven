# python3 demo/run.py <video module, e.g. v05_activity> [film|preview|render|all]
import sys, os, json, importlib, pickle
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from film import Film, build_site
import compose

name = sys.argv[1]; what = sys.argv[2] if len(sys.argv) > 2 else 'all'
m = importlib.import_module(name)
OUT = f'/tmp/vid/{name}'; os.makedirs(OUT, exist_ok=True)
if what in ('film', 'all'):
    if not os.environ.get('NOBUILD'): build_site()
    kw = m.SETUP() if hasattr(m, 'SETUP') else {}
    f = Film(OUT + '/shots', **kw)
    try: S = m.film(f)
    finally: f.close()
    pickle.dump(S, open(OUT + '/shots.pkl', 'wb'))
S = pickle.load(open(OUT + '/shots.pkl', 'rb'))
scenes = m.scenes(S)
if what in ('preview', 'all'):
    compose.preview(scenes, .8, OUT + '/pv')
    from PIL import Image
    ims = [Image.open(f'{OUT}/pv_{i:02d}.jpg').resize((640, 360)) for i in range(len(scenes))]
    c = Image.new('RGB', (1280, 360 * ((len(ims) + 1) // 2)))
    for i, im in enumerate(ims): c.paste(im, ((i % 2) * 640, (i // 2) * 360))
    c.save(OUT + '/contact.jpg', quality=80); print('contact', OUT + '/contact.jpg')
if what in ('render', 'all'):
    out = f'/tmp/vid/out/{m.FILE}.mp4'; os.makedirs('/tmp/vid/out', exist_ok=True)
    print(compose.render(scenes, out, OUT + '/work'))
