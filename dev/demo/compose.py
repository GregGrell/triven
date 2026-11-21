# Turns scene lists into a finished how-to video: title, cards, app screens with zoom/highlight/caption, end card.
# Each scene is rendered straight to its own .mp4 (crossfade from the previous scene baked in), then joined with -c copy.
import os, math, subprocess, shutil
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H, FPS = 1920, 1080, 30
HERE = os.path.dirname(os.path.abspath(__file__))
BG, PANEL, PANEL2 = (18, 20, 22), (27, 30, 32), (36, 40, 43)
TEXT, MUTED, ACC, ACC2 = (238, 241, 240), (150, 158, 161), (79, 208, 129), (31, 157, 85)
def bar(w): return ImageFont.truetype(f'{HERE}/fonts/Barlow-{w}.ttf', 10)  # placeholder, sized below
def F(kind, size):
    p = {'h': f'{HERE}/fonts/Barlow-700.ttf', 'h6': f'{HERE}/fonts/Barlow-600.ttf', 'r': '/usr/share/fonts/opentype/inter/Inter-Regular.otf',
         'm': '/usr/share/fonts/opentype/inter/Inter-Medium.otf', 'b': '/usr/share/fonts/opentype/inter/Inter-SemiBold.otf'}[kind]
    return ImageFont.truetype(p, size)
ease = lambda t: 0 if t <= 0 else 1 if t >= 1 else t * t * (3 - 2 * t)

def wrap(draw, text, font, width):
    out = []
    for para in text.split('\n'):
        line = ''
        for w in para.split(' '):
            t = (line + ' ' + w).strip()
            if draw.textlength(t, font=font) <= width: line = t
            else: out.append(line); line = w
        out.append(line)
    return out

LOGO = None
def logo(h):
    global LOGO
    if LOGO is None: LOGO = Image.open(f'{HERE}/logo_dark.png').convert('RGBA')
    return LOGO.resize((round(LOGO.width * h / LOGO.height), h), Image.LANCZOS)

# ---------------------------------------------------------------- scenes: each returns a function frame(i) -> RGB image, and a frame count
class Scene:
    dur = 4.0
    def frames(self): return round(self.dur * FPS)

def bg_canvas():
    im = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(im)
    for y in range(H):  # soft vertical gradient
        c = tuple(int(BG[k] + (PANEL[k] - BG[k]) * (y / H) * .9) for k in range(3)); d.line([(0, y), (W, y)], fill=c)
    return im

class Title(Scene):
    def __init__(self, num, title, sub='', dur=3.6): self.num, self.title, self.sub, self.dur = num, title, sub, dur
    def render(self, i):
        t = i / FPS; im = bg_canvas().convert('RGBA'); L = logo(64); im.alpha_composite(L, (120, 100))
        lay = Image.new('RGBA', (W, H)); d = ImageDraw.Draw(lay)
        a1, a2, a3 = ease((t - .15) / .5), ease((t - .35) / .5), ease((t - .6) / .5)
        d.text((120, 380 + 30 * (1 - a1)), f'HOW-TO  ·  {self.num:02d}', font=F('h6', 40), fill=ACC + (int(255 * a1),))
        y = 450 + 30 * (1 - a2)
        for ln in wrap(d, self.title, F('h', 120), 1600): d.text((116, y), ln, font=F('h', 120), fill=TEXT + (int(255 * a2),)); y += 125
        if self.sub:
            for ln in wrap(d, self.sub, F('r', 40), 1500): d.text((120, y + 30 + 20 * (1 - a3)), ln, font=F('r', 40), fill=MUTED + (int(255 * a3),)); y += 54
        d.rectangle([120, 1000, 120 + int(220 * a1), 1006], fill=ACC + (255,))
        im.alpha_composite(lay); return im.convert('RGB')

