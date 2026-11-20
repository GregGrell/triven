import os
DEV=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT=os.path.join(DEV,'out');os.makedirs(OUT,exist_ok=True)
FIT=os.environ.get('TRIVEN_FIT',os.path.join(DEV,'fixtures','multisport.fit'))
import subprocess,time,json
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8780'],cwd=DEV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
FIT=FIT;U='http://localhost:8780/site/index.html'
try:
  with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page(viewport={'width':1240,'height':950})
    errs=[];pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)+' '+(e.stack or '')[:400]))
    pg.goto(U);pg.wait_for_timeout(1200)
    pg.goto(U+'#upload');pg.wait_for_timeout(300);pg.set_input_files('#fileIn',FIT);pg.wait_for_timeout(3500)
    aid=pg.evaluate("__db.activities[0].id")
    pg.goto(U+'#a/'+aid);pg.wait_for_timeout(2500)
    pg.click('#actTools >> text=Edit');pg.wait_for_timeout(600)
    sel=pg.query_selector_all('#modalBody section:nth-of-type(2) select')[0]; sel.select_option('treadmill'); pg.wait_for_timeout(200)
    print('fix field visible', pg.is_visible('#modalBody section:nth-of-type(2) input[type=number] >> nth=0'))
    pg.click('#modalBody .actions .btn.primary');pg.wait_for_timeout(5000)
    pg.goto(U+'#a/'+aid+'?1');pg.wait_for_timeout(2500)
    pg.click('#actTools >> text=Edit');pg.wait_for_timeout(600)
    inp=pg.query_selector('#modalBody section:nth-of-type(2) input[type=number]'); inp.fill('2.00')
    pg.click('#modalBody .actions .btn.primary');pg.wait_for_timeout(5000)
    s0=pg.evaluate("__db.activity_sections.filter(s=>s.activity_id==='"+aid+"').sort((a,b)=>a.idx-b.idx)[0]")
    laps=pg.evaluate("__db.activity_laps.filter(l=>l.activity_id==='"+aid+"').sort((a,b)=>a.idx-b.idx).slice(0,3).map(l=>l.distance_m+'@'+l.avg_speed)")
    print('section', s0['distance_m'], s0['avg_speed'], s0['summary'].get('watchDistance'), s0['summary'].get('distFix'), 'laps', laps, 'act dist', pg.evaluate("__db.activities[0].distance_m"), 'stored fix', json.dumps(pg.evaluate("__db.activities[0].summary.distFix")))
    pg.goto(U+'#a/'+aid+'?2');pg.wait_for_timeout(2500)
    print('segbar', pg.inner_text('#segbar').replace('\n',' ')[:90])
    print('ERRORS',errs)
finally: srv.terminate()
