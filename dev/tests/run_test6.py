import os
DEV=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT=os.path.join(DEV,'out');os.makedirs(OUT,exist_ok=True)
FIT=os.environ.get('TRIVEN_FIT',os.path.join(DEV,'fixtures','multisport.fit'))
import subprocess,time,json
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8779'],cwd=DEV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
FIT=FIT;U='http://localhost:8779/site/index.html'
try:
  with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page(viewport={'width':1240,'height':950})
    errs=[];pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)+' '+(e.stack or '')[:400]));pg.on('console',lambda m:errs.append('CONSOLE '+m.text) if m.type=='error' and 'Failed to load resource' not in m.text else None)
    pg.goto(U);pg.wait_for_timeout(1200)
    pg.goto(U+'#upload');pg.wait_for_timeout(300);pg.set_input_files('#fileIn',FIT);pg.wait_for_timeout(3500)
    print('perf on upload', json.dumps(pg.evaluate("__db.activities[0].summary.perf")))
    # a year of training with improving 5k/10k bests and some power rides
    pg.evaluate("""(()=>{const now=Date.now();for(let d=360;d>=1;d--){if(d%7===3)continue;const run=d%2===0, prog=(360-d)/360, hrv=run?(d%6===0?160:140):132, s=run?3000+(d%5)*300:5400;
      const id='syn'+d, t=new Date(now-d*864e5).toISOString();
      __db.activities.push({id,owner:'u1',name:(run?'Run ':'Ride ')+d,sport:run?'run':'bike',start_time:t,utc_offset_min:180,distance_m:run?s*3:s*8,elapsed_s:s,moving_s:s,ascent_m:20,visibility:'club',share:{},summary:{loadData:{v:1,t:{[run?'run':'bike']:s},hr:{[run?'run':'bike']:{[hrv]:s}},pw:[]},vo2:{run:run?44+prog*3:null,bike:null,v:2},perf:{v:1,[run?'run':'bike']:{hr:run?(d%6===0?163+prog*3:150):140,speed:3.6+prog*0.3,power:run?null:220+prog*30}}}});
      if(run&&d%12===0){__db.best_efforts.push({id:'b'+d,owner:'u1',activity_id:id,sport:'run',effort:'5 km',value:1500-prog*120,unit:'s',measured:true,achieved_at:t});}
      if(!run&&d%9===0){__db.best_efforts.push({id:'p'+d,owner:'u1',activity_id:id,sport:'bike',effort:'power 20 min',value:250+prog*30,unit:'W',measured:true,achieved_at:t});}
    }})()""")
    pg.evaluate("(async()=>{const v=document.querySelector('script[type=module]').src.split('v=')[1];const m=await import('./js/main.js?v='+v);await m.loadAll();})()");pg.wait_for_timeout(800)
    pg.goto(U+'#log');pg.wait_for_timeout(3500)
    print('suggestions:', [x.replace('\n',' ')[:140] for x in pg.locator('.suggest').all_inner_texts()])
    print('status:', pg.inner_text('.perfgrid .card >> nth=0')[:260].replace('\n',' | '))
    print('thresholds:', pg.inner_text('.perfgrid .card >> nth=1')[:420].replace('\n',' | '))
    print('preds:', pg.inner_text('.preds').replace('\n',' '))
    pg.locator('#logPerf').screenshot(path=os.path.join(OUT,'perf.png'))
    pg.click('.suggest >> nth=0 >> .btn.primary');pg.wait_for_timeout(1500)
    print('settings after use', json.dumps({k:pg.evaluate("__db.profiles[0].settings")[k] for k in ['lthrRun','lthrBike','ftp'] if k in pg.evaluate("__db.profiles[0].settings")}))
    print('ERRORS',errs)
finally: srv.terminate()
