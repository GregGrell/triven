# Usernames, profile pages, short links and Share buttons.
import os, subprocess, time, json
DEV=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT=os.path.join(DEV,'out');os.makedirs(OUT,exist_ok=True)
from playwright.sync_api import sync_playwright
def nav(pg, url, **k):   # in-page navigation keeps the fake database; a full load (goto) would reset it
  if '#' in url and pg.url.startswith('http://localhost') and pg.evaluate('!!window.__db'): pg.evaluate("h=>location.hash=h", '#'+url.split('#',1)[1])
  else: pg.goto(url, **k)
ROUTE="import('/site/js/urls.js').then(m=>m.curRoute())"   # the app's route, whether the address shows #… or a clean path

srv=subprocess.Popen(['python3','-m','http.server','8790'],cwd=DEV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
def act(i,n,name,sp,day,dist,secs,race=False):
  return {'id':i,'num':n,'owner':'u1','name':name,'sport':sp,'start_time':day+'T05:00:00Z','utc_offset_min':180,'distance_m':dist,'elapsed_s':secs,'moving_s':secs,'ascent_m':40,
          'is_race':race,'visibility':'followers','share':{'pace':True},'summary':{'manual':True},'source':'manual'}
acts=[act('a1',1,'Parkrun','run','2026-03-08',5000,1250,True),act('a2',2,'Long ride','bike','2026-06-01',100000,12000)]
seed={'profile':{'privacy_set':True,'handle':'carl','display_name':'Carl'},'activities':acts,'activity_sections':[{'id':'s'+a['id'],'activity_id':a['id'],'idx':0,'sport':a['sport'],'start_offset_s':0,'elapsed_s':a['elapsed_s'],'timer_s':a['elapsed_s'],'distance_m':a['distance_m'],'summary':{}} for a in acts]}
page={'id':'u1','name':'Carl','handle':'carl','avatar':None,'me':True,'since':'2026-10-01T00:00:00Z','you_follow':None,'follows_you':False,
      'clubs':[{'id':'c1','name':'Doha Tri'}],'count':2,'year':{'run':{'n':1,'km':5,'s':1250,'up':40},'bike':{'n':1,'km':100,'s':12000,'up':40}},
      'bests':[{'sport':'run','effort':'5 km','unit':'s','value':1250,'activity':'a1','at':'2026-03-08'},{'sport':'bike','effort':'power 20 min','unit':'W','value':265,'activity':'a2','at':'2026-06-01'}]}
mock="""window.__rpcData={
 athlete_page: %s,
 resolve_link: a => ({data: a.p_handle==='carl' ? (a.p_num ? {found:true,handle:'carl',activity:'a'+a.p_num} : {found:true,handle:'carl',person:'u1'})
                     : a.p_handle==='bea' ? (a.p_num ? {found:true,handle:'bea',activity:null} : {found:true,handle:'bea',person:null})
                     : a.p_handle==='carlold' ? {found:true,handle:'carl',person:'u1'} : {found:false}, error:null}),
 check_handle: a => ({data: a.h==='bea' ? 'taken' : 'ok', error:null}),
 activity_link: a => ({data:'carl/9', error:null}) };""" % json.dumps(page)
fails=[]
def check(c,m):
  print(('  ok  ' if c else '  FAIL ')+m)
  if not c: fails.append(m)
try:
  with sync_playwright() as p:
    b=p.chromium.launch();ctx=b.new_context(viewport={'width':1240,'height':950},permissions=['clipboard-read','clipboard-write']);pg=ctx.new_page()
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)+' '+(e.stack or '')[:300]))
    pg.add_init_script('window.__seedDb='+json.dumps(seed)+';'+mock)
    base='http://localhost:8790/site/index.html'
    nav(pg,base+'#u/carl');pg.wait_for_timeout(2500)
    t=pg.inner_text('#view-profile')
    check('@carl' in t and 'Doha Tri' in t and 'Run' in t and '100 km' in t,'profile header, clubs and year totals')
    check('20:50' in t and '265 W' in t,'best efforts shown')
    check(pg.locator('#view-profile .fcard').count()==2,'their activities listed')
    pg.locator('#view-profile').screenshot(path=os.path.join(OUT,'t13_profile.png'))
    pg.click('#view-profile button:has-text("Share profile")');pg.wait_for_timeout(400)
    check(pg.evaluate('navigator.clipboard.readText()')=='https://triven.fit/carl','share profile copies triven.fit/carl')
    nav(pg,base+'#u/carlold');pg.wait_for_timeout(1500);check(pg.evaluate(ROUTE)=='#u/carl','old username shows the current one')
    nav(pg,base+'#u/bea');pg.wait_for_timeout(1500);check('private' in pg.inner_text('#view-profile').lower(),'private profile message')
    nav(pg,base+'#u/bea/3');pg.wait_for_timeout(1500);check('isn’t shared with you' in pg.inner_text('#view-profile').lower(),'unshared activity message')
    nav(pg,base+'#u/nobody');pg.wait_for_timeout(1500);check('nobody has that username' in pg.inner_text('#view-profile').lower(),'unknown username')
    nav(pg,base+'#u/carl/1');pg.wait_for_timeout(2500);check(pg.evaluate(ROUTE)=='#u/carl/1' and pg.is_visible('#view-activity') and pg.inner_text('#actName').startswith('Parkrun'),'short link opens the activity, address stays /carl/1')
    pg.click('#actTools button:has-text("Share")');pg.wait_for_timeout(400)
    check(pg.evaluate('navigator.clipboard.readText()')=='https://triven.fit/carl/1','activity share copies triven.fit/carl/1')
    nav(pg,base+'#feed');pg.wait_for_timeout(2000)
    check(pg.locator('.fcard .fwho').first.get_attribute('href')=='#u/carl','feed names link to profiles')
    pg.click('#acctLink');pg.wait_for_timeout(1500);check(pg.evaluate(ROUTE)=='#u/carl','your name in the header opens your profile')
    # username in Settings
    pg.click('#openSettings');pg.wait_for_timeout(500)
    check(pg.input_value('#p_handle')=='carl','settings shows your username')
    pg.fill('#p_handle','no way');pg.wait_for_timeout(200);check('letters' in pg.inner_text('#p_handleMsg'),'invalid username flagged')
    pg.fill('#p_handle','bea');pg.wait_for_timeout(700);check(pg.inner_text('#p_handleMsg')=='Taken','taken username flagged')
    pg.click('#saveSettings');pg.wait_for_timeout(300);check(pg.is_visible('#formerr') and 'taken' in pg.inner_text('#formerr'),'save blocked while taken')
    pg.fill('#p_handle','CarlG');pg.wait_for_timeout(700);check('triven.fit/carlg' in pg.inner_text('#p_handleMsg'),'available, shown lowercase')
    pg.click('#saveSettings');pg.wait_for_timeout(800)
    nav(pg,base+'#me');pg.wait_for_timeout(1500)
    check(pg.evaluate(ROUTE)=='#u/carlg','username saved: your profile is now #u/carlg')
    print('ERRORS',errs)
    if errs: fails.append('errors')
finally: srv.terminate()
print('FAILED '+str(len(fails)) if fails else 'ALL PASSED')
