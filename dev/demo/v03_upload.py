# 03 Uploading files and your Garmin history
from compose import *
from common import *
FILE = '04-uploading-files-and-your-garmin-history'
def SETUP(): return {'path': '#upload'}
def film(f):
    S = {}
    S['upload'] = f.shot('upload', '#drop')
    f.pg.set_input_files('#fileIn', ['/tmp/demo_up/turbo.fit', '/tmp/demo_up/evening_run.fit'])
    S['prog'] = []
    for i in range(6):
        f.pg.wait_for_timeout(350); S['prog'].append(f.shot('prog', '#upList'))
    f.pg.wait_for_timeout(5000); S['done'] = f.shot('done', '#upList')
    f.nav('#feed', 2500); S['feed'] = f.shot('feed', '.fcard')
    return S
def scenes(S):
    up = S['done'][1]
    return [
      Title(4, 'Uploading files and your Garmin history', 'For one-off files, or years of training in one go.'),
      Screen([S['upload']], 'Open the Upload tab. Drop .fit files here, or click to choose them.', zoom=1.15),
      Screen([(p, up, .35) for p, _ in S['prog']] + [(S['done'][0], up, 3.2)], 'Files are read in your browser and saved to your account, original file and all.', zoom=1.15),
      Screen([S['feed']], 'They appear in your feed straight away. Files already in Triven are skipped.', zoom=1.05),
      Card('Your whole Garmin history', [('Request your export', 'In Garmin Connect on the web: your account → Data Management → Export your data.'),
                                         ('Wait for the email', 'Garmin sends a download link, usually within a few days.'),
                                         ('Drop the zip on the Upload tab', 'Leave the tab open until it says Done. Thousands of activities take a while.')], eyebrow='Years of training at once', per=1.4),
      Card('Good to know', ['Garmin exports include lots of non-activity files (sleep, steps, settings). They’re skipped, which is expected.',
                            'Multisport files (triathlon, duathlon, aquathlon) stay as one activity.',
                            'Treadmill, indoor bike and track sessions are recognised from the watch.'], kind='bullets', per=1.0),
      End('Logging an activity without a file'),
    ]
