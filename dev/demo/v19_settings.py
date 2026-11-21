# 19 Settings: units, profile and username
from compose import *
from common import *
import social
FILE = '20-settings-units-profile-and-username'
def SETUP(): return social.setup(feed_others=False)
def film(f):
    S = {}; pg = f.pg
    pg.click('#openSettings'); pg.wait_for_timeout(1200); pg.evaluate('document.activeElement.blur()')
    pg.evaluate("document.getElementById('settings').scrollTop=0"); pg.wait_for_timeout(500)
    S['prof'] = f.shot('prof', '#settings section:has(#s_dob)')
    pg.select_option('#s_units', 'imperial'); pg.wait_for_timeout(400)
    S['units'] = f.shot('units', '#s_units')
    pg.click('#saveSettings'); pg.wait_for_timeout(1800)
    S['feed'] = f.shot('feed', '.fcard >> nth=0')
    f.nav('#me', 2500); S['me'] = f.shot('me', '#view-profile .card >> nth=0')
    pg.click('#openSettings'); pg.wait_for_timeout(1000); pg.evaluate('document.activeElement.blur()')
    pg.select_option('#s_units', 'metric'); pg.locator('#s_lthrRun').evaluate("e=>e.scrollIntoView({block:'center'})"); pg.wait_for_timeout(500)
    S['hr'] = f.shot('hr', '#settings section:has(#s_lthrRun)')
    pg.locator('input[name=s_when]').first.evaluate("e=>e.scrollIntoView({block:'center'})"); pg.wait_for_timeout(500)
    S['when'] = f.shot('when', '#settings section:has(input[name=s_when])')
    return S
def scenes(S):
    return [
      Title(20, 'Settings', 'Your profile, units and the numbers that drive your zones.'),
      Screen([S['prof']], 'Settings, top right. First: your name, photo and username.', zoom=1.15),
      Screen([S['prof']], 'Your date of birth (only your age is used) and your weight, typed in and kept by date.', zoom=1.15, z0=1.15),
      Screen([S['units']], 'Units: metric or imperial.', zoom=1.5),
      Screen([S['feed']], 'Imperial shows miles, minutes per mile, mph, feet and pounds everywhere.', zoom=1.12),
      Screen([S['me']], 'Your username gives you a profile link: triven.fit/samc. Each activity gets one too, like triven.fit/samc/149.', zoom=1.1),
      Screen([S['hr']], 'Threshold heart rates, max and resting heart rate set your zones and training load.', zoom=1.12),
      Screen([S['when']], 'When changes apply: from a date, or for past activities too. Your history isn’t rewritten by accident.', zoom=1.12),
      End('Your data: download and delete'),
    ]
