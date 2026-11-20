import os
DEV=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT=os.path.join(DEV,'out');os.makedirs(OUT,exist_ok=True)
FIT=os.environ.get('TRIVEN_FIT',os.path.join(DEV,'fixtures','multisport.fit'))
import subprocess,time,sys
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8770'],cwd=DEV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
FIT=FIT
try:
  with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page(viewport={'width':1240,'height':900},color_scheme='dark')
    errs=[];pg.on('console',lambda m:errs.append(m.text) if m.type in('error','warning') else None);pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)+' '+(e.stack or '')[:300]))
    pg.goto('http://localhost:8770/site/index.html');pg.wait_for_timeout(1500)
    pg.screenshot(path=os.path.join(OUT,'t_empty.png'),full_page=True)
    pg.goto('http://localhost:8770/site/index.html#upload');pg.wait_for_timeout(500)
    pg.set_input_files('#fileIn',FIT);pg.wait_for_timeout(3000)
    print('UPLOAD:',pg.inner_text('#upList'))
    pg.set_input_files('#fileIn',FIT);pg.wait_for_timeout(2000)
    print('REUPLOAD:',pg.inner_text('#upList').split('\n')[:3])
    pg.goto('http://localhost:8770/site/index.html#log');pg.wait_for_timeout(1000)
    print('DB', pg.evaluate("JSON.stringify({a:__db.activities.length,s:__db.activity_sections.length,l:__db.activity_laps.length,b:__db.best_efforts.length,f:Object.keys(__files)})"))
    pg.click('[data-p=year]');pg.click('#pPrev');pg.wait_for_timeout(300)
    pg.screenshot(path=os.path.join(OUT,'t_log.png'),full_page=True)
    aid=pg.evaluate("__db.activities[0].id")
    pg.goto('http://localhost:8770/site/index.html#a/'+aid);pg.wait_for_timeout(1500)
    pg.screenshot(path=os.path.join(OUT,'t_act.png'),full_page=True)
    pg.click('#openSettings');pg.wait_for_timeout(300);pg.fill('#s_lthrBike','150');pg.click('#saveSettings');pg.wait_for_timeout(600)
    print('FTP after settings:',pg.inner_text('#ftpcard')[:120].replace('\n',' | '))
    print('profile lthrBike', pg.evaluate("__db.profiles[0].settings.lthrBike"))
    print('ERRORS',errs)
    b.close()
finally: srv.terminate()
