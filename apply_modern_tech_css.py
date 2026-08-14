import os
import re

# 1. Add Fonts to base.html
with open('templates/base.html', encoding='utf-8') as f:
    html = f.read()

# Add fonts
fonts_link = """    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">"""

if 'fonts.googleapis.com' not in html:
    html = html.replace('<head>', '<head>\n' + fonts_link)
    with open('templates/base.html', 'w', encoding='utf-8') as f:
        f.write(html)
    print("Added Google Fonts to base.html")

# 2. Rewrite design-system.css for Dark Corporate Emerald
design_system = """/* DESIGN SYSTEM
   Modern Corporate Enterprise SaaS (Dark Tech Mode)
   Fonts: Outfit (Headers/Numbers), Inter (Body)
*/

@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700;800&display=swap');

:root {
    /* Brand Colors (Vibrant Emerald) */
    --color-primary: #10B981;
    --color-primary-hover: #059669;
    --color-primary-light: rgba(16, 185, 129, 0.15);
    --color-primary-glow: rgba(16, 185, 129, 0.4);
    
    /* Background & Surfaces (Dark Corporate) */
    --color-background: #0f172a;
    --color-surface: rgba(30, 41, 59, 0.7);
    --color-surface-hover: rgba(30, 41, 59, 0.9);
    --color-surface-solid: #1e293b;
    
    /* Text Colors */
    --color-text: #f8fafc;
    --color-text-secondary: #94a3b8;
    
    /* Borders */
    --color-border: rgba(255, 255, 255, 0.08);
    --color-border-highlight: rgba(255, 255, 255, 0.15);
    
    /* Semantic Colors */
    --color-success: #10B981;
    --color-success-light: rgba(16, 185, 129, 0.1);
    --color-warning: #F59E0B;
    --color-warning-light: rgba(245, 158, 11, 0.1);
    --color-danger: #EF4444;
    --color-danger-light: rgba(239, 68, 68, 0.1);
    --color-info: #3B82F6;
    --color-info-light: rgba(59, 130, 246, 0.1);
    
    /* Spacing & Sizes */
    --spacing-xs: 4px;
    --spacing-sm: 8px;
    --spacing-md: 16px;
    --spacing-lg: 24px;
    --spacing-xl: 32px;
    
    /* Radius */
    --radius-sm: 6px;
    --radius-md: 12px;
    --radius-lg: 16px;
    --radius-xl: 24px;
    
    /* Shadows (Deep & Multi-layered) */
    --shadow-sm: 0 1px 2px rgba(0,0,0,0.3);
    --shadow-md: 0 4px 6px -1px rgba(0,0,0,0.3), 0 2px 4px -1px rgba(0,0,0,0.2);
    --shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.4), 0 4px 6px -2px rgba(0,0,0,0.2);
    --shadow-glow: 0 0 15px var(--color-primary-glow);
    
    /* Transitions */
    --transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
    --transition-normal: 300ms cubic-bezier(0.4, 0, 0.2, 1);
    
    /* Glassmorphism */
    --glass-blur: blur(12px);
    --glass-bg: rgba(15, 23, 42, 0.7);
}

body {
    font-family: 'Inter', system-ui, sans-serif;
    background-color: var(--color-background);
    background-image: 
        radial-gradient(at 0% 0%, rgba(16, 185, 129, 0.15) 0px, transparent 50%),
        radial-gradient(at 100% 100%, rgba(59, 130, 246, 0.1) 0px, transparent 50%);
    background-attachment: fixed;
    color: var(--color-text);
    margin: 0;
    padding: 0;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
}

h1, h2, h3, h4, h5, h6, .outfit-font {
    font-family: 'Outfit', system-ui, sans-serif;
    font-weight: 600;
    color: var(--color-text);
    margin: 0;
}

.text-secondary {
    color: var(--color-text-secondary);
}

a {
    color: var(--color-primary);
    text-decoration: none;
    transition: color var(--transition-fast);
}

a:hover {
    color: var(--color-primary-hover);
}

/* Scrollbar */
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: var(--color-background); }
::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: var(--radius-sm); }
::-webkit-scrollbar-thumb:hover { background: var(--color-text-secondary); }
"""

with open('static/css/design-system.css', 'w', encoding='utf-8') as f:
    f.write(design_system)
print("Updated design-system.css")

