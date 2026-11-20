import os
DEV=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT=os.path.join(DEV,'out');os.makedirs(OUT,exist_ok=True)
FIT=os.environ.get('TRIVEN_FIT',os.path.join(DEV,'fixtures','multisport.fit'))
import subprocess,time,json
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8783'],cwd=DEV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
U='http://localhost:8783/site/index.html'
try:
  with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page(viewport={'width':1240,'height':950})
    errs=[];pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)+' '+(e.stack or '')[:400]))
    pg.goto(U+'#upload');pg.wait_for_timeout(1500)
    pg.set_input_files('#fileIn',['/tmp/part0.fit','/tmp/part1.fit','/tmp/part2.fit']);pg.wait_for_timeout(6000)
    print('acts',pg.evaluate("__db.activities.map(a=>a.name)"))
    print('modal',pg.inner_text('#modal')[:400].replace('\n',' | '))
    pg.screenshot(path=os.path.join(OUT,'combine.png'))
    pg.click('#modal button.btn.primary');pg.wait_for_timeout(6000)
    print('after',pg.evaluate("__db.activities.map(a=>[a.name,a.sport,a.multisport_profile,a.source_id,Math.round(a.distance_m),Math.round(a.elapsed_s),a.summary.linked&&a.summary.linked.parts.length])"))
    print('sections',pg.evaluate("__db.activity_sections.map(s=>s.sport+' '+Math.round(s.elapsed_s)).join(', ')"), 'hash',pg.evaluate('location.hash'))
    pg.wait_for_timeout(1500);pg.screenshot(path=os.path.join(OUT,'linked.png'),full_page=False)
    print('header',pg.inner_text('#view-activity')[:300].replace('\n',' | '))
    # unlink
    ub=pg.locator('button:has-text("Unlink")');ub.click();pg.wait_for_timeout(300);pg.locator('button:has-text("Split into")').click();pg.wait_for_timeout(7000)
    print('unlinked',pg.evaluate("__db.activities.map(a=>a.name+':'+a.sport)"), 'files',len([k for k in pg.evaluate("Object.keys(__files)") if k.startswith('activity-files') and not k.endswith('#blob')]))
    # link again from the activity page
    pg.wait_for_timeout(1000);pg.locator('button:has-text("Link activities")').click();pg.wait_for_timeout(800)
    print('linker',pg.inner_text('#modal')[:500].replace('\n',' | '))
    pg.screenshot(path=os.path.join(OUT,'linker.png'))
    print('ERRORS',errs)
finally: srv.terminate()