class Card(Scene):
    """Heading plus numbered steps or bullets appearing one by one. items: [(main, detail)] or [str]."""
    def __init__(self, heading, items, kind='steps', dur=None, eyebrow='', per=1.1, start=0):
        self.h, self.items, self.kind, self.eyebrow, self.per, self.start = heading, [x if isinstance(x, tuple) else (x, '') for x in items], kind, eyebrow, per, start
        self.dur = dur or (1.4 + per * len(items) + 3.2)
    def render(self, i):
        t = i / FPS; im = bg_canvas().convert('RGBA'); im.alpha_composite(logo(40), (W - 120 - logo(40).width, 70))
        lay = Image.new('RGBA', (W, H)); d = ImageDraw.Draw(lay); a = ease(t / .5)
        y = 150
        if self.eyebrow: d.text((140, y), self.eyebrow.upper(), font=F('h6', 34), fill=ACC + (int(255 * a),)); y += 56
        for ln in wrap(d, self.h, F('h', 84), 1640): d.text((136, y), ln, font=F('h', 84), fill=TEXT + (int(255 * a),)); y += 92
        y += 46
        for k, (main, det) in enumerate(self.items):
            b = ease((t - .9 - k * self.per) / .45);
            if b <= 0: continue
            x0 = 140 + 30 * (1 - b); al = int(255 * b)
            if self.kind == 'steps':
                d.ellipse([x0, y + 2, x0 + 64, y + 66], fill=ACC2 + (al,)); n = str(k + 1 + self.start)
                d.text((x0 + 32, y + 34), n, font=F('h', 42), fill=(255, 255, 255, al), anchor='mm'); tx = x0 + 96
            else:
                d.ellipse([x0 + 8, y + 24, x0 + 28, y + 44], fill=ACC + (al,)); tx = x0 + 60
            ls = wrap(d, main, F('b', 46), 1540 - (tx - 140)); yy = y + 6
            for ln in ls: d.text((tx, yy), ln, font=F('b', 46), fill=TEXT + (al,)); yy += 58
            if det:
                for ln in wrap(d, det, F('r', 36), 1540 - (tx - 140)): d.text((tx, yy + 2), ln, font=F('r', 36), fill=MUTED + (al,)); yy += 48
            y = yy + 34
        im.alpha_composite(lay); return im.convert('RGB')

class Flow(Scene):
    """Boxes left to right joined by arrows that draw in turn. nodes: [(label, sub)]"""
    def __init__(self, heading, nodes, note='', dur=7.5, eyebrow=''): self.h, self.nodes, self.note, self.dur, self.eyebrow = heading, nodes, note, dur, eyebrow
    def render(self, i):
        t = i / FPS; im = bg_canvas().convert('RGBA'); im.alpha_composite(logo(40), (W - 120 - logo(40).width, 70))
        lay = Image.new('RGBA', (W, H)); d = ImageDraw.Draw(lay); a = ease(t / .5)
        y = 150
        if self.eyebrow: d.text((140, y), self.eyebrow.upper(), font=F('h6', 34), fill=ACC + (int(255 * a),)); y += 56
        for ln in wrap(d, self.h, F('h', 84), 1640): d.text((136, y), ln, font=F('h', 84), fill=TEXT + (int(255 * a),)); y += 92
        n = len(self.nodes); bw, gap = 330, (W - 280 - 330 * n) / (n - 1); by, bh = 520, 190
        for k, (lab, sub) in enumerate(self.nodes):
            b = ease((t - .7 - k * .9) / .45)
            if b <= 0: continue
            x = 140 + k * (bw + gap); al = int(255 * b); last = k == n - 1
            d.rounded_rectangle([x, by + 20 * (1 - b), x + bw, by + bh + 20 * (1 - b)], 26, fill=(ACC2 if last else PANEL2) + (al,), outline=(ACC if last else (70, 76, 80)) + (al,), width=3)
            yy = by + 20 * (1 - b) + bh / 2 - (30 if sub else 0)
            d.text((x + bw / 2, yy), lab, font=F('h', 52), fill=(255, 255, 255, al), anchor='mm')
            if sub:
                for j, ln in enumerate(wrap(d, sub, F('r', 28), bw - 40)): d.text((x + bw / 2, yy + 50 + j * 36), ln, font=F('r', 28), fill=((225, 245, 233) if last else MUTED) + (al,), anchor='mm')
            if k < n - 1:
                c = ease((t - .7 - k * .9 - .45) / .45)
                if c > 0:
                    x1, x2, ym = x + bw + 18, x + bw + 18 + (gap - 36) * c, by + bh / 2
                    d.line([x1, ym, x2, ym], fill=ACC + (255,), width=6)
                    if c > .95: d.polygon([(x2 + 4, ym), (x2 - 18, ym - 14), (x2 - 18, ym + 14)], fill=ACC + (255,))
        if self.note:
            b = ease((t - .7 - n * .9) / .5)
            for j, ln in enumerate(wrap(d, self.note, F('r', 38), 1600)): d.text((140, 800 + j * 52), ln, font=F('r', 38), fill=MUTED + (int(255 * b),))
        im.alpha_composite(lay); return im.convert('RGB')