# 3. Rewrite components.css for Glassmorphism and Micro-animations
components_css = """/* COMPONENTS */

/* Dashboard Cards (Glassmorphism) */
.dashboard-card {
    background: var(--color-surface);
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl);
    padding: var(--spacing-xl);
    box-shadow: var(--shadow-md);
    transition: transform var(--transition-normal), box-shadow var(--transition-normal), border-color var(--transition-normal);
}

.dashboard-card:hover {
    transform: translateY(-4px);
    box-shadow: var(--shadow-lg);
    border-color: var(--color-border-highlight);
}

.dashboard-card-title {
    font-size: 1.1rem;
    color: var(--color-text-secondary);
    margin-bottom: var(--spacing-lg);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 0.75rem;
    font-family: 'Inter', sans-serif;
    font-weight: 700;
}

/* KPI Cards */
.kpi-card {
    background: var(--color-surface);
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--spacing-lg);
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: var(--spacing-md);
    box-shadow: var(--shadow-md);
    transition: transform var(--transition-normal), box-shadow var(--transition-normal), border-color var(--transition-normal);
}

.kpi-card:hover {
    transform: translateY(-4px) scale(1.02);
    box-shadow: var(--shadow-lg), 0 0 15px rgba(16, 185, 129, 0.1);
    border-color: var(--color-primary);
}

.kpi-icon {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    flex-shrink: 0;
    background-color: var(--color-primary-light);
    color: var(--color-primary);
    transition: transform var(--transition-normal);
}

.kpi-card:hover .kpi-icon {
    transform: rotate(10deg) scale(1.1);
}

.kpi-value {
    font-family: 'Outfit', sans-serif;
    font-size: 32px !important;
    font-weight: 700;
    margin: 0;
    color: var(--color-text);
    text-shadow: 0 0 20px rgba(255,255,255,0.1);
}

/* Buttons */
.btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 10px 20px;
    border-radius: var(--radius-md);
    font-weight: 500;
    font-size: 0.9rem;
    cursor: pointer;
    transition: all var(--transition-fast);
    border: none;
    font-family: 'Inter', sans-serif;
}

.btn-primary {
    background-color: var(--color-primary);
    color: white;
    box-shadow: 0 2px 10px rgba(16, 185, 129, 0.3);
}

.btn-primary:hover {
    background-color: var(--color-primary-hover);
    box-shadow: var(--shadow-glow);
    transform: translateY(-2px);
}

.btn-outline {
    background-color: transparent;
    color: var(--color-text);
    border: 1px solid var(--color-border);
}

.btn-outline:hover {
    background-color: var(--color-surface-hover);
    border-color: var(--color-text-secondary);
}

.btn-danger {
    background-color: var(--color-danger);
    color: white;
    box-shadow: 0 2px 10px rgba(239, 68, 68, 0.3);
}

.btn-danger:hover {
    background-color: #DC2626;
    box-shadow: 0 0 15px rgba(239, 68, 68, 0.4);
    transform: translateY(-2px);
}

.btn-icon {
    background: transparent;
    border: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    border-radius: 50%;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--transition-fast);
}

.btn-icon:hover {
    background: var(--color-surface-hover);
    color: var(--color-text);
    transform: rotate(90deg);
}

/* Modals (Glassmorphism & Entry Anim) */
.modal-overlay {
    position: fixed;
    top: 0; left: 0; width: 100vw; height: 100vh;
    background: rgba(15, 23, 42, 0.6);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.3s ease, visibility 0.3s ease;
}

.modal-overlay.active {
    opacity: 1;
    visibility: visible;
}

.modal-content {
    background: var(--color-surface-solid);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-xl);
    width: 100%;
    max-width: 500px;
    box-shadow: var(--shadow-lg), 0 0 40px rgba(0,0,0,0.5);
    display: flex;
    flex-direction: column;
    transform: scale(0.9) translateY(20px);
    transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.modal-overlay.active .modal-content {
    transform: scale(1) translateY(0);
}

.modal-header {
    padding: var(--spacing-lg);
    border-bottom: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.modal-header .section-title { margin: 0; font-family: 'Outfit', sans-serif; }

.modal-body {
    padding: var(--spacing-lg);
}

.modal-footer {
    padding: var(--spacing-lg);
    border-top: 1px solid var(--color-border);
    display: flex;
    justify-content: flex-end;
    gap: var(--spacing-md);
    background: rgba(0,0,0,0.1);
    border-bottom-left-radius: var(--radius-xl);
    border-bottom-right-radius: var(--radius-xl);
}

/* Badges */
.badge {
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
}

.badge-success { background: var(--color-success-light); color: var(--color-success); border: 1px solid rgba(16, 185, 129, 0.2); }
.badge-warning { background: var(--color-warning-light); color: var(--color-warning); border: 1px solid rgba(245, 158, 11, 0.2); }
.badge-danger { background: var(--color-danger-light); color: var(--color-danger); border: 1px solid rgba(239, 68, 68, 0.2); }
.badge-info { background: var(--color-info-light); color: var(--color-info); border: 1px solid rgba(59, 130, 246, 0.2); }
.badge-default { background: var(--color-surface-hover); color: var(--color-text-secondary); border: 1px solid var(--color-border); }

/* Forms */
.form-group { display: flex; flex-direction: column; gap: var(--spacing-md); }
.form-control {
    display: flex; flex-direction: column; gap: 4px;
}
.form-control label {
    font-size: 0.85rem; font-weight: 500; color: var(--color-text-secondary);
}
.form-control input, .form-control select, .form-control textarea {
    padding: 10px 14px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: rgba(15, 23, 42, 0.5);
    color: var(--color-text);
    font-family: 'Inter', sans-serif;
    transition: all var(--transition-fast);
}
.form-control input:focus, .form-control select:focus, .form-control textarea:focus {
    outline: none;
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px var(--color-primary-light);
    background: rgba(15, 23, 42, 0.8);
}

/* Empty State */
.empty-state {
    padding: var(--spacing-xl);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    background: rgba(255,255,255,0.02);
    border-radius: var(--radius-lg);
    border: 1px dashed var(--color-border);
}
.empty-state i {
    font-size: 48px; color: var(--color-border); margin-bottom: var(--spacing-md);
}
"""
with open('static/css/components.css', 'w', encoding='utf-8') as f:
    f.write(components_css)
