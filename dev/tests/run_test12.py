# Activity search: words, sport, races, dates, distance, sorting, totals.
import os, subprocess, time, json
DEV=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT=os.path.join(DEV,'out');os.makedirs(OUT,exist_ok=True)
from playwright.sync_api import sync_playwright
def nav(pg, url, **k):   # in-page navigation keeps the fake database; a full load (goto) would reset it
  if '#' in url and pg.url.startswith('http://localhost') and pg.evaluate('!!window.__db'): pg.evaluate("h=>location.hash=h", '#'+url.split('#',1)[1])
  else: pg.goto(url, **k)
ROUTE="import('/site/js/urls.js').then(m=>m.curRoute())"   # the app's route, whether the address shows #… or a clean path

srv=subprocess.Popen(['python3','-m','http.server','8789'],cwd=DEV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
def act(i,name,sp,day,dist,secs,env=None,race=False,notes=None,gear=None,prof=None):
  return {'id':i,'owner':'u1','name':name,'sport':sp,'multisport_profile':prof,'start_time':day+'T05:00:00Z','utc_offset_min':180,'distance_m':dist,'elapsed_s':secs,'moving_s':secs,'ascent_m':50,
          'is_race':race,'notes':notes,'gear_id':gear,'visibility':'followers','share':{},'summary':{},'source':'upload'}
acts=[act('a1','Parkrun','run','2025-03-08',5000,1250,race=True,gear='g1'),act('a2','Long ride','bike','2026-06-01',100000,12000),act('a3','Morning Pool Swim','swim','2026-11-10',1300,1265),
      act('a4','Easy run','run','2026-11-01',8000,2900,notes='calf felt tight'),act('a5','Doha Sprint triathlon','multi','2026-02-14',25750,4800,race=True,prof='triathlon')]
secs=[{'id':'s3','activity_id':'a3','idx':0,'sport':'swim','elapsed_s':1510,'distance_m':1300,'summary':{'env':'pool'}},{'id':'s4','activity_id':'a4','idx':0,'sport':'run','elapsed_s':2900,'distance_m':8000,'summary':{'env':'treadmill'}}]
seed={'profile':{'privacy_set':True},'activities':acts,'activity_sections':secs,'gear':[{'id':'g1','owner':'u1','kind':'shoe','name':'Vaporfly 3','brand':'Nike','start_km':0}]}
fails=[]
def check(c,m):
  print(('  ok  ' if c else '  FAIL ')+m)
  if not c: fails.append(m)
try:
  with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page(viewport={'width':1240,'height':950})
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)+' '+(e.stack or '')[:300]))
    pg.add_init_script('window.__seedDb='+json.dumps(seed)+';')
    nav(pg,'http://localhost:8789/site/index.html#feed');pg.wait_for_timeout(2000)
    pg.keyboard.press('/');pg.wait_for_timeout(800)
    check(pg.evaluate(ROUTE)=='#log/activities' and pg.is_visible('.actsearch'),'/ opens activity search')
    rows=lambda: pg.locator('.acttbl tr').count()-1
    check(rows()==5 and '5 activities' in pg.inner_text('.actsum'),'all five listed with totals')
    def q(text): pg.fill('.actsearch',text);pg.wait_for_timeout(400)
    q('vaporfly');check(rows()==1 and 'Parkrun' in pg.inner_text('.acttbl'),'search by gear name')
    q('calf');check(rows()==1 and 'Easy run' in pg.inner_text('.acttbl'),'search private notes')
    q('treadmill');check(rows()==1,'search by type (treadmill)')
    q('march 2025');check(rows()==1 and 'Parkrun' in pg.inner_text('.acttbl'),'search by month and year')
    q('sprint triathlon');check(rows()==1,'two words must both match')
    q('pool');check(rows()==1 and '/100 m' in pg.inner_text('.acttbl'),'swim shows pace per 100 m')
    q('');pg.click('.segrow .chip:has-text("Races only")');pg.wait_for_timeout(300);check(rows()==2,'races only')
    pg.click('.segrow .chip:has-text("Races only")');pg.click('.segrow .chip[data-k=run]');pg.wait_for_timeout(300);check(rows()==2,'runs only')
    pg.click('.segrow .chip[data-k=all]');pg.fill('.actkm >> nth=0','20');pg.wait_for_timeout(300);check(rows()==2,'distance at least 20 km')
    pg.fill('.actkm >> nth=0','');pg.select_option('.actfilters select','year');pg.wait_for_timeout(300);check(rows()==4,'this year')
    pg.select_option('.actfilters select','any');pg.click('.acttbl th:has-text("Distance")');pg.wait_for_timeout(300)
    check(pg.locator('.acttbl tr').nth(1).inner_text().find('Long ride')>=0,'sort by distance, longest first')
    pg.locator('#logActs .card').screenshot(path=os.path.join(OUT,'t12_search.png'))
    print('ERRORS',errs)
    if errs: fails.append('errors')
finally: srv.terminate()
print('FAILED '+str(len(fails)) if fails else 'ALL PASSED')
