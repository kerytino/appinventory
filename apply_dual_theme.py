import re

css = """/* DESIGN SYSTEM
   Modern Corporate Enterprise SaaS (Light & Dark Tech Mode)
   Fonts: Outfit (Headers/Numbers), Inter (Body)
*/

@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700;800&display=swap');

/* --- LIGHT MODE (Default Corporate) --- */
:root {
    /* Brand Colors (Vibrant Emerald) */
    --color-primary: #10B981;
    --color-primary-hover: #059669;
    --color-primary-light: rgba(16, 185, 129, 0.15);
    --color-primary-glow: rgba(16, 185, 129, 0.3);
    
    /* Background & Surfaces */
    --color-background: #f8fafc;
    --color-surface: rgba(255, 255, 255, 0.85);
    --color-surface-hover: rgba(255, 255, 255, 1);
    --color-surface-solid: #ffffff;
    
    /* Text Colors */
    --color-text: #0f172a;
    --color-text-secondary: #64748b;
    
    /* Borders */
    --color-border: rgba(0, 0, 0, 0.08);
    --color-border-highlight: rgba(16, 185, 129, 0.3);
    
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
    
    /* Shadows (Soft & Multi-layered) */
    --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
    --shadow-md: 0 4px 6px -1px rgba(0,0,0,0.05), 0 2px 4px -1px rgba(0,0,0,0.03);
    --shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05);
    --shadow-glow: 0 0 15px var(--color-primary-glow);
    
    /* Transitions */
    --transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
    --transition-normal: 300ms cubic-bezier(0.4, 0, 0.2, 1);
    
    /* Glassmorphism */
    --glass-blur: blur(12px);
    --glass-bg: rgba(255, 255, 255, 0.7);
    
    /* Body Background Gradient */
    --body-bg-gradient: 
        radial-gradient(at 0% 0%, rgba(16, 185, 129, 0.08) 0px, transparent 50%),
        radial-gradient(at 100% 100%, rgba(59, 130, 246, 0.05) 0px, transparent 50%);
}

/* --- DARK MODE (Tech/Hacker) --- */
[data-theme="dark"] {
    /* Brand Colors (Keep Vibrant Emerald) */
    --color-primary-light: rgba(16, 185, 129, 0.15);
    --color-primary-glow: rgba(16, 185, 129, 0.4);
    
    /* Background & Surfaces */
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
    
    /* Shadows (Deep) */
    --shadow-sm: 0 1px 2px rgba(0,0,0,0.3);
    --shadow-md: 0 4px 6px -1px rgba(0,0,0,0.3), 0 2px 4px -1px rgba(0,0,0,0.2);
    --shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.4), 0 4px 6px -2px rgba(0,0,0,0.2);
    
    /* Glassmorphism */
    --glass-bg: rgba(15, 23, 42, 0.7);
    
    /* Body Background Gradient */
    --body-bg-gradient: 
        radial-gradient(at 0% 0%, rgba(16, 185, 129, 0.15) 0px, transparent 50%),
        radial-gradient(at 100% 100%, rgba(59, 130, 246, 0.1) 0px, transparent 50%);
}

body {
    font-family: 'Inter', system-ui, sans-serif;
    background-color: var(--color-background);
    background-image: var(--body-bg-gradient);
    background-attachment: fixed;
    color: var(--color-text);
    margin: 0;
    padding: 0;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    transition: background-color var(--transition-normal), color var(--transition-normal);
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
    f.write(css)
print("Updated design-system.css to support light/dark themes!")
