# 13 Best efforts and trophies
from compose import *
from common import *
FILE = '13-best-efforts-and-trophies'
def SETUP(): return {'path': '#log/bests'}
def film(f):
    S = {}; pg = f.pg
    S['list'] = f.shot('list', '#logBests')
    first = pg.locator('#logBests tr, #logBests .brow, #logBests a').filter(has_text='10 km').first
    first.click(); pg.wait_for_timeout(1500); top(f)
    S['top10'] = f.shot('top10', '#logBests')
    S['ign'] = f.shot('ign', '#logBests .ign >> nth=0')
    pg.locator('#logBests .bestyears a').nth(1).click(); pg.wait_for_timeout(1200)
    S['year'] = f.shot('year', '#logBests')
    pg.locator('#logBests table a').first.click(); pg.wait_for_timeout(3500); top(f)
    S['act'] = f.shot('act', '#actTrophies')
    S['back'] = f.shot('back', '#actBack')
    f.nav('#log/bests', 1500); pg.locator('#logBests a, #logBests tr').filter(has_text='20 min').first.click(); pg.wait_for_timeout(1500); top(f)
    S['power'] = f.shot('power', '#logBests')
    return S
def scenes(S):
    return [
      Title(13, 'Best efforts and trophies', 'Your fastest times and biggest numbers, found for you.'),
      Screen([S['list']], 'Training log → Best efforts: running distances, power, cycling distances and swims, in order.', zoom=1.06),
      Screen([S['top10']], 'Click one for your top 10, each from a different activity.', zoom=1.08),
      Screen([S['year']], 'All time, or a single year.', zoom=1.08),
      Screen([S['ign']], 'A glitch, like a power spike? Ignore it, and it drops out of your bests and trophies.', zoom=1.5),
      Screen([S['act']], 'Activities show trophies: gold, silver and bronze for your top three, all time and for the year.', zoom=1.4),
      Screen([S['back']], 'Opened from your bests? The back link takes you straight to the list.', zoom=1.5),
      Card('Tracked for you', [('Running', '400 m and the mile up to the marathon, then 50 km, 50 miles, 100 km and 100 miles'),
                               ('Cycling', '10, 25, 50 and 100-mile TTs, 90 km, 100 km and 180 km; longest ride and most climbing'),
                               ('Power', '1 second to an hour'), ('Swimming', '100 m to 3.8 km, pool and open water')], kind='bullets', per=1.0),
      End('Swimming'),
    ]