print("Updated components.css")

# 4. Rewrite layout.css for Glassmorphism
layout_css = """/* LAYOUT */

.app-container {
    display: flex;
    min-height: 100vh;
}

/* Sidebar (Glassmorphism) */
.sidebar {
    width: 260px;
    background: rgba(15, 23, 42, 0.8);
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    border-right: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    position: fixed;
    height: 100vh;
    left: 0;
    top: 0;
    z-index: 100;
}

.sidebar-header {
    padding: var(--spacing-xl) var(--spacing-lg);
    display: flex;
    align-items: center;
    justify-content: center;
    border-bottom: 1px solid rgba(255,255,255,0.05);
}

.sidebar-logo {
    max-height: 60px;
    filter: drop-shadow(0 0 10px rgba(255,255,255,0.2));
}

.sidebar-nav {
    flex-grow: 1;
    padding: var(--spacing-md);
    overflow-y: auto;
}

.nav-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    color: var(--color-text-secondary);
    border-radius: var(--radius-md);
    margin-bottom: 4px;
    font-weight: 500;
    transition: all var(--transition-fast);
}

.nav-item:hover {
    background: rgba(255,255,255,0.05);
    color: var(--color-text);
    transform: translateX(4px);
}

.nav-item.active {
    background: var(--color-primary-light);
    color: var(--color-primary);
    border-right: 3px solid var(--color-primary);
}

/* Submenu */
.nav-submenu {
    list-style: none;
    padding: 0;
    margin: 0;
    margin-left: 36px;
    display: none;
    border-left: 1px solid rgba(255,255,255,0.1);
}

.nav-submenu.open { display: block; }

.nav-submenu li a {
    display: block;
    padding: 8px 16px;
    color: var(--color-text-secondary);
    font-size: 0.9rem;
    position: relative;
}

.nav-submenu li a:hover, .nav-submenu li a.active {
    color: var(--color-text);
}
.nav-submenu li a.active::before {
    content: ''; position: absolute; left: -1px; top: 0; height: 100%; width: 2px; background: var(--color-primary);
}

.sidebar-footer {
    padding: var(--spacing-md);
    border-top: 1px solid rgba(255,255,255,0.05);
}

/* Main Content */
.main-content {
    flex-grow: 1;
    margin-left: 260px;
    display: flex;
    flex-direction: column;
}

/* Header (Glassmorphism) */
.top-header {
    height: 70px;
    background: rgba(15, 23, 42, 0.6);
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    border-bottom: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 var(--spacing-xl);
    position: sticky;
    top: 0;
    z-index: 50;
}

.header-title { margin: 0; font-size: 1.25rem; font-family: 'Outfit', sans-serif; }
.header-actions { display: flex; align-items: center; gap: var(--spacing-md); }

/* Page Content */
.page-content {
    padding: var(--spacing-xl);
    flex-grow: 1;
}
"""
with open('static/css/layout.css', 'w', encoding='utf-8') as f:
    f.write(layout_css)
print("Updated layout.css")

# 5. Fix tables.css/pages.css
with open('static/css/pages.css', encoding='utf-8') as f:
    pages_css = f.read()

# Add hover effects to table rows
if 'tr:hover' not in pages_css:
    pages_css += """
/* Modern Data Tables */
.data-table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
}

.data-table th {
    background: rgba(0,0,0,0.2);
    color: var(--color-text-secondary);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 12px 16px;
    text-align: left;
    border-bottom: 1px solid var(--color-border);
    font-family: 'Outfit', sans-serif;
}

.data-table td {
    padding: 16px;
    border-bottom: 1px solid rgba(255,255,255,0.03);
    color: var(--color-text);
    transition: background var(--transition-fast);
}

.data-table tbody tr {
    transition: all var(--transition-fast);
}

.data-table tbody tr:hover {
    background: rgba(255,255,255,0.02);
    transform: scale(1.005);
    box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    position: relative;
    z-index: 10;
    border-radius: var(--radius-md);
}

.data-table tbody tr:hover td {
    border-bottom-color: transparent;
}
.data-table tbody tr:hover td:first-child { border-top-left-radius: var(--radius-md); border-bottom-left-radius: var(--radius-md); }
.data-table tbody tr:hover td:last-child { border-top-right-radius: var(--radius-md); border-bottom-right-radius: var(--radius-md); }
"""
    with open('static/css/pages.css', 'w', encoding='utf-8') as f:
        f.write(pages_css)
    print("Updated pages.css with modern tables")

print("All CSS files generated successfully for Modern Tech Mode!")
