import re

# 1. Fix KPI Card double-style bug
kpi_path = 'templates/components/kpi_card.html'
with open(kpi_path, encoding='utf-8') as f:
    kpi_html = f.read()

# Merge the styles
new_kpi_html = kpi_html.replace(
    '''{% if is_critical %}style="background-color: var(--color-danger-light); color: var(--color-danger);"{% endif %} style="width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px;"''',
    '''style="width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; {% if is_critical %}background-color: var(--color-danger-light); color: var(--color-danger);{% endif %}"'''
)
# Fix the outer card style too
new_kpi_html = new_kpi_html.replace(
    '''{% if is_critical %}style="border-color: var(--color-danger);"{% endif %} style="display: flex; align-items: center; gap: 16px;"''',
    '''style="display: flex; align-items: center; gap: 16px; {% if is_critical %}border-color: var(--color-danger);{% endif %}"'''
)

with open(kpi_path, 'w', encoding='utf-8') as f:
    f.write(new_kpi_html)

# 2. Fix Canvas size for the doughnut chart
dash_path = 'templates/dashboard.html'
with open(dash_path, encoding='utf-8') as f:
    dash_html = f.read()

dash_html = dash_html.replace(
    '<canvas id="warehouse-chart"></canvas>',
    '<div style="position: relative; width: 250px; height: 250px; flex-shrink: 0;"><canvas id="warehouse-chart"></canvas></div>'
)
with open(dash_path, 'w', encoding='utf-8') as f:
    f.write(dash_html)

# 3. Fix FontAwesome URL in base.html
base_path = 'templates/base.html'
with open(base_path, encoding='utf-8') as f:
    base_html = f.read()

base_html = re.sub(r'(href="https://cdnjs\.cloudflare\.com/ajax/libs/font-awesome/6\.4\.0/css/all\.min\.css)\?v=\d+"', r'\1"', base_html)
with open(base_path, 'w', encoding='utf-8') as f:
    f.write(base_html)

# 4. Fix table header background in components.css
comp_path = 'static/css/components.css'
with open(comp_path, encoding='utf-8') as f:
    comp_css = f.read()

comp_css = comp_css.replace('background-color: #F9FAFB;', 'background-color: #f0f4f1;')
with open(comp_path, 'w', encoding='utf-8') as f:
    f.write(comp_css)

print('Layout fixes applied successfully!')
