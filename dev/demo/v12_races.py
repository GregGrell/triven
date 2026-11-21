# 12 Race calendar and taper
from compose import *
from common import *
FILE = '13-race-calendar-and-taper'
def SETUP(): return {'path': '#log/races'}
def film(f):
    S = {}; pg = f.pg
    S['list'] = f.shot('list', '#logRaces')
    pg.locator('#logRaces button').filter(has_text='Add a race').click(); pg.wait_for_timeout(900)
    S['modal'] = f.shot('modal', '#modalBody')
    S['name'] = f.type_frames('#modalBody input >> nth=0', 'Ironman Copenhagen', 'n', every=2, hl='#modalBody')
    pg.locator('#modalBody input[type=date]').fill('2027-08-15'); pg.locator('#modalBody input').nth(2).fill('Full')
    pg.locator('#modalBody input[placeholder^="optional"]').fill('11:30:00')
    S['filled'] = f.shot('filled', '#modalBody')
    pg.locator('#modalBody button.primary').click(); pg.wait_for_timeout(1500)
    S['after'] = f.shot('after', '#logRaces')
    f.nav('#feed', 1500); S['next'] = f.shot('next', '#view-feed .card:has-text("days") >> nth=0')
    return S
def scenes(S):
    md = S['modal'][1]
    return [
      Title(13, 'Race calendar and taper', 'Plan your season and arrive fresh.'),
      Screen([S['list']], 'Training log → Races. Your upcoming races, with a countdown.', zoom=1.1),
      Screen([S['modal']], 'Add a race: name, date, type and distance.', zoom=1.12),
      Screen([(p, md, .15) for p, _ in S['name']] + [(S['filled'][0], md, 2.6)], 'Set the priority: A for the one that matters, B for important, C for a training race. Add a goal time if you have one.', zoom=1.12, z0=1.12),
      Screen([S['after']], 'Saved, in date order.', zoom=1.1),
      Screen([S['after']], 'Each race shows your forecast form on race day, and how much to cut back to arrive fresh.', zoom=1.1, z0=1.1),
      Screen([S['next']], 'The countdown to your next race sits at the top of the feed.', zoom=1.3),
      Card('How the taper works', ['A races get a 10-day taper; B races 5 days; C races none.',
                                  'Triven finds the smallest cut in training that gets your form positive on race day.',
                                  'After the race, your result is linked to it, and to the same race in other years.'], kind='bullets', per=1.1),
      End('Best efforts and trophies'),
    ]
