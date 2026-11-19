// Draw a route on a canvas over map tiles (CARTO basemaps, OpenStreetMap data). Falls back to a plain background if tiles can't load.
const TILE = 512;   // @2x tiles drawn 1:1
const SPORTCOL = { run: '#22a05a', bike: '#3987e5', swim: '#9085e9', transition: '#8d959a', other: '#4fd081' };
const wx = (lon, z) => (lon + 180) / 360 * TILE * 2 ** z;
const wy = (lat, z) => { const s = Math.sin(lat * Math.PI / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE * 2 ** z; };
const imgCache = new Map();
function loadImg(url, ms = 6000) {
  if (imgCache.has(url)) return imgCache.get(url);
  const p = new Promise(res => { const i = new Image(); i.crossOrigin = 'anonymous'; const t = setTimeout(() => res(null), ms); i.onload = () => { clearTimeout(t); res(i); }; i.onerror = () => { clearTimeout(t); res(null); }; i.src = url; });
  imgCache.set(url, p); return p;
}
export function fitView(track, w, h, pad) {
  const lats = track.map(p => p[0]), lons = track.map(p => p[1]);
  const [la0, la1] = [Math.min(...lats), Math.max(...lats)], [lo0, lo1] = [Math.min(...lons), Math.max(...lons)];
  let z = 18;
  while (z > 2) { const dx = wx(lo1, z) - wx(lo0, z), dy = wy(la0, z) - wy(la1, z); if (dx <= w - 2 * pad && dy <= h - 2 * pad) break; z--; }
  const cx = (wx(lo0, z) + wx(lo1, z)) / 2, cy = (wy(la0, z) + wy(la1, z)) / 2;
  return { z, ox: cx - w / 2, oy: cy - h / 2 };
}
// sectionSports: array mapping section index -> sport, to colour the line; colour: single colour override
export async function drawRouteMap(ctx, track, x, y, w, h, { dark = true, pad = 40, sectionSports = null, colour = null, width = 6, glow = true, tiles = true, dim = 0 } = {}) {
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = dark ? '#1b1e20' : '#eef1ef'; ctx.fillRect(x, y, w, h);
  let tilesOk = false;
  if (!track || track.length < 2) { ctx.restore(); return { tilesOk }; }
  const v = fitView(track, w, h, pad);
  if (tiles) {
    const style = dark ? 'dark_all' : 'light_all';
    const tx0 = Math.floor(v.ox / TILE), ty0 = Math.floor(v.oy / TILE), tx1 = Math.floor((v.ox + w) / TILE), ty1 = Math.floor((v.oy + h) / TILE);
    const jobs = [];
    for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) {
      const n = 2 ** v.z, X = ((tx % n) + n) % n; if (ty < 0 || ty >= n) continue;
      const sub = 'abcd'[(tx + ty) & 3];
      jobs.push(loadImg(`https://${sub}.basemaps.cartocdn.com/${style}/${v.z}/${X}/${ty}@2x.png`).then(img => ({ img, tx, ty })));
    }
    const got = await Promise.all(jobs);
    for (const { img, tx, ty } of got) if (img) { ctx.drawImage(img, x + tx * TILE - v.ox, y + ty * TILE - v.oy, TILE, TILE); tilesOk = true; }
  }
  if (dim) { ctx.fillStyle = `rgba(0,0,0,${dim})`; ctx.fillRect(x, y, w, h); }
  const P = p => [x + wx(p[1], v.z) - v.ox, y + wy(p[0], v.z) - v.oy];
  // line, split where the section changes so each sport keeps its colour
  const segs = []; let cur = [track[0]];
  for (let i = 1; i < track.length; i++) { if (track[i][2] !== track[i - 1][2]) { cur.push(track[i]); segs.push(cur); cur = [track[i]]; } else cur.push(track[i]); }
  segs.push(cur);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const pass of glow ? ['glow', 'line'] : ['line']) {
    for (const s of segs) {
      const col = colour || (sectionSports ? SPORTCOL[sectionSports[s[0][2]]] || SPORTCOL.other : SPORTCOL.other);
      ctx.beginPath(); s.forEach((p, i) => { const [a, b] = P(p); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); });
      if (pass === 'glow') { ctx.strokeStyle = dark ? 'rgba(0,0,0,.55)' : 'rgba(255,255,255,.85)'; ctx.lineWidth = width + 6; }
      else { ctx.strokeStyle = col; ctx.lineWidth = width; }
      ctx.stroke();
    }
  }
  // start and finish
  const [sx, sy] = P(track[0]), [ex, ey] = P(track[track.length - 1]);
  const dot = (a, b, fill) => { ctx.beginPath(); ctx.arc(a, b, width * 1.3, 0, 7); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = width * 0.6; ctx.strokeStyle = dark ? '#111' : '#fff'; ctx.stroke(); };
  dot(ex, ey, '#e4e8e9'); dot(sx, sy, '#4fd081');
  if (tilesOk) { ctx.font = `${Math.max(10, Math.round(h / 60))}px Inter, sans-serif`; ctx.fillStyle = dark ? 'rgba(255,255,255,.55)' : 'rgba(0,0,0,.55)'; ctx.textAlign = 'right'; ctx.fillText('© OpenStreetMap contributors © CARTO', x + w - 10, y + h - 10); ctx.textAlign = 'left'; }
  ctx.restore();
  return { tilesOk };
}
