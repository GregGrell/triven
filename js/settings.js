// Athlete settings sheet: heart-rate zones, running-balance flags, cycling model.
const $=id=>document.getElementById(id), ov=$('settings');
const ZNAMES=['Recovery','Aerobic','Tempo','Sub-threshold','Threshold','VO₂ max +'];
export const DEFAULTS={lthrRun:163,lthrBike:158,maxHr:175,restHr:50,age:null,zones:[85,90,95,100,103],balLo:48.5,balHi:51.5,balMin:10,ftp:null,mass:75,bikeMass:9,cda:0.27,crr:0.004};
const FIELDS=['lthrRun','lthrBike','maxHr','restHr','age','balLo','balHi','balMin','ftp','mass','bikeMass','cda','crr'];
let getCfg=()=>DEFAULTS, onApply=()=>{};
function fillZoneTable(z,lr,lb){const t=$('ztable');t.replaceChildren();const h=t.insertRow();['Zone','From (% threshold HR)','Run bpm','Bike bpm'].forEach(x=>{const th=document.createElement('th');th.textContent=x;h.append(th)});
  ZNAMES.forEach((n,i)=>{const r=t.insertRow();r.insertCell().textContent=`Z${i+1} ${n}`;const c=r.insertCell();
    if(i===0)c.textContent='0';else{const inp=document.createElement('input');inp.type='number';inp.step='1';inp.value=z[i-1];inp.dataset.zi=i-1;inp.oninput=preview;c.append(inp)}
    const bpm=(L)=>i===0?`< ${Math.round(z[0]/100*L)}`:i===5?`≥ ${Math.round(z[4]/100*L)}`:`${Math.round(z[i-1]/100*L)}–${Math.round(z[i]/100*L)-1}`;
    r.insertCell().textContent=bpm(lr);r.insertCell().textContent=bpm(lb);});}
function readForm(){const o={};FIELDS.forEach(f=>{const v=$('s_'+f).value;o[f]=v===''?null:+v});o.zones=[...document.querySelectorAll('#ztable input')].map(i=>+i.value);return o}
function preview(){const o=readForm(),c=getCfg();fillZoneTable(o.zones,o.lthrRun||c.lthrRun,o.lthrBike||c.lthrBike);}
function openSheet(cfg){FIELDS.forEach(f=>{$('s_'+f).value=cfg[f]??''});fillZoneTable(cfg.zones,cfg.lthrRun,cfg.lthrBike);const e=$('formerr');if(e)e.textContent='';ov.classList.add('open');$('s_lthrRun').focus()}
function alertBox(msg){let n=$('formerr');if(!n){n=document.createElement('div');n.id='formerr';n.className='note';n.style.color='var(--warn-ink)';document.querySelector('.sheet .actions').before(n)}n.textContent=msg}
export function initSettings(get,apply){
  getCfg=()=>Object.assign({},DEFAULTS,get()||{}); onApply=apply;
  ['s_lthrRun','s_lthrBike'].forEach(id=>$(id).addEventListener('input',preview));
  $('openSettings').onclick=()=>openSheet(getCfg());
  $('closeSettings').onclick=()=>ov.classList.remove('open');
  ov.addEventListener('click',e=>{if(e.target===ov)ov.classList.remove('open')});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')ov.classList.remove('open')});
  $('resetSettings').onclick=()=>openSheet(DEFAULTS);
  $('saveSettings').onclick=()=>{const o=readForm();const z=o.zones;
    if(!(z.every((v,i)=>i===0||v>z[i-1]))){alertBox('Zone boundaries must increase from Z2 to Z6.');return}
    if(!(o.balLo<50&&o.balHi>50)){alertBox('Balance thresholds must sit either side of 50%.');return}
    const cfg=Object.assign({},getCfg(),Object.fromEntries(Object.entries(o).filter(([k,v])=>v!=null||k==='ftp')));
    ov.classList.remove('open');onApply(cfg);};
}
