# Heat on activities: weather fetched for the time and place (rounded location), saved, shown with heat cost for runs.
import os, subprocess, time, json, datetime
DEV=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8801'],cwd=DEV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
d=(datetime.date.today()-datetime.timedelta(days=3)).isoformat()
acts=[{'id':'r1','owner':'u1','name':'Hot run','sport':'run','start_time':d+'T03:00:00Z','utc_offset_min':180,'distance_m':10000,'elapsed_s':3000,'moving_s':3000,'is_race':False,'visibility':'club','share':{},'source':'manual',
       'summary':{'manual':True,'track':[[25.28713,51.53101,0],[25.29,51.54,0]]}},
      {'id':'t1','owner':'u1','name':'Treadmill','sport':'run','start_time':d+'T15:00:00Z','utc_offset_min':180,'distance_m':5000,'elapsed_s':1500,'moving_s':1500,'is_race':False,'visibility':'club','share':{},'source':'manual','indoor':True,'summary':{'manual':True}}]
secs=[{'id':'s1','activity_id':'r1','idx':0,'sport':'run','elapsed_s':3000,'timer_s':3000,'distance_m':10000,'summary':{'env':'road'}},{'id':'s2','activity_id':'t1','idx':0,'sport':'run','elapsed_s':1500,'distance_m':5000,'summary':{'env':'treadmill'}}]
seed={'profile':{'privacy_set':True},'activities':acts,'activity_sections':secs}
hours=[f'{d}T{h:02d}:00' for h in range(24)]
wx={'hourly':{'time':hours,'temperature_2m':[32.0]*24,'apparent_temperature':[38.0]*24,'relative_humidity_2m':[60]*24,'dew_point_2m':[23.0]*24,'wind_speed_10m':[12.0]*24}}
calls=[]
fails=[]
def check(c,m):
  print(('  ok  ' if c else '  FAIL ')+m)
  if not c: fails.append(m)
try:
  with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page(viewport={'width':1240,'height':950});errs=[];pg.on('pageerror',lambda e:errs.append(str(e)+' '+(e.stack or '')[:300]))
    def handle(route): calls.append(route.request.url); route.fulfill(status=200,content_type='application/json',body=json.dumps(wx),headers={'access-control-allow-origin':'*'})
    pg.route('**/*open-meteo.com/**',handle)
    pg.add_init_script('window.__seedDb='+json.dumps(seed)+';')
    pg.goto('http://localhost:8801/site/index.html#a/r1');pg.wait_for_timeout(4000)
    w=pg.inner_text('#actWeather') if pg.is_visible('#actWeather') else ''
    check('32°C' in w and 'feels like 38°C' in w and 'humidity 60%' in w,'weather shown: '+w.replace('\n',' '))
    # 32°C + 23°C dew point = 89.6 + 73.4 = 163°F → about 6.6% heat cost
    check('heat cost ≈ 6.6%' in w and 'heat-adjusted pace 4:41 /km' in w,'heat cost and heat-adjusted pace (5:00 /km run → 4:41 in the cool)')
    check(calls and 'latitude=25.3&longitude=51.5' in calls[0] and 'forecast' in calls[0],'rounded location sent, recent date uses the forecast API: '+(calls[0][:120] if calls else ''))
    sw=pg.evaluate("__db.activities.find(a=>a.id==='r1').summary.weather")
    check(sw and sw['t']==32 and sw['dew']==23,'saved with the activity')
    n=len(calls);pg.evaluate("h=>location.hash=h",'#feed');pg.wait_for_timeout(2000);pg.evaluate("h=>location.hash=h",'#a/r1');pg.wait_for_timeout(2000)
    check(len(calls)==n,'not fetched again once saved')
    check(pg.evaluate("__db.activities.find(a=>a.id==='t1').summary.weather")==None,'treadmill run: no weather lookup')
    pg.evaluate("h=>location.hash=h",'#feed');pg.wait_for_timeout(1500)
    check('32°C' in pg.inner_text('#view-feed'),'feed card shows the temperature')
    print('ERRORS',errs)
    if errs: fails.append('errors')
finally: srv.terminate()
print('FAILED '+str(len(fails)) if fails else 'ALL PASSED')
