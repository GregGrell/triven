// Training log: period totals, fitness, volume chart, calendar, bests, gear.
import * as U from './units.js?v=1795207239';
const $=id=>document.getElementById(id), css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
let bound=false;
export function mountLog(D){
const A=D.activities.map(a=>({...a,t:Date.parse(a.start+'Z')})).sort((x,y)=>x.t-y.t);
const DAY=864e5, _n=new Date(), TODAY=Date.UTC(_n.getFullYear(),_n.getMonth(),_n.getDate());
const SP={run:{name:'Run',v:'--run'},bike:{name:'Bike',v:'--bike'},swim:{name:'Swim',v:'--swim'}};
const fmtDur=s=>{s=Math.round(s);const h=Math.floor(s/3600),m=Math.floor(s%3600/60),x=s%60;return h?`${h}:${String(m).padStart(2,'0')}:${String(x).padStart(2,'0')}`:`${m}:${String(x).padStart(2,'0')}`};
const fmtHM=s=>{const h=Math.floor(s/3600),m=Math.round(s%3600/60);return h?`${h}h ${String(m).padStart(2,'0')}m`:`${m}m`};
const km=m=>U.toD(m).toFixed(U.toD(m)>=100?0:1);   // km or miles
const pace=(sec,m)=>U.pace(sec,m);
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],WD=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const d0=t=>{const d=new Date(t);return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate())};
const mondayOf=t=>{const d=new Date(d0(t));return d0(t)-((d.getUTCDay()+6)%7)*DAY};
const fmtDate=t=>{const d=new Date(t);return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`};
const gearName=id=>{const g=D.gear.find(g=>g.id===id);return g?(g.name||g.model):null};
// split an activity into per-sport parts (multisport counted by section)
function parts(a){ if(a.sport!=='multi') return [{sport:a.sport,dist:a.dist,time:a.moving,elev:a.elev||0}];
  return a.sections.filter(s=>s.sport!=='trans').map(s=>({sport:s.sport,dist:s.dist,time:s.elapsed,elev:s.elev||0})); }
const actTime=a=>a.sport==='multi'?a.elapsed:a.moving;

// ---------- period state ----------
let P={type:'month',anchor:TODAY,from:TODAY-27*DAY,to:TODAY};
function range(){
  const d=new Date(P.anchor);
  if(P.type==='week'){const s=mondayOf(P.anchor);return [s,s+7*DAY]}
  if(P.type==='month'){const s=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1);return [s,Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1)]}
  if(P.type==='year'){return [Date.UTC(d.getUTCFullYear(),0,1),Date.UTC(d.getUTCFullYear()+1,0,1)]}
  return [d0(P.from),d0(P.to)+DAY];
}
function label(){const [s,e]=range();const d=new Date(s);
  if(P.type==='week') return `${fmtDate(s)} – ${fmtDate(e-DAY)}`;
  if(P.type==='month') return `${['January','February','March','April','May','June','July','August','September','October','November','December'][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  if(P.type==='year') return String(d.getUTCFullYear());
  return `${fmtDate(s)} – ${fmtDate(e-DAY)}`;}
function shift(n){const d=new Date(P.anchor);
  if(P.type==='week')P.anchor+=n*7*DAY; else if(P.type==='month')P.anchor=Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+n,1); else if(P.type==='year')P.anchor=Date.UTC(d.getUTCFullYear()+n,0,1);
  renderTotals();}
document.querySelectorAll('.seg-btns .chip').forEach(b=>b.onclick=()=>{P.type=b.dataset.p;if(P.type!=='custom')P.anchor=TODAY;renderTotals()});
$('pPrev').onclick=()=>shift(-1);$('pNext').onclick=()=>shift(1);
const iso=t=>new Date(t).toISOString().slice(0,10);
$('cFrom').onchange=$('cTo').onchange=()=>{const f=Date.parse($('cFrom').value+'T00:00:00Z'),t=Date.parse($('cTo').value+'T00:00:00Z');if(f&&t&&f<=t){P.from=f;P.to=t;renderTotals()}};

function renderTotals(){
  document.querySelectorAll('.seg-btns .chip').forEach(b=>b.setAttribute('aria-pressed',b.dataset.p===P.type));
  $('pCustom').hidden=P.type!=='custom';$('pPrev').hidden=$('pNext').hidden=P.type==='custom';
  if(P.type==='custom'){$('cFrom').value=iso(P.from);$('cTo').value=iso(P.to)}
  $('pLabel').textContent=label();
  const [s,e]=range(), inR=A.filter(a=>a.t>=s&&a.t<e);
  const T={all:{n:0,dist:0,time:0,elev:0,multi:0}};Object.keys(SP).forEach(k=>T[k]={n:0,dist:0,time:0,elev:0});
  inR.forEach(a=>{T.all.n++;T.all.time+=actTime(a);if(a.sport==='multi')T.all.multi++;
    const seen=new Set();parts(a).forEach(p=>{const t=T[p.sport];t.dist+=p.dist;t.time+=p.time;t.elev+=p.elev;T.all.dist+=p.dist;T.all.elev+=p.elev;if(!seen.has(p.sport)){t.n++;seen.add(p.sport)}})});
  const el=$('totals');el.replaceChildren();
  const card=(title,col,t,sub)=>{const c=document.createElement('div');c.className='tot';
    const h=document.createElement('div');h.className='h';if(col){const i=document.createElement('i');i.style.background=`var(${col})`;h.append(i)}h.append(document.createTextNode(title));
    const d=document.createElement('div');d.className='d';d.textContent=t.dist?km(t.dist):'0';const u=document.createElement('small');u.textContent=U.dU();d.append(u);
    const s2=document.createElement('div');s2.className='s';s2.textContent=sub;c.append(h,d,s2);el.append(c)};
  card('All sports',null,T.all,`${T.all.n} ${T.all.n===1?'activity':'activities'}${T.all.multi?` (${T.all.multi} multisport)`:''} · ${fmtHM(T.all.time)} · ${U.elev(T.all.elev)}`);
  Object.entries(SP).forEach(([k,v])=>{const t=T[k];card(v.name,v.v,t,t.n?`${t.n} · ${fmtHM(t.time)} · ${U.elev(t.elev)}${k==='run'&&t.dist?` · ${pace(t.time,t.dist)}`:''}${k==='bike'&&t.dist?` · ${U.speed(t.time,t.dist)}`:''}`:'No activities')});
  $('totNote').textContent=(P.type==='month'||P.type==='custom'?'Weeks that run into the previous or next month only count the days inside this period. ':'')+(T.all.multi?'Multisport races count once as an activity, and each section is added to its own sport: the run legs go into Run and the ride into Bike. Transition time counts towards All sports only.':'Multisport races count once as an activity, and each section is added to its own sport.');
  renderVolume(s,e);
}

// ---------- volume chart ----------
function buckets(s,e){
  const out=[];
  if(P.type==='week'){for(let t=s;t<e;t+=DAY)out.push([t,t+DAY,WD[(new Date(t).getUTCDay()+6)%7]]);return ['Daily distance',out]}
  const days=(e-s)/DAY;
  // custom periods: days up to a month, weeks up to four months, months up to three years, then years
  if(P.type==='custom'&&days<=31){for(let t=s;t<e;t+=DAY){const d=new Date(t);out.push([t,t+DAY,`${d.getUTCDate()} ${MON[d.getUTCMonth()]}`])}return ['Daily distance',out]}
  if(P.type==='custom'&&days>3*366){let y=new Date(s).getUTCFullYear();for(let t=Date.UTC(y,0,1);t<e;t=Date.UTC(++y,0,1))out.push([t,Date.UTC(y+1,0,1),String(y)]);return ['Yearly distance',out]}
  if(P.type==='year'||days>120){let d=new Date(s);let t=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1);while(t<e){const n=new Date(t);const t2=Date.UTC(n.getUTCFullYear(),n.getUTCMonth()+1,1);out.push([t,t2,MON[n.getUTCMonth()]+(P.type==='custom'&&new Date(s).getUTCFullYear()!==new Date(e-DAY).getUTCFullYear()?` ${String(n.getUTCFullYear()).slice(2)}`:'')]);t=t2}return ['Monthly distance',out]}
  for(let t=mondayOf(s);t<e;t+=7*DAY){const d=new Date(t);out.push([t,t+7*DAY,`${d.getUTCDate()} ${MON[d.getUTCMonth()]}`])} return ['Weekly distance (weeks start Monday)',out];
}
function renderVolume(s,e){
  const [title,B]=buckets(s,e);$('volTitle').textContent=title;
  const keys=Object.keys(SP);
  const data=B.map(([a,b,l])=>{const o={l,a,b};keys.forEach(k=>o[k]=0);A.filter(x=>x.t>=Math.max(a,s)&&x.t<Math.min(b,e)).forEach(x=>parts(x).forEach(p=>o[p.sport]+=U.toD(p.dist)));return o});
  const used=keys.filter(k=>data.some(d=>d[k]>0));
  const lg=$('volLegend');lg.replaceChildren();used.forEach(k=>{const s2=document.createElement('span');const i=document.createElement('i');i.style.background=`var(${SP[k].v})`;i.style.height='10px';i.style.width='10px';s2.append(i,document.createTextNode(SP[k].name));lg.append(s2)});
  const host=$('volchart');host.replaceChildren();host.style.position='relative';
  const W=Math.max(320,host.clientWidth||900),H=170,m={l:46,r:6,t:14,b:22};
  const x=d3.scaleBand().domain(data.map((d,i)=>i)).range([m.l,W-m.r]).paddingInner(.25).paddingOuter(.1);
  const max=d3.max(data,d=>keys.reduce((s,k)=>s+d[k],0))||1;
  const y=d3.scaleLinear().domain([0,max]).nice(4).range([H-m.b,m.t]);
  const svg=d3.select(host).append('svg').attr('viewBox',`0 0 ${W} ${H}`).attr('height',H);
  svg.append('g').attr('class','gridl').attr('transform',`translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(W-m.l-m.r)).tickFormat(''));
  svg.append('g').attr('class','axis').attr('transform',`translate(${m.l-4},0)`).call(d3.axisLeft(y).ticks(4).tickSize(0).tickFormat(v=>v+' '+U.dU()));
  const every=Math.ceil(data.length/14);
  svg.append('g').attr('class','axis').attr('transform',`translate(0,${H-m.b+12})`).selectAll('text').data(data).join('text').attr('x',(d,i)=>x(i)+x.bandwidth()/2).attr('text-anchor','middle').text((d,i)=>i%every===0?d.l:'');
  const tip=document.createElement('div');tip.className='vtip';tip.hidden=true;host.append(tip);
  data.forEach((d,i)=>{let acc=0;const g=svg.append('g');
    used.forEach((k,j)=>{if(!d[k])return;const y0=y(acc),y1=y(acc+d[k]);acc+=d[k];
      g.append('rect').attr('x',x(i)).attr('width',x.bandwidth()).attr('y',y1+(acc>d[k]?1:0)).attr('height',Math.max(1,y0-y1-(acc>d[k]?2:0))).attr('rx',3).attr('fill',css(SP[k].v));});
    g.append('rect').attr('x',x(i)-x.step()*x.paddingInner()/2).attr('width',x.step()).attr('y',m.t).attr('height',H-m.t-m.b).attr('fill','transparent')
     .on('pointerenter',e=>{tip.replaceChildren();const b=document.createElement('b');b.textContent=d.l;tip.append(b);
        used.forEach(k=>{const r=document.createElement('div');r.textContent=`${SP[k].name}: ${d[k].toFixed(1)} ${U.dU()}`;tip.append(r)});
        if(!used.length||!used.some(k=>d[k])){const r=document.createElement('div');r.textContent='No activities';tip.append(r)}
        tip.hidden=false;const bx=host.getBoundingClientRect();tip.style.left=Math.min(bx.width-140,(x(i)/W)*bx.width)+'px';tip.style.top='0px';})
     .on('pointerleave',()=>tip.hidden=true);
    const tot=used.reduce((s2,k)=>s2+d[k],0);
    if(tot>0&&data.length<=14) svg.append('text').attr('x',x(i)+x.bandwidth()/2).attr('y',y(tot)-4).attr('text-anchor','middle').attr('font-size',10).attr('fill',css('--text-secondary')).text(tot.toFixed(1));
  });
}

// (the calendar now lives on the Calendar tab: cal.js)
function showPop(a,anchor){
  const p=$('actpop');p.replaceChildren();
  const h=document.createElement('h4');h.textContent=a.name;const sub=document.createElement('div');sub.className='muted';
  const dt=new Date(a.t);sub.textContent=`${fmtDate(a.t)} · ${String(dt.getUTCHours()).padStart(2,'0')}:${String(dt.getUTCMinutes()).padStart(2,'0')}${a.indoor?' · treadmill':''}`;
  const kv=document.createElement('div');kv.className='kv';
  const add=(k,v)=>{const x=document.createElement('span');x.className='sec';x.textContent=k;const y=document.createElement('b');y.textContent=v;kv.append(x,y)};
  add('Distance',km(a.dist)+' '+U.dU());add(a.sport==='multi'?'Total time':'Moving time',fmtDur(actTime(a)));
  if(a.sport==='run') add('Pace',pace(a.moving,a.dist));
  if(a.sport==='multi') a.sections.forEach((s,i)=>add(s.sport==='trans'?'Transition':SP[s.sport].name,`${s.sport==='trans'?'':km(s.dist)+' '+U.dU()+' · '}${fmtDur(s.elapsed)}`));
  add('Elevation',U.elev(a.elev||0));if(a.gear) add('Shoes',gearName(a.gear)||'—');add('Source',a.source);
  p.append(h,sub,kv);
  const act=document.createElement('div');act.style.marginTop='12px';act.style.display='flex';act.style.gap='8px';
  if(a.detail){const l=document.createElement('a');l.href='#a/'+a.id;l.className='btn primary';l.textContent='Open activity';l.style.textDecoration='none';act.append(l)}
  else{const l=document.createElement('a');l.href=`https://www.strava.com/activities/${a.id}`;l.className='btn';l.textContent='View on Strava';l.style.textDecoration='none';l.target='_blank';l.rel='noopener';act.append(l);
    const n=document.createElement('div');n.className='note';n.style.margin='0';n.textContent='Full charts appear once the original file is imported.';p.append(act,n);}
  if(a.detail) p.append(act);
  const r=anchor.getBoundingClientRect();p.hidden=false;
  p.style.left=(Math.min(window.innerWidth-316,Math.max(8,r.left))+window.scrollX)+'px';p.style.top=(r.bottom+6+window.scrollY)+'px';
}