class Mock(Scene):
    """A simple, generic drawing of another site's settings page (not a copy of its design): a URL bar,
    labelled rows, and one highlighted row. rows: [(label, value)], hl: index."""
    def __init__(self, heading, url, title, rows, hl=None, caption='', dur=7, eyebrow=''):
        self.h, self.url, self.title, self.rows, self.hl, self.caption, self.dur, self.eyebrow = heading, url, title, rows, hl, caption, dur, eyebrow
    def render(self, i):
        t = i / FPS; im = bg_canvas().convert('RGBA'); im.alpha_composite(logo(40), (W - 120 - logo(40).width, 70))
        lay = Image.new('RGBA', (W, H)); d = ImageDraw.Draw(lay); a = ease(t / .5)
        y = 150
        if self.eyebrow: d.text((140, y), self.eyebrow.upper(), font=F('h6', 34), fill=ACC + (int(255 * a),)); y += 56
        for ln in wrap(d, self.h, F('h', 72), 1640): d.text((136, y), ln, font=F('h', 72), fill=TEXT + (int(255 * a),)); y += 80
        b = ease((t - .4) / .5); x0, y0, x1 = 140, y + 40 + 20 * (1 - b), 1780; al = int(255 * b)
        rows_h = 110 * len(self.rows) + 150; y1 = y0 + rows_h
        d.rounded_rectangle([x0, y0, x1, y1], 22, fill=(242, 244, 243, al))
        d.rounded_rectangle([x0, y0, x1, y0 + 70], 22, fill=(222, 226, 224, al)); d.rectangle([x0, y0 + 40, x1, y0 + 70], fill=(222, 226, 224, al))
        for k, c in enumerate([(236, 106, 94), (244, 190, 79), (98, 197, 84)]): d.ellipse([x0 + 28 + k * 34, y0 + 25, x0 + 48 + k * 34, y0 + 45], fill=c + (al,))
        d.rounded_rectangle([x0 + 150, y0 + 16, x0 + 900, y0 + 54], 19, fill=(255, 255, 255, al)); d.text((x0 + 172, y0 + 35), self.url, font=F('r', 26), fill=(80, 86, 90, al), anchor='lm')
        d.text((x0 + 50, y0 + 110), self.title, font=F('b', 44), fill=(20, 24, 26, al), anchor='lm')
        for k, (lab, val) in enumerate(self.rows):
            ry = y0 + 160 + k * 110; c = ease((t - 1.0 - k * .35) / .4); al2 = int(255 * b * c)
            on = self.hl is not None and k in (self.hl if isinstance(self.hl, (list, tuple)) else [self.hl]) and t > 1.0 + len(self.rows) * .35 + .3
            if on: d.rounded_rectangle([x0 + 30, ry - 10, x1 - 30, ry + 90], 16, fill=(225, 245, 233, al2), outline=ACC2 + (al2,), width=4)
            d.text((x0 + 60, ry + 40), lab, font=F('m', 36), fill=(50, 56, 60, al2), anchor='lm')
            if val: d.text((x1 - 60, ry + 40), val, font=F('b', 36), fill=(ACC2 if on else (90, 96, 100)) + (al2,), anchor='rm')
        if self.caption:
            c = ease((t - 1.4 - len(self.rows) * .35) / .5)
            for j, ln in enumerate(wrap(d, self.caption, F('r', 38), 1600)): d.text((140, y1 + 50 + j * 52), ln, font=F('r', 38), fill=MUTED + (int(255 * c),))
        im.alpha_composite(lay); return im.convert('RGB')

