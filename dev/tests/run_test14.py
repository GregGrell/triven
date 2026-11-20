# Units: imperial everywhere when chosen, metric unchanged, weights converted in Settings, stored values stay metric.
import os, subprocess, time, json
DEV=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT=os.path.join(DEV,'out');os.makedirs(OUT,exist_ok=True)
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8791'],cwd=DEV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
def act(i,n,name,sp,day,dist,secs,asc):
  return {'id':i,'num':n,'owner':'u1','name':name,'sport':sp,'start_time':day+'T05:00:00Z','utc_offset_min':180,'distance_m':dist,'elapsed_s':secs,'moving_s':secs,'ascent_m':asc,
          'is_race':False,'visibility':'followers','share':{'pace':True},'summary':{'manual':True},'source':'manual','gear_id':'g1' if sp=='run' else None}
acts=[act('a1',1,'Ten miler','run','2026-11-15',16093.4,4800,30.48),act('a2',2,'Long ride','bike','2026-11-16',160934.4,18000,304.8)]
secs=[{'id':'s'+a['id'],'activity_id':a['id'],'idx':0,'sport':a['sport'],'start_offset_s':0,'elapsed_s':a['elapsed_s'],'timer_s':a['elapsed_s'],'distance_m':a['distance_m'],'ascent_m':a['ascent_m'],'summary':{}} for a in acts]
seed={'profile':{'privacy_set':True,'handle':'carl','settings':{'lthrRun':163,'lthrBike':158,'maxHr':175,'restHr':50,'zones':[85,90,95,100,103],'balLo':48.5,'balHi':51.5,'balMin':10,'ftp':None,'mass':75,'bikeMass':9,'cda':0.27,'crr':0.004,'units':'imperial','goals':{'run':{'metric':'distance','target':40.2336}}}},
      'activities':acts,'activity_sections':secs,'gear':[{'id':'g1','owner':'u1','kind':'shoe','name':'Vaporfly','start_km':160.9344,'replace_km':804.672,'retired':False}]}
fails=[]
def check(c,m):
  print(('  ok  ' if c else '  FAIL ')+m)
  if not c: fails.append(m)
try:
  with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page(viewport={'width':1240,'height':950})
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)+' '+(e.stack or '')[:300]))
    pg.add_init_script('window.__seedDb='+json.dumps(seed)+';')
    base='http://localhost:8791/site/index.html'
    pg.goto(base+'#feed');pg.wait_for_timeout(2500)
    t=pg.inner_text('#view-feed')
    check('10.00 mi' in t and '8:00 /mi' in t,'feed: run in miles and min/mile')
    check('100.00 mi' in t and '20.0 mph' in t and '1,000 ft' in t,'feed: ride in miles, mph, feet')
    check('25.0 mi' in t,'weekly goal shown in miles (stored 40.2 km)')
    pg.goto(base+'#a/a1');pg.wait_for_timeout(3000)
    t=pg.inner_text('#view-activity');check('10.00 mi' in t and '8:00 /mi' in t and '100 ft' in t and 'km' not in t,'activity page in miles, pace per mile, feet')
    pg.goto(base+'#log/activities');pg.wait_for_timeout(1500)
    t=pg.inner_text('#logActs');check('110.0 mi' in t or '110 mi' in t,'search totals in miles: '+pg.inner_text('.actsum'))
    pg.fill('.actkm >> nth=0','50');pg.wait_for_timeout(300);check(pg.locator('.acttbl tr').count()==2,'distance filter in miles (≥50 mi → the ride)')
    pg.goto(base+'#log');pg.wait_for_timeout(2000)
    t=pg.inner_text('#view-log');check(' mi' in t and '100 mi' in t,'training log: miles, ride best')
    pg.goto(base+'#gear');pg.wait_for_timeout(1500)
    t=pg.inner_text('#view-gear');check('of 500 mi' in t,'shoe replacement shown as 500 mi: '+t[:200].replace('\n',' '))
    # settings: weights in lb, switch to metric converts boxes and saves kg
    pg.click('#openSettings');pg.wait_for_timeout(500)
    check(pg.input_value('#s_units')=='imperial' and pg.input_value('#s_mass')=='165.3','weight shown as 165.3 lb')
    pg.select_option('#s_units','metric');pg.wait_for_timeout(200)
    check(pg.input_value('#s_mass')=='75' and pg.inner_text('#settings .wunit >> nth=0')=='kg','switching to metric converts the box to 75 kg')
    pg.click('#saveSettings');pg.wait_for_timeout(1500)
    st=pg.evaluate("window.__db.profiles[0].settings")
    check(st['units']=='metric' and abs(st['mass']-75)<0.01 and st['goals']['run']['target']==40.2336,'saved metric; weight 75 kg; goal untouched')
    pg.goto(base+'#feed');pg.wait_for_timeout(2000)
    t=pg.inner_text('#view-feed');check('16.09 km' in t and '/km' in t and '305 m' in t,'back to metric everywhere')
    # imperial again: type a weight in lb, stored as kg
    pg.click('#openSettings');pg.wait_for_timeout(400);pg.select_option('#s_units','imperial');pg.fill('#s_mass','170');pg.click('#saveSettings');pg.wait_for_timeout(1500)
    st=pg.evaluate("window.__db.profiles[0].settings");check(abs(st['mass']-77.11)<0.01,'170 lb saved as 77.11 kg: '+str(st['mass']))
    # gear edit: unchanged box keeps the stored km exactly; a new value converts
    pg.goto(base+'#gear');pg.wait_for_timeout(1200);pg.click('#view-gear .linkbtn:has-text("Edit")');pg.wait_for_timeout(500)
    check(pg.input_value('#modalBody input[type=number] >> nth=1')=='500','edit box shows 500 mi')
    pg.fill('#modalBody input[type=number] >> nth=1','400');pg.click('#modalBody button:has-text("Save")');pg.wait_for_timeout(1200)
    g=pg.evaluate("window.__db.gear[0]");check(abs(g['replace_km']-643.7)<0.1 and abs(g['start_km']-160.9344)<1e-6,'400 mi saved as 643.7 km; untouched start distance kept exactly')
    pg.goto(base+'#feed');pg.wait_for_timeout(1500);pg.screenshot(path=os.path.join(OUT,'t14_feed.png'))
    print('ERRORS',errs)
    if errs: fails.append('errors')
finally: srv.terminate()
print('FAILED '+str(len(fails)) if fails else 'ALL PASSED')
