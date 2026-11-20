// Metric or imperial, chosen in Settings (settings.units). Everything is stored in metres, seconds and kilograms;
// these helpers only change what is shown and what number boxes mean. Swims stay in metres (pools here are metric).
export const MI = 1609.344, FT = 0.3048, LB = 0.45359237;
let imp = false;
export const setUnits = u => { imp = u === 'imperial'; };
export const imperial = () => imp;

// distance
export const dU = () => imp ? 'mi' : 'km';
export const perUnit = () => imp ? MI : 1000;                 // metres in one km or mile
export const toD = m => (+m || 0) / perUnit();                // metres → km or mi
export const fromD = x => +x * perUnit();                     // km or mi → metres
export const dist = (m, dp = 2) => `${toD(m).toFixed(dp)} ${dU()}`;
export const distBig = m => `${toD(m).toLocaleString(undefined, { maximumFractionDigits: toD(m) >= 100 ? 0 : 1 })} ${dU()}`;
// elevation
export const eU = () => imp ? 'ft' : 'm';
export const toE = m => imp ? (+m || 0) / FT : (+m || 0);
export const elev = m => `${Math.round(toE(m)).toLocaleString()} ${eU()}`;
// pace (runs) and speed (rides)
export const mmss = s => { if (!(s > 0) || !isFinite(s)) return '–'; s = Math.round(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const pU = () => '/' + dU();
export const paceS = (secs, m) => m > 0 && secs > 0 ? secs / toD(m) : null;     // seconds per km or mile
export const pace = (secs, m) => `${mmss(paceS(secs, m))} ${pU()}`;
export const paceMs = ms => ms > 0 ? perUnit() / ms : null;                     // m/s → seconds per km or mile
export const sU = () => imp ? 'mph' : 'km/h';
export const kmhTo = kmh => kmh == null ? null : imp ? kmh * 1000 / MI : kmh;    // km/h → km/h or mph
export const speed = (secs, m) => secs > 0 ? `${kmhTo(m / secs * 3.6).toFixed(1)} ${sU()}` : '–';
export const speedMs = ms => `${kmhTo(ms * 3.6).toFixed(1)} ${sU()}`;
// swims: always metres
export const swimPace = (secs, m) => `${mmss(m > 0 ? secs / (m / 100) : null)} /100 m`;
// body and bike weight
export const wU = () => imp ? 'lb' : 'kg';
export const toW = kg => kg == null || kg === '' ? kg : imp ? Math.round(kg / LB * 10) / 10 : kg;
export const fromW = x => x == null || x === '' ? x : imp ? +x * LB : +x;
// a typed pace like 4:30 (per km or mile) → seconds per km
export const paceInToKm = s => s == null ? s : imp ? s * 1000 / MI : s;
export const paceKmToU = s => s == null ? s : imp ? s * MI / 1000 : s;
