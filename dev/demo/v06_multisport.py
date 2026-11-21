# 06 Multisport activities
from compose import *
from common import *
FILE = '06-multisport-activities'
def film(f):
    S = {}; pg = f.pg
    f.nav('#a/' + tri()['id'], 4000)
    S['top'] = f.shot('top', '#stats'); S['seg'] = f.shot('seg', '#segbar')
    pg.locator('#selrow button, #selrow .chip').filter(has_text='Bike').first.click(); pg.wait_for_timeout(1500); top(f)
    S['bike'] = f.shot('bike', '#stats')
    pg.locator('#selrow button, #selrow .chip').filter(has_text='T1').first.click(); pg.wait_for_timeout(1200); top(f)
    S['t1'] = f.shot('t1', '#stats')
    pg.locator('#selrow button, #selrow .chip').filter(has_text='Whole race').first.click(); pg.wait_for_timeout(1500)
    scroll(f, '#mapsvg', offset=110, wait=1500); S['map'] = f.shot('map', '#mapsvg')
    scroll(f, '#chartscard', offset=20, wait=800); S['charts'] = f.shot('charts', '#chartscard')
    scroll(f, '.card:has(table) >> nth=-1', offset=60, wait=600); S['laps'] = f.shot('laps', '.card:has(table) >> nth=-1 >> table')
    top(f); pg.click('#actTools .ddwrap > button'); pg.wait_for_timeout(500)
    S['menu'] = f.shot('menu', '#actEditMenu')
    return S
def scenes(S):
    return [
      Title(6, 'Multisport activities', 'A triathlon is one race, so Triven keeps it as one activity.'),
      Card('Recognised automatically', [('Triathlon', 'swim, bike, run'), ('Duathlon', 'run, bike, run'), ('Aquathlon', 'swim, run'), ('Also', 'aquabike, swimrun and bike–run bricks')], kind='bullets', per=.8,
           eyebrow='Upload or sync a multisport file'),
      Screen([S['top']], 'The whole race: total time, distance and transition time together.', zoom=1.2),
      Screen([S['seg']], 'Each leg and transition on one bar, drawn to scale.', zoom=1.25),
      Screen([S['bike']], 'Click a leg to see it on its own: here, the bike, with its speed and power.', zoom=1.25),
      Screen([S['t1']], 'Transitions too. T1 and T2 are timed separately.', zoom=1.25),
      Screen([S['map']], 'The route shows each leg in its own colour.', zoom=1.12),
      Screen([S['charts']], 'Charts switch from swim to bike to run along the race.', zoom=1.04),
      Screen([S['laps']], 'Laps carry their leg, so you can compare splits within each discipline.', zoom=1.12),
      Screen([S['menu']], 'Recorded the legs as separate files? Edit → Link activities joins them into one race.', zoom=1.35),
      Card('Good to know', ['Leg totals count in their own sport: the bike leg adds to your cycling, the run to your running.',
                            'Each leg gets its own gear: race bike for the bike, race shoes for the run.',
                            'Best efforts and trophies come from inside the legs too.'], kind='bullets', per=1.0),
      End('Editing an activity'),
    ]
