import re

with open('templates/dashboard.html', encoding='utf-8') as f:
    html = f.read()

# Fix the chart container sizes
# Original:
# <div style="position: relative; width: 160px; height: 160px; flex-shrink: 0;">
#     <div style="position: relative; width: 250px; height: 250px; flex-shrink: 0;"><canvas id="warehouse-chart"></canvas></div>

html = html.replace('width: 160px; height: 160px;', 'width: 200px; height: 200px;')
html = html.replace('width: 250px; height: 250px;', 'width: 100%; height: 100%;')

with open('templates/dashboard.html', 'w', encoding='utf-8') as f:
    f.write(html)

print('Fixed dashboard.html chart size!')
