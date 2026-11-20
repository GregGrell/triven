# Units on a real activity page (uploaded run): stats, laps, charts, hover, map scale, in imperial.
import os, subprocess, time, json
DEV=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT=os.path.join(DEV,'out');os.makedirs(OUT,exist_ok=True)
FIT=os.path.join(DEV,'fixtures','run.fit');os.makedirs(os.path.dirname(FIT),exist_ok=True)
if not os.path.exists(FIT): subprocess.run(['node','node/make_run.mjs',FIT],cwd=DEV,check=True)
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8792'],cwd=DEV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
fails=[]
def check(c,m):
  print(('  ok  ' if c else '  FAIL ')+m)
  if not c: fails.append(m)
try:
  with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page(viewport={'width':1240,'height':950})
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)+' '+(e.stack or '')[:300]))
    pg.add_init_script("window.__seedDb={profile:{privacy_set:true,settings:{lthrRun:163,lthrBike:158,maxHr:175,restHr:50,zones:[85,90,95,100,103],balLo:48.5,balHi:51.5,balMin:10,ftp:null,mass:75,bikeMass:9,cda:0.27,crr:0.004,units:'imperial'}}};")
    pg.goto('http://localhost:8792/site/index.html#upload');pg.wait_for_timeout(1500)
    pg.set_input_files('#fileIn',[FIT]);pg.wait_for_timeout(5000)
    up=pg.inner_text('#view-upload');check('4.97 mi' in up or '5.0 mi' in up,'upload result in miles')
    a=pg.evaluate("__db.activities[0]");check(abs(a['distance_m']-8000)<2,'stored in metres: '+str(a['distance_m']))
    pg.goto('http://localhost:8792/site/index.html#a/'+a['id']);pg.wait_for_timeout(4000)
    st=pg.inner_text('#stats');check('4.97 mi' in st and '8:03 /mi' in st,'stats: miles and pace per mile: '+st.replace('\n',' ')[:160])
    body=pg.inner_text('#view-activity')
    import re; body=re.sub(r'\b(1|5|10|15|30|50|100) km\b','',body)   # best-effort names such as "5 km" are event names
    check('/mi' in body and 'ft' in body and ' km' not in body and '/km' not in body,'no km anywhere on the page')
    check(pg.locator('text=0.62 mi').count()>0,'laps of 1 km shown as 0.62 mi')
    svg=pg.evaluate("[...document.querySelectorAll('#view-activity svg text')].map(t=>t.textContent).join('|')")
    check('/km' not in svg,'chart labels carry no metric units')
    check('PACE' in pg.inner_text('#view-activity').upper(),'a run charts pace, not speed')
    pg.screenshot(path=os.path.join(OUT,'t15_activity.png'),full_page=True)
    print('ERRORS',errs)
    if errs: fails.append('errors')
finally: srv.terminate()
print('FAILED '+str(len(fails)) if fails else 'ALL PASSED')
