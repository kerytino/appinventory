import re

css_path = 'static/css/design-system.css'
with open(css_path, encoding='utf-8') as f:
    css = f.read()

# Update root variables for softer look and Inter font
css = re.sub(r'--font-main:.*?;', '--font-main: \'Inter\', system-ui, sans-serif;', css)
css = re.sub(r'--border-radius-sm:.*?;', '--border-radius-sm: 8px;', css)
css = re.sub(r'--border-radius-md:.*?;', '--border-radius-md: 16px;', css)
css = re.sub(r'--border-radius-lg:.*?;', '--border-radius-lg: 24px;', css)
css = re.sub(r'--shadow-sm:.*?;', '--shadow-sm: 0 4px 12px rgba(0,0,0,0.05);', css)
css = re.sub(r'--shadow-md:.*?;', '--shadow-md: 0 12px 32px rgba(0,0,0,0.08);', css)

# Add glassmorphism to specific components
glass_css = """
/* Glassmorphism Additions */
.sidebar {
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    background: rgba(255, 255, 255, 0.85);
}

[data-theme="dark"] .sidebar {
    background: rgba(30, 30, 30, 0.85);
}

.header {
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    background: rgba(255, 255, 255, 0.8);
}

[data-theme="dark"] .header {
    background: rgba(18, 18, 18, 0.8);
}

.data-table tbody tr {
    transition: all 0.2s ease;
}

.data-table tbody tr:hover {
    transform: translateY(-1px);
    box-shadow: var(--shadow-sm);
    background-color: rgba(84, 140, 91, 0.03);
}

[data-theme="dark"] .data-table tbody tr:hover {
    background-color: rgba(255, 255, 255, 0.05);
}

.btn {
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.btn-primary {
    background: linear-gradient(135deg, var(--color-primary), var(--color-accent));
    box-shadow: 0 4px 12px rgba(84, 140, 91, 0.2);
    border: none;
}

.btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(84, 140, 91, 0.3);
}
"""

if 'Glassmorphism Additions' not in css:
    css += '\n' + glass_css

with open(css_path, 'w', encoding='utf-8') as f:
    f.write(css)
print('UI Modernization CSS applied.')
