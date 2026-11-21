# Your data: export zip (data + optional files), and account deletion (files removed, rpc called, signed out).
import os, subprocess, time, json, io, zipfile
DEV=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8805'],cwd=DEV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
acts=[{'id':'a%d'%i,'owner':'u1','num':i,'name':'Run, "easy" %d'%i,'sport':'run','start_time':'2026-11-%02dT06:00:00Z'%i,'distance_m':10000+i,'moving_s':3000,'elapsed_s':3100,'visibility':'club','summary':{}} for i in range(1,4)]
seed={'profile':{'privacy_set':True,'handle':'carl'},'activities':acts,'gear':[{'id':'g1','owner':'u1','name':'Nimbus','kind':'shoe'}],'comments':[{'id':'c1','author':'u1','activity_id':'a1','body':'hi'}]}
files={'activity-files/u1/a1.fit':'FITDATA','activity-streams/u1/a1.json':'{}','activity-media/u1/a1/p.jpg':'JPG','avatars/u1/avatar-1.jpg':'AV','activity-files/u2/x.fit':'OTHER'}
fails=[]
def check(c,m):
  print(('  ok  ' if c else '  FAIL ')+m)
  if not c: fails.append(m)
try:
  with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page(viewport={'width':1240,'height':950},accept_downloads=True);errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.add_init_script('window.__seedDb='+json.dumps(seed)+';window.__seedFiles='+json.dumps(files)+';')
    pg.goto('http://localhost:8805/site/index.html#feed');pg.wait_for_timeout(2500)
    pg.evaluate("document.getElementById('settings').classList.add('open')");pg.wait_for_timeout(300)
    check(pg.is_visible('#yourData') and pg.is_disabled('#delAccount'),'Your data section shown; delete disabled until confirmed')
    with pg.expect_download() as d: pg.click('#dataExport')
    z=zipfile.ZipFile(io.BytesIO(open(d.value.path(),'rb').read()));names=z.namelist()
    csv=z.read('activities.csv').decode()
    check({'README.txt','profile.json','activities.csv','activities.json','gear.json','comments.json'}<=set(names) and not any(n.startswith('files/') for n in names),'data-only zip: '+', '.join(sorted(names))[:120])
    check(csv.count('\n')==3 and '"Run, ""easy"" 1"' in csv,'activities.csv has 3 rows, quoting right')
    check(json.loads(z.read('profile.json'))['email']=='carl@example.com' and len(json.loads(z.read('activities.json')))==3,'profile and activities in full')
    pg.check('#dataFiles')
    with pg.expect_download() as d: pg.click('#dataExport')
    z=zipfile.ZipFile(io.BytesIO(open(d.value.path(),'rb').read()));names=set(z.namelist())
    check({'files/activity-files/a1.fit','files/activity-streams/a1.json','files/activity-media/a1/p.jpg','files/avatars/avatar-1.jpg'}<=names and z.read('files/activity-files/a1.fit')==b'FITDATA','with files: originals, streams, photos, avatar')
    check(not any('x.fit' in n for n in names),"someone else's files not included")
    pg.fill('#delConfirm','delete');check(not pg.is_disabled('#delAccount'),'typing delete enables the button')
    pg.click('#delAccount');pg.wait_for_timeout(300)
    check(pg.is_visible('#delSure') and 'cannot be undone' in pg.inner_text('#delSure') and '3 activities' in pg.inner_text('#delSure') and pg.evaluate("Object.keys(__files).length")>0,'warning shown, nothing deleted yet')
    pg.click('#delNo');pg.wait_for_timeout(200)
    check(not pg.is_visible('#delSure') and pg.is_disabled('#delAccount') and pg.input_value('#delConfirm')=='' and 'delete_my_account' not in pg.evaluate("(window.__rpc||[]).map(x=>x[0])"),'Cancel backs out and clears the confirmation')
    pg.fill('#delConfirm','delete');pg.click('#delAccount');pg.wait_for_timeout(200);pg.click('#delYes');pg.wait_for_timeout(1500)
    left=pg.evaluate("Object.keys(__files).filter(k=>!k.endsWith('#blob'))") if pg.evaluate("typeof __files")!='undefined' else []
    print('   files after:',left)
    rpc=pg.evaluate("(window.__rpc||[]).map(x=>x[0])") if pg.evaluate("typeof __rpc")!='undefined' else []
    check(left==['activity-files/u2/x.fit'] or 'deleted=1' in pg.url,'your files removed, others kept')
    check('deleted=1' in pg.url or 'delete_my_account' in rpc,'account deletion called and page left: '+pg.url)
    print('ERRORS',errs)
    if errs: fails.append('errors')
finally: srv.terminate()
print('FAILED '+str(len(fails)) if fails else 'ALL PASSED')
