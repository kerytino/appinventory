import re

with open('static/js/app.js', encoding='utf-8') as f:
    js = f.read()

# Fix chart options in JS
js = re.sub(
    r'cutout:\s*[\'"]?[0-9]+%?[\'"]?,?',
    'cutout: "75%",\n            responsive: true,\n            maintainAspectRatio: false,',
    js
)

with open('static/js/app.js', 'w', encoding='utf-8') as f:
    f.write(js)

print('Fixed app.js chart options!')
