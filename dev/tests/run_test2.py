import os
DEV=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT=os.path.join(DEV,'out');os.makedirs(OUT,exist_ok=True)
FIT=os.environ.get('TRIVEN_FIT',os.path.join(DEV,'fixtures','multisport.fit'))
import subprocess,time
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8771'],cwd=DEV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
FIT=FIT
U='http://localhost:8771/site/index.html'
try:
  with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page(viewport={'width':1240,'height':900},color_scheme='dark')
    errs=[];pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)+' '+(e.stack or '')[:200]));pg.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
    pg.goto(U+'#gear');pg.wait_for_timeout(1200)
    pg.click('text=Add shoes');pg.wait_for_timeout(200)
    pg.fill('#modalBody input >> nth=0','Nimbus');pg.fill('#modalBody input >> nth=1','ASICS');pg.fill('#modalBody input >> nth=2','Gel Nimbus 28');pg.fill('#modalBody input >> nth=3','61')
    pg.check('#modalBody input[type=checkbox]');pg.click('#modalBody >> text=Save');pg.wait_for_timeout(500)
    pg.click('text=Add bike');pg.wait_for_timeout(200);pg.fill('#modalBody input >> nth=0','Canyon TT');pg.check('#modalBody input[type=checkbox]');pg.click('#modalBody >> text=Save');pg.wait_for_timeout(500)
    pg.goto(U+'#upload');pg.wait_for_timeout(300);pg.set_input_files('#fileIn',FIT);pg.wait_for_timeout(3000)
    print('sections gear', pg.evaluate("JSON.stringify(__db.activity_sections.map(s=>[s.sport,s.gear_id]))"))
    pg.goto(U+'#gear');pg.wait_for_timeout(800);pg.screenshot(path=os.path.join(OUT,'t_gear.png'),full_page=True)
    aid=pg.evaluate("__db.activities[0].id")
    pg.goto(U+'#a/'+aid);pg.wait_for_timeout(1500)
    pg.click('#actTools >> text=Edit');pg.wait_for_timeout(300)
    pg.screenshot(path=os.path.join(OUT,'t_edit.png'))
    pg.fill('#modalBody input >> nth=0','Doha winter duathlon');pg.fill('#modalBody textarea','Windy on the way out.')
    pg.uncheck('#modalBody .checks input >> nth=0')
    pg.click('#modalBody >> text=Save');pg.wait_for_timeout(1200)
    print('act', pg.evaluate("JSON.stringify({n:__db.activities[0].name,share:__db.activities[0].share,d:__db.activities[0].description})"))
    print('shared lat null', pg.evaluate("JSON.parse(__files['activity-streams/'+__db.activities[0].streams_path]).lat.every(v=>v==null)"))
    pg.fill('#comments textarea','Great race!');pg.click('#comments >> text=Post');pg.wait_for_timeout(600)
    print('comments', pg.inner_text('#comments')[:120].replace('\n',' | '))
    pg.screenshot(path=os.path.join(OUT,'t_act2.png'))
    print('ERRORS',errs)
    b.close()
finally: srv.terminate()
