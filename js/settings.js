// Athlete settings sheet: heart-rate zones, running-balance flags, cycling model.
const $=id=>document.getElementById(id), ov=$('settings');
const ZNAMES=['Recovery','Aerobic','Tempo','Sub-threshold','Threshold','VO₂ max +'];
import { DEFAULTS } from './defaults.js?v=1795178358';
import { PHYS, PHYS_LABEL, PHYS_UNIT, applyChange, removeChange, todayKey } from './athlete.js?v=1795178358';
export { DEFAULTS };
const FIELDS=['lthrRun','lthrBike','maxHr','restHr','balLo','balHi','balMin','ftp','mass','bikeMass','cda','crr'];
let getCfg=()=>DEFAULTS, onApply=()=>{}, priv=null, draft=null;
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmtDay=k=>{const [y,m,d]=k.split('-');return `${+d} ${MON[+m-1]} ${y}`};
// dated history of threshold changes, each part removable (applied with the rest on Apply)
function paintHist(){const box=$('s_hist');box.replaceChildren();const h=(draft.history||[]);if(!h.length)return;
  const wrap=document.createElement('div');wrap.className='hist';
  h.slice().sort((a,b)=>(b.from||'').localeCompare(a.from||'')).forEach(e=>{const r=document.createElement('div');r.className='hrow';const t=document.createElement('b');t.textContent=e.from?'From '+fmtDay(e.from):'Before your first change';
    const v=document.createElement('span');v.textContent=PHYS.filter(f=>e[f]!==undefined).map(f=>`${PHYS_LABEL[f]} ${e[f]==null?'not set':e[f]+' '+PHYS_UNIT[f]}`).join(' · ');
    const x=document.createElement('button');x.type='button';x.className='linkbtn';x.textContent='Remove';x.style.color='var(--text-muted)';
    x.onclick=()=>{draft=removeChange(draft,e.from);PHYS.forEach(f=>{if($('s_'+f))$('s_'+f).value=draft[f]??''});preview();paintHist()};r.append(t,v,x);wrap.append(r)});
  const cap=document.createElement('div');cap.className='sec';cap.style.cssText='font-size:12px;font-weight:600;margin-top:12px';cap.textContent='Your changes';box.append(cap,wrap)}
function fillZoneTable(z,lr,lb){const t=$('ztable');t.replaceChildren();const h=t.insertRow();['Zone','From (% threshold HR)','Run bpm','Bike bpm'].forEach(x=>{const th=document.createElement('th');th.textContent=x;h.append(th)});
  ZNAMES.forEach((n,i)=>{const r=t.insertRow();r.insertCell().textContent=`Z${i+1} ${n}`;const c=r.insertCell();
    if(i===0)c.textContent='0';else{const inp=document.createElement('input');inp.type='number';inp.step='1';inp.value=z[i-1];inp.dataset.zi=i-1;inp.oninput=preview;c.append(inp)}
    const bpm=(L)=>i===0?`< ${Math.round(z[0]/100*L)}`:i===5?`≥ ${Math.round(z[4]/100*L)}`:`${Math.round(z[i-1]/100*L)}–${Math.round(z[i]/100*L)-1}`;
    r.insertCell().textContent=bpm(lr);r.insertCell().textContent=bpm(lb);});}
function readForm(){const o={};FIELDS.forEach(f=>{const v=$('s_'+f).value;o[f]=v===''?null:+v});o.zones=[...document.querySelectorAll('#ztable input')].map(i=>+i.value);return o}
function preview(){const o=readForm(),c=getCfg();fillZoneTable(o.zones,o.lthrRun||c.lthrRun,o.lthrBike||c.lthrBike);}
function fillPriv(){if(!priv)return;const p=priv.get()||{};$('p_name').value=p.display_name||'';$('p_defvis').value=p.default_visibility||'club';$('p_search').checked=p.searchable!==false;$('p_approve').checked=!!p.approve_followers;$('p_approveRow').hidden=!$('p_search').checked;$('p_audience').value=(p.searchable===false&&(p.feed_audience||'everyone')==='everyone')?'followers_clubs':(p.feed_audience||'everyone');audOpt()}
function audOpt(){const hid=!$('p_search').checked,o=$('p_audience').querySelector('option[value=everyone]');o.disabled=hid;if(hid&&$('p_audience').value==='everyone')$('p_audience').value='followers_clubs'}
function openSheet(cfg){draft={...cfg};$('s_from').value=todayKey();$('s_from').max=todayKey();document.querySelector('input[name=s_when][value=date]').checked=true;paintHist();fillPriv();FIELDS.forEach(f=>{$('s_'+f).value=cfg[f]??''});fillZoneTable(cfg.zones,cfg.lthrRun,cfg.lthrBike);const e=$('formerr');if(e)e.textContent='';ov.classList.add('open');$('s_lthrRun').focus()}
function alertBox(msg){let n=$('formerr');if(!n){n=document.createElement('div');n.id='formerr';n.className='note';n.style.color='var(--warn-ink)';document.querySelector('.sheet .actions').before(n)}n.textContent=msg}
export function initSettings(get,apply,privacy){
  getCfg=()=>Object.assign({},DEFAULTS,get()||{}); onApply=apply; priv=privacy||null;
  $('p_search').onchange=()=>{$('p_approveRow').hidden=!$('p_search').checked;audOpt()};
  ['s_lthrRun','s_lthrBike'].forEach(id=>$(id).addEventListener('input',preview));
  $('openSettings').onclick=()=>openSheet(getCfg());
  $('closeSettings').onclick=()=>ov.classList.remove('open');
  $('openSettings').addEventListener('click',()=>{$('setWelcome').hidden=true});
  ov.addEventListener('click',e=>{if(e.target===ov)ov.classList.remove('open')});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')ov.classList.remove('open')});
  $('resetSettings').onclick=()=>openSheet(DEFAULTS);
  $('saveSettings').onclick=()=>{const o=readForm();const z=o.zones;
    if(!(z.every((v,i)=>i===0||v>z[i-1]))){alertBox('Zone boundaries must increase from Z2 to Z6.');return}
    if(!(o.balLo<50&&o.balHi>50)){alertBox('Balance thresholds must sit either side of 50%.');return}
    const patch=Object.fromEntries(Object.entries(o).filter(([k,v])=>v!=null||k==='ftp'));
    const when=document.querySelector('input[name=s_when]:checked').value, from=when==='all'?null:($('s_from').value||todayKey());
    const cfg=Object.assign(applyChange(draft,patch,from),{massSet:true});
    if(priv){const p=priv.get()||{},n=$('p_name').value.trim();const upd={display_name:n||p.display_name,default_visibility:$('p_defvis').value,searchable:$('p_search').checked,approve_followers:$('p_search').checked&&$('p_approve').checked,feed_audience:$('p_audience').value,privacy_set:true};
      if(Object.keys(upd).some(k=>upd[k]!==p[k]))priv.save(upd);}
    ov.classList.remove('open');onApply(cfg);};
}

// first sign-in: settings with a welcome note at the top (saving marks the privacy choice as made)
export function openWelcome(){openSheet(getCfg());document.querySelector('input[name=s_when][value=all]').checked=true;$('setWelcome').hidden=false;$('p_name').focus();ov.scrollTop=0}
