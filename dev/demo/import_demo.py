# Imports the generated demo files through the real app (mock backend) and saves the resulting database + files.
import os, subprocess, time, json, sys
from playwright.sync_api import sync_playwright
DEV=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC=sys.argv[1] if len(sys.argv)>1 else '/tmp/demo'
files=[os.path.join(SRC,f) for f in json.load(open(SRC+'/files.json'))]
prof={'display_name':'Sam Carter','handle':'samc','privacy_set':True,'settings':{'lthrRun':168,'lthrBike':160,'maxHr':186,'restHr':48,'zones':[85,90,95,100,103],'balLo':48.5,'balHi':51.5,'balMin':10,'mass':68,'bikeMass':8.5,'cda':0.27,'crr':0.004,'css':102,'ftp':240,'units':'metric','dob':'1988-04-12'}}
gear=[{'id':'g-shoe1','owner':'u1','kind':'shoe','name':'Daily trainers','brand':'','roles':['run:road'],'start_km':0,'retired':False},
      {'id':'g-bike1','owner':'u1','kind':'bike','name':'Road bike','brand':'','roles':['bike:road','bike:race'],'start_km':1200,'retired':False}]
srv=subprocess.Popen(['python3','-m','http.server','8810'],cwd=DEV,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);time.sleep(1)
try:
  with sync_playwright() as p:
    b=p.chromium.launch();pg=b.new_page(viewport={'width':1280,'height':800});errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.add_init_script('window.__seedDb='+json.dumps({'profile':prof,'gear':gear})+';')
    pg.goto('http://localhost:8810/site/index.html#upload');pg.wait_for_timeout(2500)
    for i in range(0,len(files),10):
      pg.set_input_files('#fileIn',files[i:i+10])
      for _ in range(240):
        pg.wait_for_timeout(1000)
        n=pg.evaluate("__db.activities.length")
        if n>=min(i+10,len(files)): break
        # answer a combine prompt if one shows up
        if pg.is_visible('text=Keep separate'): pg.click('text=Keep separate')
      print('imported',n,flush=True)
    pg.wait_for_timeout(3000)
    snap=pg.evaluate("JSON.stringify({db:__db,files:Object.fromEntries(Object.entries(__files).filter(([k,v])=>!k.endsWith('#blob')&&typeof v==='string'&&!k.startsWith('activity-files/')))})")
    open(DEV+'/demo/snapshot.json','w').write(snap)
    print('errors',errs[:3]); print('snapshot', len(snap)//1024,'KB')
finally: srv.terminate()
