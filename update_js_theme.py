with open('static/js/main_v2.js', encoding='utf-8') as f:
    js = f.read()

# Change default to dark
js = js.replace("localStorage.getItem('netvault-theme') || 'glass'", "localStorage.getItem('netvault-theme') || 'dark'")

with open('static/js/main_v2.js', 'w', encoding='utf-8') as f:
    f.write(js)
print('Updated main_v2.js default theme')
