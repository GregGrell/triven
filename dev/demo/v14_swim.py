# 14 Swimming
from compose import *
from common import *
FILE = '15-swimming'
def film(f):
    S = {}; pg = f.pg
    a = last('swim'); f.nav('#a/' + a['id'], 4000)
    S['top'] = f.shot('top', '#stats')
    scroll(f, '#swimcard', offset=70, wait=900); S['card'] = f.shot('card', '#swimcard')
    S['card2'] = f.shot('card2', '#swimcard')
    pg.evaluate("window.scrollBy(0,560)"); pg.wait_for_timeout(700); S['card3'] = f.shot('card3', '#swimcard')
    f.nav('#a/' + tri()['id'], 3500); scroll(f, '#swimcard', offset=70, wait=800); S['ow'] = f.shot('ow', '#swimcard')
    top(f); pg.click('#openSettings'); pg.wait_for_timeout(1200); pg.evaluate('document.activeElement.blur()')
    pg.evaluate("document.getElementById('s_css').scrollIntoView({block:'center'})"); pg.wait_for_timeout(600)
    sec = '#settings section:has(#s_css)'
    pg.fill('#s_css', '')
    S['tt4'] = f.type_frames('#s_tt400', '7:05', 't4', hl=sec)
    S['tt2'] = f.type_frames('#s_tt200', '3:24', 't2', hl=sec)
    pg.wait_for_timeout(500); S['css'] = f.shot('css', sec)
    return S
def scenes(S):
    sec = S['css'][1]
    return [
      Title(15, 'Swimming', 'Pool sets, pace per 100 m, SWOLF and your swim threshold.'),
      Screen([S['top']], 'Pace is worked out on swimming time only. Rests at the wall don’t slow it down.', zoom=1.25),
      Screen([S['card']], 'Sets are found from your rests, with each set’s pace and strokes.', zoom=1.1),
      Screen([S['card3']], 'Every length: pace, SWOLF and stroke type.', zoom=1.1),
      Screen([S['ow']], 'Open water uses GPS, with zones against your swim threshold.', zoom=1.12),
      Card('Your swim threshold (CSS)', [('Swim 400 m flat out', 'Rest, then swim 200 m flat out.'), ('Enter both times', 'Settings → Swimming. Triven works out your CSS.'),
                                        ('Zones and load follow', 'Swim zones, pace targets and training load use it.')], eyebrow='Critical swim speed', per=1.3),
      Screen([(p, sec, .2) for p, _ in S['tt4'] + S['tt2']] + [(S['css'][0], sec, 3.4)], 'Type your 400 m and 200 m times, and the CSS fills in.', zoom=1.15, z0=1.15),
      Card('Good to know', ['Pool bests only count continuous swimming: no rests, no drills.', 'Odd pool lengths (33 m, 25 yd) are handled.',
                            'Stroke rate comes from your watch arm, so it reads half your total strokes.'], kind='bullets', per=1.0),
      End('Privacy: who sees what'),
    ]
