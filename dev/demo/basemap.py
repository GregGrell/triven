# A plain, made-up base map for the demo videos (the demo routes are invented, so real streets wouldn't match):
# light grey land, a warped street grid, parks around the demo loops and a lake. Tiles are drawn on request and cached.
import math, os, io
import numpy as np
from PIL import Image

REF = (51.45, -0.2)
LOOPS = {  # same shapes as make_demo.mjs: centre, radius, harmonics, x-stretch; park scale
  'hyde': ((51.5073, -0.1657), 720, [(3, .10, .4), (5, .05, 1.3), (2, .08, 2.1)], 1.6, 1.28),
  'regents': ((51.5313, -0.1570), 560, [(4, .08, .2), (3, .06, 2.4)], 1.2, 1.3),
  'richmond': ((51.4440, -0.2750), 1700, [(3, .12, 1.0), (5, .05, .2), (7, .03, 2.9)], 1.25, 1.22),
}
LAKE = ((51.5052, -0.1690), 160 * 2.4, 160 * 1.0)
LAND, PARK, WATER, ROAD, MAJOR = (234, 234, 232), (213, 229, 205), (184, 212, 230), (252, 252, 251), (255, 255, 255)

def meters(lat, lon):
    return (lon - REF[1]) * 111320 * math.cos(math.radians(REF[0])), (lat - REF[0]) * 111320

def tile(z, x, y, size=256):
    n = 2 ** z; i = np.arange(size) + .5
    lon = (x + i / size) / n * 360 - 180
    lat = np.degrees(np.arctan(np.sinh(np.pi * (1 - 2 * (y + i / size) / n))))
    LON, LAT = np.meshgrid(lon, lat)
    px = (LON - REF[1]) * 111320 * math.cos(math.radians(REF[0])); py = (LAT - REF[0]) * 111320
    mpp = 156543 * math.cos(math.radians(REF[0])) / n * 256 / size   # metres per pixel
    img = np.empty((size, size, 3), np.float32); img[:] = LAND
    # streets: a gently warped grid, major roads every 900 m, minor every 180 m when zoomed in
    ca, sa = math.cos(.21), math.sin(.21); qx, qy = px * ca + py * sa, -px * sa + py * ca
    u = qx + 28 * np.sin(qy / 1100) + 9 * np.sin(qy / 430); v = qy + 30 * np.sin(qx / 1300) + 8 * np.sin(qx / 520)
    def lines(spacing, width):
        w = max(width, mpp * .9)
        du = np.abs(((u + spacing / 2) % spacing) - spacing / 2); dv = np.abs(((v + spacing / 2) % spacing) - spacing / 2)
        return np.clip(1 - (np.minimum(du, dv) - w / 2) / mpp, 0, 1)
    if z >= 14: m = lines(180, 7) * (0.55 if z >= 15 else .35); img = img * (1 - m[..., None]) + np.array(ROAD) * m[..., None]
    if z >= 10: m = lines(900, 14); img = img * (1 - m[..., None]) + np.array(MAJOR) * m[..., None]
    m = lines(5400, 26) * .9; img = img * (1 - m[..., None]) + np.array((247, 244, 236)) * m[..., None]
    # parks around the loops (paths inside are left out)
    for (c, R, ks, sx, sc) in LOOPS.values():
        cx, cy = meters(*c); dx, dy = (px - cx) / sx, py - cy; th = np.arctan2(dy, dx)
        rr = 1 + sum(a * np.sin(h * th + p) for h, a, p in ks)
        d = np.hypot(dx, dy) - R * rr * sc
        m = np.clip(.5 - d / (mpp * 1.5), 0, 1); img = img * (1 - m[..., None]) + np.array(PARK) * m[..., None]
    # the lake
    (la, lo), a, b = LAKE; cx, cy = meters(la, lo)
    d = np.hypot((px - cx) / a, (py - cy) / b) - 1
    m = np.clip(.5 - d * min(a, b) / (mpp * 1.2), 0, 1); img = img * (1 - m[..., None]) + np.array(WATER) * m[..., None]
    out = io.BytesIO(); Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(out, 'PNG', optimize=False); return out.getvalue()

CACHE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'tiles_gen')
def tile_png(z, x, y):
    os.makedirs(CACHE, exist_ok=True); f = os.path.join(CACHE, f'{z}_{x}_{y}.png')
    if not os.path.exists(f): open(f, 'wb').write(tile(z, x, y))
    return f
