# Race history: the same event across years, side by side with legs and transitions.
import os, subprocess, time, json
DEV=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8802'],cwd=DEV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
acts=[];secs=[]
def tri(i,day,legs,lat=25.30,dist=25750,race=True,prof='triathlon'):
  tot=sum(legs)
  acts.append({'id':i,'owner':'u1','name':f'Doha Sprint {day[:4]}','sport':'multi','multisport_profile':prof,'start_time':day+'T04:00:00Z','utc_offset_min':180,'distance_m':dist,'elapsed_s':tot,'moving_s':tot,'is_race':race,'visibility':'club','share':{},'source':'manual','summary':{'manual':True,'track':[[lat,51.52,0]]}})
  for k,(sp,t) in enumerate(zip(['swim','transition','bike','transition','run'],legs)): secs.append({'id':f'{i}{k}','activity_id':i,'idx':k,'sport':sp,'elapsed_s':t,'distance_m':0,'summary':{}})
tri('y24','2024-02-10',[900,120,2400,60,1500])
tri('y25','2025-02-08',[880,100,2300,55,1450])
tri('y26','2026-02-14',[860,90,2250,50,1480])
tri('far','2025-03-01',[800,90,2000,50,1300],lat=25.60)        # another venue
tri('notrace','2025-04-01',[800,90,2000,50,1300],race=False)   # not flagged as a race
seed={'profile':{'privacy_set':True},'activities':acts,'activity_sections':secs}
fails=[]
def check(c,m):
  print(('  ok  ' if c else '  FAIL ')+m)
  if not c: fails.append(m)
try:
  with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page(viewport={'width':1240,'height':950});errs=[];pg.on('pageerror',lambda e:errs.append(str(e)+' '+(e.stack or '')[:300]))
    pg.add_init_script('window.__seedDb='+json.dumps(seed)+';')
    pg.goto('http://localhost:8802/site/index.html#a/y26');pg.wait_for_timeout(3000)
    t=pg.inner_text('#raceHist') if pg.is_visible('#raceHist') else ''
    check('3 TIMES AT THIS EVENT' in t.upper(),'three races at this event (other venue and unflagged run left out)')
    check('T1' in t and 'T2' in t and 'Swim' in t.title() and 'Bike' in t.title(),'legs and transitions as columns')
    check('1:23:00' in t and 'null' not in t,'2024 total 1:23:00, nothing stray')
    rows=pg.locator('#raceHist tr');check(rows.count()==4,'one row per year')
    check('−' in t and '+' in t,'differences shown both ways')
    pg.locator('#raceHist').screenshot(path=os.path.join(DEV,'out','t23_hist.png'))
    pg.evaluate("h=>location.hash=h",'#a/notrace');pg.wait_for_timeout(2500)
    check(not pg.is_visible('#raceHist'),'no history on a non-race')
    print('ERRORS',errs)
    if errs: fails.append('errors')
finally: srv.terminate()
print('FAILED '+str(len(fails)) if fails else 'ALL PASSED')
