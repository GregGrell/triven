// Writes a realistic Garmin-style pool swim .FIT for tests: 25 m pool, warm-up, 8x100 with rests, drills, back cool-down.
// Rests are recorded as idle lengths and rest laps (as Garmin watches do). Usage: node node/make_pool_swim.mjs out.fit
import { Encoder, Profile } from '@garmin/fitsdk';
import fs from 'fs';
const M = Profile.MesgNum, POOL = 25, t0 = process.env.T0 ? Date.parse(process.env.T0) : Date.UTC(2026, 10, 10, 3, 0, 0);
const enc = new Encoder();
const at = s => new Date(t0 + s * 1000);
enc.onMesg(M.FILE_ID, { type: 'activity', manufacturer: 'garmin', product: 4315, serialNumber: 1234567, timeCreated: at(0) });
// plan: [stroke, lengths, secondsPerLength, strokesPerLength] for each interval, with rest after (s)
const plan = [['freestyle', 8, 26, 17, 30], ['freestyle', 4, 21, 15, 20], ['freestyle', 4, 21, 15, 20], ['breaststroke', 4, 27, 12, 20], ['freestyle', 4, 21, 16, 20],
  ['freestyle', 4, 22, 16, 20], ['freestyle', 4, 21, 15, 20], ['backstroke', 4, 25, 18, 20], ['freestyle', 4, 20, 15, 45], ['drill', 4, 35, 0, 30], ['backstroke', 8, 27, 19, 0]];
let s = 0, dist = 0, li = 0; const lengths = [], laps = [], recs = [];
for (const [stroke, n, spl, strokes, rest] of plan) {
  const lapStart = s, first = li, d0 = dist;
  for (let k = 0; k < n; k++) {
    const d = spl + ((k * 7) % 3) - 1;   // a little variation
    lengths.push({ timestamp: at(s + d), startTime: at(s), totalElapsedTime: d, totalTimerTime: d, messageIndex: li++, totalStrokes: strokes || undefined, swimStroke: stroke, lengthType: 'active', avgSwimmingCadence: strokes ? Math.round(strokes / d * 60) : undefined });
    for (let x = 1; x <= d; x++) recs.push({ timestamp: at(s + x), distance: dist + POOL * x / d, heartRate: 130 + Math.round(20 * Math.sin((s + x) / 200)) });
    s += d; dist += POOL;
  }
  laps.push({ timestamp: at(s), startTime: at(lapStart), totalElapsedTime: s - lapStart, totalTimerTime: s - lapStart, totalDistance: dist - d0, numActiveLengths: n, firstLengthIndex: first, numLengths: n, swimStroke: stroke, sport: 'swimming', subSport: 'lapSwimming', enhancedAvgSpeed: (dist - d0) / (s - lapStart) });
  if (rest) {
    lengths.push({ timestamp: at(s + rest), startTime: at(s), totalElapsedTime: rest, totalTimerTime: rest, messageIndex: li++, lengthType: 'idle' });
    for (let x = 1; x <= rest; x++) recs.push({ timestamp: at(s + x), distance: dist, heartRate: 115 });
    laps.push({ timestamp: at(s + rest), startTime: at(s), totalElapsedTime: rest, totalTimerTime: rest, totalDistance: 0, numActiveLengths: 0, firstLengthIndex: li - 1, numLengths: 1, sport: 'swimming', subSport: 'lapSwimming' });
    s += rest;
  }
}
recs.forEach(r => enc.onMesg(M.RECORD, r));
lengths.forEach(l => enc.onMesg(M.LENGTH, l));
laps.forEach((l, i) => enc.onMesg(M.LAP, { ...l, messageIndex: i }));
const active = lengths.filter(l => l.lengthType === 'active');
enc.onMesg(M.SESSION, { timestamp: at(s), startTime: at(0), totalElapsedTime: s, totalTimerTime: s, totalDistance: dist, sport: 'swimming', subSport: 'lapSwimming',
  poolLength: POOL, poolLengthUnit: 'metric', numActiveLengths: active.length, numLaps: laps.length, firstLapIndex: 0, avgHeartRate: 128, maxHeartRate: 152,
  enhancedAvgSpeed: dist / s, avgCadence: 34, avgSwolf: 39, totalCycles: active.reduce((p, l) => p + (l.totalStrokes || 0), 0), messageIndex: 0 });
enc.onMesg(M.ACTIVITY, { timestamp: at(s), totalTimerTime: s, numSessions: 1, type: 'manual', event: 'activity', eventType: 'stop', localTimestamp: Math.round((t0 + s * 1000) / 1000) - 631065600 + 3600 * +(process.env.TZH ?? 3) });
fs.writeFileSync(process.argv[2] || 'fixtures/pool_swim.fit', enc.close());
console.log('wrote', process.argv[2] || 'fixtures/pool_swim.fit', 'distance', dist, 'm, elapsed', s, 's, active lengths', active.length, 'swim time', active.reduce((p, l) => p + l.totalElapsedTime, 0), 's');
