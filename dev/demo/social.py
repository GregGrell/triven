# Made-up club mates for the social videos: their activities for the feed, a club, a relay, notifications, profiles.
import json, os, copy
HERE = os.path.dirname(os.path.abspath(__file__))
NOW = '2026-11-22T17:30:00Z'

PEOPLE = [('u2', 'Priya Shah', 'priya'), ('u3', 'Tom Willis', 'tomw'), ('u4', 'Jess Ong', 'jess'), ('u5', 'Marco Rossi', 'marco')]

def load():
    return json.load(open(os.path.join(HERE, 'snapshot_final.json')))['db']

def build(db):
    acts = sorted(db['activities'], key=lambda a: a['start_time'])
    secs = {}
    for s in db['activity_sections']: secs.setdefault(s['activity_id'], []).append(s)
    def borrow(src, oid, name, handle, aid, when, title, scale=1.0, kudos=3, comments=0, race=False):
        a = copy.deepcopy(src); a.update({'id': aid, 'owner': oid, 'athlete': name, 'handle': handle, 'avatar_path': None, 'name': title, 'start_time': when,
                                          'distance_m': round(a['distance_m'] * scale), 'elapsed_s': round(a['elapsed_s'] * scale * .97), 'moving_s': round((a.get('moving_s') or a['elapsed_s']) * scale * .97),
                                          'kudos': kudos, 'comments': comments, 'you_kudoed': False, 'relay': None, 'media': [], 'is_race': race, 'num': None,
                                          'share': {'map': True, 'hr': True, 'power': True, 'pace': True, 'cadence': True}})
        a['track'] = (a.get('summary') or {}).get('track'); a['flags'] = None
        a['sections'] = [dict(s, activity_id=aid, distance_m=round(s['distance_m'] * scale)) for s in sorted(secs.get(src['id'], []), key=lambda s: s['idx'])]
        return a
    ride = [a for a in acts if a['sport'] == 'bike'][-1]; run = [a for a in acts if a['sport'] == 'run'][-2]
    rich = [a for a in acts if a['name'] == 'Richmond Park laps'][-1]; swim = [a for a in acts if a['sport'] == 'swim'][-1]
    ivl = [a for a in acts if a['name'].startswith('Intervals')][-1]
    others = [
        borrow(rich, 'u2', 'Priya Shah', 'priya', 'o1', '2026-11-22T15:10:00Z', 'Richmond Park, 3 laps', 1.0, kudos=5, comments=2),
        borrow(run, 'u3', 'Tom Willis', 'tomw', 'o2', '2026-11-22T10:05:00Z', 'Parkrun PB!', .62, kudos=9, comments=4, race=True),
        borrow(swim, 'u4', 'Jess Ong', 'jess', 'o3', '2026-11-21T07:00:00Z', 'Masters swim', 1.15, kudos=4),
        borrow(ride, 'u5', 'Marco Rossi', 'marco', 'o4', '2026-11-21T08:30:00Z', 'Club ride to Box Hill', .9, kudos=7, comments=1),
        borrow(ivl, 'u2', 'Priya Shah', 'priya', 'o5', '2026-11-20T06:40:00Z', 'Track: 8 × 400 m', .7, kudos=3),
    ]
    me = db['profiles'][0]
    club = {'id': 'c1', 'name': 'Hyde Park Tri Club', 'description': 'Tuesday track, Thursday swim, Saturday long ride from the Serpentine. All abilities welcome.', 'avatar': None,
            'listed': True, 'join_policy': 'approval', 'members_count': 5, 'my_role': 'owner', 'my_status': 'active', 'invite_code': 'hptc2026x7k',
            'members': [{'id': 'u1', 'name': me['display_name'], 'avatar': None, 'role': 'owner'}] + [{'id': i, 'name': n, 'avatar': None, 'role': 'admin' if i == 'u2' else 'member'} for i, n, h in PEOPLE],
            'pending': [{'id': 'u6', 'name': 'Alex Kim', 'avatar': None, 'since': '2026-11-22T09:00:00Z'}],
            'posts': [{'id': 'p1', 'author': 'u1', 'name': me['display_name'], 'avatar': None, 'body': 'Club 10-mile TT on Saturday 28th, 7am at the Richmond Park gate. Lights on, please.', 'created_at': '2026-11-21T19:00:00Z'},
                      {'id': 'p2', 'author': 'u2', 'name': 'Priya Shah', 'avatar': None, 'body': 'Thursday swim moves to 6:30am from next week.', 'created_at': '2026-11-18T12:00:00Z'}]}
    lb = [{'user_id': 'u5', 'name': 'Marco Rossi', 'handle': 'marco', 'avatar': None, 'n': 14, 'dist': 612000, 'secs': 82000, 'elev': 5200},
          {'user_id': 'u1', 'name': me['display_name'], 'handle': me.get('handle'), 'avatar': None, 'n': 21, 'dist': 498000, 'secs': 88400, 'elev': 3900},
          {'user_id': 'u2', 'name': 'Priya Shah', 'handle': 'priya', 'avatar': None, 'n': 18, 'dist': 405000, 'secs': 71000, 'elev': 2800},
          {'user_id': 'u3', 'name': 'Tom Willis', 'handle': 'tomw', 'avatar': None, 'n': 12, 'dist': 151000, 'secs': 50200, 'elev': 900},
          {'user_id': 'u4', 'name': 'Jess Ong', 'handle': 'jess', 'avatar': None, 'n': 11, 'dist': 64000, 'secs': 46000, 'elev': 300}]
    n = lambda kind, at, who, **k: dict({'kind': kind, 'at': at, 'actor': who[0], 'actor_name': who[1], 'actor_handle': who[2], 'actor_avatar': None,
                                         'activity_id': None, 'activity_name': None, 'club_id': None, 'club_name': None, 'relay_id': None, 'body': None}, **k)
    last = acts[-1]
    notes = [n('kudos', '2026-11-22T16:40:00Z', PEOPLE[0], activity_id=last['id'], activity_name=last['name']),
             n('comment', '2026-11-22T16:05:00Z', PEOPLE[1], activity_id=last['id'], activity_name=last['name'], body='Strong finish! Same again next week?'),
             n('club_request', '2026-11-22T09:00:00Z', ('u6', 'Alex Kim', None), club_id='c1', club_name='Hyde Park Tri Club'),
             n('follow', '2026-11-21T20:12:00Z', PEOPLE[3]),
             n('club_post', '2026-11-18T12:00:00Z', PEOPLE[0], club_id='c1', club_name='Hyde Park Tri Club', body='Thursday swim moves to 6:30am from next week.')]
    network = []
    for i, nm, h in PEOPLE:
        network += [{'other': i, 'athlete': nm, 'handle': h, 'direction': 'following', 'status': 'accepted', 'since': '2026-06-01', 'avatar': None},
                    {'other': i, 'athlete': nm, 'handle': h, 'direction': 'follower', 'status': 'accepted', 'since': '2026-06-01', 'avatar': None}]
    rpc = {'my_network': network, 'my_clubs': [{'id': 'c1', 'name': club['name'], 'invite_code': club['invite_code'], 'role': 'owner', 'status': 'active', 'members': 5, 'avatar': None, 'listed': True, 'join_policy': 'approval', 'pending': 1}],
           'club_page': club, 'club_leaderboard': lb, 'my_notifications': notes,
           'search_athletes': [{'id': 'u7', 'athlete': 'Sophie Laurent', 'handle': 'sophiel', 'avatar': None, 'you_follow': None, 'follows_you': False, 'approve_followers': False}, {'id': 'u8', 'athlete': 'Sophie Grant', 'handle': 'sgrant', 'avatar': None, 'you_follow': None, 'follows_you': False, 'approve_followers': True}],
           'search_clubs': [{'id': 'c9', 'name': 'Serpentine Swimming Club', 'description': '', 'avatar': None, 'join_policy': 'open', 'members': 64, 'my_status': None}],
           'my_relay_invites': []}
    return rpc, others, club

