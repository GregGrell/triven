# 16 Following, the feed and notifications
from compose import *
from common import *
import social
FILE = '16-following-the-feed-and-notifications'
def SETUP(): return social.setup()
def film(f):
    S = {}; pg = f.pg
    f.nav('#club', 1800); S['people'] = f.shot('people', '#view-club .card >> nth=0')
    S['q'] = f.type_frames('#view-club input[placeholder^="Find athletes"]', 'Sophie', 'q', hl='#view-club .card >> nth=0')
    pg.wait_for_timeout(900); S['res'] = f.shot('res', '#view-club .card >> nth=0')
    btn = pg.locator('#view-club button').filter(has_text='Follow').first
    S['fol'] = f.shot('fol', btn.bounding_box() and tuple(round(v * 1.5) for v in (lambda b: (b['x'], b['y'], b['width'], b['height']))(btn.bounding_box())))
    pg.locator('#view-club .chip, #view-club button').filter(has_text='Following').first.click(); pg.wait_for_timeout(800)
    S['net'] = f.shot('net', '#view-club .card >> nth=0')
    f.nav('#feed', 2000); pg.locator('#view-feed .chip, #view-feed button').filter(has_text='Following').first.click(); pg.wait_for_timeout(2000)
    S['feed'] = f.shot('feed', '.fcard >> nth=0')
    kb = pg.locator('.fcard').first.locator('button').first
    kb.click(); pg.wait_for_timeout(700); S['kudos'] = f.shot('kudos', '.fcard >> nth=0')
    pg.click('#bellBtn'); pg.wait_for_timeout(900); S['bell'] = f.shot('bell', '#bellPanel')
    return S
def scenes(S):
    c = S['people'][1]
    return [
      Title(16, 'Following, the feed and notifications', 'Keep up with your training partners.'),
      Screen([S['people']], 'On the People tab, search for athletes by name.', zoom=1.12),
      Screen([(p, c, .2) for p, _ in S['q']] + [(S['res'][0], c, 2.2)], 'Results show as you type.', zoom=1.12, z0=1.12),
      Screen([S['fol']], 'Follow. If they approve followers, it waits until they accept.', zoom=1.5) if S['fol'][1] else Screen([S['res']], 'Follow. If they approve followers, it waits until they accept.', zoom=1.12),
      Screen([S['net']], 'Your followers and the people you follow are listed here.', zoom=1.12),
      Screen([S['feed']], 'The feed: Me, Following, Club or Everyone. Your friends’ activities, newest first.', zoom=1.08),
      Screen([S['kudos']], 'Give kudos, or open the comments.', zoom=1.12),
      Screen([S['bell']], 'The bell shows kudos, comments, new followers, relay invitations and club news. Click one to go there.', zoom=1.35),
      End('Clubs and leaderboards'),
    ]
