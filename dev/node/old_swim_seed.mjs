// Seed data for a pool swim imported before the 20 Nov 2026 swim fix (rest counted, record-based bests)
import { Decoder, Stream } from '@garmin/fitsdk';
import fs from 'fs';
import { processFit } from '../../js/process.js';
const {messages:m}=new Decoder(Stream.fromByteArray(fs.readFileSync(process.argv[2]))).read({convertDateTimesToDates:true,expandComponents:true,mergeHeartRates:true,applyScaleAndOffset:true,expandSubFields:true,convertTypesToStrings:true});
const o=processFit(m), id='old1', uid='u1';
const secs=o.sections.map((s,i)=>{const sm={...s.summary};['swimTime','rest','strokeRate','strokesPerLength','swimV'].forEach(k=>delete sm[k]);return {...s,id:'s'+i,activity_id:id,summary:sm}});
const act={...o.activity,id,owner:uid,moving_s:1510,file_path:uid+'/old1.fit',streams_path:uid+'/old1.json',visibility:'followers',share:{map:true,pace:true,hr:true},summary:{...o.activity.summary,track:null,loadData:{v:1,t:{swim:1510},hr:{},pw:[]},perf:null}};
const bests=[{id:'b1',owner:uid,activity_id:id,sport:'swim',effort:'400 m',value:408,unit:'s',achieved_at:act.start_time},{id:'b2',owner:uid,activity_id:id,sport:'swim',effort:'100 m',value:79,unit:'s',achieved_at:act.start_time}];
console.log(JSON.stringify({db:{profile:{privacy_set:true},activities:[act],activity_sections:secs,best_efforts:bests},files:{['activity-streams/'+uid+'/old1.full.json']:JSON.stringify(o.streams)}}));
