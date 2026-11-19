// Triven: turn a decoded FIT file into activity rows, streams and best efforts.
// Pure functions only (no network), so the same code runs in the browser and in tests.

const SC = 180 / 2 ** 31;                 // semicircles -> degrees
const FIT_EPOCH = 631065600;              // 1989-12-31T00:00:00Z in unix seconds
const SPORT = { running: 'run', cycling: 'bike', swimming: 'swim', transition: 'transition' };
const r = (v, d = 2) => (v == null || Number.isNaN(v) ? null : Math.round(v * 10 ** d) / 10 ** d);

export const RUN_DISTANCES = [['400 m', 400], ['1 km', 1000], ['1 mile', 1609.34], ['5 km', 5000], ['10 km', 10000], ['15 km', 15000],
  ['10 mile', 16093.4], ['Half marathon', 21097.5], ['30 km', 30000], ['Marathon', 42195], ['50 km', 50000], ['50 mile', 80467.2],
  ['100 km', 100000], ['100 mile', 160934.4]];
export const BIKE_DISTANCES = [['10 mile TT', 16093.4], ['25 mile TT', 40233.6], ['50 mile TT', 80467.2], ['100 km', 100000], ['100 mile TT', 160934.4]];
export const POWER_DURATIONS = [['power 1 s', 1], ['power 5 s', 5], ['power 10 s', 10], ['power 30 s', 30], ['power 1 min', 60], ['power 5 min', 300],
  ['power 10 min', 600], ['power 20 min', 1200], ['power 30 min', 1800], ['power 1 hour', 3600]];
export const SWIM_DISTANCES = [['100 m', 100], ['400 m', 400], ['750 m', 750], ['1500 m', 1500], ['1900 m', 1900], ['3800 m', 3800]];

export const STREAM_FIELDS = ['t', 'lat', 'lon', 'dist', 'speed', 'alt', 'hr', 'power', 'cad', 'gct', 'gctBal', 'vo', 'stride', 'temp'];

function sportOf(s) { return SPORT[s] || 'other'; }

export function multisportProfile(seq) {
  const s = seq.filter(x => x !== 'transition').join('-');
  if (s === 'swim-bike-run') return 'triathlon';
  if (s === 'run-bike-run' || s === 'run-bike') return 'duathlon';
  if (s === 'swim-run' || s === 'run-swim-run') return 'aquathlon';
  return 'other';
}

// fastest time to cover `dist` metres inside one section's records (interpolated)
function bestOverDistance(recs, dist) {
  let best = null, j = 0;
  for (let i = 0; i < recs.length; i++) {
    if (j < i) j = i;
    while (j < recs.length && recs[j].dist - recs[i].dist < dist) j++;
    if (j >= recs.length) break;
    const a = recs[j - 1], b = recs[j];
    const f = (recs[i].dist + dist - a.dist) / Math.max(1e-6, b.dist - a.dist);
    const t = a.t + f * (b.t - a.t) - recs[i].t;
    if (best == null || t < best.t) best = { t, start: recs[i].t };
  }
  return best;
}

// best average power for each duration, from a 1-second resampled series
function bestPower(recs, durations) {
  if (recs.length < 2) return {};
  const t0 = recs[0].t, n = Math.floor(recs[recs.length - 1].t - t0) + 1;
  const p = new Float64Array(n); let j = 0;
  for (let k = 0; k < n; k++) { const t = t0 + k; while (j < recs.length - 1 && recs[j + 1].t <= t) j++; const gap = (recs[j + 1]?.t ?? recs[j].t) - recs[j].t; p[k] = gap > 10 ? 0 : (recs[j].power ?? 0); }
  const pre = new Float64Array(n + 1); for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + p[i];
  const out = {};
  for (const [name, w] of durations) { if (w > n) continue; let b = 0, at = 0; for (let i = 0; i + w <= n; i++) { const a = (pre[i + w] - pre[i]) / w; if (a > b) { b = a; at = i; } } if (b > 0) out[name] = { w: b, start: t0 + at }; }
  return out;
}

