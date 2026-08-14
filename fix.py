with open('static/js/main_v2.js', 'r', encoding='utf-8') as f:
    js = f.read()
js = js.replace("document.getElementById('')?.addEventListener('submit'", "document.getElementById('login-form')?.addEventListener('submit'")
with open('static/js/main_v2.js', 'w', encoding='utf-8') as f:
    f.write(js)
print('Fixed login listener!')
