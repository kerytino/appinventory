import os
import re

for js_file in ['static/js/tables.js', 'static/js/app.js', 'static/js/main_v2.js']:
    if os.path.exists(js_file):
        content = open(js_file, encoding='utf-8').read()
        
        # Replace simple <td>${d.status}</td>
        content = re.sub(r'<td>\$\{([a-zA-Z0-9_]+)\.status\}<\/td>', 
                       r'<td><span class="status-badge ${getStatusClass(\1.status)}">${\1.status}</span></td>', content)
        
        # Replace existing class assignments that don't have status-badge
        content = content.replace('<span class="${getStatusClass(', '<span class="status-badge ${getStatusClass(')
        
        open(js_file, 'w', encoding='utf-8').write(content)

print('Updated table rendering in JS')
