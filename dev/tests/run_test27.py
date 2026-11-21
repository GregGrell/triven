# Switching units and pressing Apply must not record a weight change (68 kg -> 149.9 lb -> 67.99 kg was saved as new weight).
import os, subprocess, time, json
DEV=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8806'],cwd=DEV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
fails=[]
def check(c,m):
  print(('  ok  ' if c else '  FAIL ')+m)
  if not c: fails.append(m)
try:
  with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page(viewport={'width':1240,'height':950});errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.add_init_script('window.__seedDb='+json.dumps({'profile':{'privacy_set':True,'settings':{'mass':68,'bikeMass':8.5,'units':'metric'}}})+';')
    pg.goto('http://localhost:8806/site/index.html#feed');pg.wait_for_timeout(2500)
    pg.click('#openSettings');pg.wait_for_timeout(800)
    pg.select_option('#s_units','imperial');pg.wait_for_timeout(200)
    check(pg.input_value('#s_mass')=='149.9','shown as 149.9 lb')
    pg.click('#saveSettings');pg.wait_for_timeout(1500)
    s=pg.evaluate("__db.profiles[0].settings")
    check(s.get('units')=='imperial','units saved')
    check(s.get('mass')==68 and not (s.get('history') or s.get('physHistory') or []),'weight still exactly 68 kg, no dated change: '+json.dumps({k:v for k,v in s.items() if 'hist' in k.lower() or k=='mass'}))
    pg.click('#openSettings');pg.wait_for_timeout(800)
    pg.fill('#s_mass','150');pg.click('#saveSettings');pg.wait_for_timeout(1500)
    s=pg.evaluate("JSON.stringify(__db.profiles[0].settings)")
    check('68.04' in s,'a real change in lb is still saved (150 lb = 68.04 kg)')
    print('ERRORS',errs)
    if errs: fails.append('errors')
finally: srv.terminate()
print('FAILED '+str(len(fails)) if fails else 'ALL PASSED')
