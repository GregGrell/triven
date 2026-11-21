import sys, os, json; sys.path.insert(0, os.path.dirname(__file__))
from film import Film, build_site
build_site()
f = Film('/tmp/survey')
db = json.load(open(os.path.join(os.path.dirname(__file__), 'snapshot_final.json')))['db']
acts = sorted(db['activities'], key=lambda a: a['start_time'])
pick = {'tri': next(a for a in acts if a['sport'] == 'multi'), 'run': acts[-1], 'ride': [a for a in acts if a['sport'] == 'bike'][-1], 'swim': [a for a in acts if a['sport'] == 'swim'][-1], 'ivl': [a for a in acts if a['name'].startswith('Intervals')][-1]}
json.dump({k: v['id'] for k, v in pick.items()}, open('/tmp/survey/ids.json', 'w'))
for name, h in [('log', '#log'), ('acts', '#log/activities'), ('races', '#log/races'), ('bests', '#log/bests'), ('gear', '#gear'), ('people', '#club'), ('upload', '#upload'), ('me', '#me')] + [(k, '#a/' + v['id']) for k, v in pick.items()]:
    f.nav(h, 3000); f.pg.screenshot(path=f'/tmp/survey/{name}.jpg', type='jpeg', quality=70, full_page=True)
f.close()
