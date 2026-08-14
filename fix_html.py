with open('templates/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

html = html.replace('max-width: 400px; border-radius: 16px; padding: 40px;', 'max-width: 320px; border-radius: 8px; padding: 24px;')
html = html.replace('padding: 40px; width: 100%; max-width: 400px; border-radius: 16px;', 'padding: 24px; width: 100%; max-width: 320px; border-radius: 8px;')
html = html.replace('style="padding: 12px; border-radius: 8px;', 'style="padding: 8px 12px; border-radius: 4px;')
html = html.replace('padding: 12px; font-size: 16px;', 'padding: 8px 16px; font-size: 14px; border-radius: 4px;')

with open('templates/index.html', 'w', encoding='utf-8') as f:
    f.write(html)
print('Fixed login form size!')
