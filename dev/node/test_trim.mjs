import { Decoder, Stream } from '@garmin/fitsdk';
import fs from 'fs';
import { processFit, trimMessages, detectDriving, makeTrack } from '../../js/process.js';
const dec=new Decoder(Stream.fromByteArray(fs.readFileSync(process.argv[2])));
const {messages}=dec.read({convertDateTimesToDates:true,expandComponents:true,mergeHeartRates:true,applyScaleAndOffset:true,expandSubFields:true,convertTypesToStrings:true});
const o=processFit(messages);
console.log('track pts', makeTrack(o.streams,o.sections).length, 'driving', JSON.stringify(detectDriving(o.sections,o.streams)));
// simulate a car ride: last 300 s of run2 at 15 m/s
const m2=JSON.parse(JSON.stringify(messages),(k,v)=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT/.test(v)?new Date(v):v);
const recs=m2.recordMesgs; const lastT=+recs[recs.length-1].timestamp; let d=recs[recs.length-1].distance;
const S=m2.sessionMesgs; const sLast=S[S.length-1];
for(let i=1;i<=300;i++){d+=15;recs.push({...recs[recs.length-1],timestamp:new Date(lastT+i*1000),distance:d,enhancedSpeed:15,heartRate:95});}
sLast.totalElapsedTime+=300;
const o2=processFit(m2);
const drv=detectDriving(o2.sections,o2.streams);
console.log('with car: dist',(o2.activity.distance_m/1000).toFixed(2),'driving',JSON.stringify(drv));
const cut=drv[0].t0-5;
const t=processFit(trimMessages(m2,0,cut));
console.log('trimmed: dist',(t.activity.distance_m/1000).toFixed(2),'elapsed',t.activity.elapsed_s,'sections',t.sections.map(s=>[s.sport,s.elapsed_s,s.distance_m,s.avg_hr]).join(' | '));
console.log('orig   :',(o.activity.distance_m/1000).toFixed(2),o.activity.elapsed_s,o.sections.map(s=>[s.sport,s.elapsed_s,s.distance_m,s.avg_hr]).join(' | '));
console.log('bests same?', JSON.stringify(t.bests.map(b=>[b.effort,b.value]))===JSON.stringify(o.bests.map(b=>[b.effort,b.value])));
// trim the start by 60 s
const t3=processFit(trimMessages(messages,60,1e6));
console.log('start-trim: first section', t3.sections[0].elapsed_s, t3.sections[0].distance_m, 'start', t3.activity.start_time, 'vs', o.activity.start_time);
