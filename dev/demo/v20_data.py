# 20 Your data: download and delete
from compose import *
from common import *
FILE = '20-your-data-download-and-delete'
def film(f):
    S = {}; pg = f.pg
    pg.click('#openSettings'); pg.wait_for_timeout(1200); pg.evaluate('document.activeElement.blur()')
    pg.locator('#yourData').evaluate("e=>e.scrollIntoView({block:'center'})"); pg.wait_for_timeout(600)
    S['sec'] = f.shot('sec', '#yourData')
    with pg.expect_download(timeout=60000): pg.click('#dataExport')
    pg.wait_for_timeout(500); S['dl'] = f.shot('dl', '#yourData')
    S['typ'] = f.type_frames('#delConfirm', 'delete', 'd', hl='#yourData')
    pg.click('#delAccount'); pg.wait_for_timeout(500)
    pg.locator('#yourData').evaluate("e=>e.scrollIntoView({block:'center'})"); pg.wait_for_timeout(400)
    S['sure'] = f.shot('sure', '#delSure')
    return S
def scenes(S):
    sec = S['sec'][1]
    return [
      Title(20, 'Your data: download and delete', 'It’s yours. Take it with you, or take it away.'),
      Screen([S['sec']], 'Settings → Your data, at the bottom.', zoom=1.2),
      Screen([S['dl']], 'Download my data: a zip with your profile, every activity as a spreadsheet and in full, gear, bests, comments and clubs.', zoom=1.2, z0=1.2),
      Card('Want your original files too?', ['Tick "Include original activity files and photos" before downloading.', 'With years of history it’s a big download, so give it time.'], kind='bullets', per=1.0),
      Screen([(p, sec, .2) for p, _ in S['typ']] + [(S['typ'][-1][0], sec, 1.4)], 'To delete your account, type delete…', zoom=1.2),
      Screen([S['sure']], '…press the button, and confirm the final warning. Everything goes straight away, and it can’t be undone.', zoom=1.4),
      Card('What happens', ['Activities, files, photos, gear, comments, kudos and follows are deleted.', 'Clubs you run pass to the next admin or member.',
                            'Download your data first if you want a copy.'], kind='bullets', per=1.0),
      End(),
    ]
