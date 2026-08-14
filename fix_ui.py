import re

# 1. Inline the header into base.html
base = open('templates/base.html', encoding='utf-8').read()
header = open('templates/partials/header.html', encoding='utf-8').read()
base = base.replace("{% include 'partials/header.html' %}", header)
open('templates/base.html', 'w', encoding='utf-8').write(base)

# 2. Add form-control and form-label to modals.html
modals = open('templates/partials/modals.html', encoding='utf-8').read()
modals = re.sub(r'<input (?!.*?class=)', r'<input class="form-control" ', modals)
modals = re.sub(r'<select (?!.*?class=)', r'<select class="form-control" ', modals)
modals = re.sub(r'<textarea (?!.*?class=)', r'<textarea class="form-control" ', modals)
modals = re.sub(r'<label (?!.*?class=)', r'<label class="form-label" ', modals)

# Add btn classes to buttons in modals
modals = re.sub(r'<button type="button" onclick="closeModal\((.*?)\)">', r'<button type="button" class="btn-outline" onclick="closeModal(\1)">', modals)
modals = re.sub(r'<button type="submit"(.*?)>', r'<button type="submit" class="btn-primary"\1>', modals)

open('templates/partials/modals.html', 'w', encoding='utf-8').write(modals)

# 3. Fix scrollbars in css
css = open('static/css/layout.css', encoding='utf-8').read()
css = css.replace('width: 100vw;', 'width: 100%;')
css = css.replace('overflow-x: hidden;', '')
open('static/css/layout.css', 'w', encoding='utf-8').write(css)

print('Done fixing UI issues in templates.')