class Screen(Scene):
    """App screenshots. shots: [(path, highlight box or None, seconds)] shown in turn (for typing etc.).
    zoom: 1.0 = none; >1 pushes in slowly toward the highlight (or 'focus' box)."""
    def __init__(self, shots, caption='', zoom=1.12, focus=None, cap_pos=None, dim=True, z0=1.0):
        self.shots = [s if len(s) == 3 else (s[0], s[1], 3.5) for s in shots]
        self.dur = sum(s[2] for s in self.shots); self.caption, self.zoom, self.focus, self.cap_pos, self.dim, self.z0 = caption, zoom, focus, cap_pos, dim, z0
        self.cache = {}
    def img(self, p):
        if p not in self.cache: self.cache = {p: Image.open(p).convert('RGB').resize((W, H), Image.LANCZOS) if Image.open(p).size != (W, H) else Image.open(p).convert('RGB')}
        return self.cache[p]
    def render(self, i):
        t = i / FPS; acc = 0
        for p, hl, s in self.shots:
            if t < acc + s or (p, hl, s) == self.shots[-1]: break
            acc += s
        im = self.img(p); fb = self.focus or hl or next((x[1] for x in self.shots if x[1]), None)
        cap = min(W * .94 / (fb[2] + 40), H * .9 / (fb[3] + 40)) if fb else 9
        zt, z0 = max(1, min(self.zoom, cap)), max(1, min(self.z0, cap))
        e = ease(t / max(self.dur, 1)); z = z0 + (zt - z0) * e; pe = 1 if z0 > 1.001 else e
        if fb: cx, cy = fb[0] + fb[2] / 2, fb[1] + fb[3] / 2
        else: cx, cy = W / 2, H / 2
        cw, ch = W / z, H / z
        x0 = min(max(cx - cw / 2, 0), W - cw); y0 = min(max(cy - ch / 2, 0), H - ch)
        x0 = W / 2 - cw / 2 + (x0 - (W / 2 - cw / 2)) * pe if z > 1.001 else 0
        y0 = H / 2 - ch / 2 + (y0 - (H / 2 - ch / 2)) * pe if z > 1.001 else 0
        frame = im.crop((round(x0), round(y0), round(x0 + cw), round(y0 + ch))).resize((W, H), Image.BILINEAR) if z > 1.001 else im.copy()
        frame = frame.convert('RGBA'); lay = Image.new('RGBA', (W, H)); d = ImageDraw.Draw(lay)
        if hl:
            a = 1 if self.z0 > 1.001 else ease((t - acc - .25) / .4) if acc == 0 or self.shots[0][1] is None else 1
            bx = [(hl[0] - x0) * z, (hl[1] - y0) * z, (hl[0] + hl[2] - x0) * z, (hl[1] + hl[3] - y0) * z]; pad = 12
            bx = [bx[0] - pad, bx[1] - pad, bx[2] + pad, bx[3] + pad]
            if self.dim:
                m = Image.new('L', (W, H), int(110 * a)); ImageDraw.Draw(m).rounded_rectangle(bx, 18, fill=0)
                lay.paste((10, 12, 14, 255), (0, 0), m)
            d.rounded_rectangle(bx, 18, outline=ACC + (int(255 * a),), width=6)
        frame.alpha_composite(lay)
        if self.caption: frame.alpha_composite(self.cap_layer(t, hl, x0, y0, z))
        return frame.convert('RGB')
    def cap_layer(self, t, hl, x0, y0, z):
        lay = Image.new('RGBA', (W, H)); d = ImageDraw.Draw(lay); a = ease((t - .15) / .35)
        f = F('m', 42); lines = wrap(d, self.caption, f, 1500); bw = max(d.textlength(l, font=f) for l in lines) + 100; bh = len(lines) * 56 + 56
        top = self.cap_pos == 'top' or (self.cap_pos is None and hl and (hl[1] + hl[3] / 2 - y0) * z > H * .6)
        by = 60 if top else H - 60 - bh; bx = (W - bw) / 2; dy = (-20 if top else 20) * (1 - a)
        sh = Image.new('RGBA', (W, H)); ImageDraw.Draw(sh).rounded_rectangle([bx, by + dy + 8, bx + bw, by + bh + dy + 8], 26, fill=(0, 0, 0, int(90 * a)))
        lay.alpha_composite(sh.filter(ImageFilter.GaussianBlur(14)))
        d.rounded_rectangle([bx, by + dy, bx + bw, by + bh + dy], 26, fill=(20, 23, 25, int(238 * a)))
        d.rectangle([bx + 28, by + dy + 24, bx + 34, by + bh + dy - 24], fill=ACC + (int(255 * a),))
        for j, l in enumerate(lines): d.text((bx + 60, by + dy + 28 + j * 56), l, font=f, fill=TEXT + (int(255 * a),))
        return lay

