import { Decoder, Stream } from '@garmin/fitsdk';
import fs from 'fs';
import { processFit, rows } from '../../js/process.js';
import { vo2FromActivity, vdot, vdotFromBests, vo2Band } from '../../js/vo2.js';
const dec=new Decoder(Stream.fromByteArray(fs.readFileSync(process.argv[2])));
const {messages}=dec.read({convertDateTimesToDates:true,expandComponents:true,mergeHeartRates:true,applyScaleAndOffset:true,expandSubFields:true,convertTypesToStrings:true});
const o=processFit(messages);
const map={run:'running',bike:'cycling',transition:'transition'};
const S=o.sections.map(s=>({sport:map[s.sport],start:s.start_offset_s,elapsed:s.elapsed_s}));
const R=rows(o.streams);
// estimated bike power (same model as the activity page, CdA 0.27)
const m=78.4+9;
R.forEach(r=>{ if(r.speed!=null){ const v=r.speed; r.estP=(m*9.81*v*0.004+0.5*1.19*0.27*v**3)/0.975; }});
for (const rest of [45,50,55]) {
  const v=vo2FromActivity(S,R,{maxHr:175,restHr:rest,mass:78.4},'estP',true);
  console.log('rest',rest,'run',v.run&&v.run.value.toFixed(1),v.run&&[v.run.low.toFixed(1),v.run.high.toFixed(1),v.run.windows],'bike',v.bike&&v.bike.value.toFixed(1),v.bike&&v.bike.windows);
}
console.log('VDOT 5k 22:16',vdot(5000,22*60+16).toFixed(1),'HM 1:59',vdot(21097.5,119*60).toFixed(1),'10k 50:00',vdot(10000,3000).toFixed(1),'Mara 4:18',vdot(42195,258*60).toFixed(1),'5k 28:24',vdot(5000,1704).toFixed(1));
console.log('duathlon mile', vdotFromBests(o.bests));
console.log(vo2Band(44,52));
