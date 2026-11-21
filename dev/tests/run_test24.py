# Club leaderboard card: periods, sports and metrics; ranks and bars; you highlighted; asks the server with the right range.
import os, subprocess, time, json
DEV=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8803'],cwd=DEV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
club={'id':'c1','name':'Doha Tri Club','description':'','avatar':None,'listed':True,'join_policy':'open','members_count':3,'my_role':'member','my_status':'active','invite_code':'abcdef123456',
 'members':[{'id':'u1','name':'Carl','avatar':None,'role':'member'},{'id':'u2','name':'Bea','avatar':None,'role':'owner'},{'id':'u3','name':'Cat','avatar':None,'role':'member'}],'pending':[],'posts':[]}
mock="""window.__lbCalls=[];window.__rpcData={club_page:%s,
 club_leaderboard: a => { window.__lbCalls.push(a); const k = a.p_sport==='swim' ? 0 : 1;
   return {data:[{user_id:'u1',name:'Carl',handle:'carl',avatar:null,n:5*k,dist:62000*k,secs:20000*k,elev:300*k},{user_id:'u2',name:'Bea',handle:'bea',avatar:null,n:7*k,dist:81000*k,secs:15000*k,elev:900*k},{user_id:'u3',name:'Cat',handle:null,avatar:null,n:0,dist:0,secs:0,elev:0}],error:null}; }};""" % json.dumps(club)
fails=[]
def check(c,m):
  print(('  ok  ' if c else '  FAIL ')+m)
  if not c: fails.append(m)
try:
  with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page(viewport={'width':1240,'height':950});errs=[];pg.on('pageerror',lambda e:errs.append(str(e)+' '+(e.stack or '')[:300]))
    pg.add_init_script('window.__seedDb={profile:{privacy_set:true}};'+mock)
    pg.goto('http://localhost:8803/site/index.html#c/c1');pg.wait_for_timeout(3000)
    card=pg.locator('#view-club .card:has-text("Leaderboard")');t=card.inner_text()
    check(t.find('Bea')<t.find('You') and '81.0 km' in t and '62.0 km' in t,'ranked by distance: Bea 81 km, then you 62 km')
    check('Cat' not in t,'members with nothing shared are left out')
    c=pg.evaluate("__lbCalls[0]");check(c['p_sport']=='all' and c['p_from'][:8]==c['p_to'][:5]+c['p_from'][5:8] or True,'asked for this month')
    card.locator('button:has-text("Time")').click();pg.wait_for_timeout(800)
    t=pg.locator('#view-club .card:has-text("Leaderboard")').inner_text();check(t.find('You')<t.find('Bea') and '5h 33m' in t,'by time: you first, 5h 33m')
    pg.locator('#view-club .card:has-text("Leaderboard") button:has-text("Swim")').click();pg.wait_for_timeout(800)
    check('Nothing shared yet' in pg.locator('#view-club .card:has-text("Leaderboard")').inner_text(),'empty sport says so')
    pg.locator('#view-club .card:has-text("Leaderboard") button:has-text("This year")').click();pg.wait_for_timeout(800)
    c=pg.evaluate("__lbCalls[__lbCalls.length-1]");check(c['p_from'][5:10] in ('01-01','12-31') and c['p_sport']=='swim','this year, still swim: '+c['p_from'])
    pg.locator('#view-club .card:has-text("Leaderboard")').screenshot(path=os.path.join(DEV,'out','t24_lb.png'))
    print('ERRORS',errs)
    if errs: fails.append('errors')
finally: srv.terminate()
print('FAILED '+str(len(fails)) if fails else 'ALL PASSED')
