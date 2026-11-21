# Feedback form (members) and the owner dashboard (admins only).
import os, subprocess, time, json, datetime
DEV=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8808'],cwd=DEV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
today=datetime.date.today()
daily=[{'day':str(today-datetime.timedelta(days=29-i)),'signups':i%3,'active':5+i%4,'uploads':i%5,'synced':2,'manual':i%2,'views':{'landing':10+i,'app':4,'help':1,'videos':i%2}} for i in range(30)]
stats={'from':daily[0]['day'],'to':daily[-1]['day'],'totals':{'users':42,'users_new':20,'active_1':7,'active_7':18,'active_30':30,'activities':3120,'activities_new':300,'multisport':41,'synced_users':12,'clubs':3,'follows':55,'relays':2,'kudos':300,'comments':80,'feedback_open':2,'feedback_new':1,'visitors':900},
  'daily':daily,'sports':{'run':1500,'bike':900,'swim':500,'multi':41,'other':179},'profiles':{'triathlon':30,'duathlon':11},'devices':[{'device':'Garmin Forerunner 965','n':1200},{'device':'Unknown','n':40}],'per_user':{'median':24,'max':2058},
  'recent':[{'id':'u9','name':'Bea Moss','handle':'bea','email':'bea@example.com','joined':str(today)+'T08:00:00Z','activities':12,'last_seen':str(today),'synced':True}],
  'feedback':[{'id':'f1','kind':'problem','body':'Upload stuck at 90%','page':'#upload','app_build':'123','user_agent':'Safari','screen':'390×844','status':'new','admin_note':None,'created_at':str(today)+'T09:00:00Z','name':'Bea Moss','handle':'bea'},
              {'id':'f2','kind':'feature','body':'Turbo trainer mode please','page':'#feed','app_build':'123','user_agent':'Chrome','screen':'1440×900','status':'seen','admin_note':None,'created_at':str(today)+'T07:00:00Z','name':'Tom','handle':'tomw'}]}
fails=[]
def check(c,m):
  print(('  ok  ' if c else '  FAIL ')+m)
  if not c: fails.append(m)
try:
  with sync_playwright() as p:
    b=p.chromium.launch()
    # a member sends feedback
    pg=b.new_page(viewport={'width':1240,'height':900});errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.add_init_script('window.__seedDb='+json.dumps({'profile':{'privacy_set':True},'feedback':[]})+';')
    pg.goto('http://localhost:8808/site/index.html#log');pg.wait_for_timeout(2200)
    check(not pg.is_visible('.adminonly'),'members don\'t see the Dashboard link')
    pg.click('#acct .fbopen');pg.wait_for_timeout(500)
    pg.click('#modalBody .chip:has-text("Report a problem")');pg.fill('#modalBody textarea','The calendar shows the wrong week');pg.click('#modalBody button:has-text("Send")');pg.wait_for_timeout(800)
    f=pg.evaluate("__db.feedback[0]")
    check(f and f['kind']=='problem' and f['page']=='#log' and f['body'].startswith('The calendar') and f.get('user_agent') and f.get('screen'),'problem report saved with page, browser and screen: '+json.dumps({k:f.get(k) for k in ('kind','page','screen')} if f else None))
    check(not pg.is_visible('#modal.open'),'form closes after sending')
    pg.click('#openSettings');pg.wait_for_timeout(300);pg.click('.setlinks .fbopen[data-kind=feature]');pg.wait_for_timeout(500)
    check(pg.is_visible('#modalBody textarea') and 'What you’ve sent' in pg.inner_text('#modalBody'),'Settings → Suggest a feature opens the form, with your earlier feedback listed')
    pg.goto('http://localhost:8808/site/index.html#admin');pg.wait_for_timeout(2000)
    check('only for the site owner' in pg.inner_text('#view-admin'),'members get no dashboard')
    if errs: fails.append('errors '+str(errs))
    pg.close()
    # the owner
    pg=b.new_page(viewport={'width':1240,'height':900});errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.add_init_script('window.__seedDb='+json.dumps({'profile':{'privacy_set':True},'feedback':[{k:v for k,v in x.items() if k not in('name','handle')}|{'user_id':'u9'} for x in stats['feedback']]})+';window.__rpcData={is_admin:true,admin_stats:'+json.dumps(stats)+'};')
    pg.goto('http://localhost:8808/site/index.html#admin');pg.wait_for_timeout(2500)
    t=pg.inner_text('#view-admin'); print('TEXT', t[:400].replace('\n',' | '))
    check(pg.is_visible('#acct .adminonly'),'the owner sees the Dashboard link')
    check('42' in t and 'ACTIVE TODAY' in t.upper() and '3,120' in t and 'VISITORS' in t.upper(),'tiles: members, active, activities, visitors')
    check(pg.locator('#view-admin svg.adchart').count()==5,'five charts')
    box=pg.locator('#view-admin svg.adchart').nth(3).bounding_box();pg.mouse.move(box['x']+box['width']*.6,box['y']+box['height']*.5);pg.wait_for_timeout(200)
    tip=pg.locator('#view-admin .adtip').nth(3)
    check(tip.is_visible() and 'Uploaded' in tip.inner_text(),'hover shows the day\'s numbers')
    check('Upload stuck at 90%' in t and 'Turbo trainer' in t and 'Bea Moss' in t and 'bea@example.com' in t,'feedback and newest members listed')
    row=pg.locator('.adfbrow').filter(has_text='Upload stuck');row.locator('select').select_option('planned');row.locator('input').fill('Fix coming this week');row.locator('button:has-text("Save")').click();pg.wait_for_timeout(700)
    f=pg.evaluate("__db.feedback.find(x=>x.id==='f1')")
    check(f['status']=='planned' and f['admin_note']=='Fix coming this week','status and reply saved')
    with pg.expect_download() as d: pg.click('button:has-text("Download CSV")')
    csv=open(d.value.path()).read().splitlines()
    check(csv[0].startswith('day,signups,active') and len(csv)==31,'CSV of the daily figures')
    pg.click('.adhead .chip:has-text("Year")');pg.wait_for_timeout(800)
    check(pg.locator('#view-admin svg.adchart').count()==5,'switching the period reloads')
    if errs: fails.append('errors '+str(errs))
    pg.set_viewport_size({'width':390,'height':844});pg.wait_for_timeout(300)
    print('WIDE', pg.evaluate("[...document.querySelectorAll('#view-admin *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,5).map(e=>e.tagName+'.'+e.className+' '+Math.round(e.getBoundingClientRect().right))"))
    check(pg.evaluate("document.documentElement.scrollWidth<=innerWidth+1"),'dashboard fits a phone')
finally: srv.terminate()
print('FAILED '+str(len(fails)) if fails else 'ALL PASSED')
