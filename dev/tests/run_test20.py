# Gear "in use from": default gear only goes on activities from that date; setting the date offers to remove it from earlier ones.
import os, subprocess, time, json
DEV=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIT=os.path.join(DEV,'fixtures','run.fit')   # a run on 12 Nov 2026
if not os.path.exists(FIT): subprocess.run(['node','node/make_run.mjs',FIT],cwd=DEV,check=True)
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8799'],cwd=DEV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
acts=[];secs=[]
for i,d in enumerate(['2024-05-01','2025-02-01','2026-10-01','2026-11-16']):
  acts.append({'id':f'r{i}','owner':'u1','name':f'Run {d}','sport':'run','start_time':d+'T05:00:00Z','utc_offset_min':180,'distance_m':10000,'elapsed_s':3000,'moving_s':3000,'is_race':False,'visibility':'club','share':{},'summary':{'manual':True},'source':'manual','gear_id':'g1'})
  secs.append({'id':f's{i}','activity_id':f'r{i}','idx':0,'sport':'run','elapsed_s':3000,'distance_m':10000,'gear_id':None,'summary':{}})
gear=[{'id':'g1','owner':'u1','kind':'shoe','name':'Pegasus','start_km':0,'replace_km':700,'retired':False,'is_default_for':'run:road','created_at':'2026-11-15T10:00:00Z','in_use_from':None}]
seed={'profile':{'privacy_set':True},'activities':acts,'activity_sections':secs,'gear':gear}
fails=[]
def check(c,m):
  print(('  ok  ' if c else '  FAIL ')+m)
  if not c: fails.append(m)
try:
  with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page(viewport={'width':1240,'height':950});errs=[];pg.on('pageerror',lambda e:errs.append(str(e)+' '+(e.stack or '')[:300]))
    pg.add_init_script('window.__seedDb='+json.dumps(seed)+';')
    pg.goto('http://localhost:8799/site/index.html#upload');pg.wait_for_timeout(1500)
    pg.set_input_files('#fileIn',[FIT]);pg.wait_for_timeout(5000)
    new=pg.evaluate("__db.activities.find(a=>a.source!=='manual')")
    check(new and new['gear_id'] is None,'a run from 12 Nov gets no shoe added on 15 Nov')
    pg.evaluate("h=>location.hash=h",'#gear');pg.wait_for_timeout(1200)
    pg.click('#view-gear .linkbtn:has-text("Edit")');pg.wait_for_timeout(500)
    check(pg.input_value('#modalBody input[type=date]')=='2026-11-15','in use from defaults to the day it was added')
    pg.fill('#modalBody input[type=date]','2026-01-01');pg.click('#modalBody button:has-text("Save")');pg.wait_for_timeout(1200)
    t=pg.inner_text('#modalBody')
    check('on 2 activities from before' in t,'offers to remove it from the 2 earlier runs: '+t[t.find('Pegasus is'):][:90])
    pg.click('#modalBody button:has-text("Remove from 2")');pg.wait_for_timeout(1500)
    g=pg.evaluate("__db.activities.filter(a=>a.source==='manual').map(a=>[a.start_time.slice(0,10),a.gear_id])")
    check(g==[['2024-05-01',None],['2025-02-01',None],['2026-10-01','g1'],['2026-11-16','g1']],'removed from the earlier ones only: '+str(g))
    check(pg.evaluate("__db.gear[0].in_use_from")=='2026-01-01','date saved')
    print('ERRORS',errs)
    if errs: fails.append('errors')
finally: srv.terminate()
print('FAILED '+str(len(fails)) if fails else 'ALL PASSED')
