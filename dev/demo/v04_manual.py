# 04 Logging an activity without a file
from compose import *
from common import *
FILE = '04-logging-an-activity-without-a-file'
def SETUP(): return {'path': '#upload'}
def film(f):
    S = {}; pg = f.pg
    scroll(f, '#manualBox', offset=90); S['form'] = f.shot('form', '#manualBox .card')
    pg.click('#manualBox .chip[data-k=bike]'); pg.wait_for_timeout(300)
    row = '#manualBox .mleg'
    sel = pg.locator(row + ' select').nth(1)
    opts = sel.evaluate("s=>[...s.options].map(o=>o.value)"); print('bike types', opts)
    sel.select_option('indoor' if 'indoor' in opts else opts[0]); pg.wait_for_timeout(200)
    S['kind'] = f.shot('kind', '#manualBox .card')
    S['t1'] = f.type_frames(row + ' input[placeholder="h:mm:ss"]', '1:00:00', 'dur', hl='#manualBox .card')
    S['t2'] = f.type_frames(row + ' input[type=number] >> nth=0', '32.5', 'dist', hl='#manualBox .card')
    S['t3'] = f.type_frames(row + ' input[placeholder="avg HR"]', '141', 'hr', hl='#manualBox .card')
    S['t4'] = f.type_frames('#manualBox input[placeholder="Name (optional)"]', 'Turbo: sweet spot 3 × 12 min', 'name', every=3, hl='#manualBox .card')
    S['save'] = f.shot('save', '#manualBox button.primary')
    pg.click('#manualBox button.primary'); pg.wait_for_timeout(2500)
    top(f); S['after'] = f.shot('after')
    return S
def scenes(S):
    card = S['form'][1]
    seq = lambda k: [(p, card, .12) for p, _ in S[k]]
    return [
      Title(4, 'Logging an activity without a file', 'A treadmill run, a turbo session, or anything your watch missed.'),
      Screen([S['form']], 'On the Upload tab, scroll to Log without a file.', zoom=1.2),
      Screen([(S['kind'][0], card, 2.6)], 'Choose the sport, and the type: indoor, road, treadmill and so on.', zoom=1.2, z0=1.2),
      Screen(seq('t1') + seq('t2') + seq('t3') + [(S['t3'][-1][0], card, 1.6)], 'Add the time, distance and, if you know it, average heart rate.', zoom=1.2, z0=1.2),
      Screen(seq('t4') + [(S['t4'][-1][0], card, 1.4)], 'Give it a name if you like.', zoom=1.2, z0=1.2),
      Screen([(S['save'][0], S['save'][1], 2.4)], 'Save activity.', zoom=1.2, z0=1.2, focus=card),
      Screen([S['after']], 'It counts towards your totals, training load and gear, like any other activity.', zoom=1.04),
      Card('Good to know', ['Multisport: pick Multisport to log a brick or a race leg by leg, transitions included.',
                            'Tick "This was a race" to flag it as a race.',
                            'Without a file there’s no map or charts, just the summary.'], kind='bullets', per=1.0),
      End('The activity page'),
    ]
