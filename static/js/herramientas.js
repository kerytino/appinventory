/**
 * Módulo de Control de Herramientas y Equipos de Uso Interno
 * The Excellence Collection - AppInventory
 */

document.addEventListener('DOMContentLoaded', () => {
    let allTools = [];
    let auxiliaryData = {
        technicians: [],
        warehouses: [],
        hotels: []
    };

    // DOM Elements
    const searchInput = document.getElementById('tool-search-input');
    const filterStatus = document.getElementById('filter-tool-status');
    const filterCategory = document.getElementById('filter-tool-category');
    const filterTech = document.getElementById('filter-tool-technician');
    const filterWarehouse = document.getElementById('filter-tool-warehouse');
    const btnResetFilters = document.getElementById('btn-reset-tool-filters');
    const btnExportCsv = document.getElementById('btn-export-tools-csv');
    const btnOpenNew = document.getElementById('btn-open-new-tool');
    const tbody = document.getElementById('tools-tbody');

    // Modals
    const toolModal = document.getElementById('tool-modal');
    const formTool = document.getElementById('form-tool');
    const assignModal = document.getElementById('tool-assign-modal');
    const formAssign = document.getElementById('form-tool-assign');
    const returnModal = document.getElementById('tool-return-modal');
    const formReturn = document.getElementById('form-tool-return');

    // Init
    init();

    async function init() {
        await loadAuxiliaryData();
        await fetchTools();
        setupEventListeners();
    }

    async function loadAuxiliaryData() {
        try {
            const [techRes, whRes, hotRes] = await Promise.all([
                fetch('/api/settings/technicians'),
                fetch('/api/settings/warehouses'),
                fetch('/api/settings/hotels')
            ]);

            if (techRes.ok) auxiliaryData.technicians = await techRes.json();
            if (whRes.ok) auxiliaryData.warehouses = await whRes.json();
            if (hotRes.ok) auxiliaryData.hotels = await hotRes.json();

            populateDatalistsAndFilters();
        } catch (e) {
            console.error('Error loading auxiliary data:', e);
        }
    }

    function populateWarehouseDropdown(selectElem, selectedVal = 'Taller IT') {
        if (!selectElem) return;
        selectElem.innerHTML = '';
        
        const whNames = ['Taller IT'];
        (auxiliaryData.warehouses || []).forEach(w => {
            if (w.name && !whNames.includes(w.name)) {
                whNames.push(w.name);
            }
        });

        if (selectedVal && !whNames.includes(selectedVal)) {
            whNames.push(selectedVal);
        }

        whNames.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            if (selectedVal && name.toLowerCase() === selectedVal.toLowerCase()) {
                opt.selected = true;
            }
            selectElem.appendChild(opt);
        });

        if (selectedVal) {
            selectElem.value = selectedVal;
        }
    }

    function populateDatalistsAndFilters() {
        // Techs
        const techList = document.getElementById('list-techs-tools');
        if (techList) {
            techList.innerHTML = '';
            auxiliaryData.technicians.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.name;
                techList.appendChild(opt);
            });
        }
        if (filterTech) {
            const currentVal = filterTech.value;
            filterTech.innerHTML = '<option value="all">Técnico: Todos</option>';
            auxiliaryData.technicians.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.name;
                opt.textContent = t.name;
                filterTech.appendChild(opt);
            });
            filterTech.value = currentVal;
        }

        // Warehouses Filter
        if (filterWarehouse) {
            const currentVal = filterWarehouse.value;
            filterWarehouse.innerHTML = '<option value="all">Almacén / Taller: Todos</option>';
            const allWhs = ['Taller IT', ...(auxiliaryData.warehouses || []).map(w => w.name).filter(Boolean)];
            [...new Set(allWhs)].forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                filterWarehouse.appendChild(opt);
            });
            filterWarehouse.value = currentVal;
        }

        // Hotels
        const hotList = document.getElementById('list-hotels-tools');
        if (hotList) {
            hotList.innerHTML = '';
            auxiliaryData.hotels.forEach(h => {
                const opt = document.createElement('option');
                opt.value = `${h.name} (${h.sigla || ''})`.trim();
                hotList.appendChild(opt);
            });
        }

        // Populate modal selects
        populateWarehouseDropdown(document.getElementById('tool-warehouse'), 'Taller IT');
        populateWarehouseDropdown(document.getElementById('return-warehouse'), 'Taller IT');
    }

    async function fetchTools() {
        try {
            const res = await fetch('/api/tools');
            if (res.ok) {
                const data = await res.json();
                allTools = data.tools || [];
                renderKPIs(data.stats);
                applyFiltersAndRender();
            } else {
                tbody.innerHTML = '<tr><td colspan="11" style="text-align: center; color: var(--color-danger); padding: 30px;">Error al cargar las herramientas.</td></tr>';
            }
        } catch (err) {
            console.error('Error fetching tools:', err);
            tbody.innerHTML = '<tr><td colspan="11" style="text-align: center; color: var(--color-danger); padding: 30px;">Error de conexión.</td></tr>';
        }
    }

    function renderKPIs(stats) {
        if (!stats) return;
        document.getElementById('kpi-total-tools').textContent = stats.total || 0;
        document.getElementById('kpi-total-qty').textContent = `${stats.total || 0} unidades registradas`;
        document.getElementById('kpi-available-tools').textContent = stats.available || 0;
        document.getElementById('kpi-in-use-tools').textContent = stats.in_use || 0;
        document.getElementById('kpi-maintenance-tools').textContent = stats.maintenance || 0;
        document.getElementById('kpi-total-value').textContent = `RD$ ${(stats.total_value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    function applyFiltersAndRender() {
        const query = (searchInput.value || '').toLowerCase().trim();
        const status = filterStatus.value;
        const category = filterCategory.value;
        const tech = filterTech.value;
        const wh = filterWarehouse.value;

        const filtered = allTools.filter(t => {
            if (status !== 'all' && t.status !== status) return false;
            if (category !== 'all' && t.category !== category) return false;
            if (tech !== 'all' && (t.assigned_to || '').toLowerCase() !== tech.toLowerCase()) return false;
            if (wh !== 'all' && (t.warehouse || '').toLowerCase() !== wh.toLowerCase()) return false;

            if (query) {
                const matchName = (t.name || '').toLowerCase().includes(query);
                const matchCode = (t.code || '').toLowerCase().includes(query);
                const matchBrand = (t.brand || '').toLowerCase().includes(query);
                const matchModel = (t.model || '').toLowerCase().includes(query);
                const matchSerial = (t.serial_number || '').toLowerCase().includes(query);
                const matchTech = (t.assigned_to || '').toLowerCase().includes(query);
                const matchNotes = (t.notes || '').toLowerCase().includes(query);
                if (!matchName && !matchCode && !matchBrand && !matchModel && !matchSerial && !matchTech && !matchNotes) {
                    return false;
                }
            }
            return true;
        });

        renderTable(filtered);
    }

    function renderTable(tools) {
        tbody.innerHTML = '';
        if (tools.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="11" style="text-align: center; padding: 40px; color: var(--color-text-secondary);">
                        <i class="fa-solid fa-toolbox" style="font-size: 32px; margin-bottom: 12px; display: block; opacity: 0.4;"></i>
                        No se encontraron herramientas con los criterios seleccionados.
                    </td>
                </tr>
            `;
            return;
        }

        tools.forEach(t => {
            const tr = document.createElement('tr');

            // Status Badge
            let statusBadge = '';
            if (t.status === 'Disponible') {
                statusBadge = `<span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; font-weight: 700;"><i class="fa-solid fa-circle-check"></i> Disponible</span>`;
            } else if (t.status === 'En Uso / Asignada') {
                statusBadge = `<span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; font-weight: 700;"><i class="fa-solid fa-user-gear"></i> En Uso</span>`;
            } else if (t.status === 'En Mantenimiento') {
                statusBadge = `<span class="badge" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; font-weight: 700;"><i class="fa-solid fa-screwdriver-wrench"></i> Mantenimiento</span>`;
            } else if (t.status === 'Dañada') {
                statusBadge = `<span class="badge" style="background: rgba(100, 116, 139, 0.15); color: #64748b; font-weight: 700;"><i class="fa-solid fa-triangle-exclamation"></i> Dañada</span>`;
            } else {
                statusBadge = `<span class="badge" style="background: rgba(148, 163, 184, 0.15); color: #94a3b8; font-weight: 700;">${escapeHtml(t.status)}</span>`;
            }

            // Condition Badge
            let conditionBadge = '';
            if (t.condition === 'Excelente') {
                conditionBadge = `<span style="color: #10b981; font-weight: 600;"><i class="fa-solid fa-star"></i> Excelente</span>`;
            } else if (t.condition === 'Buena') {
                conditionBadge = `<span style="color: #0284c7; font-weight: 600;"><i class="fa-solid fa-check"></i> Buena</span>`;
            } else if (t.condition === 'Regular') {
                conditionBadge = `<span style="color: #f59e0b; font-weight: 600;"><i class="fa-solid fa-circle-dot"></i> Regular</span>`;
            } else {
                conditionBadge = `<span style="color: #ef4444; font-weight: 600;"><i class="fa-solid fa-wrench"></i> ${escapeHtml(t.condition)}</span>`;
            }

            // Tech & Location display
            const techDisplay = t.assigned_to 
                ? `<strong><i class="fa-solid fa-user" style="color: #f59e0b; margin-right: 4px;"></i>${escapeHtml(t.assigned_to)}</strong>${t.assigned_date ? `<div style="font-size: 11px; color: var(--color-text-secondary);">${t.assigned_date}</div>` : ''}`
                : '<span style="color: var(--color-text-secondary); font-size: 12px;">En taller</span>';

            const locationDisplay = t.location 
                ? `<div><i class="fa-solid fa-location-dot" style="color: var(--color-primary); margin-right: 4px;"></i>${escapeHtml(t.location)}</div><div style="font-size: 11px; color: var(--color-text-secondary);">${escapeHtml(t.warehouse || 'Taller IT')}</div>`
                : `<div><i class="fa-solid fa-warehouse" style="color: var(--color-text-secondary); margin-right: 4px;"></i>${escapeHtml(t.warehouse || 'Taller IT')}</div>`;

            // Action buttons based on status
            let primaryActionBtn = '';
            if (t.status === 'Disponible') {
                primaryActionBtn = `
                    <button class="action-btn btn-assign-tool" data-id="${t.id}" title="Asignar / Prestar a Técnico" style="color: #f59e0b; margin-right: 4px;">
                        <i class="fa-solid fa-hand-holding-hand"></i>
                    </button>
                `;
            } else if (t.status === 'En Uso / Asignada') {
                primaryActionBtn = `
                    <button class="action-btn btn-return-tool" data-id="${t.id}" title="Registrar Devolución al Taller" style="color: #10b981; margin-right: 4px;">
                        <i class="fa-solid fa-warehouse"></i>
                    </button>
                `;
            }

            tr.innerHTML = `
                <td>
                    <span style="font-family: monospace; font-weight: 700; color: var(--color-primary);">${escapeHtml(t.code || `HER-${t.id}`)}</span>
                </td>
                <td>
                    <strong style="color: var(--color-text);">${escapeHtml(t.name)}</strong>
                    ${t.quantity > 1 ? `<span class="badge" style="margin-left: 6px; font-size: 11px; background: rgba(37,99,235,0.1); color: var(--color-primary);">${t.quantity} unids</span>` : ''}
                    ${t.notes ? `<div style="font-size: 12px; color: var(--color-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 250px;" title="${escapeHtml(t.notes)}"><i class="fa-solid fa-comment-dots" style="margin-right: 4px;"></i>${escapeHtml(t.notes)}</div>` : ''}
                </td>
                <td>
                    <span class="badge" style="background: rgba(100, 116, 139, 0.1); color: var(--color-text); font-size: 12px;">${escapeHtml(t.category)}</span>
                </td>
                <td>${escapeHtml(t.brand || '-')} ${escapeHtml(t.model ? `/ ${t.model}` : '')}</td>
                <td><span style="font-family: monospace; font-size: 12px; color: var(--color-text-secondary);">${escapeHtml(t.serial_number || '-')}</span></td>
                <td>${locationDisplay}</td>
                <td style="text-align: center;">${statusBadge}</td>
                <td>${techDisplay}</td>
                <td style="text-align: center;">${conditionBadge}</td>
                <td style="text-align: right; font-weight: 600; font-family: monospace;">RD$ ${parseFloat(t.value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td style="text-align: right; white-space: nowrap;">
                    ${primaryActionBtn}
                    <button class="action-btn edit btn-edit-tool" data-id="${t.id}" title="Editar Herramienta" style="margin-right: 4px;">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="action-btn delete btn-delete-tool" data-id="${t.id}" data-name="${escapeHtml(t.name)}" title="Eliminar Herramienta">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            `;

            tbody.appendChild(tr);
        });

        attachTableEvents();
    }

    function attachTableEvents() {
        // Assign Tool button
        tbody.querySelectorAll('.btn-assign-tool').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.getAttribute('data-id'));
                const tool = allTools.find(item => item.id === id);
                if (tool) openAssignModal(tool);
            });
        });

        // Return Tool button
        tbody.querySelectorAll('.btn-return-tool').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.getAttribute('data-id'));
                const tool = allTools.find(item => item.id === id);
                if (tool) openReturnModal(tool);
            });
        });

        // Edit Tool button
        tbody.querySelectorAll('.btn-edit-tool').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.getAttribute('data-id'));
                const tool = allTools.find(item => item.id === id);
                if (tool) openToolModal('edit', tool);
            });
        });

        // Delete Tool button
        tbody.querySelectorAll('.btn-delete-tool').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                const name = btn.getAttribute('data-name');
                if (!confirm(`¿Estás seguro de eliminar la herramienta "${name}" del registro?`)) return;

                try {
                    const res = await fetch(`/api/tools/${id}`, { method: 'DELETE' });
                    if (res.ok) {
                        showToast(`Herramienta "${name}" eliminada`, 'success');
                        await fetchTools();
                    } else {
                        showToast('Error al eliminar herramienta', 'error');
                    }
                } catch (e) {
                    showToast('Error de conexión', 'error');
                }
            });
        });
    }

    function openToolModal(mode = 'add', tool = null) {
        formTool.reset();
        const whSelect = document.getElementById('tool-warehouse');
        if (mode === 'edit' && tool) {
            document.getElementById('tool-modal-title').innerHTML = `<i class="fa-solid fa-pen-to-square" style="color: var(--color-primary); margin-right: 8px;"></i><span>Editar Herramienta: ${escapeHtml(tool.name)}</span>`;
            document.getElementById('tool-id').value = tool.id;
            document.getElementById('tool-code').value = tool.code || '';
            document.getElementById('tool-name').value = tool.name || '';
            document.getElementById('tool-category').value = tool.category || 'General';
            document.getElementById('tool-brand').value = tool.brand || '';
            document.getElementById('tool-model').value = tool.model || '';
            document.getElementById('tool-serial').value = tool.serial_number || '';
            document.getElementById('tool-condition').value = tool.condition || 'Buena';
            document.getElementById('tool-status').value = tool.status || 'Disponible';
            populateWarehouseDropdown(whSelect, tool.warehouse || 'Taller IT');
            document.getElementById('tool-value').value = tool.value || 0;
            document.getElementById('tool-quantity').value = tool.quantity || 1;
            document.getElementById('tool-notes').value = tool.notes || '';
        } else {
            document.getElementById('tool-modal-title').innerHTML = `<i class="fa-solid fa-toolbox" style="color: var(--color-primary); margin-right: 8px;"></i><span>Nueva Herramienta de Trabajo</span>`;
            document.getElementById('tool-id').value = '';
            populateWarehouseDropdown(whSelect, 'Taller IT');
            document.getElementById('tool-quantity').value = 1;
            document.getElementById('tool-value').value = '0.00';
            document.getElementById('tool-condition').value = 'Buena';
            document.getElementById('tool-status').value = 'Disponible';
        }
        toolModal.classList.add('active');
    }

    function openAssignModal(tool) {
        formAssign.reset();
        document.getElementById('assign-tool-id').value = tool.id;
        document.getElementById('assign-tool-name').textContent = tool.name;
        document.getElementById('assign-tool-details').textContent = `Código: ${tool.code || `HER-${tool.id}`} | S/N: ${tool.serial_number || 'S/N'} | Marca: ${tool.brand || '-'} ${tool.model || ''}`;
        document.getElementById('assign-date').value = new Date().toISOString().split('T')[0];
        document.getElementById('assign-location').value = tool.location || '';
        assignModal.classList.add('active');
    }

    function openReturnModal(tool) {
        formReturn.reset();
        document.getElementById('return-tool-id').value = tool.id;
        document.getElementById('return-tool-name').textContent = tool.name;
        document.getElementById('return-tool-details').textContent = `Actualmente en poder de: ${tool.assigned_to || 'Técnico'} | Ubicación: ${tool.location || 'N/A'}`;
        const returnWhSelect = document.getElementById('return-warehouse');
        populateWarehouseDropdown(returnWhSelect, tool.warehouse || 'Taller IT');
        document.getElementById('return-condition').value = tool.condition || 'Buena';
        returnModal.classList.add('active');
    }

    function setupEventListeners() {
        // Search & Filters
        searchInput.addEventListener('input', applyFiltersAndRender);
        filterStatus.addEventListener('change', applyFiltersAndRender);
        filterCategory.addEventListener('change', applyFiltersAndRender);
        filterTech.addEventListener('change', applyFiltersAndRender);
        filterWarehouse.addEventListener('change', applyFiltersAndRender);

        btnResetFilters.addEventListener('click', () => {
            searchInput.value = '';
            filterStatus.value = 'all';
            filterCategory.value = 'all';
            filterTech.value = 'all';
            filterWarehouse.value = 'all';
            applyFiltersAndRender();
        });

        // Open Modal
        btnOpenNew.addEventListener('click', () => openToolModal('add'));

        // Close Modals
        const closeToolM = () => toolModal.classList.remove('active');
        document.getElementById('btn-close-tool-modal')?.addEventListener('click', closeToolM);
        document.getElementById('btn-cancel-tool-modal')?.addEventListener('click', closeToolM);

        const closeAssignM = () => assignModal.classList.remove('active');
        document.getElementById('btn-close-assign-modal')?.addEventListener('click', closeAssignM);
        document.getElementById('btn-cancel-assign-modal')?.addEventListener('click', closeAssignM);

        const closeReturnM = () => returnModal.classList.remove('active');
        document.getElementById('btn-close-return-modal')?.addEventListener('click', closeReturnM);
        document.getElementById('btn-cancel-return-modal')?.addEventListener('click', closeReturnM);

        // Submit Tool Form
        formTool.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('tool-id').value;
            const payload = {
                code: document.getElementById('tool-code').value.trim(),
                name: document.getElementById('tool-name').value.trim(),
                category: document.getElementById('tool-category').value,
                brand: document.getElementById('tool-brand').value.trim(),
                model: document.getElementById('tool-model').value.trim(),
                serial_number: document.getElementById('tool-serial').value.trim(),
                condition: document.getElementById('tool-condition').value,
                status: document.getElementById('tool-status').value,
                warehouse: document.getElementById('tool-warehouse').value.trim(),
                value: parseFloat(document.getElementById('tool-value').value) || 0.0,
                quantity: parseInt(document.getElementById('tool-quantity').value) || 1,
                notes: document.getElementById('tool-notes').value.trim()
            };

            const url = id ? `/api/tools/${id}` : '/api/tools';
            const method = id ? 'PUT' : 'POST';

            try {
                const res = await fetch(url, {
                    method: method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (res.ok) {
                    showToast(id ? 'Herramienta actualizada' : 'Herramienta registrada exitosamente', 'success');
                    closeToolM();
                    await fetchTools();
                } else {
                    showToast(data.error || 'Error al guardar herramienta', 'error');
                }
            } catch (err) {
                showToast('Error de conexión', 'error');
            }
        });

        // Submit Assign Form
        formAssign.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('assign-tool-id').value;
            const payload = {
                assigned_to: document.getElementById('assign-tech').value.trim(),
                assigned_date: document.getElementById('assign-date').value,
                location: document.getElementById('assign-location').value.trim(),
                notes: document.getElementById('assign-notes').value.trim()
            };

            try {
                const res = await fetch(`/api/tools/${id}/assign`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (res.ok) {
                    showToast(`Herramienta asignada a ${payload.assigned_to}`, 'success');
                    closeAssignM();
                    await fetchTools();
                } else {
                    showToast(data.error || 'Error al asignar', 'error');
                }
            } catch (err) {
                showToast('Error de conexión', 'error');
            }
        });

        // Submit Return Form
        formReturn.addEventListener('submit', async (e) => {
            e.preventDefault();
            const id = document.getElementById('return-tool-id').value;
            const payload = {
                warehouse: document.getElementById('return-warehouse').value.trim(),
                condition: document.getElementById('return-condition').value,
                notes: document.getElementById('return-notes').value.trim()
            };

            try {
                const res = await fetch(`/api/tools/${id}/return`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                if (res.ok) {
                    showToast('Herramienta devuelta al taller exitosamente', 'success');
                    closeReturnM();
                    await fetchTools();
                } else {
                    showToast(data.error || 'Error al devolver', 'error');
                }
            } catch (err) {
                showToast('Error de conexión', 'error');
            }
        });

        // CSV Export
        btnExportCsv?.addEventListener('click', exportToCSV);
    }

    function exportToCSV() {
        if (allTools.length === 0) {
            showToast('No hay herramientas para exportar', 'warning');
            return;
        }

        const headers = ['Código', 'Herramienta', 'Categoría', 'Marca', 'Modelo', 'Serial', 'Estado', 'Asignado a', 'Fecha Asignación', 'Ubicación', 'Almacén/Taller', 'Condición', 'Valor USD', 'Cantidad', 'Notas'];
        const rows = allTools.map(t => [
            `"${t.code || `HER-${t.id}`}"`,
            `"${(t.name || '').replace(/"/g, '""')}"`,
            `"${(t.category || '').replace(/"/g, '""')}"`,
            `"${(t.brand || '').replace(/"/g, '""')}"`,
            `"${(t.model || '').replace(/"/g, '""')}"`,
            `"${(t.serial_number || '').replace(/"/g, '""')}"`,
            `"${t.status || ''}"`,
            `"${(t.assigned_to || '').replace(/"/g, '""')}"`,
            `"${t.assigned_date || ''}"`,
            `"${(t.location || '').replace(/"/g, '""')}"`,
            `"${(t.warehouse || '').replace(/"/g, '""')}"`,
            `"${t.condition || ''}"`,
            t.value || 0,
            t.quantity || 1,
            `"${(t.notes || '').replace(/"/g, '""')}"`
        ]);

        const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `Inventario_Herramientas_IT_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('Exportación completada con éxito', 'success');
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
});
