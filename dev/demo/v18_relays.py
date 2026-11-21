# 18 Relays
from compose import *
from common import *
import social
FILE = '19-relays'
MINE = None
def SETUP():
    global MINE
    db = social.load(); mine = sorted(db['activities'], key=lambda a: a['start_time'])[-1]; MINE = mine['id']
    relay = social.relay_for(db, mine)
    cands = [{'activity_id': 'o2', 'owner': 'u3', 'athlete': 'Tom Willis', 'avatar': None, 'name': 'Parkrun PB!', 'sport': 'run', 'multisport_profile': None, 'start_time': '2026-11-22T10:05:00Z', 'utc_offset_min': 0, 'elapsed_s': 1180, 'distance_m': 5000},
             {'activity_id': 'o4', 'owner': 'u5', 'athlete': 'Marco Rossi', 'avatar': None, 'name': 'Relay bike leg', 'sport': 'bike', 'multisport_profile': None, 'start_time': '2026-11-22T06:54:30Z', 'utc_offset_min': 0, 'elapsed_s': 2020, 'distance_m': 20000},
             {'activity_id': 'o3', 'owner': 'u4', 'athlete': 'Jess Ong', 'avatar': None, 'name': 'Relay swim leg', 'sport': 'swim', 'multisport_profile': None, 'start_time': '2026-11-22T06:40:00Z', 'utc_offset_min': 0, 'elapsed_s': 760, 'distance_m': 750}]
    return social.setup({'relay_view': relay, 'relay_candidates': cands, 'start_relay': 'r1'}, relay_on=(MINE, relay))
def film(f):
    S = {}; pg = f.pg
    f.nav('#a/' + MINE, 3500)
    pg.click('#actTools .ddwrap > button'); pg.wait_for_timeout(400)
    S['menu'] = f.shot('menu', '#actEditMenu')
    pg.locator('#actEditMenu .dditem').filter(has_text='Make a relay').click(); pg.wait_for_timeout(1200)
    S['pick'] = f.shot('pick', '#modalBody')
    pg.keyboard.press('Escape'); pg.evaluate("document.getElementById('modal').classList.remove('open')"); pg.wait_for_timeout(400)
    f.nav('#r/r1', 2500); S['relay'] = f.shot('relay', '#view-relay .card >> nth=0')
    f.nav('#feed', 2200); S['feed'] = f.shot('feed', '.fcard >> nth=0')
    return S
def scenes(S):
    return [
      Title(19, 'Relays', 'Team up: your leg and your friends’ legs, as one result.'),
      Screen([S['menu']], 'On your activity, open Edit → Make a relay.', zoom=1.35),
      Screen([S['pick']], 'Pick a friend’s activity from within 12 hours, or invite them to pick their own. Up to six legs.', zoom=1.12),
      Screen([S['relay']], 'The relay page: every leg in order, the hand-overs, and the total time.', zoom=1.08),
      Screen([S['feed']], 'It shows once on every member’s feed.', zoom=1.08),
      Card('Good to know', ['Relays are between people who follow each other.', 'Invitations show at the top of the feed and in the bell. Accept with one of your activities, or decline.',
                            'Each activity stays its owner’s, for their own totals, bests and training load.', 'People only see a leg’s route and name if they’re allowed to see that activity.'], kind='bullets', per=1.0),
      End('Settings'),
    ]
