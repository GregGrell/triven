# Best efforts: overview in distance/duration order, all-time and per year; top 10 per category; ignore/restore;
# back link from an activity to the list; trophies all-time and per year.
import os, subprocess, time, json
DEV=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT=os.path.join(DEV,'out');os.makedirs(OUT,exist_ok=True)
from playwright.sync_api import sync_playwright
def nav(pg, url, **k):   # in-page navigation keeps the fake database; a full load (goto) would reset it
  if '#' in url and pg.url.startswith('http://localhost') and pg.evaluate('!!window.__db'): pg.evaluate("h=>location.hash=h", '#'+url.split('#',1)[1])
  else: pg.goto(url, **k)
ROUTE="import('/site/js/urls.js').then(m=>m.curRoute())"   # the app's route, whether the address shows #… or a clean path

srv=subprocess.Popen(['python3','-m','http.server','8795'],cwd=DEV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
acts=[];secs=[];bests=[]
def act(i,sp,day,name):
  acts.append({'id':i,'owner':'u1','name':name,'sport':sp,'start_time':day+'T05:00:00Z','utc_offset_min':180,'distance_m':20000,'elapsed_s':3600,'moving_s':3600,'ascent_m':100,'is_race':False,'visibility':'club','share':{},'summary':{'manual':True},'source':'manual'})
  secs.append({'id':'s'+i,'activity_id':i,'idx':0,'sport':sp,'elapsed_s':3600,'distance_m':20000,'summary':{}})
def be(i,sp,eff,v,unit,day): bests.append({'id':'b'+i+eff,'owner':'u1','activity_id':i,'sport':sp,'effort':eff,'value':v,'unit':unit,'measured':True,'achieved_at':day+'T05:30:00Z'})
rides=[('r1','2025-03-01',280),('r2','2025-09-01',300),('spike','2026-02-01',900),('r4','2026-05-01',290)]
for i,d,w in rides: act(i,'bike',d,'Ride '+i); be(i,'bike','power 20 min',w,'W',d); be(i,'bike','longest ride',50000,'m',d)
runs=[('k1','2025-04-01',1260),('k2','2026-03-01',1230),('k3','2026-06-01',1245)]
for i,d,t in runs: act(i,'run',d,'Run '+i); be(i,'run','5 km',t,'s',d); be(i,'run','1 km',t/5.3,'s',d)
seed={'profile':{'privacy_set':True,'settings':{'mass':75}},'activities':acts,'activity_sections':secs,'best_efforts':bests}
fails=[]
def check(c,m):
  print(('  ok  ' if c else '  FAIL ')+m)
  if not c: fails.append(m)
try:
  with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page(viewport={'width':1240,'height':950});errs=[];pg.on('pageerror',lambda e:errs.append(str(e)+' '+(e.stack or '')[:300]))
    pg.add_init_script('window.__seedDb='+json.dumps(seed)+';')
    base='http://localhost:8795/site/index.html'
    nav(pg,base+'#log/bests');pg.wait_for_timeout(2500)
    run=pg.inner_text('#logBests .card:has-text("Running")')
    check(run.find('400 m')<run.find('1 km')<run.find('5 km')<run.find('Marathon'),'running bests in distance order')
    pw=pg.inner_text('#logBests .card:has-text("Cycling power")')
    check(pw.find('1 s')<pw.find('20 min')<pw.find('1 hour') and '900 W' in pw,'power in duration order, spike shows: 900 W')
    check('Longest ride' in pg.inner_text('#logBests') and '100 km' in pg.inner_text('#logBests'),'cycling records and 100 km listed')
    chips=pg.inner_text('#logBests .bestyears');check(chips.split()==['All','time','2026','2025'],'year chips: All time, 2026, 2025')
    pg.click('#logBests .bestyears a:has-text("2025")');pg.wait_for_timeout(500)
    check('300 W' in pg.inner_text('#logBests .card:has-text("Cycling power")') and '21:00' in pg.inner_text('#logBests .card:has-text("Running")'),'2025 bests: 300 W, 5 km 21:00')
    pg.click('#logBests .bestyears a:has-text("All time")');pg.wait_for_timeout(400)
    pg.click('#logBests tr:has-text("20 min")');pg.wait_for_timeout(500)
    rows=pg.locator('#logBests .ranklist:not(.ignored) tr');t=pg.inner_text('#logBests')
    check(rows.count()==5 and t.find('900 W')<t.find('300 W')<t.find('290 W')<t.find('280 W'),'20 min top list ranked: 900, 300, 290, 280')
    check('12.00 W/kg' in t,'W/kg shown')
    pg.click('#logBests .ranklist tr:has-text("900 W") .ign');pg.wait_for_timeout(800)
    t=pg.inner_text('#logBests')
    check('ignored (1)' in t.lower() and pg.locator('#logBests .ranklist:not(.ignored) tr').count()==4,'spike moved to Ignored')
    check(pg.evaluate("__db.best_ignores.length")==1,'ignore saved')
    pg.click('#logBests a:has-text("All best efforts")');pg.wait_for_timeout(400)
    check('300 W' in pg.inner_text('#logBests .card:has-text("Cycling power")'),'overview now shows 300 W')
    # open an activity from the list, then back
    pg.click('#logBests tr:has-text("20 min")');pg.wait_for_timeout(400)
    pg.click('#logBests .ranklist a:has-text("Ride r4")');pg.wait_for_timeout(2500)
    check(pg.is_visible('#actBack') and pg.inner_text('#actBack')=='← Back to 20 min power bests','activity page has the back link: '+pg.inner_text('#actBack'))
    tr=pg.inner_text('#actTrophies')
    check("'26" in tr and '290 W' in tr,'trophy: 290 W best of 2026 (spike ignored), shown with a 2026 cup: '+tr.replace('\n',' '))
    pg.click('#actBack');pg.wait_for_timeout(800)
    check(pg.evaluate(ROUTE).startswith('#log/bests/bike/') and pg.is_visible('#logBests .ranklist'),'back returns to the 20 min list')
    pg.click('#logBests .ranklist.ignored button:has-text("Restore")');pg.wait_for_timeout(800)
    check(pg.locator('#logBests .ranklist:not(.ignored) tr').count()==5 and pg.evaluate("__db.best_ignores.length")==0,'restore puts it back')
    nav(pg,base+'#log/bests/run/5%20km?y=2026');pg.wait_for_timeout(1500)
    t=pg.inner_text('#logBests');check('in 2026' in t and t.find('20:30')<t.find('20:45') and '21:00' not in t,'5 km list for 2026 only')
    pg.screenshot(path=os.path.join(OUT,'t17_list.png'))
    nav(pg,base+'#log/bests');pg.wait_for_timeout(1200);pg.screenshot(path=os.path.join(OUT,'t17_overview.png'),full_page=True)
    nav(pg,base+'#a/k3');pg.wait_for_timeout(2000);check(not pg.is_visible('#actBack'),'no back link when not opened from a list')
    print('ERRORS',errs)
    if errs: fails.append('errors')
finally: srv.terminate()
print('FAILED '+str(len(fails)) if fails else 'ALL PASSED')
