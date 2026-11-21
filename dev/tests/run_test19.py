# Ironman bike distances: 90 km and 180 km bests from new uploads, trophies for bike distances, and the one-off back-fill
# for rides uploaded before (from saved streams).
import os, subprocess, time, json
DEV=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIT=os.path.join(DEV,'fixtures','ride100.fit')
if not os.path.exists(FIT): subprocess.run(['node','node/make_ride.mjs',FIT],cwd=DEV,check=True)
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8797'],cwd=DEV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
fails=[]
def check(c,m):
  print(('  ok  ' if c else '  FAIL ')+m)
  if not c: fails.append(m)
try:
  with sync_playwright() as p:
    b=p.chromium.launch();errs=[]
    pg=b.new_page(viewport={'width':1240,'height':950});pg.on('pageerror',lambda e:errs.append(str(e)+' '+(e.stack or '')[:300]))
    pg.add_init_script("window.__seedDb={profile:{privacy_set:true,settings:{lthrRun:163,lthrBike:158,maxHr:175,restHr:50,zones:[85,90,95,100,103],balLo:48.5,balHi:51.5,balMin:10,mass:75,bikeMass:9,cda:0.27,crr:0.004,bikeBestsV:1}}};")
    pg.goto('http://localhost:8797/site/index.html#upload');pg.wait_for_timeout(1500)
    pg.set_input_files('#fileIn',[FIT]);pg.wait_for_timeout(8000)
    be=pg.evaluate("__db.best_efforts.filter(b=>b.sport==='bike'&&b.unit==='s').map(b=>[b.effort,b.value])")
    d=dict(be);check(abs(d.get('90 km',0)-9000)<2 and '180 km' not in d,'new upload: 90 km in 2:30:00, no 180 km on a 100 km ride: '+str(be))
    aid=pg.evaluate("__db.activities[0].id")
    pg.evaluate("h=>location.hash=h",'#a/'+aid);pg.wait_for_timeout(3000)
    tr=pg.inner_text('#actTrophies');check('Bike 90 km' in tr and 'Bike 10 mile' in tr,'trophies for bike distances: '+tr.replace('\n',' ')[:160])
    pg.evaluate("h=>location.hash=h",'#log/bests');pg.wait_for_timeout(1500)
    t=pg.inner_text('#logBests .card:has-text("Time trial")');check('90 km (70.3 bike)' in t and '180 km (Ironman bike)' in t and t.find('50 mile')<t.find('90 km')<t.find('100 km')<t.find('100 mile')<t.find('180 km'),'Cycling card lists 90 and 180 km in distance order')
    check('2:30:00' in t,'90 km best shown')
    # the same ride as if uploaded before 90 km existed: back-fill adds it once
    db=pg.evaluate("JSON.stringify(__db)");files=pg.evaluate("JSON.stringify(Object.fromEntries(Object.entries(__files).filter(([k])=>!k.endsWith('#blob'))))")
    db=json.loads(db);db['best_efforts']=[x for x in db['best_efforts'] if x['effort'] not in ('90 km','180 km')]
    prof=db.pop('profiles')[0];prof['settings'].pop('bikeBestsV',None)
    seed={k:v for k,v in db.items() if v};seed['profile']=prof
    pg2=b.new_page();pg2.on('pageerror',lambda e:errs.append(str(e)))
    pg2.add_init_script('window.__seedDb='+json.dumps(seed)+';window.__seedFiles='+files+';')
    pg2.goto('http://localhost:8797/site/index.html#feed');pg2.wait_for_timeout(6000)
    be2=pg2.evaluate("__db.best_efforts.filter(b=>b.effort==='90 km').map(b=>b.value)")
    check(len(be2)==1 and abs(be2[0]-9000)<2,'back-fill added the 90 km best: '+str(be2))
    check(pg2.evaluate("__db.profiles[0].settings.bikeBestsV")==1,'back-fill marked done, so it runs once')
    print('ERRORS',errs)
    if errs: fails.append('errors')
finally: srv.terminate()
print('FAILED '+str(len(fails)) if fails else 'ALL PASSED')
