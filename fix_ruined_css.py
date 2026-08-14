import re

with open('static/css/components.css', encoding='utf-8') as f:
    css = f.read()

# Fix modal-content
css = css.replace('.modal-content {\n    background: var(--color-surface);\n    border-radius: var(--radius-xl);\n    width: 100%;\n    max-width: 500px;\n    box-shadow: var(--shadow-modal);\n    display: flex;\n    flex-direction: row; align-items: center;\n}', '.modal-content {\n    background: var(--color-surface);\n    border-radius: var(--radius-xl);\n    width: 100%;\n    max-width: 500px;\n    box-shadow: var(--shadow-modal);\n    display: flex;\n    flex-direction: column;\n}')

# Fix empty-state
css = css.replace('.empty-state {\n    padding: var(--spacing-xl);\n    display: flex;\n    flex-direction: row; align-items: center;\n    align-items: center;\n    justify-content: center;', '.empty-state {\n    padding: var(--spacing-xl);\n    display: flex;\n    flex-direction: column;\n    align-items: center;\n    justify-content: center;')

with open('static/css/components.css', 'w', encoding='utf-8') as f:
    f.write(css)

print('Fixed ruined CSS classes!')
