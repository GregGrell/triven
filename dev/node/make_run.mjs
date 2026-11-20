// Writes a simple outdoor run .FIT for tests: 8 km at 5:00/km, 1 s records with GPS, altitude, HR and cadence, a lap per km.
import { Encoder, Profile } from '@garmin/fitsdk';
import fs from 'fs';
const M = Profile.MesgNum, t0 = Date.UTC(2026, 10, 12, 3, 0, 0), at = s => new Date(t0 + s * 1000);
const enc = new Encoder(), V = 1000 / 300, N = 2400, deg = 2 ** 31 / 180, RD = process.argv[3] === 'rd';   // rd: the watch records stride length (running dynamics)
enc.onMesg(M.FILE_ID, { type: 'activity', manufacturer: 'garmin', product: 4315, serialNumber: 7654321, timeCreated: at(0) });
const laps = [];
for (let s = 0; s <= N; s++) {
  const d = V * s, lat = 25.28 + d / 111320, lon = 51.52;
  enc.onMesg(M.RECORD, { timestamp: at(s), positionLat: Math.round(lat * deg), positionLong: Math.round(lon * deg), distance: d, enhancedSpeed: V,
    enhancedAltitude: 10 + 20 * Math.sin(s / 300), heartRate: 140 + Math.round(10 * Math.sin(s / 200)), cadence: 85, ...(RD ? { stepLength: 1200 } : {}) });
  if (s > 0 && s % 300 === 0) laps.push({ timestamp: at(s), startTime: at(s - 300), totalElapsedTime: 300, totalTimerTime: 300, totalDistance: 1000, enhancedAvgSpeed: V, avgHeartRate: 140, totalAscent: 13, sport: 'running' });
}
laps.forEach((l, i) => enc.onMesg(M.LAP, { ...l, messageIndex: i }));
enc.onMesg(M.SESSION, { timestamp: at(N), startTime: at(0), totalElapsedTime: N, totalTimerTime: N, totalDistance: V * N, sport: 'running', subSport: 'generic',
  enhancedAvgSpeed: V, avgHeartRate: 140, maxHeartRate: 150, totalAscent: 100, numLaps: laps.length, firstLapIndex: 0, messageIndex: 0 });
enc.onMesg(M.ACTIVITY, { timestamp: at(N), totalTimerTime: N, numSessions: 1, type: 'manual', event: 'activity', eventType: 'stop', localTimestamp: Math.round((t0 + N * 1000) / 1000) - 631065600 + 3 * 3600 });
fs.writeFileSync(process.argv[2] || 'fixtures/run.fit', enc.close());
console.log('wrote run', V * N, 'm');
