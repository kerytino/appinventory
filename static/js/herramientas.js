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

    // Safe Notification Helper
    function showToast(message, type = 'success') {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
            return;
        }
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerText = message;
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease-in forwards';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

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

    let currentEditingTool = null;

    // Modals
    const toolModal = document.getElementById('tool-modal');
    const formTool = document.getElementById('form-tool');
    const assignModal = document.getElementById('tool-assign-modal');
    const formAssign = document.getElementById('form-tool-assign');
    const returnModal = document.getElementById('tool-return-modal');
    const formReturn = document.getElementById('form-tool-return');
    const historyModal = document.getElementById('tool-history-modal');
    const historyTimelineContainer = document.getElementById('history-timeline-container');

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
            (auxiliaryData.technicians || []).forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.name;
                techList.appendChild(opt);
            });
        }
        if (filterTech) {
            const currentVal = filterTech.value;
            filterTech.innerHTML = '<option value="all">Técnico: Todos</option>';
            (auxiliaryData.technicians || []).forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.name;
                opt.textContent = t.name;
                filterTech.appendChild(opt);
            });
            filterTech.value = currentVal || 'all';
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
            filterWarehouse.value = currentVal || 'all';
        }

        // Hotels
        const hotList = document.getElementById('list-hotels-tools');
        if (hotList) {
            hotList.innerHTML = '';
            (auxiliaryData.hotels || []).forEach(h => {
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
        document.getElementById('kpi-total-value').textContent = `$ ${(stats.total_value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
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
                statusBadge = `<span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; font-weight: 700; border: 1px solid rgba(16, 185, 129, 0.3);"><i class="fa-solid fa-circle-check"></i> Disponible</span>`;
            } else if (t.status === 'En Uso / Asignada') {
                statusBadge = `<span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; font-weight: 700; border: 1px solid rgba(245, 158, 11, 0.3);"><i class="fa-solid fa-user-gear"></i> En Uso</span>`;
            } else if (t.status === 'En Mantenimiento') {
                statusBadge = `<span class="badge" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; font-weight: 700; border: 1px solid rgba(239, 68, 68, 0.3);"><i class="fa-solid fa-screwdriver-wrench"></i> Mantenimiento</span>`;
            } else if (t.status === 'Dañada') {
                statusBadge = `<span class="badge" style="background: rgba(100, 116, 139, 0.15); color: #64748b; font-weight: 700; border: 1px solid rgba(100, 116, 139, 0.3);"><i class="fa-solid fa-triangle-exclamation"></i> Dañada</span>`;
            } else {
                statusBadge = `<span class="badge" style="background: rgba(148, 163, 184, 0.15); color: #94a3b8; font-weight: 700;">${escapeHtml(t.status)}</span>`;
            }

            // Condition Badge
            let conditionBadge = '';
            if (t.condition === 'Excelente') {
                conditionBadge = `<span style="color: #10b981; font-weight: 700;"><i class="fa-solid fa-star"></i> Excelente</span>`;
            } else if (t.condition === 'Buena') {
                conditionBadge = `<span style="color: #0284c7; font-weight: 700;"><i class="fa-solid fa-check"></i> Buena</span>`;
            } else if (t.condition === 'Regular') {
                conditionBadge = `<span style="color: #f59e0b; font-weight: 700;"><i class="fa-solid fa-circle-dot"></i> Regular</span>`;
            } else {
                conditionBadge = `<span style="color: #ef4444; font-weight: 700;"><i class="fa-solid fa-wrench"></i> ${escapeHtml(t.condition)}</span>`;
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
                    <button class="tool-action-btn assign btn-assign-tool" data-id="${t.id}" title="Asignar / Prestar a Técnico" style="color: #f59e0b;">
                        <i class="fa-solid fa-handshake"></i>
                    </button>
                `;
            } else if (t.status === 'En Uso / Asignada') {
                primaryActionBtn = `
                    <button class="tool-action-btn return btn-return-tool" data-id="${t.id}" title="Registrar Devolución al Taller" style="color: #10b981;">
                        <i class="fa-solid fa-warehouse"></i>
                    </button>
                `;
            }

            // Botón de Decomiso para herramientas Dañadas
            let decommissionBtn = '';
            if (t.status === 'Dañada' || (t.condition && t.condition.toLowerCase().includes('dañad'))) {
                decommissionBtn = `
                    <button class="tool-action-btn decommission btn-decommission-tool" data-id="${t.id}" title="Enviar Herramienta Dañada a Decomiso Oficial" style="color: #dc2626;">
                        <i class="fa-solid fa-dumpster-fire"></i>
                    </button>
                `;
            }

            // Botón de Historial con indicador de movimientos
            const movesCount = t.movements_count || 0;
            const hasMovesClass = movesCount > 0 ? 'has-moves' : '';
            const movesBadge = movesCount > 0 ? `<span class="movs-badge" title="${movesCount} movimientos">${movesCount}</span>` : '';
            const historyBtnTitle = movesCount > 0 ? `Ver Historial (${movesCount} movimientos registrados)` : 'Ver Historial de Movimientos';

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
                    <span class="badge" style="background: rgba(100, 116, 139, 0.1); color: var(--color-text); font-size: 12px; font-weight: 600;">${escapeHtml(t.category)}</span>
                </td>
                <td>${escapeHtml(t.brand || '-')} ${escapeHtml(t.model ? `/ ${t.model}` : '')}</td>
                <td><span style="font-family: monospace; font-size: 12px; color: var(--color-text-secondary);">${escapeHtml(t.serial_number || '-')}</span></td>
                <td>${locationDisplay}</td>
                <td style="text-align: center;">${statusBadge}</td>
                <td>${techDisplay}</td>
                <td style="text-align: center;">${conditionBadge}</td>
                <td style="text-align: right; font-weight: 700; font-family: monospace; font-size: 13px; white-space: nowrap;">$${parseFloat(t.value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD</td>
                <td style="text-align: right;">
                    <div class="actions-cell-wrapper">
                        ${primaryActionBtn}
                        ${decommissionBtn}
                        <button class="tool-action-btn history btn-history-tool ${hasMovesClass}" data-id="${t.id}" title="${historyBtnTitle}" style="color: #6366f1;">
                            <i class="fa-solid fa-clock-rotate-left"></i>
                            ${movesBadge}
                        </button>
                        <button class="tool-action-btn edit btn-edit-tool" data-id="${t.id}" title="Editar Herramienta" style="color: var(--color-primary);">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="tool-action-btn delete btn-delete-tool" data-id="${t.id}" data-name="${escapeHtml(t.name)}" title="Eliminar Herramienta" style="color: #ef4444;">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
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

        // Decommission Tool button
        tbody.querySelectorAll('.btn-decommission-tool').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.getAttribute('data-id'));
                const tool = allTools.find(item => item.id === id);
                if (tool) openDecommissionModal(tool);
            });
        });

        // History Tool button
        tbody.querySelectorAll('.btn-history-tool').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.getAttribute('data-id'));
                const tool = allTools.find(item => item.id === id);
                if (tool) openHistoryModal(tool);
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
        const btnModalHistory = document.getElementById('btn-modal-tool-history');

        if (mode === 'edit' && tool) {
            currentEditingTool = tool;
            if (btnModalHistory) btnModalHistory.style.display = 'inline-flex';
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

            // Limpiar notas de cualquier log histórico legado para que solo se muestren accesorios y notas puras
            const rawNotes = tool.notes || '';
            const cleanNotes = rawNotes
                .split('\n')
                .filter(l => !(l.trim().startsWith('[') && l.includes(']')))
                .join('\n')
                .trim();
            document.getElementById('tool-notes').value = cleanNotes;
        } else {
            currentEditingTool = null;
            if (btnModalHistory) btnModalHistory.style.display = 'none';
            document.getElementById('tool-modal-title').innerHTML = `<i class="fa-solid fa-toolbox" style="color: var(--color-primary); margin-right: 8px;"></i><span>Nueva Herramienta de Trabajo</span>`;
            document.getElementById('tool-id').value = '';
            populateWarehouseDropdown(whSelect, 'Taller IT');
            document.getElementById('tool-quantity').value = 1;
            document.getElementById('tool-value').value = '0.00';
            document.getElementById('tool-condition').value = 'Buena';
            document.getElementById('tool-status').value = 'Disponible';
            document.getElementById('tool-notes').value = '';
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

    const decModal = document.getElementById('tool-decommission-modal');
    const formDec = document.getElementById('form-tool-decommission');

    function openDecommissionModal(tool) {
        if (!tool) return;
        formDec.reset();
        document.getElementById('dec-tool-id').value = tool.id;
        document.getElementById('dec-tool-name').textContent = `${tool.name} ${tool.brand ? `(${tool.brand} ${tool.model || ''})` : ''}`;
        document.getElementById('dec-tool-details').textContent = `Código: ${tool.code || `HER-${tool.id}`} | S/N: ${tool.serial_number || 'S/N'} | Estado actual: ${tool.status}`;
        document.getElementById('dec-tool-value').value = (tool.value || 0).toFixed(2);
        document.getElementById('dec-tool-reason').value = tool.notes ? `Herramienta dañada / fuera de servicio. ${tool.notes}` : 'Herramienta dañada / fuera de servicio técnico.';

        // Llenar select de hoteles
        const hotelSelect = document.getElementById('dec-tool-hotel');
        hotelSelect.innerHTML = '<option value="">Selecciona la propiedad para generar folio...</option>';
        if (auxiliaryData.hotels && auxiliaryData.hotels.length > 0) {
            auxiliaryData.hotels.forEach(h => {
                const opt = document.createElement('option');
                opt.value = h.name || h;
                opt.textContent = `${h.name || h} (${h.prefix || 'EX'})`;
                hotelSelect.appendChild(opt);
            });
        }

        // Preview del número al cambiar de hotel
        hotelSelect.onchange = async () => {
            const selectedHotel = hotelSelect.value;
            const previewInput = document.getElementById('dec-tool-number-preview');
            if (!selectedHotel) {
                previewInput.value = '';
                return;
            }
            try {
                const res = await fetch(`/api/decommissions/preview-number?hotel=${encodeURIComponent(selectedHotel)}`);
                if (res.ok) {
                    const d = await res.json();
                    previewInput.value = d.decommission_number || 'FOLIO-AUTO';
                }
            } catch(e) {
                previewInput.value = 'FOLIO-AUTO';
            }
        };

        if (decModal) decModal.classList.add('active');
    }

    async function openHistoryModal(tool) {
        if (!tool) return;
        document.getElementById('history-tool-title').textContent = `${tool.name} ${tool.brand ? `(${tool.brand} ${tool.model || ''})` : ''}`;
        document.getElementById('history-tool-code').textContent = tool.code || `HER-${tool.id}`;
        document.getElementById('history-tool-sn').textContent = tool.serial_number || 'S/N';
        document.getElementById('history-tool-assigned').textContent = tool.assigned_to ? `${tool.assigned_to} (${tool.location || 'N/A'})` : 'En Taller IT';

        // Badge de estado actual
        let stBadge = '';
        if (tool.status === 'Disponible') {
            stBadge = `<span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; font-weight: 700;"><i class="fa-solid fa-circle-check"></i> Disponible</span>`;
        } else if (tool.status === 'En Uso / Asignada') {
            stBadge = `<span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; font-weight: 700;"><i class="fa-solid fa-user-gear"></i> En Uso</span>`;
        } else if (tool.status === 'En Mantenimiento') {
            stBadge = `<span class="badge" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; font-weight: 700;"><i class="fa-solid fa-screwdriver-wrench"></i> Mantenimiento</span>`;
        } else if (tool.status === 'Dañada') {
            stBadge = `<span class="badge" style="background: rgba(220, 38, 38, 0.15); color: #dc2626; font-weight: 700;"><i class="fa-solid fa-triangle-exclamation"></i> Dañada</span>`;
        } else if (tool.status === 'Baja') {
            stBadge = `<span class="badge" style="background: rgba(100, 116, 139, 0.2); color: #475569; font-weight: 700;"><i class="fa-solid fa-dumpster-fire"></i> Decomisada / Baja</span>`;
        } else {
            stBadge = `<span class="badge" style="background: rgba(100, 116, 139, 0.15); color: #64748b; font-weight: 700;">${escapeHtml(tool.status)}</span>`;
        }
        document.getElementById('history-tool-status-badge').innerHTML = stBadge;

        historyTimelineContainer.innerHTML = `
            <div style="text-align: center; padding: 30px; color: var(--color-text-secondary);">
                <i class="fa-solid fa-spinner fa-spin" style="font-size: 22px; margin-bottom: 8px; display: block;"></i>
                Cargando historial de movimientos...
            </div>
        `;

        historyModal.classList.add('active');

        try {
            const res = await fetch(`/api/tools/${tool.id}/history`);
            if (res.ok) {
                const data = await res.json();
                const logs = data.history || [];
                renderHistoryTimeline(logs);
            } else {
                historyTimelineContainer.innerHTML = `
                    <div style="text-align: center; padding: 30px; color: var(--color-danger);">
                        <i class="fa-solid fa-circle-exclamation" style="font-size: 24px; margin-bottom: 8px; display: block;"></i>
                        Error al cargar el historial.
                    </div>
                `;
            }
        } catch (err) {
            console.error(err);
            historyTimelineContainer.innerHTML = `
                <div style="text-align: center; padding: 30px; color: var(--color-danger);">
                    <i class="fa-solid fa-triangle-exclamation" style="font-size: 24px; margin-bottom: 8px; display: block;"></i>
                    Error de conexión al cargar historial.
                </div>
            `;
        }
    }

    function renderHistoryTimeline(logs) {
        document.getElementById('history-count-badge').textContent = `${logs.length} ${logs.length === 1 ? 'movimiento registrado' : 'movimientos registrados'}`;
        if (!logs || logs.length === 0) {
            historyTimelineContainer.innerHTML = `
                <div style="text-align: center; padding: 40px 20px; color: var(--color-text-secondary);">
                    <div style="width: 50px; height: 50px; border-radius: 50%; background: var(--color-surface-2, rgba(0,0,0,0.04)); display: inline-flex; align-items: center; justify-content: center; margin-bottom: 12px;">
                        <i class="fa-solid fa-clock-rotate-left" style="font-size: 22px; opacity: 0.5;"></i>
                    </div>
                    <div style="font-weight: 700; color: var(--color-text); margin-bottom: 4px;">Sin movimientos registrados</div>
                    <div style="font-size: 13px;">Esta herramienta aún no tiene registros de asignación o devolución en el historial.</div>
                </div>
            `;
            return;
        }

        historyTimelineContainer.innerHTML = '';
        logs.forEach(log => {
            const item = document.createElement('div');
            item.style.cssText = 'position: relative; padding-left: 36px; padding-bottom: 18px; border-left: 2px solid var(--color-border); margin-left: 10px;';

            let iconHtml = '<i class="fa-solid fa-circle-dot"></i>';
            let iconColor = '#6366f1';
            let iconBg = 'rgba(99, 102, 241, 0.15)';
            let actionBadge = `<span class="badge" style="background: rgba(99, 102, 241, 0.12); color: #6366f1; font-weight: 700;">${escapeHtml(log.action)}</span>`;

            if (log.action === 'Asignación' || log.action === 'Despacho') {
                iconHtml = '<i class="fa-solid fa-handshake"></i>';
                iconColor = '#f59e0b';
                iconBg = 'rgba(245, 158, 11, 0.15)';
                actionBadge = `<span class="badge" style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; font-weight: 700;"><i class="fa-solid fa-arrow-right-from-bracket"></i> Asignada / Despachada</span>`;
            } else if (log.action === 'Devolución') {
                iconHtml = '<i class="fa-solid fa-warehouse"></i>';
                iconColor = '#10b981';
                iconBg = 'rgba(16, 185, 129, 0.15)';
                actionBadge = `<span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; font-weight: 700;"><i class="fa-solid fa-arrow-right-to-bracket"></i> Devolución al Taller</span>`;
            } else if (log.action === 'Decomiso' || log.action === 'Enviado a Decomiso') {
                iconHtml = '<i class="fa-solid fa-dumpster-fire"></i>';
                iconColor = '#dc2626';
                iconBg = 'rgba(220, 38, 38, 0.15)';
                actionBadge = `<span class="badge" style="background: rgba(220, 38, 38, 0.15); color: #dc2626; font-weight: 700;"><i class="fa-solid fa-dumpster-fire"></i> Enviado a Decomiso</span>`;
            } else if (log.action === 'Registro Inicial') {
                iconHtml = '<i class="fa-solid fa-box"></i>';
                iconColor = '#3b82f6';
                iconBg = 'rgba(59, 130, 246, 0.15)';
                actionBadge = `<span class="badge" style="background: rgba(59, 130, 246, 0.15); color: #3b82f6; font-weight: 700;"><i class="fa-solid fa-plus"></i> Registro Inicial</span>`;
            }

            item.innerHTML = `
                <div style="position: absolute; left: -14px; top: 0; width: 26px; height: 26px; border-radius: 50%; background: ${iconBg}; color: ${iconColor}; display: flex; align-items: center; justify-content: center; font-size: 11px; border: 2px solid var(--color-surface);">
                    ${iconHtml}
                </div>
                <div style="background: var(--color-surface-2, rgba(0,0,0,0.02)); border: 1px solid var(--color-border); border-radius: 10px; padding: 14px 16px;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; flex-wrap: wrap; margin-bottom: 8px;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            ${actionBadge}
                            ${log.technician ? `<strong style="font-size: 13px; color: var(--color-text);"><i class="fa-solid fa-user" style="color: #f59e0b; margin-right: 4px;"></i>${escapeHtml(log.technician)}</strong>` : ''}
                        </div>
                        <div style="font-size: 12px; color: var(--color-text-secondary); display: flex; align-items: center; gap: 6px;">
                            <i class="fa-regular fa-calendar"></i> ${escapeHtml(log.date || '')} ${log.timestamp ? `<span style="opacity: 0.7;">${escapeHtml(log.timestamp.split(' ')[1] || '')}</span>` : ''}
                        </div>
                    </div>

                    <div style="display: flex; flex-wrap: wrap; gap: 14px; font-size: 12px; color: var(--color-text-secondary); margin-bottom: ${log.notes ? '10px' : '0'};">
                        ${log.location ? `<div><i class="fa-solid fa-location-dot" style="color: var(--color-primary); margin-right: 4px;"></i><strong>Ubicación:</strong> ${escapeHtml(log.location)}</div>` : ''}
                        ${log.warehouse ? `<div><i class="fa-solid fa-warehouse" style="color: #10b981; margin-right: 4px;"></i><strong>Almacén:</strong> ${escapeHtml(log.warehouse)}</div>` : ''}
                        ${log.condition ? `<div><i class="fa-solid fa-circle-check" style="color: #6366f1; margin-right: 4px;"></i><strong>Estado:</strong> ${escapeHtml(log.condition)}</div>` : ''}
                        ${log.performed_by ? `<div><i class="fa-solid fa-user-shield" style="margin-right: 4px;"></i><strong>Registrado por:</strong> ${escapeHtml(log.performed_by)}</div>` : ''}
                    </div>

                    ${log.notes ? `
                        <div style="background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 8px; padding: 9px 12px; font-size: 12.5px; color: var(--color-text); line-height: 1.4;">
                            <i class="fa-solid fa-comment-dots" style="color: #64748b; margin-right: 4px;"></i>${escapeHtml(log.notes)}
                        </div>
                    ` : ''}
                </div>
            `;
            historyTimelineContainer.appendChild(item);
        });
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

        const closeDecM = () => decModal?.classList.remove('active');
        document.getElementById('btn-close-dec-modal')?.addEventListener('click', closeDecM);
        document.getElementById('btn-cancel-dec-modal')?.addEventListener('click', closeDecM);

        const closeHistoryM = () => historyModal.classList.remove('active');
        document.getElementById('btn-close-history-modal')?.addEventListener('click', closeHistoryM);
        document.getElementById('btn-close-history-modal-footer')?.addEventListener('click', closeHistoryM);

        // Open History from Tool Modal
        document.getElementById('btn-modal-tool-history')?.addEventListener('click', () => {
            if (currentEditingTool) {
                openHistoryModal(currentEditingTool);
            }
        });

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
                console.error(err);
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
                console.error(err);
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
                console.error(err);
                showToast('Error de conexión', 'error');
            }
        });

        // Submit Decommission Form
        formDec?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const toolId = document.getElementById('dec-tool-id').value;
            const hotel = document.getElementById('dec-tool-hotel').value;
            const value = parseFloat(document.getElementById('dec-tool-value').value) || 0.0;
            const reason = document.getElementById('dec-tool-reason').value.trim();

            if (!hotel) {
                showToast('Por favor selecciona una propiedad / hotel', 'error');
                return;
            }

            try {
                const res = await fetch(`/api/tools/${toolId}/decommission`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ hotel, value, reason })
                });
                const data = await res.json();
                if (res.ok) {
                    showToast(data.message || 'Herramienta enviada a decomiso exitosamente', 'success');
                    closeDecM();
                    await fetchTools();
                } else {
                    showToast(data.error || 'Error al enviar a decomiso', 'error');
                }
            } catch(err) {
                console.error(err);
                showToast('Error de conexión al procesar decomiso', 'error');
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

        const headers = ['Código', 'Herramienta', 'Categoría', 'Marca', 'Modelo', 'Serial', 'Estado', 'Asignado a', 'Fecha Asignación', 'Ubicación', 'Almacén/Taller', 'Condición', 'Valor RD$', 'Cantidad', 'Notas'];
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
