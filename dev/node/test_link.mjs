import { Decoder, Stream } from '@garmin/fitsdk';
import fs from 'fs';
import { processFit } from '../../js/process.js';
import { mergeMessages } from '../../js/pipeline.js';
const buf=fs.readFileSync(process.argv[2]);
const {messages:m}=new Decoder(Stream.fromByteArray(buf)).read({convertDateTimesToDates:true,expandComponents:true,mergeHeartRates:true,applyScaleAndOffset:true,expandSubFields:true,convertTypesToStrings:true});
const orig=processFit(m);
// split into one file per non-transition session, distances restarting at 0 (as separate watch files would)
const parts=m.sessionMesgs.filter(s=>s.sport!=='transition').map(s=>{
  const t0=+s.startTime,t1=t0+s.totalElapsedTime*1000;
  const recs=m.recordMesgs.filter(r=>+r.timestamp>=t0&&+r.timestamp<=t1); const d0=recs.find(r=>r.distance!=null)?.distance||0;
  return {messages:{...m,sessionMesgs:[s],lapMesgs:m.lapMesgs.filter(l=>+l.startTime>=t0&&+l.startTime<t1),recordMesgs:recs.map(r=>r.distance!=null?{...r,distance:r.distance-d0}:r),
    activityMesgs:[{...m.activityMesgs[0],timestamp:new Date(t1),totalTimerTime:s.totalTimerTime}]}};
});
console.log('parts',parts.length, parts.map(p=>processFit(p.messages).activity.name).join(' | '));
const merged=mergeMessages(parts.reverse());
const out=processFit(merged,{sourceId:'linked:x'});
const f=o=>o.sections.map(s=>`${s.sport} ${(s.distance_m/1000).toFixed(2)}km ${Math.round(s.elapsed_s)}s`).join(' / ');
console.log('orig  ',orig.activity.name,orig.activity.multisport_profile,'|',f(orig),'| total',orig.activity.distance_m,orig.activity.elapsed_s);
console.log('linked',out.activity.name,out.activity.multisport_profile,out.activity.source_id,'|',f(out),'| total',out.activity.distance_m,out.activity.elapsed_s,'laps',out.laps.length,'vs',orig.laps.length,'bests',out.bests.length);
