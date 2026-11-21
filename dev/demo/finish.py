# After rendering: thumbnails (1280x720) and the YouTube upload notes, plus durations for the site page.
import sys, os, json, importlib, subprocess
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from catalog import SERIES, youtube_text
import compose
OUT = '/tmp/vid/out'; TH = '/tmp/vid/thumbs'; os.makedirs(TH, exist_ok=True)
from PIL import Image, ImageDraw
def thumb(n, title):
    W, H = 1280, 720; im = compose.bg_canvas().resize((W, H)).convert('RGBA'); d = ImageDraw.Draw(im)
    im.alpha_composite(compose.logo(54), (70, 60))
    d.text((W - 70, 56), f'{n:02d}', font=compose.F('h', 150), fill=compose.ACC + (255,), anchor='ra')
    size = 132
    while True:
        lines = compose.wrap(d, title, compose.F('h', size), W - 150)
        if len(lines) <= 3 or size < 90: break
        size -= 8
    y = H - 90 - len(lines) * (size + 4)
    d.text((72, y - 52), 'HOW-TO', font=compose.F('h6', 40), fill=compose.ACC + (255,))
    for ln in lines: d.text((68, y), ln, font=compose.F('h', size), fill=compose.TEXT + (255,)); y += size + 4
    d.rectangle([72, H - 52, 292, H - 44], fill=compose.ACC + (255,))
    return im.convert('RGB')
notes, meta = [], []
for n, (mod, title, line, group) in enumerate(SERIES, 1):
    m = importlib.import_module(mod); f = f'{OUT}/{m.FILE}.mp4'
    dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], capture_output=True, text=True).stdout or 0) if os.path.exists(f) else 0
    thumb(n, title).save(f'{TH}/{n:02d}.jpg', quality=90)
    notes.append(f'=== {m.FILE}.mp4  ({int(dur // 60)}:{int(dur % 60):02d})\nTitle: Triven how-to {n:02d}: {title}\nThumbnail: thumbs/{n:02d}.jpg\nDescription:\n{youtube_text(n, mod, title, line)}\n')
    meta.append({'n': n, 'title': title, 'line': line, 'group': group, 'secs': round(dur), 'file': m.FILE})
open(f'{OUT}/youtube-notes.txt', 'w').write('\n'.join(notes))
json.dump(meta, open('/tmp/vid/meta.json', 'w'), indent=1)
print(len(meta), 'videos;', sum(x['secs'] for x in meta) // 60, 'min total')
