html = open('templates/index.html', encoding='utf-8').read()

old_warehouse = '''                    <div class="recent-activity glass-panel" style="margin-top: 0;">
                        <h2>Stock por Almacén</h2>
                        <div class="table-container" style="max-height: 300px; overflow-y: auto;">
                            <table class="data-table">
                                <thead>
                                    <tr>
                                        <th>Almacén</th>
                                        <th>Equipos</th>
                                        <th>Costo Total</th>
                                    </tr>
                                </thead>
                                <tbody id="warehouse-summary-table">
                                    <!-- Llenado dinámicamente -->
                                </tbody>
                            </table>
                        </div>
                    </div>'''

new_warehouse = '''                    <div class="recent-activity glass-panel" style="margin-top: 0;">
                        <h2>Stock por Almacén</h2>
                        <div class="warehouse-chart-container" style="display: flex; align-items: center; gap: 32px; padding-top: 16px;">
                            <div style="position: relative; width: 160px; height: 160px; flex-shrink: 0;">
                                <canvas id="warehouse-chart"></canvas>
                                <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center;">
                                    <span style="display: block; font-size: 12px; color: var(--color-text-secondary);">Total</span>
                                    <strong id="warehouse-total-cost" style="font-size: 16px; color: var(--color-text);">$0.00</strong>
                                </div>
                            </div>
                            <div id="warehouse-legend" style="flex-grow: 1; display: flex; flex-direction: column; gap: 16px; overflow-y: auto; max-height: 200px;">
                                <!-- JS injected -->
                            </div>
                        </div>
                    </div>'''

if old_warehouse in html:
    html = html.replace(old_warehouse, new_warehouse)
    open('templates/index.html', 'w', encoding='utf-8').write(html)
    print('Replaced in index.html')
else:
    print('Could not find exact block, let us use regex or manual replace')
