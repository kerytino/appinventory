html = open('templates/dashboard.html', encoding='utf-8').read()

old_warehouse = '''        <!-- Stock por Almacén -->
        <div class="dashboard-card">
            <h3 class="dashboard-card-title">Stock por Almacén</h3>
            <div class="table-container" style="max-height: 350px; overflow-y: auto;">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Almacén</th>
                            <th>Equipos</th>
                            <th>Costo Total</th>
                        </tr>
                    </thead>
                    <tbody id="warehouse-summary-table">
                        <!-- JS injected -->
                    </tbody>
                </table>
            </div>
        </div>'''

new_warehouse = '''        <!-- Stock por Almacén -->
        <div class="dashboard-card">
            <h3 class="dashboard-card-title">Stock por Almacén</h3>
            <div class="warehouse-chart-container" style="display: flex; align-items: center; gap: 32px; padding-top: 16px;">
                <div style="position: relative; width: 160px; height: 160px; flex-shrink: 0;">
                    <canvas id="warehouse-chart"></canvas>
                    <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center;">
                        <span style="display: block; font-size: 12px; color: var(--color-text-secondary);">Total</span>
                        <strong id="warehouse-total-cost" style="font-size: 16px; color: var(--color-text);">...</strong>
                    </div>
                </div>
                <div id="warehouse-legend" style="flex-grow: 1; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; max-height: 200px;">
                    <!-- JS injected -->
                </div>
            </div>
        </div>'''

if old_warehouse in html:
    html = html.replace(old_warehouse, new_warehouse)
else:
    print('Could not find old warehouse HTML block')

if '{% block extra_js %}' in html:
    if 'chart.js' not in html.lower():
        js_block = '''{% block extra_js %}
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>'''
        html = html.replace('{% block extra_js %}', js_block)
else:
    print('Could not find extra_js block')

open('templates/dashboard.html', 'w', encoding='utf-8').write(html)
print('Updated dashboard.html')
