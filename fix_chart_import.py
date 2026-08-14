import os

html_path = 'templates/index.html'
html = open(html_path, encoding='utf-8').read()

if 'chart.js' not in html.lower():
    html = html.replace('</body>', '<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>\n</body>')
    open(html_path, 'w', encoding='utf-8').write(html)
    print("Added Chart.js to index.html")
else:
    print("Chart.js is already there")
