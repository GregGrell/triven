# 15 Privacy: who sees what
from compose import *
from common import *
FILE = '16-privacy-who-sees-what'
def film(f):
    S = {}; pg = f.pg
    a = last('run', 'Sunday'); f.nav('#a/' + a['id'], 3500)
    S['vis'] = f.shot('vis', '#actVis')
    pg.locator('#actVis button, #actVis .chip').filter(has_text='Only me').first.click(); pg.wait_for_timeout(900)
    S['priv'] = f.shot('priv', '#actVis')
    pg.locator('#actVis button, #actVis .chip').filter(has_text='Club').first.click(); pg.wait_for_timeout(600)
    pg.click('#actTools .ddwrap > button'); pg.wait_for_timeout(300); pg.locator('#actEditMenu .dditem').filter(has_text='Edit details').click(); pg.wait_for_timeout(1200)
    pg.evaluate("document.getElementById('modal').scrollTop=99999"); pg.wait_for_timeout(500)
    S['share'] = f.shot('share', '#modalBody section:has-text("Who can see it")')
    pg.locator('#modalBody button').filter(has_text='Cancel').click(); pg.wait_for_timeout(500)
    pg.click('#openSettings'); pg.wait_for_timeout(1200); pg.evaluate('document.activeElement.blur()')
    sec = '#settings section:has-text("Approve new followers")'
    pg.locator(sec).evaluate("e=>e.scrollIntoView({block:'center'})"); pg.wait_for_timeout(600)
    S['set'] = f.shot('set', sec)
    return S
def scenes(S):
    return [
      Title(16, 'Privacy: who sees what', 'You decide, for your profile and for every activity.'),
      Card('Four levels for each activity', [('Only me', 'Private. Nobody else sees it, anywhere.'), ('Followers', 'People who follow you, and your club mates.'),
                                             ('Club', 'Your club mates only.'), ('Everyone', 'Any Triven member.')], per=1.0),
      Screen([S['vis']], 'Change it with one click at the top of any activity.', zoom=1.4),
      Screen([S['priv']], 'Only me: now it’s just yours. It still counts in your own totals.', zoom=1.4),
      Screen([S['share']], 'Edit details → Who can see it: hide the map, heart rate, pace, power or other data, even when the activity is shared.', zoom=1.15),
      Screen([S['set']], 'In Settings: whether people can find you, whether you approve followers, and an upper limit for all your activities.', zoom=1.15),
      Card('Good to know', ['New activities use your default from Settings.', 'Links to your profile and activities only open for signed-in members, and only show what they’re allowed to see.',
                            'Club leaderboards never count private activities.'], kind='bullets', per=1.0),
      End('Following, the feed and notifications'),
    ]
