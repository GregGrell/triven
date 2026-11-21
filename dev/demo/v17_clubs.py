# 17 Clubs and leaderboards
from compose import *
from common import *
import social
FILE = '17-clubs-and-leaderboards'
def SETUP(): return social.setup()
def film(f):
    S = {}; pg = f.pg
    f.nav('#club', 1800); scroll(f, '#view-club .card:has-text("Clubs")', offset=120, wait=600)
    S['clubs'] = f.shot('clubs', '#view-club .card:has-text("Start a club") >> nth=-1')
    pg.locator('#view-club button').filter(has_text='Start a club').click(); pg.wait_for_timeout(900)
    S['start'] = f.shot('start', '#modalBody')
    pg.locator('#modalBody button').filter(has_text='Cancel').first.click(); pg.wait_for_timeout(500)
    f.nav('#c/c1', 2500); S['page'] = f.shot('page', '#view-club .card >> nth=0')
    scroll(f, '#view-club .card:has-text("Leaderboard")', offset=90, wait=900)
    S['lb'] = f.shot('lb', '#view-club .card:has-text("Leaderboard")')
    pg.locator('#view-club .card:has-text("Leaderboard") button').filter(has_text='Time').first.click(); pg.wait_for_timeout(700)
    S['lb2'] = f.shot('lb2', '#view-club .card:has-text("Leaderboard")')
    for t, k in [('Posts', 'posts'), ('Members', 'mem'), ('Requests', 'req'), ('Invite', 'inv')]:
        loc = pg.locator(f'#view-club .card:has-text("{t}")').last
        if loc.count():
            loc.evaluate("e=>{const r=e.getBoundingClientRect();window.scrollBy(0,r.top-110)}"); pg.wait_for_timeout(500)
            S[k] = f.shot(k, f'#view-club .card:has-text("{t}") >> nth=-1')
    return S
def scenes(S):
    sc = [Title(17, 'Clubs and leaderboards', 'Your tri club, running club or Sunday ride group, in one place.'),
          Screen([S['clubs']], 'People tab → Clubs: find a club, paste an invite link, or start your own.', zoom=1.2),
          Screen([S['start']], 'Starting one: a name and description, listed in search or invite only, and open to all or by approval.', zoom=1.15),
          Screen([S['page']], 'The club page: photo, description and the club’s activities.', zoom=1.1)]
    if 'posts' in S: sc.append(Screen([S['posts']], 'Posts from the club’s admins: sessions, races, changes.', zoom=1.15))
    if 'req' in S: sc.append(Screen([S['req']], 'Join requests wait for an admin to approve them.', zoom=1.2))
    if 'mem' in S: sc.append(Screen([S['mem']], 'Members. The owner can make admins or hand the club over.', zoom=1.15))
    sc += [Screen([S['lb']], 'The leaderboard: this week, month or year, by sport.', zoom=1.12),
           Screen([S['lb2']], 'Rank by distance, time or climbing.', zoom=1.12, z0=1.12)]
    if 'inv' in S: sc.append(Screen([S['inv']], 'Share the invite link to bring people in.', zoom=1.2))
    sc += [Card('Good to know', ['Leaderboards only count activities members share with the club; private ones never count.', 'Multisport legs count towards their own sport.',
                                 'You can be in several clubs. Club on the feed shows all your club mates.'], kind='bullets', per=1.0),
           End('Relays')]
    return sc