def profile_page(db):
    acts = db['activities']; me = db['profiles'][0]
    yr = {}
    for a in acts:
        if not a['start_time'].startswith('2026'): continue
        for sp in (['swim', 'bike', 'run'] if a['sport'] == 'multi' else [a['sport']]):
            y = yr.setdefault(sp, {'n': 0, 'km': 0, 's': 0, 'up': 0}); y['n'] += 1
            if a['sport'] != 'multi': y['km'] += a['distance_m'] / 1000; y['s'] += a['elapsed_s']; y['up'] += a.get('ascent_m') or 0
    for y in yr.values(): y['km'] = round(y['km']); y['up'] = round(y['up'])
    best = {}
    for b in db['best_efforts']:
        k = (b['sport'], b['effort']); better = (lambda o: b['value'] < o['value']) if b['unit'] == 's' else (lambda o: b['value'] > o['value'])
        if k not in best or better(best[k]): best[k] = b
    want = [('run', '5 km'), ('run', '10 km'), ('run', 'Half marathon'), ('bike', 'power 20 min'), ('bike', 'power 1 hour'), ('swim', '400 m')]
    bests = [{'sport': s, 'effort': e, 'unit': best[(s, e)]['unit'], 'value': best[(s, e)]['value'], 'activity': best[(s, e)]['activity_id'], 'at': best[(s, e)].get('achieved_at', '')[:10]} for s, e in want if (s, e) in best]
    return {'id': 'u1', 'name': me['display_name'], 'handle': me['handle'], 'avatar': None, 'me': True, 'since': '2026-05-25T00:00:00Z', 'you_follow': None, 'follows_you': False,
            'clubs': [{'id': 'c1', 'name': 'Hyde Park Tri Club'}], 'count': len(acts), 'year': yr, 'bests': bests}

