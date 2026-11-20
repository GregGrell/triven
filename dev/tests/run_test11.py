# Pool swim: upload the generated pool swim, check swim time, pace, bests, and the swim card (sets, lengths, SWOLF).
import os, subprocess, time, json
DEV=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT=os.path.join(DEV,'out');os.makedirs(OUT,exist_ok=True)
FIT=os.path.join(DEV,'fixtures','pool_swim.fit')
if not os.path.exists(FIT): subprocess.run(['node','node/make_pool_swim.mjs',FIT],cwd=DEV,check=True)
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8788'],cwd=DEV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
fails=[]
def check(c,m):
  print(('  ok  ' if c else '  FAIL ')+m)
  if not c: fails.append(m)
try:
  with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page(viewport={'width':1240,'height':950})
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)+' '+(e.stack or '')[:300]))
    pg.add_init_script("window.__seedDb={profile:{privacy_set:true}};")
    pg.goto('http://localhost:8788/site/index.html#upload');pg.wait_for_timeout(1500)
    pg.set_input_files('#fileIn',[FIT]);pg.wait_for_timeout(5000)
    a=pg.evaluate("__db.activities[0]")
    check(a and a['moving_s']==1265 and a['elapsed_s']==1510,f"swim time excludes rest: moving {a and a['moving_s']} of {a and a['elapsed_s']}")
    bests=pg.evaluate("__db.best_efforts.map(b=>b.effort+'='+b.value)");check(sorted(bests)==['100 m=79','200 m=207'],'pool bests only from continuous swimming (no 400: never swam 400 m without a rest): '+str(bests))
    pg.goto(f"http://localhost:8788/site/index.html#a/{a['id']}");pg.wait_for_timeout(3000)
    t=pg.inner_text('#swimcard') if pg.is_visible('#swimcard') else ''
    check('1:37 /100 m' in t,'pace on swimming time (1265 s / 1300 m = 1:37): '+t[:160].replace('\n',' '))
    check('52 × 25 m' in t and 'SWOLF' in t and 'Breaststroke' in t and 'Drill' in t,'lengths, SWOLF and stroke mix shown')
    st=pg.inner_text('#stats');check('Swim time' in st and '/100 m' in st and 'Rest' in st,'top stats: swim time, pace /100 m, rest: '+st.replace('\n',' ')[:140])
    sets=pg.locator('#swimcard tr.lap').count();check(sets==11,f'11 sets found from the rests ({sets})')
    pg.locator('#swimcard tr.lap').nth(1).click();pg.wait_for_timeout(200)
    check(pg.locator('#swimcard tr.swimlen:visible').count()==4,'clicking a set shows its 4 lengths')
    pg.locator('#swimcard').screenshot(path=os.path.join(OUT,'t11_swim.png'))
    pg.goto('http://localhost:8788/site/index.html#log/bests');pg.wait_for_timeout(1500)
    sw=pg.inner_text('#pbSwim');print('   pbSwim:',sw[:200].replace('\n',' | '));check('SWIMMING BESTS' in pg.inner_text('#logBests').upper() and '1:19' in sw,'swimming bests table shows the 100 m')
    # history imported before the fix gets corrected in the background
    seed=json.load(open('/tmp/oldseed.json'))
    pg2=b.new_page();pg2.add_init_script('window.__seedDb='+json.dumps(seed['db'])+';window.__seedFiles='+json.dumps(seed['files'])+';')
    pg2.on('pageerror',lambda e:errs.append(str(e)))
    pg2.goto('http://localhost:8788/site/index.html#feed');pg2.wait_for_timeout(6000)
    st=pg2.evaluate("({m:__db.activities[0].moving_s,b:__db.best_efforts.map(x=>x.effort+'='+x.value).sort(),v:__db.activity_sections[0].summary.swimV})")
    check(st['m']==1265 and st['b']==['100 m=79','200 m=207'] and st['v']==1,'old pool swim fixed in the background: '+json.dumps(st))
    print('ERRORS',errs)
    if errs: fails.append('errors')
finally: srv.terminate()
print('FAILED '+str(len(fails)) if fails else 'ALL PASSED')
