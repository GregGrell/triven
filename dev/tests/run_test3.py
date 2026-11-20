import os
DEV=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT=os.path.join(DEV,'out');os.makedirs(OUT,exist_ok=True)
FIT=os.environ.get('TRIVEN_FIT',os.path.join(DEV,'fixtures','multisport.fit'))
import subprocess,time
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8774'],cwd=DEV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
FIT=FIT;U='http://localhost:8774/site/index.html'
try:
  with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page(viewport={'width':1240,'height':950},color_scheme='dark')
    errs=[];pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)+' '+(e.stack or '')[:300]));pg.on('console',lambda m:errs.append('CONSOLE '+m.text) if m.type=='error' and 'Failed to load resource' not in m.text else None)
    pg.goto(U);pg.wait_for_timeout(1200)
    pg.goto(U+'#upload');pg.wait_for_timeout(300);pg.set_input_files('#fileIn',FIT);pg.wait_for_timeout(3500)
    print('upload:',pg.inner_text('#upList').split('\n')[0:2])
    print('summary keys', pg.evaluate("Object.keys(__db.activities[0].summary).join(',')"), 'track pts', pg.evaluate("__db.activities[0].summary.track.length"))
    pg.goto(U+'#feed');pg.wait_for_timeout(2000);pg.screenshot(path=os.path.join(OUT,'f_feed.png'),full_page=True)
    # edit from feed: notes + photo
    pg.click('.fcard >> text=Edit');pg.wait_for_timeout(600)
    pg.fill('#modalBody textarea >> nth=1','Calf tight from km 1. Gel at T1.')
    pg.set_input_files('#modalBody input[type=file]','photo.jpg');pg.wait_for_timeout(1500)
    pg.screenshot(path=os.path.join(OUT,'f_edit.png'))
    pg.click('#modalBody >> text=Save');pg.wait_for_timeout(1200)
    print('notes', pg.evaluate("__db.activities[0].notes"), 'media', pg.evaluate("__db.activity_media.length"))
    pg.wait_for_timeout(800);pg.screenshot(path=os.path.join(OUT,'f_feed2.png'),full_page=True)
    # inject a driving flag and open the activity
    aid=pg.evaluate("__db.activities[0].id")
    pg.evaluate("__db.activities[0].summary.driving=[{t0:3300,t1:3480,section:4,maxKmh:58,km:2.1,atEnd:true,atStart:false}]")
    pg.goto(U+'#a/'+aid);pg.wait_for_timeout(2000);pg.screenshot(path=os.path.join(OUT,'f_act.png'))
    # trim: cut from the flag
    pg.click('#actWarn >> text=Trim it');pg.wait_for_timeout(800);pg.click('#modalBody .chip >> nth=0');pg.wait_for_timeout(300)
    print('trim label', pg.inner_text('.trimlab'))
    pg.screenshot(path=os.path.join(OUT,'f_trim.png'))
    pg.click('#modalBody .actions .btn.primary');pg.wait_for_timeout(3500)
    print('modal msg:', pg.evaluate("[...document.querySelectorAll('#modalBody .note')].map(n=>n.textContent).join(' || ')"))
    print('after trim dist', pg.evaluate("__db.activities[0].distance_m"), 'elapsed', pg.evaluate("__db.activities[0].elapsed_s"), 'trim', pg.evaluate("JSON.stringify(__db.activities[0].summary.trim)"), 'sections', pg.evaluate("__db.activity_sections.length"), 'bests', pg.evaluate("__db.best_efforts.length"), 'gear kept', pg.evaluate("JSON.stringify(__db.activity_sections.map(s=>s.gear_id))"))
    # IG
    pg.goto(U+'#a/'+aid+'?x');pg.wait_for_timeout(2000)
    pg.evaluate("window.__comp=[{owner:'u2',athlete:'Sam Jones',sport:'multi'},{owner:'u3',athlete:'Alex',sport:'multi'}]")
    pg.click('#actTools >> text=Instagram post');pg.wait_for_timeout(3500)
    pg.screenshot(path=os.path.join(OUT,'f_ig.png'))
    print('with chip:', pg.evaluate("[...document.querySelectorAll('#modalBody .chip')].map(c=>c.textContent).join(' | ')"))
    print('feed has IG button:', 'Instagram' in pg.evaluate("1") if False else None)
    pg.click('#modalBody >> text=My photo');pg.wait_for_timeout(2500);pg.screenshot(path=os.path.join(OUT,'f_ig2.png'))
    pg.click('#modalBody >> text=Transparent sticker');pg.wait_for_timeout(2500);pg.screenshot(path=os.path.join(OUT,'f_ig3.png'))
    print('dl', pg.get_attribute('#modalBody a.btn','download'))
    # no photos: popup
    pg.keyboard.press('Escape');pg.evaluate("__db.activity_media.length=0");pg.goto(U+'#a/'+aid+'?y');pg.wait_for_timeout(2000)
    pg.click('#actTools >> text=Instagram post');pg.wait_for_timeout(2500)
    pg.click('#modalBody >> text=My photo');pg.wait_for_timeout(500)
    print('popup visible:', pg.is_visible('.igpop'), pg.inner_text('.igpop')[:60])
    pg.set_input_files('#modalBody input[type=file]','f_ig.png');pg.wait_for_timeout(2500)
    print('popup after pick:', pg.is_visible('.igpop'));pg.screenshot(path=os.path.join(OUT,'f_ig4.png'))
    pg.keyboard.press('Escape');pg.goto(U+'#feed');pg.wait_for_timeout(2500)
    print('feed IG buttons:', pg.evaluate("[...document.querySelectorAll('.feed button')].filter(b=>b.textContent.includes('Instagram')).length"))
    print('ERRORS',errs)
    b.close()
finally: srv.terminate()
