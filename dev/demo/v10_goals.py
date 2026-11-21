# 10 Goals
from compose import *
from common import *
FILE = '11-goals'
def film(f):
    S = {}; pg = f.pg
    S['side'] = f.shot('side', '#view-feed aside, .feedside')
    pg.locator('button.linkbtn').filter(has_text='Set goals').first.click(); pg.wait_for_timeout(900)
    S['modal'] = f.shot('modal', '#modalBody')
    rows = pg.locator('#modalBody .goalrow')
    def fill(i, v, metric=None):
        r = rows.nth(i)
        if metric: r.locator('select').select_option(metric)
        return f.type_frames(f'#modalBody .goalrow >> nth={i} >> input', v, 'g', hl='#modalBody')
    S['w'] = fill(1, '150') + fill(2, '40') + fill(0, '3')
    pg.locator('#modalBody .chip').filter(has_text='Monthly').click(); pg.wait_for_timeout(400)
    S['m'] = fill(3, '45', 'time')
    pg.locator('#modalBody .chip').filter(has_text='Annual').click(); pg.wait_for_timeout(400)
    S['y'] = fill(2, '2000')
    pg.locator('#modalBody button.primary').click(); pg.wait_for_timeout(1500)
    top(f, 400)
    h = pg.get_by_text('Goals', exact=True).first
    # the sidebar is sticky: fold away the cards above the goals so they come into view
    h.evaluate("e=>{const c=e.closest('.card');let p=c.previousElementSibling;while(p){p.style.display='none';p=p.previousElementSibling}}"); pg.wait_for_timeout(500)
    bx = h.evaluate("e=>{const c=e.closest('.card');const r=e.getBoundingClientRect(),q=c.getBoundingClientRect();return [q.x,r.y-12,q.width,Math.min(q.bottom,720)-r.y+12]}")
    S['panel'] = f.shot('panel', tuple(round(v * 1.5) for v in bx))
    return S
def scenes(S):
    md = S['modal'][1]; seq = lambda k: [(p, md, .16) for p, _ in S[k]]
    return [
      Title(11, 'Goals', 'Weekly, monthly and annual targets for each sport.'),
      Screen([S['modal']], 'In the feed sidebar, click Set goals.', zoom=1.12),
      Screen(seq('w') + [(S['w'][-1][0], md, 1.2)], 'Weekly: a distance, time or climbing target per sport, or for everything together.', zoom=1.12, z0=1.12),
      Screen(seq('m') + [(S['m'][-1][0], md, 1.2)], 'Monthly: here, 45 hours of training across all sports.', zoom=1.12, z0=1.12),
      Screen(seq('y') + [(S['y'][-1][0], md, 1.2)], 'Annual: 2,000 km of running this year.', zoom=1.12, z0=1.12),
      Screen([S['panel']], 'Your progress sits in the sidebar. The tick shows where you should be by today, so you know if you’re ahead or behind.', zoom=1.3),
      Card('Good to know', ['Multisport legs count towards their own sport.', 'Leave a box empty for no goal.', 'Goals are private to you.'], kind='bullets', per=1.0),
      End('Fitness, form and training load'),
    ]
