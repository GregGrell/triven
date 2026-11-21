# 07 Editing an activity
from compose import *
from common import *
FILE = '07-editing-an-activity'
def film(f):
    S = {}; pg = f.pg
    a = last('run', 'Sunday'); f.nav('#a/' + a['id'], 4000)
    pg.click('#actTools .ddwrap > button'); pg.wait_for_timeout(500); S['menu'] = f.shot('menu', '#actEditMenu')
    pg.locator('#actEditMenu .dditem').filter(has_text='Edit details').click(); pg.wait_for_timeout(1200)
    S['modal'] = f.shot('modal', '#modalBody')
    desc = pg.locator('#modalBody textarea').first
    S['desc'] = f.type_frames('#modalBody textarea >> nth=0', 'Last long run before the taper. Felt easy.', 'desc', every=4, hl='#modalBody')
    pg.evaluate("document.getElementById('modal').scrollTop=520"); pg.wait_for_timeout(500)
    S['modal2'] = f.shot('modal2', '#modalBody')
    pg.evaluate("document.getElementById('modal').scrollTop=99999"); pg.wait_for_timeout(500)
    S['modal3'] = f.shot('modal3', '#modalBody')
    pg.locator('#modalBody button.primary').last.click(); pg.wait_for_timeout(2500); top(f)
    S['saved'] = f.shot('saved', '#actDesc')
    pg.click('#actTools .ddwrap > button'); pg.wait_for_timeout(400)
    pg.locator('#actEditMenu .dditem').filter(has_text='Trim').click(); pg.wait_for_timeout(1500); pg.evaluate("document.getElementById('modal').scrollTop=0"); pg.wait_for_timeout(300)
    S['trim'] = f.shot('trim', '#modalBody')
    pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
    if pg.is_visible('#modal'): pg.evaluate("document.getElementById('modal').classList.remove('open')")
    pg.wait_for_timeout(300); top(f)
    pg.locator('#actTools button').filter(has_text='Instagram').click(); pg.wait_for_timeout(2500)
    S['ig'] = f.shot('ig', '#modalBody')
    return S
def scenes(S):
    md = S['modal'][1]
    return [
      Title(7, 'Editing an activity', 'Names, notes, gear, trimming and more.'),
      Screen([S['menu']], 'On any of your activities, open the Edit menu.', zoom=1.35),
      Screen([S['modal']], 'Edit details: the name, a description everyone who can see it reads, and private notes only you see.', zoom=1.1),
      Screen([(p, md, .16) for p, _ in S['desc']] + [(S['desc'][-1][0], md, 1.2)], 'Type away.', zoom=1.1, z0=1.1),
      Screen([S['modal2']], 'Further down: the type of each leg (road, trail, track, treadmill), and the gear used.', zoom=1.1),
      Screen([S['modal3']], 'And what you share: map, heart rate, pace, power, and photos.', zoom=1.1),
      Screen([S['saved']], 'Save, and it updates everywhere.', zoom=1.3),
      Screen([S['trim']], 'Trim: forgot to stop your watch? Cut off the start or the end. The original file is kept.', zoom=1.1),
      Screen([S['ig']], 'Instagram post makes a ready-to-share image of the activity.', zoom=1.08),
      Card('Also in the Edit menu', [('Mark as race', 'Flags it as a race, and swaps in your race shoes or bike.'), ('Link activities', 'Joins separate swim, bike and run files into one race.'),
                                     ('Make a relay', 'Teams your leg up with friends’ legs.')], kind='bullets', per=1.1),
      End('Gear and mileage'),
    ]
