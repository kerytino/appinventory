import os

html_path = 'templates/base.html'
html = open(html_path, encoding='utf-8').read()

if 'chart.js' not in html.lower():
    insert_str = '<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>\n'
    html = html.replace('<!-- Global scripts -->', '<!-- Global scripts -->\n' + insert_str)
    open(html_path, 'w', encoding='utf-8').write(html)
    print("Added Chart.js to base.html")
else:
    print("Chart.js is already there")
