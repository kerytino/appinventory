with open('apply_modern_tech_css.py', encoding='utf-8') as f:
    lines = f.readlines()

components_content = []
layout_content = []

in_components = False
in_layout = False

for line in lines:
    if line.startswith('components_css = '):
        in_components = True
        continue
    if line.startswith('\"\"\"') and in_components:
        in_components = False
        continue
    
    if line.startswith('layout_css = '):
        in_layout = True
        continue
    if line.startswith('\"\"\"') and in_layout:
        in_layout = False
        continue

    if in_components:
        components_content.append(line)
    if in_layout:
        layout_content.append(line)

with open('static/css/components.css', 'a', encoding='utf-8') as f:
    f.write('\\n\\n/* MODERN TECH OVERRIDES */\\n')
    f.write(''.join(components_content))

with open('static/css/layout.css', 'a', encoding='utf-8') as f:
    f.write('\\n\\n/* MODERN TECH OVERRIDES */\\n')
    f.write(''.join(layout_content))

print('Successfully appended modern tech styles safely!')