// ---------- bests ----------
const SWIM_PB=[['100 m',100,'100 m'],['200 m',200,'200 m'],['400 m',400,'400 m'],['750 m',750,'750 m (sprint tri)'],['800 m',800,'800 m'],['1500 m',1500,'1500 m (Olympic tri)'],['1900 m',1900,'1.9 km (70.3)'],['3800 m',3800,'3.8 km (Ironman)']];
const RUN_PB=[['400 m',400],['1 km',1000],['1 mile',1609.34],['5 km',5000],['10 km',10000],['15 km',15000],['10 mile',16093.4],['Half marathon',21097.5],['30 km',30000],['Marathon',42195],['50 km',50000],['50 mile',80467.2],['100 km',100000],['100 mile',160934.4]];
const BIKE_PB=[['10 mile TT',16093.4],['25 mile TT',40233.6],['50 mile TT',80467.2],['100 km ride',100000,'100 km'],['100 mile TT',160934.4]];
const PWR=[['power 1 s','1 s'],['power 5 s','5 s'],['power 10 s','10 s'],['power 30 s','30 s'],['power 1 min','1 min'],['power 5 min','5 min'],['power 10 min','10 min'],['power 20 min','20 min'],['power 30 min','30 min'],['power 1 hour','1 hour']];
const bestOf=(sport,effort,hi)=>{const l=(D.bests||[]).filter(b=>b.sport===sport&&b.effort===effort);if(!l.length)return null;return l.sort((x,y)=>hi?y.value-x.value:x.value-y.value)[0]};
const actLink=(b)=>{const l=document.createElement('a');l.href='#a/'+b.activity_id;l.textContent=fmtDate(Date.parse(b.achieved_at));return l};
const actName=b=>{const x=A.find(a=>a.id===b.activity_id);return x?x.name:''};
function pbRow(t,name,b,cell2){
  const tr=t.insertRow();tr.insertCell().textContent=name;const v=tr.insertCell();v.className='v';
  if(!b){tr.className='none';v.textContent='—';const c=tr.insertCell();c.colSpan=3;c.textContent=cell2||'Not set yet';return}
  return [tr,v];
}
function renderBests(){
  const hdr=(t,cols)=>{const r=t.insertRow();cols.forEach(c=>{const th=document.createElement('th');th.textContent=c;r.append(th)})};
  const r=$('pbRun');r.replaceChildren();hdr(r,['Distance','Time','Pace','Date','Activity']);
  RUN_PB.forEach(([n,m])=>{const b=bestOf('run',n);const x=pbRow(r,n,b);if(!x)return;x[1].textContent=fmtDur(b.value);x[0].insertCell().textContent=pace(b.value,m);x[0].insertCell().append(actLink(b));const c=x[0].insertCell();c.className='muted';c.textContent=actName(b)});
  $('pbRunNote').textContent='Worked out by Triven from every imported run, using the fastest stretch of any run, including the run legs of multisport races.';
  const bk=$('pbBike');bk.replaceChildren();hdr(bk,['Distance','Time','Speed','Date','Activity']);
  BIKE_PB.forEach(([n,m,label])=>{const b=bestOf('bike',n);const x=pbRow(bk,label||n,b);if(!x)return;x[1].textContent=fmtDur(b.value);x[0].insertCell().textContent=U.speed(b.value,m);x[0].insertCell().append(actLink(b));const c=x[0].insertCell();c.className='muted';c.textContent=actName(b)});
  [['longest ride','Longest ride',v=>U.dist(v,1)],['most elevation','Most elevation gain',v=>U.elev(v)]].forEach(([e,label,f])=>{const b=bestOf('bike',e,true);const x=pbRow(bk,label,b);if(!x)return;x[1].textContent=f(b.value);x[0].insertCell();x[0].insertCell().append(actLink(b));const c=x[0].insertCell();c.className='muted';c.textContent=actName(b)});
  const sw=$('pbSwim');sw.replaceChildren();hdr(sw,['Distance','Time','Pace /100 m','Date','Activity']);
  SWIM_PB.forEach(([n,m,label])=>{const b=bestOf('swim',n);const x=pbRow(sw,label,b);if(!x)return;x[1].textContent=fmtDur(b.value);x[0].insertCell().textContent=fmtDur(b.value/m*100);x[0].insertCell().append(actLink(b));const c=x[0].insertCell();c.className='muted';c.textContent=actName(b)});
  const p=$('pbPower');p.replaceChildren();hdr(p,['Duration','Power','W/kg','Date','Activity']);
  PWR.forEach(([e,label])=>{const b=bestOf('bike',e,true);const x=pbRow(p,label,b,'Needs a ride with a power meter');if(!x)return;x[1].textContent=Math.round(b.value)+' W';x[0].insertCell().textContent=D.mass?(b.value/D.mass).toFixed(2):'—';x[0].insertCell().append(actLink(b));const c=x[0].insertCell();c.className='muted';c.textContent=actName(b)});
}