class End(Scene):
    def __init__(self, next_title='', dur=4.0): self.next, self.dur = next_title, dur
    def render(self, i):
        t = i / FPS; im = bg_canvas().convert('RGBA'); a = ease(t / .6)
        L = logo(150); L.putalpha(L.getchannel('A').point(lambda v: int(v * a))); im.alpha_composite(L, ((W - L.width) // 2, 340))
        d = ImageDraw.Draw(im); b = ease((t - .5) / .5)
        d.text((W / 2, 610), 'triven.fit', font=F('h', 70), fill=ACC + (int(255 * b),), anchor='mm')
        d.text((W / 2, 690), 'Swim, bike, run. Free.', font=F('r', 38), fill=MUTED + (int(255 * b),), anchor='mm')
        if self.next: d.text((W / 2, 880), f'Next: {self.next}', font=F('m', 40), fill=TEXT + (int(255 * ease((t - 1.2) / .5)),), anchor='mm')
        return im.convert('RGB')

# ---------------------------------------------------------------- rendering
XF = 12   # crossfade frames into each scene
def encode(scene, path, prev_last):
    n = scene.frames(); tmp = path[:-4] + '.part.mp4'
    ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                           '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', str(FPS), tmp], stdin=subprocess.PIPE)
    last = None
    for i in range(n):
        im = scene.render(i)
        if prev_last is not None and i < XF: im = Image.blend(prev_last, im, ease((i + 1) / XF))
        ff.stdin.write(im.tobytes()); last = im
    ff.stdin.close()
    if ff.wait() != 0: raise RuntimeError('ffmpeg failed on ' + path)
    os.replace(tmp, path); return last

def preview(scenes, at, out):
    """Save one frame per scene at fraction `at` of the scene, to check layouts before rendering."""
    for k, s in enumerate(scenes): s.render(min(s.frames() - 1, int(s.frames() * at))).save(f'{out}_{k:02d}.jpg', quality=85)

def render(scenes, out, work):
    os.makedirs(work, exist_ok=True); parts = []; prev = None
    for k, s in enumerate(scenes):
        p = os.path.join(work, f'scene{k:02d}.mp4'); prev = encode(s, p, prev); parts.append(p)
    lst = os.path.join(work, 'list.txt'); open(lst, 'w').write(''.join(f"file '{p}'\n" for p in parts))
    tmp = out[:-4] + '.part.mp4'
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lst, '-c', 'copy', '-movflags', '+faststart', tmp], check=True)
    os.replace(tmp, out)
    return out
