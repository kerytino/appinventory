import os
import re

js_logic = """
        // Populate Warehouse Summary Chart
        const warehouseSummary = {};
        let totalCost = 0;
        let totalCount = 0;
        
        stockDevices.forEach(d => {
            const w = d.warehouse && d.warehouse.trim() !== '' ? d.warehouse : 'Sin Almacén / Por Defecto';
            if (!warehouseSummary[w]) {
                warehouseSummary[w] = { count: 0, totalValue: 0 };
            }
            const q = d.quantity || 1;
            warehouseSummary[w].count += q;
            const val = parseFloat(d.value || 0);
            warehouseSummary[w].totalValue += val;
            totalCost += val;
            totalCount += q;
        });

        const wLegend = document.getElementById('warehouse-legend');
        const wTotalCost = document.getElementById('warehouse-total-cost');
        const canvas = document.getElementById('warehouse-chart');
        
        if (wTotalCost) wTotalCost.textContent = formatCurrency(totalCost);
        
        if (wLegend && canvas) {
            wLegend.innerHTML = '';
            
            const labels = [];
            const data = [];
            const backgroundColors = [
                '#548c5b', // Main organic green
                '#7db183', // Lighter green
                '#a8cfad',
                '#d2ead4',
                '#3a6340'
            ];
            
            let colorIdx = 0;
            for (const [w, info] of Object.entries(warehouseSummary)) {
                labels.push(w);
                data.push(info.count);
                
                const percent = totalCost > 0 ? ((info.totalValue / totalCost) * 100).toFixed(1) : 0;
                
                const itemHtml = `
                    <div style="display: flex; align-items: flex-start; gap: 12px;">
                        <div style="width: 12px; height: 12px; border-radius: 50%; background-color: ${backgroundColors[colorIdx % backgroundColors.length]}; margin-top: 4px; flex-shrink: 0;"></div>
                        <div style="flex-grow: 1;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                <span style="font-weight: 600; font-size: 13px; color: var(--color-text-secondary); text-transform: uppercase;">${w}</span>
                                <span style="font-weight: 700; font-size: 13px; color: var(--color-text);">${formatCurrency(info.totalValue)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <span style="font-size: 13px; color: var(--color-text-light);">${info.count} equipos</span>
                                <span style="font-size: 13px; color: var(--color-text-light);">${percent}%</span>
                            </div>
                        </div>
                    </div>
                `;
                wLegend.insertAdjacentHTML('beforeend', itemHtml);
                colorIdx++;
            }
            
            // Draw chart
            if (window.warehouseChartInstance) {
                window.warehouseChartInstance.destroy();
            }
            
            if (typeof Chart !== 'undefined') {
                window.warehouseChartInstance = new Chart(canvas, {
                    type: 'doughnut',
                    data: {
                        labels: labels,
                        datasets: [{
                            data: data,
                            backgroundColor: backgroundColors,
                            borderWidth: 0,
                            cutout: '75%'
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        return ' ' + context.label + ': ' + context.raw + ' equipos';
                                    }
                                }
                            }
                        },
                        animation: { duration: 0 }
                    }
                });
            }
        }
"""

old_js = """        // Populate Warehouse Summary
        const warehouseSummary = {};
        stockDevices.forEach(d => {
            const w = d.warehouse && d.warehouse.trim() !== '' ? d.warehouse : 'Sin Almacn / Por Defecto';
            if (!warehouseSummary[w]) {
                warehouseSummary[w] = { count: 0, totalValue: 0 };
            }
            const q = d.quantity || 1;
            warehouseSummary[w].count += q;
            warehouseSummary[w].totalValue += parseFloat(d.value || 0);
        });
        const warehouseTbody = document.getElementById('warehouse-summary-table');
        if (warehouseTbody) {
            warehouseTbody.innerHTML = '';
            for (const [w, info] of Object.entries(warehouseSummary)) {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${w}</td>
                    <td style="font-size: 16px;"><strong>${info.count}</strong></td>
                    <td style="font-size: 16px; font-weight: 600;">${formatCurrency(info.totalValue)}</td>
                `;
                warehouseTbody.appendChild(tr);
            }
        }"""

for js_file in ['static/js/app.js', 'static/js/main_v2.js']:
    if os.path.exists(js_file):
        content = open(js_file, encoding='utf-8').read()
        
        # We need a better way to replace since the encoding issues might mess up the text literal
        # Let's use regex to find the block
        
        pattern = re.compile(r'// Populate Warehouse Summary\s+const warehouseSummary = \{\};.*?\}\s+\}', re.DOTALL)
        content = pattern.sub(js_logic.replace('\\', '\\\\'), content)
        
        open(js_file, 'w', encoding='utf-8').write(content)

print('Updated js')
