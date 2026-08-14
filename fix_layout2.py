import re

# Fix KPI Card direction
with open('static/css/components.css', encoding='utf-8') as f:
    css = f.read()

css = css.replace('flex-direction: column;', 'flex-direction: row; align-items: center;')

with open('static/css/components.css', 'w', encoding='utf-8') as f:
    f.write(css)

# Fix chart options in JS
with open('static/js/main_v2.js', encoding='utf-8') as f:
    js = f.read()

js = re.sub(
    r'cutout:\s*[\'"]?[0-9]+%?[\'"]?,?',
    'cutout: "75%",\n            responsive: true,\n            maintainAspectRatio: false,',
    js
)

with open('static/js/main_v2.js', 'w', encoding='utf-8') as f:
    f.write(js)

print('Fixed CSS and JS!')
