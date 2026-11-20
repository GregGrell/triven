import { Decoder, Stream } from '@garmin/fitsdk';
import fs from 'fs';
import { processFit } from '/home/claude/triven/js/process.js';
const {messages:m}=new Decoder(Stream.fromByteArray(fs.readFileSync(process.argv[2]))).read({convertDateTimesToDates:true,expandComponents:true,mergeHeartRates:true,applyScaleAndOffset:true,expandSubFields:true,convertTypesToStrings:true});
console.log('lengths', m.lengthMesgs?.length, JSON.stringify(m.lengthMesgs?.[0]), 'session pool', m.sessionMesgs[0].poolLength, m.sessionMesgs[0].subSport);
const o=processFit(m);
console.log(o.activity.name, 'dist', o.activity.distance_m, 'moving', o.activity.moving_s, 'elapsed', o.activity.elapsed_s, 'laps', o.laps.length, 'env', o.sections[0].summary.env);
console.log('bests', JSON.stringify(o.bests));
console.log('streams.lengths', o.streams.lengths?.length, JSON.stringify(o.streams.lengths?.slice(0,2)));
