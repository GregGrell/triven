# Names, gear and a race on the imported demo data; writes demo/snapshot_final.json
import json
s=json.load(open('demo/snapshot.json'));db=s['db']
acts=sorted(db['activities'],key=lambda a:a['start_time'])
db['gear']=[
 {'id':'g-shoe1','owner':'u1','kind':'shoe','name':'Daily trainers','brand':'Asics','model':'Novablast','start_km':0,'replace_km':800,'retired':False,'is_default_for':'run:road','in_use_from':None},
 {'id':'g-shoe2','owner':'u1','kind':'shoe','name':'Race shoes','brand':'Saucony','model':'Endorphin Pro','start_km':40,'replace_km':500,'retired':False,'is_default_for':'run:race','in_use_from':None},
 {'id':'g-bike1','owner':'u1','kind':'bike','name':'Road bike','brand':'Canyon','model':'Endurace','start_km':3200,'replace_km':None,'retired':False,'is_default_for':'bike:road','in_use_from':None},
 {'id':'g-bike2','owner':'u1','kind':'bike','name':'TT bike','brand':'Cervélo','model':'P-Series','start_km':900,'replace_km':None,'retired':False,'is_default_for':'bike:race','in_use_from':None}]
secs={}
for x in db['activity_sections']: secs.setdefault(x['activity_id'],[]).append(x)
for a in acts:
  d=a['start_time'][:10]; wd=__import__('datetime').date.fromisoformat(d).weekday()
  if a['sport']=='multi':
    a['name']='Serpentine Sprint Triathlon'; a['is_race']=True
    a['description']='First tri of the season. Choppy swim, fast bike, legs gone on the run.'
    for x in secs.get(a['id'],[]):
      if x['sport']=='bike': x['gear_id']='g-bike2'
      if x['sport']=='run': x['gear_id']='g-shoe2'
  elif a['sport']=='run':
    a['gear_id']='g-shoe1'
    if wd==6 and a["distance_m"]<10600 and a["distance_m"]>9500 and a['start_time'][11:13]=='09':
      a['name']="Regent's Park 10K"; a['is_race']=True; a['gear_id']='g-shoe2'; a['description']='New 10K PB. Negative split, just.'
      continue
    if wd==1: a['name']='Intervals: 6 × 4 min'
    elif wd==6: a['name']='Sunday long run'
    else: a['name']='Easy run, Hyde Park'
  elif a['sport']=='bike':
    a['gear_id']='g-bike1'
    a['name']='Surrey Hills loop' if a['distance_m']>45000 else 'Richmond Park laps'
  elif a['sport']=='swim':
    a['name']='Pool: 8 × 100'
db['profiles'][0]['settings']['races']=[
  {'id':'r-tri1','name':'Serpentine Sprint Triathlon','date':'2026-09-13','kind':'triathlon','dist':'Sprint','pri':'B','goal':4500},
  {'id':'r-half','name':'Cambridge Half Marathon','date':'2027-03-07','kind':'run','dist':'Half marathon','pri':'B','goal':5700},
  {'id':'r-703','name':'Mallorca 70.3','date':'2027-05-08','kind':'triathlon','dist':'70.3','pri':'A','goal':19800}]
json.dump(s,open('demo/snapshot_final.json','w'))
print(len(acts), [a['name'] for a in acts[-8:]])
