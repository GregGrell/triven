# The how-to series: titles, one-line summaries and YouTube descriptions. Used for the site's videos page and the upload notes.
SERIES = [
  ('v01_welcome', 'Welcome to Triven', 'A quick tour: the feed, activities, the training log, gear and settings.', 'Getting started'),
  ('v02_install', 'Installing Triven on your phone or computer', 'No app store needed: install it on iPhone, Android, Windows or Mac.', 'Getting started'),
  ('v02_sync_video', 'Automatic sync with intervals.icu', 'Connect once and every workout from your watch arrives on its own.', 'Getting started'),
  ('v03_upload', 'Uploading files and your Garmin history', 'Drop in .fit files, or years of training from a Garmin export.', 'Getting started'),
  ('v04_manual', 'Logging an activity without a file', 'Treadmill runs, turbo sessions and anything your watch missed.', 'Getting started'),
  ('v05_activity', 'The activity page', 'Headline numbers, weather, route, zones, charts and laps.', 'Your activities'),
  ('v06_multisport', 'Multisport activities', 'Triathlons stay one race: legs, transitions and joined files.', 'Your activities'),
  ('v07_editing', 'Editing an activity', 'Names, notes, leg types, sharing, trimming and Instagram posts.', 'Your activities'),
  ('v08_gear', 'Gear and mileage', 'Shoes and bikes, replacement distances and automatic assignment.', 'Your activities'),
  ('v09_log', 'The training log', 'Totals by week, month or year, the calendar and activity search.', 'Training'),
  ('v10_goals', 'Goals', 'Weekly, monthly and annual targets, and whether you’re on pace.', 'Training'),
  ('v11_fitness', 'Fitness, form and training load', 'Load, fitness, fatigue and form, training status and thresholds.', 'Training'),
  ('v12_races', 'Race calendar and taper', 'Plan your races and see how to arrive fresh.', 'Training'),
  ('v13_bests', 'Best efforts and trophies', 'Your top 10 at every distance and power duration, all time and by year.', 'Training'),
  ('v14_swim', 'Swimming', 'Pool sets, every length, SWOLF and your swim threshold (CSS).', 'Training'),
  ('v15_privacy', 'Privacy: who sees what', 'Visibility for each activity, hiding data, and profile settings.', 'People'),
  ('v16_people', 'Following, the feed and notifications', 'Find athletes, follow, give kudos, and the notifications bell.', 'People'),
  ('v17_clubs', 'Clubs and leaderboards', 'Start or join a club: posts, members, requests and leaderboards.', 'People'),
  ('v18_relays', 'Relays', 'Team up with friends: your leg and theirs as one result.', 'People'),
  ('v19_settings', 'Settings', 'Profile and username, units, heart rate zones and dated changes.', 'Account'),
  ('v20_data', 'Your data: download and delete', 'Download everything, or delete your account.', 'Account'),
]

def youtube_text(n, mod, title, line):
    return (f'Triven how-to {n:02d}: {title}\n\n{line}\n\n'
            'Triven is a free training log for swimming, cycling, running and multisport, with proper triathlon support: https://triven.fit\n'
            'Help guide: https://triven.fit/help.html\nAll the how-to videos: https://triven.fit/videos.html\n\n'
            'The athlete and activities in this video are made up for the demo.')
