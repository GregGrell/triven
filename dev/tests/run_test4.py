import os
DEV=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT=os.path.join(DEV,'out');os.makedirs(OUT,exist_ok=True)
FIT=os.environ.get('TRIVEN_FIT',os.path.join(DEV,'fixtures','multisport.fit'))
import subprocess,time,json
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8776'],cwd=DEV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
FIT=FIT;U='http://localhost:8776/site/index.html'
try:
  with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page(viewport={'width':1240,'height':950},color_scheme='light')
    errs=[];pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)+' '+(e.stack or '')[:300]));pg.on('console',lambda m:errs.append('CONSOLE '+m.text) if m.type=='error' and 'Failed to load resource' not in m.text else None)
    pg.goto(U);pg.wait_for_timeout(1200)
    pg.goto(U+'#upload');pg.wait_for_timeout(300);pg.set_input_files('#fileIn',FIT);pg.wait_for_timeout(3500)
    print('loadData', json.dumps(pg.evaluate("__db.activities[0].summary.loadData"))[:300])
    aid=pg.evaluate("__db.activities[0].id")
    # synthetic history: 100 days, runs and rides with HR histograms
    pg.evaluate("""(()=>{const now=Date.now();for(let d=100;d>=1;d--){if(d%7===3)continue;const run=d%2===0, hrv=run?(d%6===0?158:140):132, s=run?3000+(d%5)*300:5400;
      __db.activities.push({id:'syn'+d,owner:'u1',name:(run?'Morning run ':'Ride ')+d,sport:run?'run':'bike',start_time:new Date(now-d*864e5).toISOString(),utc_offset_min:180,distance_m:run?s*3:s*8,elapsed_s:s,moving_s:s,ascent_m:20,visibility:'club',share:{},summary:{loadData:{v:1,t:{[run?'run':'bike']:s},hr:{[run?'run':'bike']:{[hrv]:s}},pw:[]},track:null}})}})()""")
    # a few swims and a brick week so the weekly split shows
    pg.evaluate("""(()=>{const now=Date.now();[3,10,17].forEach(d=>__db.activities.push({id:'sw'+d,owner:'u1',name:'Pool swim',sport:'swim',start_time:new Date(now-d*864e5-3*3600e3).toISOString(),utc_offset_min:180,distance_m:2000,elapsed_s:2700,moving_s:2400,ascent_m:0,visibility:'club',share:{},summary:{loadData:{v:1,t:{swim:2400},hr:{},pw:[]}}}))})()""")
    pg.evaluate("(async()=>{const v=document.querySelector('script[type=module]').src.split('v=')[1];const m=await import('./js/main.js?v='+v);await m.loadAll();})()");pg.wait_for_timeout(800)
    pg.goto(U+'#log');pg.wait_for_timeout(2500);print('early errs',errs)
    print('tiles:', pg.inner_text('.pmcstats').replace('\n',' | '))
    print('svg rects', pg.evaluate("document.querySelectorAll('.pmc rect').length"), 'cal days', pg.evaluate("document.querySelectorAll('.cal .day').length"), 'loads', pg.evaluate("[...document.querySelectorAll('.dload')].slice(0,5).map(x=>x.textContent).join(',')"))
    pg.mouse.move(700,420);pg.wait_for_timeout(300)
    pg.screenshot(path=os.path.join(OUT,'cal.png'),full_page=True)
    print('tip', pg.inner_text('.pmctip') if pg.is_visible('.pmctip') else 'hidden')
    # visibility one-click
    pg.goto(U+'#a/'+aid);pg.wait_for_timeout(2500)
    print('vis seg:', pg.inner_text('#actVis').replace('\n',' | '))
    pg.click('#actVis >> text=Followers');pg.wait_for_timeout(600)
    print('visibility now', pg.evaluate("__db.activities.find(a=>a.id==='"+aid+"').visibility"))
    pg.screenshot(path=os.path.join(OUT,'vis.png'))
    # people
    pg.evaluate("window.__search=[{id:'u7',athlete:'Sam Jones',approve_followers:false,follows_you:true}];window.__net=[{other:'u8',athlete:'Alex Smith',direction:'follower',status:'pending',since:'2026-11-18'},{other:'u9',athlete:'Jo Bloggs',direction:'follower',status:'accepted',since:'2026-11-10'}]")
    pg.goto(U+'#club');pg.wait_for_timeout(1500)
    pg.fill('.people input[type=search]','sam');pg.wait_for_timeout(900)
    print('search:', pg.inner_text('.people .plist >> nth=0').replace('\n',' | '))
    pg.click('.people .plist >> nth=0 >> text=Follow back');pg.wait_for_timeout(700)
    print('follows', json.dumps(pg.evaluate("__db.follows")))
    pg.screenshot(path=os.path.join(OUT,'people.png'),full_page=True)
    # privacy settings
    pg.click('#openSettings');pg.wait_for_timeout(400)
    pg.fill('#p_name','Carl G');pg.select_option('#p_defvis','followers');pg.check('#p_approve');pg.click('#saveSettings');pg.wait_for_timeout(800)
    print('profile', json.dumps({k:pg.evaluate("__db.profiles[0]")[k] for k in ['display_name','default_visibility','searchable','approve_followers']}))
    pg.goto(U+'#feed/following');pg.wait_for_timeout(1200);print('following chips', pg.inner_text('.segrow').replace('\n',' '))
    pg.goto(U+'#feed');pg.wait_for_timeout(2500)
    print('sidebar:', pg.inner_text('.feedside')[:200].replace('\n',' | '))
    pg.click('.feedside >> text=Set weekly goals');pg.wait_for_timeout(400)
    rows=pg.query_selector_all('#modalBody .goalrow input'); rows[1].fill('150'); rows[2].fill('40'); rows[3].fill('8')
    pg.click('#modalBody >> text=Save goals');pg.wait_for_timeout(800)
    print('goals', json.dumps(pg.evaluate("__db.profiles[0].settings.goals")))
    print('goal rows', pg.inner_text('.goals').replace('\n',' | '))
    pg.click('.wtab >> text=Run');pg.wait_for_timeout(300)
    pg.screenshot(path=os.path.join(OUT,'feed_side.png'))
    pg.goto(U+'#log/bests');pg.wait_for_timeout(1500)
    print('bests view: main hidden', pg.evaluate("document.getElementById('logMain').hidden"), 'bests shown', pg.is_visible('#pbRun'))
    print('ERRORS',errs)
finally: srv.terminate()
