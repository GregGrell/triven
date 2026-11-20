import os
DEV=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT=os.path.join(DEV,'out');os.makedirs(OUT,exist_ok=True)
FIT=os.environ.get('TRIVEN_FIT',os.path.join(DEV,'fixtures','multisport.fit'))
import subprocess,time
from playwright.sync_api import sync_playwright
srv=subprocess.Popen(['python3','-m','http.server','8775'],cwd=DEV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
FIT=FIT;U='http://localhost:8775/site/index.html'
try:
  with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page(viewport={'width':1240,'height':950},color_scheme='dark')
    errs=[];pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e)))
    pg.goto(U);pg.wait_for_timeout(1200)
    pg.goto(U+'#upload');pg.wait_for_timeout(300);pg.set_input_files('#fileIn',FIT);pg.wait_for_timeout(3500)
    aid=pg.evaluate("__db.activities[0].id")
    pg.goto(U+'#a/'+aid);pg.wait_for_timeout(2500)
    print('svgs', pg.evaluate("[...document.querySelectorAll('#lmap svg')].map(s=>s.getAttribute('class')+':'+Math.round(s.getBoundingClientRect().width)+'x'+Math.round(s.getBoundingClientRect().height)).join(' ')"), 'attr', pg.inner_text('.leaflet-control-attribution'));pg.locator('#lmap').screenshot(path=os.path.join(OUT,'lmap.png'))
    print('laps rows', pg.evaluate("document.querySelectorAll('tr.lap').length"))
    g="[...document.querySelectorAll('#charts .chart')].map(c=>c.querySelector('.t').firstChild.textContent+': '+c.querySelector('.cur').dataset.avg).join(' | ')"
    print('before', pg.evaluate(g))
    for i in range(11):
      pg.click(f'tr.lap >> nth={i}');pg.wait_for_timeout(700)
      print(i, pg.evaluate("document.querySelectorAll('tr.lap')["+str(i)+"].innerText.replace(/\\s+/g,' ')")[:50], '=>', pg.evaluate(g)[:150])
      if i==4: print('banner:', pg.inner_text('#chartsel'), '| charts top in view:', round(pg.evaluate("document.querySelector('#chartscard').getBoundingClientRect().top"))); pg.screenshot(path=os.path.join(OUT,'lap4.png'))
      pg.click(f'tr.lap >> nth={i}',force=True);pg.wait_for_timeout(500)
    print('charts top', pg.evaluate("document.querySelector('#charts').getBoundingClientRect().top+scrollY"), 'laps top', pg.evaluate("document.querySelector('tr.lap').getBoundingClientRect().top+scrollY"))
    pg.screenshot(path=os.path.join(OUT,'lap.png'),full_page=True)
    pg.evaluate("__db.activity_sections.splice(1);__db.activities[0].sport='run';__db.activities[0].multisport_profile=null")
    pg.goto(U+'#a/'+aid+'?single');pg.wait_for_timeout(2500)
    print('single: segbar hidden', pg.evaluate("document.getElementById('segbar').hidden"), 'chips hidden', pg.evaluate("document.getElementById('selrow').hidden"))
    pg.click('tr.lap >> nth=0');pg.wait_for_timeout(800);print('single banner:', pg.inner_text('#chartsel').replace('\n',' '))
    print('ERRORS',errs)
finally: srv.terminate()
