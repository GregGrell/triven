# 11 Fitness, form and training load
from compose import *
from common import *
FILE = '12-fitness-form-and-training-load'
def SETUP(): return {'path': '#log'}
def film(f):
    S = {}; pg = f.pg
    scroll(f, '#logPmc', offset=70, wait=900); S['pmc'] = f.shot('pmc', '#logPmc')
    b = pg.locator('#logPmc svg').first.bounding_box(); S['hov'] = []
    for k in range(6):
        pg.mouse.move(b['x'] + b['width'] * (.55 + k * .07), b['y'] + b['height'] * .35); pg.wait_for_timeout(250); S['hov'].append(f.shot('hov', '#logPmc'))
    pg.mouse.move(5, 5)
    scroll(f, '#logPerf', offset=70, wait=800); S['perf'] = f.shot('perf', '#logPerf')
    S['status'] = f.shot('status', '#logPerf .card >> nth=0')
    S['thr'] = f.shot('thr', '#logPerf .card >> nth=1')
    scroll(f, '#logPerf .card:has-text("Race predictor")', offset=70, wait=700); S['pred'] = f.shot('pred', '#logPerf .card:has-text("Race predictor")')
    f.nav('#feed', 1500); S['week'] = f.shot('week', '#view-feed .card:has-text("This week")')
    return S
def scenes(S):
    hv = S['hov']
    return [
      Title(12, 'Fitness, form and training load', 'How hard you’ve trained, and whether you’re fresh or tired.'),
      Card('Training load', [('Every activity gets a load score', 'From heart rate, power or swim pace, against your thresholds. An hour flat out at threshold scores 100.'),
                             ('Fitness', 'Your load averaged over the last six weeks.'), ('Fatigue', 'Your load over the last week.'),
                             ('Form', 'Fitness minus fatigue. Negative means tired; positive means fresh.')], per=1.3),
      Screen([S['pmc']], 'The fitness and form chart, for 6 weeks up to a year.', zoom=1.08),
      Screen([(p, b, .5) for p, b in hv] + [(hv[-1][0], hv[-1][1], 1.2)], 'Hover any day to see the numbers.', zoom=1.08, z0=1.08),
      Screen([S['status']], 'Training status reads the trend: building, productive, maintaining, overreaching or detraining.', zoom=1.2),
      Screen([S['thr']], 'Thresholds: Triven suggests new values when a hard session shows you’ve improved.', zoom=1.2),
      Screen([S['pred']], 'The race predictor, from your best recent efforts.', zoom=1.15),
      Screen([S['week']], 'On the feed: this week’s load against the range that suits you.', zoom=1.3),
      Card('Get it right', ['Set your threshold heart rates, FTP and swim CSS in Settings. Load is only as good as these.',
                            'Thresholds are kept by date, so a change doesn’t rewrite your history.'], kind='bullets', per=1.0),
      End('Race calendar and taper'),
    ]
