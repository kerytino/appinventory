import os

css_to_append = """
/* ==========================================================================
   Dark Theme Overrides
   ========================================================================== */
[data-theme="dark"] {
    --bg-main: #121212;
    --bg-dark: #1e1e1e;
    --text-main: #e0e0e0;
    --text-muted: #a0a0a0;
    
    --glass-bg: rgba(30, 30, 30, 0.75);
    --glass-border: rgba(255, 255, 255, 0.1);
    
    --color-primary: #548c5b;
    --color-primary-hover: #437349;
    --color-accent: #2e4a31;
    
    --shadow-sm: 0 2px 8px rgba(0,0,0,0.4);
    --shadow-md: 0 8px 24px rgba(0,0,0,0.5);
}

[data-theme="dark"] .glass-panel {
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    box-shadow: var(--shadow-sm);
}

[data-theme="dark"] .data-table th {
    background: rgba(255, 255, 255, 0.05);
    border-bottom: 2px solid var(--glass-border);
    color: var(--text-main);
}

[data-theme="dark"] .data-table td {
    border-bottom: 1px solid var(--glass-border);
    color: var(--text-main);
}

[data-theme="dark"] .form-control {
    background: var(--bg-dark);
    border: 1px solid var(--glass-border);
    color: var(--text-main);
}

[data-theme="dark"] .form-control:focus {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px rgba(84, 140, 91, 0.2);
}

[data-theme="dark"] .sidebar {
    background: var(--bg-dark);
    border-right: 1px solid var(--glass-border);
}

[data-theme="dark"] .header {
    background: var(--bg-main);
    border-bottom: 1px solid var(--glass-border);
}
"""

with open('static/css/design-system.css', 'a', encoding='utf-8') as f:
    f.write(css_to_append)
print("Dark theme CSS appended successfully.")
