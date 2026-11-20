import { Decoder, Encoder, Stream, Profile } from '@garmin/fitsdk';
import fs from 'fs';
const buf=fs.readFileSync(process.argv[2]);
const {messages:m}=new Decoder(Stream.fromByteArray(buf)).read({convertDateTimesToDates:true,expandComponents:false,mergeHeartRates:false,applyScaleAndOffset:true,expandSubFields:false,convertTypesToStrings:true});
const M=Profile.MesgNum;
const clean=(num,o)=>{const f=Profile.messages[num].fields,names=new Set(Object.values(f).map(x=>x.name));const out={};for(const[k,v]of Object.entries(o)){if(!names.has(k)||v==null)continue;const fd=Object.values(f).find(x=>x.name===k);if(Array.isArray(v)&&!fd.array)continue;out[k]=v}return out};
const E=(e,num,o)=>{try{e.onMesg(num,clean(num,o))}catch(err){console.error('bad',num,Object.keys(o).join(','));throw err}};
m.sessionMesgs.filter(s=>s.sport!=='transition').forEach((s,i)=>{
  const t0=+s.startTime,t1=t0+s.totalElapsedTime*1000,inR=x=>+x.timestamp>=t0&&+x.timestamp<=t1;
  const e=new Encoder();
  E(e,M.FILE_ID,{...m.fileIdMesgs[0],timeCreated:new Date(t0)});
  const recs=m.recordMesgs.filter(inR),d0=recs.find(r=>r.distance!=null)?.distance||0;
  E(e,M.EVENT,{timestamp:new Date(t0),event:'timer',eventType:'start'});
  recs.forEach(r=>{const {developerFields,...x}=r; if(x.distance!=null)x.distance-=d0; E(e,M.RECORD,x)});
  m.lapMesgs.filter(l=>+l.startTime>=t0&&+l.startTime<t1).forEach(l=>{const {developerFields,...x}=l;E(e,M.LAP,x)});
  const {developerFields,...ss}=s; E(e,M.SESSION,{...ss,messageIndex:0,firstLapIndex:0});
  E(e,M.ACTIVITY,{...m.activityMesgs[0],timestamp:new Date(t1),numSessions:1,totalTimerTime:s.totalTimerTime,localTimestamp:Math.round(m.activityMesgs[0].localTimestamp - (+m.activityMesgs[0].timestamp - t1)/1000)});
  fs.writeFileSync(`/tmp/part${i}.fit`,e.close());
});
for(let i=0;i<3;i++){const b=fs.readFileSync(`/tmp/part${i}.fit`);const r=new Decoder(Stream.fromByteArray(b)).read({convertDateTimesToDates:true});console.log(i,b.length,r.errors.length,r.messages.sessionMesgs?.[0]?.sport,r.messages.recordMesgs?.length,r.messages.sessionMesgs?.[0]?.totalDistance)}