// ---------- gear (summary on the log; full management on the Gear tab) ----------
function renderGear(){
  const el=$('gear');el.replaceChildren();
  const list=(D.gear||[]).filter(g=>!g.retired);
  if(!list.length){el.append(Object.assign(document.createElement('div'),{className:'note',textContent:'No gear yet. Add shoes and bikes on the Gear tab, then assign them to activities.'}));$('gearNote').textContent='';return}
  list.forEach(g=>{
    const LIMIT=g.replace_km||(g.kind==='bike'?null:700);
    const m=g.used_m+(g.start_km||0)*1000;
    const row=document.createElement('div');row.className='gearrow';
    const n=document.createElement('div');const b=document.createElement('b');b.textContent=g.name;const s=document.createElement('div');s.className='muted';s.textContent=[g.kind==='bike'?'Bike':'Shoes',[g.brand,g.model].filter(Boolean).join(' '),`${g.uses} ${g.uses===1?'activity':'activities'}`].filter(Boolean).join(' · ');n.append(b,s);
    const bar=document.createElement('div');bar.className='bar';
    if(LIMIT){const f=document.createElement('div');f.style.width=Math.min(100,m/1000/LIMIT*100)+'%';if(m/1000>=LIMIT)f.style.background='var(--warn)';bar.append(f)}
    const v=document.createElement('div');v.className='val';v.textContent=LIMIT?`${km(m)} of ${Math.round(U.toD(LIMIT*1000))} ${U.dU()}`:`${km(m)} ${U.dU()}`;
    row.append(n,bar,v);el.append(row);
  });
  $('gearNote').textContent='Distance includes any starting distance you entered plus every activity or multisport section the item is assigned to.';
}

window.__log={renderTotals};
renderTotals();renderBests();renderGear();
if(!bound){bound=true;let rt;window.addEventListener('resize',()=>{clearTimeout(rt);rt=setTimeout(()=>{if(!$('view-log').hidden)window.__log.renderTotals()},150)});
 document.addEventListener('click',e=>{const p=$('actpop');if(!p.hidden&&!p.contains(e.target))p.hidden=true});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')$('actpop').hidden=true});}
}