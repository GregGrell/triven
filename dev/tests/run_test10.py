# Profile privacy, clubs, relays, PB trophies and the VO2 max removal, against the fake Supabase.
import os, json, subprocess, time
DEV=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT=os.path.join(DEV,'out');os.makedirs(OUT,exist_ok=True)
from playwright.sync_api import sync_playwright
def nav(pg, url, **k):   # in-page navigation keeps the fake database; a full load (goto) would reset it
  if '#' in url and pg.url.startswith('http://localhost') and pg.evaluate('!!window.__db'): pg.evaluate("h=>location.hash=h", '#'+url.split('#',1)[1])
  else: pg.goto(url, **k)
ROUTE="import('/site/js/urls.js').then(m=>m.curRoute())"   # the app's route, whether the address shows #… or a clean path

srv=subprocess.Popen(['python3','-m','http.server','8784'],cwd=DEV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
U='http://localhost:8784/site/index.html'
TR=[[25.30+i*0.001,51.50+i*0.0012,0] for i in range(40)]
TRB=[[25.34+i*0.002,51.55-i*0.0015,0] for i in range(40)]
sec=lambda aid,sp,el,d:{'id':aid+'-s','activity_id':aid,'idx':0,'sport':sp,'start_offset_s':0,'elapsed_s':el,'distance_m':d,'summary':{}}
act=lambda i,name,sp,t,el,d,tr=None:{'id':i,'owner':'u1','name':name,'sport':sp,'start_time':t,'utc_offset_min':180,'distance_m':d,'elapsed_s':el,'moving_s':el,'visibility':'followers','share':{'map':True,'pace':True,'hr':True,'power':True},'summary':{'track':tr} if tr else {},'source':'manual'}
seed={'profile':{'privacy_set':False,'searchable':True,'feed_audience':'everyone','avatar_path':None},
 'activities':[act('a0','Old 5k','run','2026-10-01T03:00:00Z',1300,5000),act('a1','Parkrun','run','2026-11-14T04:00:00Z',1250,5000,TR),act('a2','Relay swim','swim','2026-11-15T04:00:00Z',900,1500,TR)],
 'activity_sections':[sec('a0','run',1300,5000),sec('a1','run',1250,5000),sec('a2','swim',900,1500)],
 'best_efforts':[{'id':'b0','owner':'u1','activity_id':'a0','sport':'run','effort':'5 km','value':1300,'unit':'s','achieved_at':'2026-10-01T03:00:00Z'},
                 {'id':'b1','owner':'u1','activity_id':'a1','sport':'run','effort':'5 km','value':1250,'unit':'s','achieved_at':'2026-11-14T04:00:00Z'},
                 {'id':'b2','owner':'u1','activity_id':'a1','sport':'run','effort':'1 km','value':236,'unit':'s','achieved_at':'2026-11-14T04:00:00Z'},
                 {'id':'b3','owner':'u1','activity_id':'a0','sport':'run','effort':'1 km','value':230,'unit':'s','achieved_at':'2026-10-01T03:00:00Z'}]}
leg=lambda o,n,sp,t,el,d,aid=None,tr=None,st='accepted':{'owner':o,'athlete':n,'avatar':None,'status':st,'activity_id':aid,'name':n+' leg' if aid else None,'sport':sp,'multisport_profile':None,'start_time':t,'utc_offset_min':180,'elapsed_s':el,'distance_m':d,'is_race':True,'sections':[{'sport':sp,'elapsed_s':el,'distance_m':d}],'track':tr}
relay={'id':'r1','name':'Doha Sprint relay','member':True,'legs':[leg('u1','Carl','swim','2026-11-15T04:00:00Z',900,1500,'a2',TR),leg('u2','Bea','bike','2026-11-15T04:16:00Z',2400,20000,'b9',TRB),leg('u3','Cat','run','2026-11-15T04:57:30Z',1320,5000,None,None)]}
club={'id':'c1','name':'Doha Tri Club','description':'Sunday rides, Tuesday track, open water at the Pearl.','avatar':None,'listed':True,'join_policy':'approval','members_count':3,'my_role':'owner','my_status':'active','invite_code':'abcdef123456',
 'members':[{'id':'u1','name':'Carl','avatar':None,'role':'owner'},{'id':'u2','name':'Bea','avatar':None,'role':'admin'},{'id':'u3','name':'Cat','avatar':None,'role':'member'}],
 'pending':[{'id':'u4','name':'Dan','avatar':None,'since':'2026-11-19T10:00:00Z'}],
 'posts':[{'id':'p1','author':'u1','name':'Carl','avatar':None,'body':'Club TT on Friday, 6am at Sealine. Bring lights.','created_at':'2026-11-19T08:00:00Z'}]}
rpc={'my_network':[{'other':'u2','athlete':'Bea','direction':'following','status':'accepted','since':'2026-01-01','avatar':None},{'other':'u2','athlete':'Bea','direction':'follower','status':'accepted','since':'2026-01-01','avatar':None},{'other':'u5','athlete':'Eve','direction':'following','status':'accepted','since':'2026-01-01','avatar':None},{'other':'u5','athlete':'Eve','direction':'follower','status':'accepted','since':'2026-01-01','avatar':None}],
 'relay_candidates':[{'activity_id':'b8','owner':'u2','athlete':'Bea','avatar':None,'name':'Bea bike leg','sport':'bike','multisport_profile':None,'start_time':'2026-11-14T04:20:00Z','utc_offset_min':180,'elapsed_s':2400,'distance_m':20000}],
 'start_relay':'r2','relay_view':relay,
 'my_relay_invites':[{'relay_id':'r3','relay_name':'Corniche relay','invited_by':'Bea','invited_by_avatar':None,'activity_id':None,'created_at':'2026-11-19T08:00:00Z','relay':{'id':'r3','name':'Corniche relay','legs':[leg('u2','Bea','bike','2026-11-14T03:40:00Z',2400,20000)]}}],
 'my_clubs':[{'id':'c1','name':'Doha Tri Club','invite_code':'abcdef123456','role':'owner','status':'active','members':3,'avatar':None,'listed':True,'join_policy':'approval','pending':1},{'id':'c2','name':'Qatar Runners','invite_code':None,'role':'member','status':'pending','members':40,'avatar':None,'listed':True,'join_policy':'approval','pending':None}],
 'club_page':club,'search_clubs':[{'id':'c9','name':'Doha Masters Swim','description':'','avatar':None,'join_policy':'open','members':12,'my_status':None}],
 'club_preview':{'id':'c7','name':'Al Wakra Wheelers','description':'Weekend group rides.','avatar':None,'join_policy':'open','members':8,'my_status':None},
 'join_club':{'id':'c7','name':'Al Wakra Wheelers','status':'active'},'review_member':None,'update_club':club,'create_club':{'id':'c8','name':'New club'},'respond_relay':None,'activity_trophies':[]}
init=f"window.__seedDb={json.dumps(seed)};window.__rpcData={json.dumps(rpc)};window.__feedRelay={{a2:{json.dumps(relay)}}};"
fails=[]
def check(c,m):
  print(('  ok  ' if c else '  FAIL ')+m)
  if not c: fails.append(m)
try:
  with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page(viewport={'width':1240,'height':950})
    errs=[];pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)+' '+(e.stack or '')[:300]))
    pg.on('console',lambda m:m.type=='error' and 'TUNNEL' not in m.text and errs.append('CONSOLE '+m.text[:200]))
    pg.add_init_script(init)
    nav(pg,U+'#feed');pg.wait_for_timeout(2500)
    # first sign-in: Settings opens with a welcome note
    check(pg.evaluate("document.getElementById('settings').classList.contains('open')") and pg.is_visible('#setWelcome'),'first sign-in opens Settings with the welcome note')
    pg.screenshot(path=os.path.join(OUT,'t10_welcome.png'))
    pg.uncheck('#p_search');pg.wait_for_timeout(100)
    check(pg.evaluate("document.querySelector('#p_audience option[value=everyone]').disabled") and pg.input_value('#p_audience')=='followers_clubs','hidden profile: Everyone unavailable, falls back to followers and clubs')
    pg.select_option('#p_audience','followers');pg.click('#saveSettings');pg.wait_for_timeout(500)
    pr=pg.evaluate("__db.profiles[0]");check(pr['searchable']==False and pr['feed_audience']=='followers' and pr['privacy_set']==True,'privacy saved: '+json.dumps({k:pr.get(k) for k in ['searchable','feed_audience','privacy_set']}))
    check(pg.is_visible('#acct a[href="help.html"]'),'Help link in the header')
    # feed: invitation + relay card once
    pg.wait_for_timeout(500)
    check('Bea invited you to a relay' in pg.inner_text('.invites'),'relay invitation on the feed')
    check(pg.locator('.relaycard').count()==1,'relay shown as one card')
    pg.screenshot(path=os.path.join(OUT,'t10_feed.png'),full_page=True)
    pg.select_option('.invite select',index=0);pg.click('.invite button:has-text("Accept")');pg.wait_for_timeout(400)
    calls=pg.evaluate("__rpc.filter(c=>c[0]==='respond_relay')");check(calls and calls[-1][1]['accept']==True and calls[-1][1]['p_activity']=='a1','accept sends my nearest activity: '+json.dumps(calls[-1:] if calls else None))
    # relay page
    nav(pg,U+'#r/r1');pg.wait_for_timeout(1500)
    t=pg.inner_text('#view-relay');check('Doha Sprint relay' in t and 'Hand-over' in t and 'Not shared with you' in t,'relay page: legs, hand-overs, unshared leg')
    check('1:19:30' in t,'total time first start to last finish (1:19:30)')
    pg.screenshot(path=os.path.join(OUT,'t10_relay.png'),full_page=True)
    # activity page: trophies + make a relay
    nav(pg,U+'#a/a1');pg.wait_for_timeout(2500)
    tt=pg.inner_text('#actTrophies') if pg.is_visible('#actTrophies') else '';check('5 km' in tt and '20:50' in tt and '1 km' in tt,'trophies: '+tt.replace('\n',' '))
    check(pg.locator('#actTrophies .trophy.r1').count()==1 and pg.locator('#actTrophies .trophy.r2').count()==1,'gold for the 5 km PB, silver for the 2nd-best 1 km')
    check(not pg.locator('#vo2card').count(),'no VO2 max card on the activity page')
    pg.locator('#actTools button:has-text("Make a relay")').click();pg.wait_for_timeout(800)
    mt=pg.inner_text('#modal');check('Bea bike leg' in mt and 'Eve' in mt,'relay maker lists Bea’s activity and Eve to pick')
    pg.screenshot(path=os.path.join(OUT,'t10_maker.png'))
    pg.locator('#modal .ropt:has-text("Bea bike leg")').click();pg.click('#modal button:has-text("Send invitation")');pg.wait_for_timeout(400)
    sc=pg.evaluate("__rpc.filter(c=>c[0]==='start_relay').pop()");check(sc and sc[1]['other']=='u2' and sc[1]['other_aid']=='b8' and sc[1]['p_name']=='Parkrun relay','start_relay called: '+json.dumps(sc))
    # clubs
    nav(pg,U+'#club');pg.wait_for_timeout(1200)
    t=pg.inner_text('#view-club');check('Doha Tri Club' in t and '1 request' in t and 'Request sent, waiting' in t,'People tab lists clubs with request count and pending status')
    pg.fill('input[placeholder="Find a club by name"]','swim');pg.wait_for_timeout(600);check('Doha Masters Swim' in pg.inner_text('#view-club'),'club search')
    nav(pg,U+'#c/c1');pg.wait_for_timeout(1500)
    t=pg.inner_text('#view-club');check('Club TT on Friday' in t and 'REQUESTS TO JOIN · 1' in t.upper() and 'MEMBERS · 3' in t.upper(),'club page: news, requests, members')
    pg.screenshot(path=os.path.join(OUT,'t10_club.png'),full_page=True)
    pg.fill('.composer textarea','Kit order closes Sunday');pg.click('.composer button');pg.wait_for_timeout(400)
    check(pg.evaluate("__db.club_posts.length")==1,'admin posts a message')
    pg.locator('.clubside button:has-text("Approve")').click();pg.wait_for_timeout(300)
    rv=pg.evaluate("__rpc.filter(c=>c[0]==='review_member').pop()");check(rv and rv[1]['approve']==True and rv[1]['uid']=='u4','approve request')
    pg.locator('.clubacts button:has-text("Settings")').click();pg.wait_for_timeout(300);check('Club settings' in pg.inner_text('#modal'),'settings form')
    pg.screenshot(path=os.path.join(OUT,'t10_clubsettings.png'))
    pg.click('#modal input[value=open]');pg.click('#modal button:has-text("Save")');pg.wait_for_timeout(400)
    uc=pg.evaluate("__rpc.filter(c=>c[0]==='update_club').pop()");check(uc and uc[1]['p_policy']=='open' and uc[1]['p_listed']==True,'settings saved')
    # invite link
    nav(pg,U+'#join/abcdef654321');pg.wait_for_timeout(1200)
    check('Al Wakra Wheelers' in pg.inner_text('#view-club'),'invite link preview')
    pg.screenshot(path=os.path.join(OUT,'t10_join.png'))
    pg.click('#view-club button:has-text("Join club")');pg.wait_for_timeout(600);check(pg.evaluate(ROUTE)=='#c/c7','joined → club page')
    # start a club form
    nav(pg,U+'#club');pg.wait_for_timeout(1000);pg.click('button:has-text("Start a club")');pg.wait_for_timeout(300)
    pg.fill('#modal input[placeholder^="e.g."]','Lusail Brick Club');pg.click('#modal button:has-text("Create club")');pg.wait_for_timeout(400)
    cc=pg.evaluate("__rpc.filter(c=>c[0]==='create_club').pop()");check(cc and cc[1]['club_name']=='Lusail Brick Club' and cc[1]['p_listed']==True and cc[1]['p_policy']=='open','create club')
    # settings + log
    nav(pg,U+'#log');pg.wait_for_timeout(2000);check(not pg.locator('#fitcard').count() and 'VO₂ max' not in pg.inner_text('#view-log').replace('VO₂ max +',''),'no VO2 max in the training log')
    pg.click('#openSettings');pg.wait_for_timeout(400);check(not pg.is_visible('#setWelcome'),'no welcome note on later visits');print('   audience',pg.input_value('#p_audience'),pg.evaluate("JSON.stringify(__db.profiles[0].feed_audience)"));check(pg.input_value('#p_audience')=='followers' and pg.evaluate("document.querySelector('#p_audience option[value=everyone]').disabled"),'settings show the audience; Everyone off while hidden')
    pg.click('#closeSettings')
    # thresholds on the day: change run threshold HR from today; a 14 Nov activity keeps 163
    nav(pg,U+'#a/a1');pg.wait_for_timeout(2500)
    z=pg.inner_text('#znote');check('163 bpm' in z,'activity uses 163 before the change: '+z[:90])
    pg.click('#openSettings');pg.wait_for_timeout(300);pg.fill('#s_lthrRun','170');pg.click('#saveSettings');pg.wait_for_timeout(800)
    st=pg.evaluate("__db.profiles[0].settings");check(st['lthrRun']==170 and any(e.get('from') is None and e.get('lthrRun')==163 for e in st.get('history',[])),'history saved: '+json.dumps(st.get('history')))
    z=pg.inner_text('#znote');check('163 bpm (your earlier setting)' in z,'14 Nov activity still uses 163: '+z[:110])
    pg.click('#openSettings');pg.wait_for_timeout(300);check('Before your first change' in pg.inner_text('#s_hist'),'history listed in Settings')
    pg.screenshot(path=os.path.join(OUT,'t10_history.png'));pg.click('#closeSettings')
    print('ERRORS',errs)
    if errs: fails.append('page errors')
finally: srv.terminate()
print('FAILED: '+str(len(fails)) if fails else 'ALL PASSED')
