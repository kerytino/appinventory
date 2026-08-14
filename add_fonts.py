import os

html_path = 'templates/base.html'
with open(html_path, encoding='utf-8') as f:
    html = f.read()

font_link = '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">\n'
if 'fonts.googleapis.com' not in html:
    html = html.replace('</head>', font_link + '</head>')
    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(html)
    print('Added Google Fonts to base.html')
else:
    print('Google Fonts already in base.html')
