# 08 Gear and mileage
from compose import *
from common import *
FILE = '09-gear-and-mileage'
def SETUP(): return {'path': '#gear'}
def film(f):
    S = {}; pg = f.pg
    S['list'] = f.shot('list', '#view-gear')
    S['bar'] = f.shot('bar', '#view-gear .card >> nth=0')
    pg.locator('#view-gear button').filter(has_text='Add shoes').click(); pg.wait_for_timeout(900)
    S['new'] = f.shot('new', '#modalBody')
    S['name'] = f.type_frames('#modalBody input >> nth=0', 'Trail shoes', 'name', every=2, hl='#modalBody')
    pg.locator('#modalBody input').nth(1).fill('Hoka'); pg.locator('#modalBody input').nth(2).fill('Speedgoat')
    pg.locator('#modalBody .segrow .chip').filter(has_text='Trail').click(); pg.wait_for_timeout(300)
    S['roles'] = f.shot('roles', '#modalBody')
    pg.locator('#modalBody button.primary').click(); pg.wait_for_timeout(1800)
    S['after'] = f.shot('after', '#view-gear .card >> nth=0')
    return S
def scenes(S):
    return [
      Title(9, 'Gear and mileage', 'Know when your shoes are done, and what each bike has covered.'),
      Screen([S['list']], 'The Gear tab lists your shoes and bikes with the distance each has done.', zoom=1.05),
      Screen([S['bar']], 'The bar fills towards the distance you plan to replace them at.', zoom=1.2),
      Screen([S['new']], 'Add shoes or a bike: name, brand and model.', zoom=1.12),
      Screen([(p, S['new'][1], .18) for p, _ in S['name']] + [(S['name'][-1][0], S['new'][1], .8)], 'Give it a name you’ll recognise.', zoom=1.12, z0=1.12),
      Screen([S['roles']], 'Use automatically for: everyday runs, trail, track, treadmill or races. New activities pick the right pair.', zoom=1.12),
      Screen([S['roles']], 'In use from: only activities from that date get it, so an old history isn’t credited to new shoes.', zoom=1.12, z0=1.12),
      Screen([S['after']], 'Saved. Change the gear on any activity from Edit details.', zoom=1.15),
      Card('Good to know', ['Multisport races credit each leg’s own gear: the bike leg to your bike, the run to your shoes.',
                            'Distance already done: add what the shoes or bike had covered before Triven.',
                            'Retire gear when it’s finished. Its history stays.'], kind='bullets', per=1.0),
      End('The training log'),
    ]
