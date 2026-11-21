# 05 The activity page
from compose import *
from common import *
FILE = '06-the-activity-page'
def film(f):
    S = {}; pg = f.pg
    a = last('run', 'Intervals'); f.nav('#a/' + a['id'], 4000)
    S['top'] = f.shot('top', '#stats')
    S['weather'] = f.shot('weather', '#actWeather')
    scroll(f, '#mapsvg', offset=110, wait=1500); S['map'] = f.shot('map', '#mapsvg'); S['focus'] = f.shot('focus', '#focus')
    scroll(f, '#chartscard', offset=20, wait=800); S['charts'] = f.shot('charts', '#chartscard')
    b = pg.locator('#charts svg').first.bounding_box()
    S['hover'] = []
    for k in range(7):
        pg.mouse.move(b['x'] + b['width'] * (.18 + k * .1), b['y'] + b['height'] * .5); pg.wait_for_timeout(250)
        S['hover'].append(f.shot('hover', '#chartscard'))
    laps = pg.locator('.card:has-text("Laps")').last
    laps.scroll_into_view_if_needed(); scroll(f, '.card:has(table)', offset=60, wait=600)
    S['laps'] = f.shot('laps', '.card:has(table) table')
    row = pg.locator('.card:has(table) table tbody tr').nth(4); row.click(); pg.wait_for_timeout(1200)
    top(f, 600); S['drill'] = f.shot('drill', '#stats')
    return S
def scenes(S):
    hv = S['hover']
    return [
      Title(6, 'The activity page', 'Everything about one workout, on one page.'),
      Screen([S['top']], 'The headline numbers: time, distance, pace, heart rate and climbing.', zoom=1.25),
      Screen([S['weather']], 'The weather on the day, and for runs, how much the heat cost you.', zoom=1.4),
      Screen([S['map']], 'Your route. Switch map styles with the layers button.', zoom=1.15),
      Screen([S['focus']], 'Training focus: where the session sat in your heart rate zones.', zoom=1.2),
      Screen([S['charts']], 'Charts for everything your watch recorded: pace, grade-adjusted pace, heart rate, cadence, power, running dynamics.', zoom=1.05),
      Screen([(p, b, .45) for p, b in hv] + [(hv[-1][0], hv[-1][1], 1.2)], 'Move along any chart, or the route, to read every value at that moment.', zoom=1.05, z0=1.05),
      Screen([S['laps']], "Laps, as your watch split them, with each lap's pace, heart rate and climbing.", zoom=1.15),
      Screen([S['drill']], 'Click a lap, a leg or a section to zoom the whole page in on it.', zoom=1.25),
      End('Multisport activities'),
    ]
