# 01 Welcome to Triven: a tour
from compose import *
from common import *
FILE = '01-welcome-to-triven'
def film(f):
    S = {}
    S['feed'] = f.shot('feed')
    S['tabs'] = f.shot('tabs', '#tabs')
    f.nav('#a/' + tri()['id'], 3500); S['tri'] = f.shot('tri')
    f.nav('#log', 3000); S['log'] = f.shot('log')
    f.nav('#gear', 2000); S['gear'] = f.shot('gear')
    f.pg.click('#openSettings'); f.pg.wait_for_timeout(1200); f.pg.evaluate("document.activeElement.blur();document.getElementById('settings').scrollTop=0"); f.pg.wait_for_timeout(400); S['settings'] = f.shot('settings')
    return S
def scenes(S):
    return [
      Title(1, 'Welcome to Triven', 'A training log for swimming, cycling, running and multisport. Free.'),
      Card('What it does', ['Brings in every workout from your watch, automatically',
                            'Keeps a triathlon as one race: swim, bike, run and transitions',
                            'Shows where your training went: zones, load, fitness and form',
                            'Tracks your bests, gear mileage, goals and races',
                            'Shares with your club, on your terms'], kind='bullets', per=.9),
      Screen([S['feed']], 'Feed: your latest activities, and your friends’ and club’s.', zoom=1.04),
      Screen([S['tabs']], 'Five tabs: Feed, Training log, Upload, Gear and People.', zoom=1.25),
      Screen([S['tri']], 'Every activity gets a map, charts, laps and zones. Multisport races stay one activity.', zoom=1.05),
      Screen([S['log']], 'The training log: totals, fitness and form, your calendar and best efforts.', zoom=1.05),
      Screen([S['gear']], 'Gear: mileage on every pair of shoes and every bike.', zoom=1.05),
      Screen([S['settings']], 'Settings: your profile, privacy, heart rate zones and thresholds.', zoom=1.04),
      Card('Getting started', [('Bring your workouts in', 'Connect intervals.icu for automatic sync, or upload files.'),
                               ('Set your thresholds', 'Threshold heart rates, FTP and swim CSS make the zones and load right.'),
                               ('Find your club mates', 'Follow friends and join or start a club.')], per=1.2),
      End('Automatic sync with intervals.icu'),
    ]
