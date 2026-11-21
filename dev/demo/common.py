import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
_db = None
def db():
    global _db
    if _db is None: _db = json.load(open(os.path.join(HERE, 'snapshot_final.json')))['db']
    return _db
def acts(): return sorted(db()['activities'], key=lambda a: a['start_time'])
def find(pred): return [a for a in acts() if pred(a)]
def tri(): return find(lambda a: a['sport'] == 'multi')[0]
def last(sport=None, name=None): return [a for a in acts() if (not sport or a['sport'] == sport) and (not name or a['name'].startswith(name))][-1]
def scroll(f, sel, block='start', offset=0, wait=500):
    loc = f.pg.locator(sel).first
    if not loc.count(): return
    loc.evaluate("(e,o)=>{const r=e.getBoundingClientRect();window.scrollBy(0,r.top-o)}", offset); f.pg.wait_for_timeout(wait)
def top(f, wait=300): f.pg.evaluate('window.scrollTo(0,0)'); f.pg.wait_for_timeout(wait)
