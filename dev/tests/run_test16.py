# Training log Year view (monthly bars, totals) with "other" activities and an "other" multisport leg; weekly/monthly/annual goals.
import os, subprocess, time, json, datetime
DEV=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT=os.path.join(DEV,'out');os.makedirs(OUT,exist_ok=True)
from playwright.sync_api import sync_playwright
def nav(pg, url, **k):   # in-page navigation keeps the fake database; a full load (goto) would reset it
  if '#' in url and pg.url.startswith('http://localhost') and pg.evaluate('!!window.__db'): pg.evaluate("h=>location.hash=h", '#'+url.split('#',1)[1])
  else: pg.goto(url, **k)
ROUTE="import('/site/js/urls.js').then(m=>m.curRoute())"   # the app's route, whether the address shows #… or a clean path

srv=subprocess.Popen(['python3','-m','http.server','8794'],cwd=DEV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
Y=datetime.date.today().year
acts=[];secs=[]
def add(i,sp,day,dist,secs_=3000,prof=None):
  acts.append({'id':i,'owner':'u1','name':i,'sport':sp,'multisport_profile':prof,'start_time':f'{day}T05:00:00Z','utc_offset_min':180,'distance_m':dist,'elapsed_s':secs_,'moving_s':secs_,'ascent_m':20,'is_race':False,'visibility':'club','share':{},'summary':{'manual':True},'source':'manual'})
for m in range(1,datetime.date.today().month+1):
  add(f'r{m}','run',f'{Y}-{m:02d}-02',10000); add(f'w{m}','other',f'{Y}-{m:02d}-03',5000)
add('tri','multi',f'{Y}-01-15',30000,7200,'other')
for i,(sp,d) in enumerate([('swim',750),('transition',0),('other',5000),('run',5000)]):
  secs.append({'id':f'ts{i}','activity_id':'tri','idx':i,'sport':sp,'elapsed_s':1000,'distance_m':d,'summary':{}})
for a in acts:
  if a['sport']!='multi': secs.append({'id':'s'+a['id'],'activity_id':a['id'],'idx':0,'sport':a['sport'],'elapsed_s':3000,'distance_m':a['distance_m'],'summary':{}})
nm=datetime.date.today().month
seed={'profile':{'privacy_set':True,'settings':{'goals':{'run':{'metric':'distance','target':30}},'goalsMonth':{'run':{'metric':'distance','target':100}},'goalsYear':{'all':{'metric':'distance','target':500}}}},'activities':acts,'activity_sections':secs}
fails=[]
def check(c,m):
  print(('  ok  ' if c else '  FAIL ')+m)
  if not c: fails.append(m)
try:
  with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page(viewport={'width':1240,'height':950});errs=[];pg.on('pageerror',lambda e:errs.append(str(e)+' '+(e.stack or '')[:300]))
    pg.add_init_script('window.__seedDb='+json.dumps(seed)+';')
    nav(pg,'http://localhost:8794/site/index.html#log');pg.wait_for_timeout(2500)
    pg.click('.seg-btns .chip[data-p=year]');pg.wait_for_timeout(800)
    labels=pg.evaluate("[...document.querySelectorAll('#view-log svg text')].map(t=>t.textContent)")
    check('Jan' in labels and 'Dec' in labels,'Year view: monthly bars Jan–Dec')
    tot=pg.inner_text('#totals')
    runs=nm+1  # one run a month plus the race's run leg
    check(f'{nm*10+5}' in tot.split('RUN')[1].split('\n')[1] if 'RUN' in tot else False,f'run total excludes walks: {nm*10+5} km')
    check('OTHER' in tot.upper(),'walks and the race\'s "other" leg get their own Other card')
    check(f'{round(nm*10+5+nm*5+5+0.75)}km' in tot.replace(',','').replace(' ','').replace('\n',''),'all sports include everything: '+tot.replace('\n',' ')[:160])
    pg.locator('#view-log .card').first.screenshot(path=os.path.join(OUT,'t16_year.png'))
    # goals
    nav(pg,'http://localhost:8794/site/index.html#feed');pg.wait_for_timeout(2000)
    g=pg.inner_text('.goals')
    check('THIS WEEK' in g.upper() and str(Y) in g and 'pace' in g,'week, month and year goals with pace: '+g.replace('\n',' | ')[:220])
    check(pg.locator('.gdue').count()==2,'pace ticks on month and year goals only')
    pg.click('text=Set goals');pg.wait_for_timeout(400)
    pg.click('#modalBody .chip:has-text("Annual")');pg.wait_for_timeout(200)
    check(pg.input_value('#modalBody .goalrow:has-text("All sports") input')=='500','annual tab shows the saved 500')
    pg.fill('#modalBody .goalrow:has-text("Run") input','1000');pg.click('#modalBody .chip:has-text("Weekly")');pg.wait_for_timeout(200)
    check(pg.input_value('#modalBody .goalrow:has-text("Run") input')=='30','weekly tab keeps its own 30')
    pg.click('#modalBody .chip:has-text("Annual")');pg.wait_for_timeout(200)
    check(pg.input_value('#modalBody .goalrow:has-text("Run") input')=='1000','switching tabs keeps unsaved edits')
    pg.click('#modalBody button:has-text("Save goals")');pg.wait_for_timeout(1000)
    st=pg.evaluate("__db.profiles[0].settings")
    check(st['goalsYear']=={'all':{'metric':'distance','target':500},'run':{'metric':'distance','target':1000}} and st['goals']=={'run':{'metric':'distance','target':30}} and st['goalsMonth']=={'run':{'metric':'distance','target':100}},'saved all three; untouched ones unchanged: '+json.dumps({k:st.get(k) for k in ('goals','goalsMonth','goalsYear')}))
    pg.locator('.goals').screenshot(path=os.path.join(OUT,'t16_goals.png'))
    print('ERRORS',errs)
    if errs: fails.append('errors')
finally: srv.terminate()
print('FAILED '+str(len(fails)) if fails else 'ALL PASSED')
