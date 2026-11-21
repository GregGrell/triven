# 09 The training log: totals, calendar and search
from compose import *
from common import *
FILE = '10-the-training-log'
def SETUP(): return {'path': '#log'}
def film(f):
    S = {}; pg = f.pg
    S['month'] = f.shot('month', '#logMain .card >> nth=0')
    pg.click('#view-log [data-p=year]'); pg.wait_for_timeout(1200); S['year'] = f.shot('year', '#logMain .card >> nth=0')
    S['side'] = f.shot('side', '#logSide')
    pg.click('#view-log [data-p=week]'); pg.wait_for_timeout(1000)
    scroll(f, '#logCal', offset=70, wait=800); S['cal'] = f.shot('cal', '#logCal')
    f.nav('#log/activities', 1500); S['acts'] = f.shot('acts', '#logActs')
    S['q'] = f.type_frames('#logActs input[type=search]', 'long run', 'q', every=2, hl='#logActs')
    pg.wait_for_timeout(800); S['res'] = f.shot('res', '#logActs')
    return S
def scenes(S):
    q = S['acts'][1]
    return [
      Title(10, 'The training log', 'Totals, trends, your calendar and every activity, searchable.'),
      Screen([S['month']], 'Totals by sport for the week, month or year, or any dates you pick.', zoom=1.12),
      Screen([S['year']], 'Year view breaks it down month by month.', zoom=1.12),
      Screen([S['side']], 'Alongside: your year so far, with the longest swim, ride and run.', zoom=1.3),
      Screen([S['cal']], 'The calendar shows each day’s sessions and training load, with weekly totals on the right.', zoom=1.08),
      Screen([S['acts']], 'Activities lists everything you’ve done. Sort by any column.', zoom=1.08),
      Screen([(p, q, .2) for p, _ in S['q']] + [(S['res'][0], q, 2.8)], 'Search names, notes, gear, races or a month. Filters narrow it by sport, date and distance.', zoom=1.08, z0=1.08),
      Card('Good to know', ['Multisport races count once as an activity, and each leg adds to its own sport.',
                            'Press / anywhere, or the magnifier at the top, to jump to search.',
                            'Click any day or row to open the activity.'], kind='bullets', per=1.0),
      End('Goals'),
    ]
