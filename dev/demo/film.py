# Captures the real app (mock backend + demo athlete) for the how-to videos.
# Viewport 1280x720 at 1.5x = 1920x1080 JPEG frames. The clock is fixed so dates read the same in every video.
import os, re, json, subprocess, time, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playwright.sync_api import sync_playwright

DEV = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(DEV)
PORT = 8820
NOW = '2026-11-22T17:30:00Z'
SCALE = 1.5

def build_site():
    subprocess.run(['./bump.sh'], cwd=ROOT, stdout=subprocess.DEVNULL)
    subprocess.run(['dev/build_site.sh'], cwd=ROOT, stdout=subprocess.DEVNULL)
    # the real fonts (the test copy drops the Google Fonts link)
    fdir = '../node_modules/@fontsource/barlow-semi-condensed/files/'
    css = ''.join(f"@font-face{{font-family:'Barlow Semi Condensed';font-weight:{w};src:url({fdir}barlow-semi-condensed-latin-{w}-normal.woff2) format('woff2')}}" for w in (500, 600, 700))
    p = os.path.join(DEV, 'site/index.html'); h = open(p).read()
    if 'Barlow Semi Condensed\';font-weight' not in h:
        h = h.replace('</head>', f'<style>{css}.leaflet-control-attribution{{display:none!important}}.leaflet-tile{{opacity:1!important}}</style></head>', 1); open(p, 'w').write(h)

def logo_png(out, height=200, dark=True):
    """Render the header logo SVG to a transparent PNG."""
    h = open(os.path.join(ROOT, 'index.html')).read()
    svg = re.search(r'<svg aria-label="Triven".*?</svg>', h, re.S).group(0)
    svg = re.sub(r'style="[^"]*"', f'style="height:{height}px;width:auto;display:block"', svg, 1)
    with sync_playwright() as p:
        b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1600, 'height': height + 40})
        pg.set_content(f'<html><body style="margin:0;background:transparent;--text-primary:{"#eef1f0" if dark else "#14181a"};--logo-light:{"#eef1f0" if dark else "#14181a"}"><div id=l style="display:inline-block;padding:10px;color:{"#eef1f0" if dark else "#14181a"}">{svg}</div></body></html>')
        pg.locator('#l').screenshot(path=out, omit_background=True); b.close()

class Film:
    def __init__(self, outdir, seed=None, rpc=None, extra_init='', dark=False, path='#feed'):
        self.out = outdir; os.makedirs(outdir, exist_ok=True); self.n = 0
        self.srv = subprocess.Popen(['python3', '-m', 'http.server', str(PORT)], cwd=DEV, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
        self.p = sync_playwright().start(); self.b = self.p.chromium.launch(args=['--lang=en-GB'])
        self.ctx = self.b.new_context(viewport={'width': 1280, 'height': 720}, device_scale_factor=SCALE, color_scheme='dark' if dark else 'light', locale='en-GB', timezone_id='Europe/London')
        self.pg = self.ctx.new_page(); self.errs = []; self.pg.on('pageerror', lambda e: self.errs.append(str(e)))
        self.pg.clock.set_fixed_time(NOW)
        from basemap import tile_png
        def tile(route):
            u = route.request.url
            m = re.search(r'/tile/(\d+)/(\d+)/(\d+)', u)
            if m: z, y, x = map(int, m.groups())
            else: z, x, y = map(int, re.search(r'/(\d+)/(\d+)/(\d+)\.png', u).groups())
            route.fulfill(path=tile_png(z, x, y), content_type='image/png')
        self.pg.route(re.compile(r'arcgisonline|opentopomap'), tile)
        def weather(route):
            import datetime, math, urllib.parse as up
            q = dict(up.parse_qsl(up.urlparse(route.request.url).query))
            d0 = datetime.date.fromisoformat(q['start_date']); d1 = datetime.date.fromisoformat(q['end_date'])
            H = {'time': [], 'temperature_2m': [], 'apparent_temperature': [], 'relative_humidity_2m': [], 'dew_point_2m': [], 'wind_speed_10m': []}
            d = d0
            while d <= d1:
                base = 11 + 8 * math.cos((d.timetuple().tm_yday - 200) / 365 * 2 * math.pi)   # London-ish seasons
                for h in range(24):
                    t = base + 4 * math.sin((h - 9) / 24 * 2 * math.pi) + 1.5 * math.sin(d.toordinal() * 1.7)
                    H['time'].append(f'{d}T{h:02d}:00'); H['temperature_2m'].append(round(t, 1)); H['apparent_temperature'].append(round(t - 1.5, 1))
                    H['relative_humidity_2m'].append(72); H['dew_point_2m'].append(round(t - 5, 1)); H['wind_speed_10m'].append(14)
                d += datetime.timedelta(days=1)
            route.fulfill(status=200, content_type='application/json', body=json.dumps({'hourly': H}))
        self.pg.route(re.compile(r'open-meteo'), weather)
        init = ("(function(){var x=new XMLHttpRequest();x.open('GET','/demo/snapshot_final.json',false);x.send();var s=JSON.parse(x.responseText);"
                "var db=s.db,prof=db.profiles[0];delete db.profiles;var seed={profile:prof};for(var k in db)seed[k]=db[k];"
                "var extra=" + json.dumps(seed or {}) + ";for(var k in extra){if(k==='profile')Object.assign(seed.profile,extra.profile);else seed[k]=(seed[k]||[]).concat(extra[k]);}"
                "window.__seedDb=seed;window.__seedFiles=s.files;window.__uuidStart=900000;window.__rpcData=" + json.dumps(rpc or {}) + ";})();" + extra_init)
        self.pg.add_init_script(init)
        self.pg.goto(f'http://localhost:{PORT}/site/index.html{path}'); self.pg.wait_for_timeout(3500)

    def nav(self, h, wait=1500):
        self.pg.evaluate(f"location.hash={json.dumps(h)}"); self.pg.wait_for_timeout(wait)

    def box(self, sel):
        """Bounding box of an element in output pixels (x, y, w, h)."""
        b = self.pg.locator(sel).first.bounding_box()
        if not b: return None
        x0, y0 = max(0, b['x']), max(0, b['y']); x1, y1 = min(1280, b['x'] + b['width']), min(720, b['y'] + b['height'])
        return tuple(round(v * SCALE) for v in (x0, y0, x1 - x0, y1 - y0))

    def shot(self, name=None, hl=None, blur=True):
        """Screenshot the viewport; returns (path, highlight box or None)."""
        if blur: self.pg.evaluate("document.activeElement && document.activeElement.tagName!=='BODY' && !document.activeElement.matches('input:not([type=checkbox]):not([type=radio]),textarea') && document.activeElement.blur()")
        self.n += 1; f = os.path.join(self.out, f'{self.n:03d}_{name or "s"}.jpg')
        self.pg.screenshot(path=f, type='jpeg', quality=92)
        return f, (self.box(hl) if isinstance(hl, str) else hl)

    def type_frames(self, sel, text, name='type', every=1, hl=None):
        """Type text a character at a time, a screenshot after each step."""
        out = []; loc = self.pg.locator(sel).first; loc.click()
        for i, ch in enumerate(text):
            loc.press_sequentially(ch)
            if i % every == every - 1 or i == len(text) - 1: out.append(self.shot(name, hl or sel))
        return out

    def close(self):
        if self.errs: print('page errors:', self.errs[:3])
        self.b.close(); self.p.stop(); self.srv.terminate()