def relay_for(db, mine):
    leg = lambda o, n, sp, t, el, d, aid=None, tr=None, st='accepted', name=None: {'owner': o, 'athlete': n, 'avatar': None, 'status': st, 'activity_id': aid, 'name': name, 'sport': sp, 'multisport_profile': None,
        'start_time': t, 'utc_offset_min': 0, 'elapsed_s': el, 'distance_m': d, 'is_race': True, 'sections': [{'sport': sp, 'elapsed_s': el, 'distance_m': d}], 'track': tr}
    acts = sorted(db['activities'], key=lambda a: a['start_time'])
    rich = [a for a in acts if a['name'] == 'Richmond Park laps'][-1]; tri = [a for a in acts if a['sport'] == 'multi'][0]
    tr = (tri.get('summary') or {}).get('track') or []
    swim_tr = tr[:max(2, len(tr) // 9)]
    return {'id': 'r1', 'name': 'Club relay: swim, bike, run', 'member': True, 'legs': [
        leg('u4', 'Jess Ong', 'swim', '2026-11-22T06:40:00Z', 760, 750, 'o3', swim_tr, name='Relay swim leg'),
        leg('u5', 'Marco Rossi', 'bike', '2026-11-22T06:54:30Z', 2020, 20000, 'o4', (rich.get('summary') or {}).get('track'), name='Relay bike leg'),
        leg('u1', db['profiles'][0]['display_name'], 'run', mine['start_time'], mine['elapsed_s'], mine['distance_m'], mine['id'], (mine.get('summary') or {}).get('track'), name=mine['name'])]}

def setup(extra_rpc=None, feed_others=True, relay_on=None):
    import json as _j
    db = load(); rpc, others, club = build(db)
    rpc['athlete_page'] = profile_page(db); rpc['resolve_link'] = {'found': True, 'handle': db['profiles'][0]['handle'], 'person': 'u1'}; rpc['check_handle'] = 'ok'
    rpc.update(extra_rpc or {})
    init = ('window.__feedOthers=' + _j.dumps(others) + ';') if feed_others else ''
    if relay_on: init += 'window.__feedRelay=' + _j.dumps({relay_on[0]: relay_on[1]}) + ';'
    return {'rpc': rpc, 'extra_init': init}