export function processFit(messages, opts = {}) {
  const fid = messages.fileIdMesgs?.[0] || {};
  const act = messages.activityMesgs?.[0] || {};
  const S = (messages.sessionMesgs || []).slice().sort((a, b) => a.startTime - b.startTime);
  if (!S.length) throw new Error('No sessions in this file');
  const start = S[0].startTime;
  const startMs = +start;
  const off = s => (+s - startMs) / 1000;
  let utcOffsetMin = 0;
  if (act.localTimestamp != null && act.timestamp) utcOffsetMin = Math.round(((act.localTimestamp + FIT_EPOCH) - (+act.timestamp / 1000)) / 60);

  const sections = S.map((s, i) => ({
    idx: i, sport: sportOf(s.sport), start_offset_s: r(off(s.startTime)), elapsed_s: r(s.totalElapsedTime), timer_s: r(s.totalTimerTime),
    distance_m: r(s.totalDistance, 1), ascent_m: s.totalAscent ?? null, avg_hr: s.avgHeartRate ?? null, max_hr: s.maxHeartRate ?? null,
    avg_speed: r(s.enhancedAvgSpeed ?? s.avgSpeed, 3), avg_power: s.avgPower ?? null,
    avg_cadence: s.avgRunningCadence ?? s.avgCadence ?? null,
    summary: {
      maxSpeed: r(s.enhancedMaxSpeed ?? s.maxSpeed, 3), maxPower: s.maxPower ?? null, np: s.normalizedPower ?? null, descent: s.totalDescent ?? null,
      calories: s.totalCalories ?? null, te: s.totalTrainingEffect ?? null, ate: s.totalAnaerobicTrainingEffect ?? null,
      avgGct: r(s.avgStanceTime, 1), avgGctBal: r(s.avgStanceTimeBalance, 2), avgVo: r(s.avgVerticalOscillation, 1), avgStride: r(s.avgStepLength, 0),
      poolLength: s.poolLength ?? null, numLengths: s.numActiveLengths ?? null, avgStrokeRate: s.avgCadence ?? null, swolf: s.avgSwolf ?? null,
      subSport: s.subSport ?? null,
    },
  }));
  const secAt = t => { for (let i = sections.length - 1; i >= 0; i--) if (t >= sections[i].start_offset_s - 0.5) return i; return 0; };

  const laps = (messages.lapMesgs || []).slice().sort((a, b) => a.startTime - b.startTime).map((l, i) => ({
    idx: i, sport: sportOf(l.sport ?? S[secAt(off(l.startTime))].sport), start_offset_s: r(off(l.startTime)), elapsed_s: r(l.totalElapsedTime),
    distance_m: r(l.totalDistance, 1), ascent_m: l.totalAscent ?? null, avg_hr: l.avgHeartRate ?? null, max_hr: l.maxHeartRate ?? null,
    avg_speed: r(l.enhancedAvgSpeed ?? l.avgSpeed, 3), avg_power: l.avgPower ?? null,
  }));

  // records -> columnar streams
  const recs = (messages.recordMesgs || []).filter(x => x.timestamp).map(x => {
    const cad = x.cadence != null ? x.cadence + (x.fractionalCadence || 0) : null;
    return {
      t: r(off(x.timestamp), 1), lat: x.positionLat != null ? r(x.positionLat * SC, 6) : null, lon: x.positionLong != null ? r(x.positionLong * SC, 6) : null,
      dist: r(x.distance, 1), speed: r(x.enhancedSpeed ?? x.speed, 3), alt: r(x.enhancedAltitude ?? x.altitude, 1), hr: x.heartRate ?? null,
      power: x.power ?? null, cad: r(cad, 1), gct: r(x.stanceTime, 1), gctBal: r(x.stanceTimeBalance, 2), vo: r(x.verticalOscillation, 1),
      stride: r(x.stepLength, 0), temp: x.temperature ?? null,
    };
  });
  const streams = { fields: STREAM_FIELDS, v: 1 };
  for (const f of STREAM_FIELDS) streams[f] = recs.map(x => x[f]);
  if (messages.lengthMesgs?.length) streams.lengths = messages.lengthMesgs.map(l => ({ t: r(off(l.startTime), 1), dur: r(l.totalElapsedTime, 2), type: l.lengthType, strokes: l.totalStrokes ?? null, stroke: l.swimStroke ?? null }));

  // activity row
  const real = sections.filter(s => s.sport !== 'transition');
  const kinds = [...new Set(real.map(s => s.sport))];
  const isMulti = real.length > 1 && kinds.length > 1;
  const sport = isMulti ? 'multi' : (kinds[0] || 'other');
  const totalElapsed = sections.reduce((a, s) => Math.max(a, s.start_offset_s + s.elapsed_s), 0);
  const sum = k => sections.reduce((a, s) => a + (s[k] || 0), 0);
  const hrW = sections.filter(s => s.avg_hr).reduce((a, s) => a + s.avg_hr * s.elapsed_s, 0) / Math.max(1, sections.filter(s => s.avg_hr).reduce((a, s) => a + s.elapsed_s, 0));
  const profile = isMulti ? multisportProfile(sections.map(s => s.sport)) : null;
  const local = new Date(startMs + utcOffsetMin * 60000);
  const hh = local.getUTCHours();
  const part = hh < 12 ? 'Morning' : hh < 17 ? 'Afternoon' : hh < 21 ? 'Evening' : 'Night';
  const label = { run: 'Run', bike: 'Ride', swim: 'Swim', other: 'Workout' };
  const name = isMulti ? `${part} ${profile === 'other' ? 'Multisport' : profile[0].toUpperCase() + profile.slice(1)}` : `${part} ${label[sport] || 'Workout'}`;
  const devices = (messages.deviceInfoMesgs || []);
  const creator = devices.find(d => d.deviceIndex === 'creator') || {};
  const sensors = [...new Set(devices.filter(d => d.garminProduct && d.garminProduct !== creator.garminProduct && d.sourceType !== 'local').map(d => String(d.garminProduct)))];
  const NICE = { fenix7x: 'Garmin fēnix 7X', fenix7: 'Garmin fēnix 7', fenix7s: 'Garmin fēnix 7S', fenix8: 'Garmin fēnix 8', fr965: 'Garmin Forerunner 965', fr955: 'Garmin Forerunner 955', fr265: 'Garmin Forerunner 265', fr255: 'Garmin Forerunner 255', edge1040: 'Garmin Edge 1040', edge840: 'Garmin Edge 840', hrmProPlus: 'HRM-Pro Plus', hrmPro: 'HRM-Pro', hrm600: 'HRM 600', hrmRun: 'HRM-Run' };
  const nice = v => NICE[v] || String(v).replace(/([a-z])([A-Z0-9])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
  const tz = (messages.timeInZoneMesgs || []).find(z => z.referenceMesg === 'session');
  const up = messages.userProfileMesgs?.[0] || {};
  const indoor = sport !== 'multi' && !recs.some(x => x.lat != null);

  const activity = {
    name, sport, multisport_profile: profile, start_time: new Date(startMs).toISOString(), utc_offset_min: utcOffsetMin,
    distance_m: r(sum('distance_m'), 1), elapsed_s: r(totalElapsed), moving_s: r(act.totalTimerTime ?? sum('timer_s')),
    ascent_m: sum('ascent_m') || null, descent_m: sections.reduce((a, s) => a + (s.summary.descent || 0), 0) || null,
    calories: sections.reduce((a, s) => a + (s.summary.calories || 0), 0) || null, avg_hr: hrW ? Math.round(hrW) : null,
    max_hr: Math.max(0, ...sections.map(s => s.max_hr || 0)) || null, indoor,
    device: [creator.garminProduct || fid.garminProduct || fid.manufacturer, ...sensors].filter(Boolean).map(nice).join(' + ') || null,
    source: opts.source || 'upload',
    source_id: `${fid.manufacturer || 'x'}-${fid.serialNumber || 'x'}-${+(fid.timeCreated || start)}`,
    summary: {
      lthr: tz?.thresholdHeartRate ?? null, maxHr: tz?.maxHeartRate ?? null, ftp: tz?.functionalThresholdPower ?? null,
      weight: up.weight ?? null, te: S[S.length - 1].totalTrainingEffect ?? null, ate: S[S.length - 1].totalAnaerobicTrainingEffect ?? null,
    },
  };

  // best efforts
  const bests = [];
  const add = (sport, effort, value, unit, startOff, measured = true) => bests.push({ sport, effort, value: r(value, 2), unit, start_offset_s: startOff == null ? null : r(startOff, 1), measured, achieved_at: activity.start_time });
  sections.forEach((s, i) => {
    const sr = recs.filter(x => x.t >= s.start_offset_s && x.t <= s.start_offset_s + s.elapsed_s && x.dist != null);
    if (s.sport === 'run') RUN_DISTANCES.forEach(([n, d]) => { if (s.distance_m >= d) { const b = bestOverDistance(sr, d); if (b) add('run', n, b.t, 's', b.start); } });
    if (s.sport === 'bike') {
      BIKE_DISTANCES.forEach(([n, d]) => { if (s.distance_m >= d) { const b = bestOverDistance(sr, d); if (b) add('bike', n, b.t, 's', b.start); } });
      const pr = recs.filter(x => x.t >= s.start_offset_s && x.t <= s.start_offset_s + s.elapsed_s);
      if (pr.some(x => x.power > 0)) Object.entries(bestPower(pr, POWER_DURATIONS)).forEach(([n, v]) => add('bike', n, v.w, 'W', v.start));
    }
    if (s.sport === 'swim' && sr.length > 1) SWIM_DISTANCES.forEach(([n, d]) => { if (s.distance_m >= d) { const b = bestOverDistance(sr, d); if (b) add('swim', n, b.t, 's', b.start); } });
  });
  // keep the best of each effort across sections (e.g. run 1 vs run 2 of a duathlon)
  const keep = new Map();
  for (const b of bests) { const k = b.effort + '|' + b.sport; const cur = keep.get(k); if (!cur || (b.unit === 'W' ? b.value > cur.value : b.value < cur.value)) keep.set(k, b); }
  const bikeDist = sections.filter(s => s.sport === 'bike').reduce((a, s) => a + (s.distance_m || 0), 0);
  const bikeGain = sections.filter(s => s.sport === 'bike').reduce((a, s) => a + (s.ascent_m || 0), 0);
  const out = [...keep.values()];
  if (bikeDist > 0) out.push({ sport: 'bike', effort: 'longest ride', value: r(bikeDist, 1), unit: 'm', start_offset_s: null, measured: true, achieved_at: activity.start_time });
  if (bikeGain > 0) out.push({ sport: 'bike', effort: 'most elevation', value: bikeGain, unit: 'm', start_offset_s: null, measured: true, achieved_at: activity.start_time });
  // run and bike efforts share names like '100 km'; make the stored effort key unique per sport
  out.forEach(b => { if (b.sport === 'bike' && b.effort === '100 km') b.effort = '100 km ride'; });

  return { activity, sections, laps, streams, bests: out };
}

// copy of the streams with fields the owner chose not to share removed
export function shareStreams(streams, share) {
  const s = { ...streams };
  const drop = f => { s[f] = s[f] ? s[f].map(() => null) : s[f]; };
  if (!share.map) { drop('lat'); drop('lon'); }
  if (!share.hr) drop('hr');
  if (!share.power) drop('power');
  if (!share.pace) drop('speed');
  if (!share.cadence) drop('cad');
  if (!share.dynamics) { drop('gct'); drop('gctBal'); drop('vo'); drop('stride'); }
  return s;
}

// columnar -> row objects (the activity view works with rows)
export function rows(streams) {
  const n = streams.t.length, out = new Array(n);
  for (let i = 0; i < n; i++) { const o = {}; for (const f of streams.fields) o[f] = streams[f][i]; out[i] = o; }
  return out;
}
