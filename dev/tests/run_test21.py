# Race calendar: add a race, countdown, race-day form forecast and taper suggestion, next race on the feed, link a past result.
import os, subprocess, time, json, datetime
DEV=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8800'],cwd=DEV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
T=datetime.date.today();acts=[];secs=[]
for i in range(1,61):   # an hour a day for two months (50 load a day, time-based)
  d=(T-datetime.timedelta(days=i)).isoformat()
  acts.append({'id':f'a{i}','owner':'u1','name':f'Run {d}','sport':'run','start_time':d+'T05:00:00Z','utc_offset_min':180,'distance_m':12000,'elapsed_s':3600,'moving_s':3600,'is_race':i==30,'visibility':'club','share':{},'summary':{'manual':True},'source':'manual'})
  secs.append({'id':f's{i}','activity_id':f'a{i}','idx':0,'sport':'run','elapsed_s':3600,'distance_m':12000,'summary':{}})
past=(T-datetime.timedelta(days=30)).isoformat()
seed={'profile':{'privacy_set':True,'settings':{'races':[{'id':'p1','name':'Club 10K','date':past,'kind':'run','dist':'10K','pri':'B','goal':3500}]}},'activities':acts,'activity_sections':secs}
fails=[]
def check(c,m):
  print(('  ok  ' if c else '  FAIL ')+m)
  if not c: fails.append(m)
try:
  with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page(viewport={'width':1240,'height':950});errs=[];pg.on('pageerror',lambda e:errs.append(str(e)+' '+(e.stack or '')[:300]))
    pg.add_init_script('window.__seedDb='+json.dumps(seed)+';')
    pg.goto('http://localhost:8800/site/index.html#log/races');pg.wait_for_timeout(2500)
    check('No races coming up' in pg.inner_text('#logRaces'),'empty upcoming list')
    pg.click('#logRaces button:has-text("Add a race")');pg.wait_for_timeout(400)
    rd=(T+datetime.timedelta(days=21)).isoformat()
    pg.fill('#modalBody input >> nth=0','Doha Sprint Triathlon');pg.fill('#modalBody input[type=date]',rd);pg.fill('#modalBody input >> nth=2','Sprint');pg.fill('#modalBody input >> nth=3','1:15:00')
    pg.click('#modalBody button:has-text("Save")');pg.wait_for_timeout(1200)
    t=pg.inner_text('#logRaces')
    check('Doha Sprint Triathlon' in t and '21' in t and 'days to go' in t,'countdown: 21 days to go')
    check('Race-day form if you keep training' in t and 'cut training by about' in t and 'last 10 days' in t,'forecast and an A-race taper suggestion: '+t[t.find('Race-day'):][:200].replace('\n',' '))
    st=pg.evaluate("__db.profiles[0].settings.races")
    check(len(st)==2 and any(r['name']=='Doha Sprint Triathlon' and r['pri']=='A' and r['goal']==4500 and r['kind']=='triathlon' for r in st),'saved with priority A, goal 1:15:00, triathlon')
    # past race: link the result
    check('Link your result' in t,'past race offers activities from that day to link')
    pg.click('#logRaces button:has-text("Link")');pg.wait_for_timeout(1200)
    t=pg.inner_text('#logRaces');check('Result:' in t and '1:00:00' in t and 'over goal' in t,'result linked: 1:00:00, 1:40 over a 58:20 goal')
    pg.locator('#logRaces').screenshot(path=os.path.join(DEV,'out','t21_races.png'))
    pg.evaluate("h=>location.hash=h",'#feed');pg.wait_for_timeout(1500)
    n=pg.inner_text('.nextrace');check('Doha Sprint Triathlon' in n and '21' in n,'next race on the feed sidebar: '+n.replace('\n',' '))
    print('ERRORS',errs)
    if errs: fails.append('errors')
finally: srv.terminate()
print('FAILED '+str(len(fails)) if fails else 'ALL PASSED')
