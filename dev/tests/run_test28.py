# Phone-width header: every header control fits on screen; Help and Sign out are in Settings there.
import os, subprocess, time, json
DEV=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8807'],cwd=DEV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
fails=[]
def check(c,m):
  print(('  ok  ' if c else '  FAIL ')+m)
  if not c: fails.append(m)
try:
  with sync_playwright() as p:
    b=p.chromium.launch()
    for w in (360,390,430,620,700,768,900,1240):
      pg=b.new_page(viewport={'width':w,'height':800});errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
      pg.add_init_script('window.__seedDb='+json.dumps({'profile':{'privacy_set':True,'display_name':'Sam Carter'}})+';')
      pg.goto('http://localhost:8807/site/index.html#feed');pg.wait_for_timeout(2200)
      out=pg.evaluate("[...document.querySelectorAll('#acct > *, #acct .bellwrap > button')].filter(e=>e.offsetParent).map(e=>[e.id||e.textContent.trim().slice(0,12),Math.round(e.getBoundingClientRect().right)]).filter(x=>x[1]>innerWidth)")
      check(not out, f'{w}px: everything in the header fits {out}')
      check(pg.evaluate("document.documentElement.scrollWidth<=innerWidth"), f'{w}px: no sideways scroll')
      pg.click('#openSettings');pg.wait_for_timeout(500)
      check(pg.is_visible('#signOut2') and pg.is_visible('.setlinks a:has-text("Help")') and pg.is_visible('.setlinks .fbopen'), f'{w}px: Help and Sign out in Settings')
      if w==1240: check(pg.is_visible('#signOut'),'wide screens keep Sign out in the header')
      if errs: fails.append('errors '+str(errs))
      pg.close()
finally: srv.terminate()
print('FAILED '+str(len(fails)) if fails else 'ALL PASSED')
