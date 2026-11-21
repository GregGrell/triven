# Notifications bell: unread count, list with links, opening marks read (saved in settings), panel closes.
import os, subprocess, time, json, datetime
DEV=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8804'],cwd=DEV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
now=datetime.datetime.utcnow()
iso=lambda m: (now-datetime.timedelta(minutes=m)).strftime('%Y-%m-%dT%H:%M:%SZ')
N=[{'kind':'comment','at':iso(5),'actor':'u2','actor_name':'Bea','actor_handle':'bea','actor_avatar':None,'activity_id':'a1','activity_name':'Morning run','club_id':None,'club_name':None,'relay_id':None,'body':'Nice one!'},
   {'kind':'kudos','at':iso(30),'actor':'u3','actor_name':'Cat','actor_handle':'cat','actor_avatar':None,'activity_id':'a1','activity_name':'Morning run','club_id':None,'club_name':None,'relay_id':None,'body':None},
   {'kind':'club_request','at':iso(200),'actor':'u4','actor_name':'Dan','actor_handle':None,'actor_avatar':None,'activity_id':None,'activity_name':None,'club_id':'c1','club_name':'Doha Tri','relay_id':None,'body':None},
   {'kind':'follow','at':iso(3000),'actor':'u5','actor_name':'Eve','actor_handle':'eve','actor_avatar':None,'activity_id':None,'activity_name':None,'club_id':None,'club_name':None,'relay_id':None,'body':None}]
seen=iso(100)
seed={'profile':{'privacy_set':True,'settings':{'notifSeen':seen}}}
fails=[]
def check(c,m):
  print(('  ok  ' if c else '  FAIL ')+m)
  if not c: fails.append(m)
try:
  with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page(viewport={'width':1240,'height':950});errs=[];pg.on('pageerror',lambda e:errs.append(str(e)+' '+(e.stack or '')[:300]))
    pg.add_init_script('window.__seedDb='+json.dumps(seed)+';window.__rpcData={my_notifications:'+json.dumps(N)+'};')
    pg.goto('http://localhost:8804/site/index.html#feed');pg.wait_for_timeout(2500)
    check(pg.is_visible('#bellBadge') and pg.inner_text('#bellBadge')=='2','badge: 2 new since you last looked')
    pg.click('#bellBtn');pg.wait_for_timeout(500)
    t=pg.inner_text('#bellPanel')
    check('Bea commented on Morning run' in t.replace('\n',' ') and '“Nice one!”' in t and 'Cat gave kudos' in t and 'Dan asked to join Doha Tri' in t and 'Eve started following you' in t,'all four kinds listed')
    check(pg.locator('#bellPanel .bellitem.new').count()==2,'the 2 new ones highlighted')
    pg.wait_for_timeout(800)
    check(not pg.is_visible('#bellBadge'),'badge clears once opened')
    st=pg.evaluate("__db.profiles[0].settings.notifSeen");check(st>seen,'read state saved in settings: '+st)
    pg.click('#bellPanel .bellitem:has-text("Dan")');pg.wait_for_timeout(800)
    check(not pg.is_visible('#bellPanel') and pg.evaluate("import('/site/js/urls.js').then(m=>m.curRoute())")=='#c/c1','clicking goes to the club and closes the list')
    print('ERRORS',errs)
    if errs: fails.append('errors')
finally: srv.terminate()
print('FAILED '+str(len(fails)) if fails else 'ALL PASSED')
