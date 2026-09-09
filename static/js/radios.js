// =========================================================================
// CONTROLADOR JAVASCRIPT - TEC-RADIOS (MÓDULO DE GESTIÓN DE RADIOS)
// SISTEMA ROBUSTO, REACTIVO Y TOTALMENTE MODULAR
// =========================================================================

let userProperties = [];
let currentPropertyId = 'all';
let currentRadiosList = [];
let statusChartInstance = null;

const STATUS_MAP = {
    operativo: { label: 'Operativo', class: 'badge-success', icon: 'fa-circle-check' },
    requiere_revision: { label: 'Requiere Revisión', class: 'badge-warning', icon: 'fa-triangle-exclamation' },
    en_reparacion: { label: 'En Reparación', class: 'badge-warning', icon: 'fa-wrench' },
    danado: { label: 'Dañado', class: 'badge-danger', icon: 'fa-circle-xmark' },
    perdido: { label: 'No Localizado / Perdido', class: 'badge-dark', icon: 'fa-circle-question' },
    fuera_servicio: { label: 'Fuera de Servicio', class: 'badge-info', icon: 'fa-ban' },
    disponible: { label: 'Disponible', class: 'badge-secondary', icon: 'fa-warehouse' },
    en_almacen: { label: 'En Almacén', class: 'badge-secondary', icon: 'fa-boxes-stacked' }
};

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
}

function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.add('active');
}

function renderStatusBadge(statusKey) {
    const meta = STATUS_MAP[statusKey] || { label: statusKey || 'Operativo', class: 'badge-secondary', icon: 'fa-circle' };
    return `<span class="badge ${meta.class}"><i class="fa-solid ${meta.icon} me-1"></i> ${meta.label}</span>`;
}

// -------------------------------------------------------------------------
// FUNCIONES GLOBALES DE MODALES
// -------------------------------------------------------------------------
window.openModal = function (modalId) {
    const m = document.getElementById(modalId);
    if (m) m.classList.add('active');
};

window.closeModal = function (modalId) {
    const m = document.getElementById(modalId);
    if (m) m.classList.remove('active');
};

window.openNewRadioModal = function () {
    const modal = document.getElementById('modal-radio-item');
    if (modal) {
        document.getElementById('form-radio-item')?.reset();
        const idField = document.getElementById('rad-form-id');
        if (idField) idField.value = '';
        
        const codeInput = document.getElementById('rad-form-code');
        if (codeInput) {
            codeInput.value = '----';
            codeInput.placeholder = 'Calculando...';
        }

        const hintEl = document.getElementById('rad-form-id-hint');
        if (hintEl) {
            hintEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-primary me-1"></i> Identificando bloque de IDs disponible...';
        }

        const propSel = document.getElementById('rad-form-property');
        if (propSel && userProperties.length > 0) {
            propSel.innerHTML = userProperties.map(p => `<option value="${p.id}">${escapeHtml(p.name)} (${escapeHtml(p.sigla)})</option>`).join('');
            if (currentPropertyId !== 'all') {
                propSel.value = currentPropertyId;
            }
        }
        loadDepartmentsForForms().then(() => {
            const deptSel = document.getElementById('rad-form-dept');
            if (deptSel && deptSel.options.length > 1) {
                deptSel.selectedIndex = 1;
                deptSel.dispatchEvent(new Event('change'));
            }
        });
        modal.classList.add('active');
    }
};

// -------------------------------------------------------------------------
// NAVEGACIÓN GLOBAL DE PESTAÑAS (TABS)
// -------------------------------------------------------------------------
window.switchRadioTab = function (targetTab) {
    if (!targetTab) return;

    // Actualizar botones de navegación
    const navItems = document.querySelectorAll('.radio-sidebar-nav-item, .radio-tab-btn');
    navItems.forEach(b => {
        if (b.getAttribute('data-tab') === targetTab) {
            b.classList.add('active');
        } else {
            b.classList.remove('active');
        }
    });

    // Ocultar todos los paneles y mostrar el destino
    const tabContents = document.querySelectorAll('.radio-tab-content');
    tabContents.forEach(c => c.style.display = 'none');
    
    const targetEl = document.getElementById(targetTab);
    if (targetEl) {
        targetEl.style.display = 'block';
    }

    // Cargar los datos correspondientes a cada solapa
    switch (targetTab) {
        case 'tab-dashboard':
            loadDashboard();
            break;
        case 'tab-inventory':
            loadRadiosList();
            break;
        case 'tab-search':
            initSearchTab();
            break;
        case 'tab-formal-inv':
            loadFormalInventories();
            break;
        case 'tab-my-inv':
            loadMyInventory();
            break;
        case 'tab-assignments':
            loadAssignments();
            break;
        case 'tab-reports':
            loadReports();
            break;
        case 'tab-decommissions':
            loadDecommissions();
            break;
        case 'tab-depts':
            loadDepartmentsForForms();
            loadRadioIdRanges();
            break;
    }
};

// -------------------------------------------------------------------------
// 1. TAB DASHBOARD
// -------------------------------------------------------------------------
async function loadDashboard() {
    try {
        const propSel = document.getElementById('radio-property-selector');
        if (propSel && propSel.value) {
            currentPropertyId = propSel.value;
        }

        const url = `/api/radios/dashboard?hotel_id=${encodeURIComponent(currentPropertyId)}`;
        console.log('[TEC-RADIOS] Consultando dashboard:', url);
        const res = await fetch(url);
        if (!res.ok) {
            console.error('[TEC-RADIOS] Error HTTP al cargar dashboard:', res.status, res.statusText);
            const deptContainer = document.getElementById('rad-dept-bar-list');
            if (deptContainer) {
                deptContainer.innerHTML = `<div style="text-align: center; color: var(--color-danger); padding: 16px; font-size: 13px;"><i class="fa-solid fa-triangle-exclamation me-1"></i> Error ${res.status} al cargar métricas. Verifica tu sesión.</div>`;
            }
            return;
        }
        const data = await res.json();
        console.log('[TEC-RADIOS] Datos recibidos del dashboard:', data);

        const total = data.total || 0;
        const operativos = data.operativo || 0;
        const revision = data.requiere_revision || 0;
        const reparacion = data.en_reparacion || 0;
        const danados = data.danado || 0;
        const perdidos = data.perdido || 0;
        const fuera = data.fuera_servicio || 0;
        const disponibles = (data.disponible !== undefined) ? data.disponible : (data.unassigned !== undefined ? data.unassigned : 0);

        function calcPct(val) {
            if (total <= 0) return '0%';
            return Math.round((val / total) * 100) + '%';
        }

        const elTotal = document.getElementById('rad-stat-total');
        if (elTotal) elTotal.innerText = total;

        const elOp = document.getElementById('rad-stat-operativos');
        if (elOp) elOp.innerText = operativos;
        const elOpPct = document.getElementById('rad-stat-operativos-pct');
        if (elOpPct) elOpPct.innerText = calcPct(operativos);

        const elRev = document.getElementById('rad-stat-revision');
        if (elRev) elRev.innerText = revision;
        const elRevPct = document.getElementById('rad-stat-revision-pct');
        if (elRevPct) elRevPct.innerText = calcPct(revision);

        const elRep = document.getElementById('rad-stat-reparacion');
        if (elRep) elRep.innerText = reparacion;
        const elRepPct = document.getElementById('rad-stat-reparacion-pct');
        if (elRepPct) elRepPct.innerText = calcPct(reparacion);

        const elDan = document.getElementById('rad-stat-danados');
        if (elDan) elDan.innerText = danados;
        const elDanPct = document.getElementById('rad-stat-danados-pct');
        if (elDanPct) elDanPct.innerText = calcPct(danados);

        const elPerd = document.getElementById('rad-stat-perdidos');
        if (elPerd) elPerd.innerText = perdidos;
        const elPerdPct = document.getElementById('rad-stat-perdidos-pct');
        if (elPerdPct) elPerdPct.innerText = calcPct(perdidos);

        const elFue = document.getElementById('rad-stat-fuera');
        if (elFue) elFue.innerText = fuera;
        const elFuePct = document.getElementById('rad-stat-fuera-pct');
        if (elFuePct) elFuePct.innerText = calcPct(fuera);

        const elDisp = document.getElementById('rad-stat-disponibles');
        if (elDisp) elDisp.innerText = disponibles;
        const elDispPct = document.getElementById('rad-stat-disponibles-pct');
        if (elDispPct) elDispPct.innerText = calcPct(disponibles);

        // Alertas Atendibles Dinámicas desde la API
        const alertNoinv = document.getElementById('rad-alert-noinv-val');
        if (alertNoinv) alertNoinv.innerText = data.alert_noinv_90 !== undefined ? data.alert_noinv_90 : 0;
        const alertDan = document.getElementById('rad-alert-danados-val');
        if (alertDan) alertDan.innerText = data.alert_danados_fuera !== undefined ? data.alert_danados_fuera : (danados + fuera);
        const alertPerd = document.getElementById('rad-alert-perdidos-val');
        if (alertPerd) alertPerd.innerText = data.alert_perdidos !== undefined ? data.alert_perdidos : perdidos;
        const alertRev = document.getElementById('rad-alert-revision-val');
        if (alertRev) alertRev.innerText = data.alert_revision !== undefined ? data.alert_revision : revision;

        // Renderizado Dinámico: Radios por Departamento
        const deptContainer = document.getElementById('rad-dept-bar-list');
        if (deptContainer) {
            const deptsData = data.by_department || [];
            if (deptsData.length === 0) {
                deptContainer.innerHTML = '<div style="text-align: center; color: var(--color-text-muted); padding: 16px; font-size: 13px;">No hay departamentos configurados en esta propiedad.</div>';
            } else {
                const colors = ['#2563eb', '#0284c7', '#eab308', '#06b6d4', '#6366f1', '#10b981', '#f59e0b', '#ec4899'];
                deptContainer.innerHTML = deptsData.map((d, idx) => {
                    const pct = total > 0 ? Math.round((d.count / total) * 100) : 0;
                    const barColor = colors[idx % colors.length];
                    return `
                        <div class="radios-dept-bar-item">
                            <div class="radios-dept-bar-info">
                                <span style="font-weight: 600;">${escapeHtml(d.name)}</span>
                                <span style="font-weight: 700;">${d.count} ${d.count === 1 ? 'radio' : 'radios'}</span>
                            </div>
                            <div class="radios-dept-bar-track">
                                <div class="radios-dept-bar-fill" style="width: ${Math.max(pct, d.count > 0 ? 12 : 0)}%; background: ${barColor};"></div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }

        // Renderizado Dinámico: Últimos Inventarios
        const lastInvTbody = document.getElementById('rad-last-inventories-tbody');
        if (lastInvTbody) {
            const inventories = data.recent_inventories || [];
            if (inventories.length === 0) {
                lastInvTbody.innerHTML = '<tr><td colspan="4" class="text-center p-3 text-secondary" style="font-size: 12.5px;">Sin inventarios formales auditados aún.</td></tr>';
            } else {
                lastInvTbody.innerHTML = inventories.map(inv => `
                    <tr>
                        <td><small style="font-weight: 600;">${escapeHtml(inv.created_at || 'Reciente')}</small></td>
                        <td>${escapeHtml(inv.department_name || 'General')}</td>
                        <td><span class="badge badge-primary"><strong>${inv.verified_count || inv.total_radios || 0}</strong></span></td>
                        <td><small style="font-weight: 600;">${escapeHtml(inv.user_name || 'Sistema')}</small></td>
                    </tr>
                `).join('');
            }
        }

        // Gráfico Dona de Estados
        renderStatusChart([operativos, revision, reparacion, danados, perdidos, fuera, disponibles]);

    } catch (err) {
        console.error('[TEC-RADIOS] Error en loadDashboard:', err);
    }
}

function renderStatusChart(values) {
    const canvas = document.getElementById('rad-status-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (statusChartInstance) {
        statusChartInstance.destroy();
    }

    if (typeof Chart !== 'undefined') {
        statusChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Operativo', 'Requiere Revisión', 'En Reparación', 'Dañado', 'Perdido', 'Fuera de Servicio', 'Disponible'],
                datasets: [{
                    data: values,
                    backgroundColor: ['#16a34a', '#ca8a04', '#ea580c', '#dc2626', '#334155', '#0891b2', '#94a3b8'],
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right', labels: { font: { size: 11, family: 'Inter' }, boxWidth: 12 } }
                },
                cutout: '70%'
            }
        });
    }
}

// -------------------------------------------------------------------------
// 2. TAB CONSULTAR RADIO
// -------------------------------------------------------------------------
let currentSearchedRadio = null;

function initSearchTab() {
    const searchBtn = document.getElementById('btn-rad-quick-search');
    const input = document.getElementById('rad-quick-search-input');

    async function doSearch() {
        const query = input ? input.value.trim() : '';
        if (!query) {
            alert('Por favor ingresa un número de serial, ID de radio o nombre.');
            return;
        }

        try {
            const res = await fetch(`/api/radios?hotel_id=${currentPropertyId}&search=${encodeURIComponent(query)}`);
            if (!res.ok) {
                alert('Error al consultar el radio en el servidor.');
                return;
            }
            const data = await res.json();
            const cardEl = document.getElementById('rad-search-result-card');
            const emptyEl = document.getElementById('rad-search-empty-state');

            if (data && data.length > 0) {
                const r = data[0];
                currentSearchedRadio = r;

                if (cardEl) cardEl.style.display = 'grid';
                if (emptyEl) emptyEl.style.display = 'none';

                const elTitle = document.getElementById('rad-card-title');
                if (elTitle) elTitle.innerText = `Radio ID: #${r.radio_code || r.id}`;

                const elSer = document.getElementById('rad-card-serial');
                if (elSer) elSer.innerText = r.serial_number || 'N/A';

                const elBrand = document.getElementById('rad-card-brand');
                if (elBrand) elBrand.innerText = r.brand || 'Motorola';

                const elModel = document.getElementById('rad-card-model');
                if (elModel) elModel.innerText = r.model || 'R7';

                const elProp = document.getElementById('rad-card-prop');
                if (elProp) elProp.innerText = r.property_sigla || 'Hotel';

                const elDept = document.getElementById('rad-card-dept');
                if (elDept) elDept.innerText = r.department_name || 'General';

                const elArea = document.getElementById('rad-card-area');
                if (elArea) elArea.innerText = r.subdepartment_name || r.area_name || '-';

                const elAss = document.getElementById('rad-card-assigned');
                if (elAss) elAss.innerText = r.assigned_person ? r.assigned_person.name : 'Sin Asignar';

                const elEmpNum = document.getElementById('rad-card-emp-num');
                if (elEmpNum) elEmpNum.innerText = r.assigned_person ? (r.assigned_person.employeeId || '-') : '-';

                const elAssignDate = document.getElementById('rad-card-assign-date');
                if (elAssignDate) elAssignDate.innerText = r.assigned_person ? (r.assigned_person.assignedDate || '-') : '-';

                const elObs = document.getElementById('rad-card-obs');
                if (elObs) elObs.innerText = r.notes || 'Sin novedades.';

                const statusBadge = document.getElementById('rad-card-status-badge');
                if (statusBadge) statusBadge.innerHTML = renderStatusBadge(r.status);
            } else {
                currentSearchedRadio = null;
                if (cardEl) cardEl.style.display = 'none';
                if (emptyEl) {
                    emptyEl.style.display = 'block';
                    emptyEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="font-size: 2.5rem; color: #f59e0b; margin-bottom: 12px; display: block;"></i><h4 style="font-size: 1.1rem; font-weight: 700; color: #1e293b; margin: 0 0 6px 0;">No se encontró ningún radio</h4><p style="font-size: 0.88rem; margin: 0; color: #64748b;">No existen registros que coincidan con "${escapeHtml(query)}".</p>`;
                }
            }
        } catch(err) {
            console.error('Error buscando radio:', err);
            alert('Error al conectar con el servidor.');
        }
    }

    if (searchBtn) searchBtn.onclick = doSearch;
    if (input) {
        input.onkeypress = function (e) {
            if (e.key === 'Enter') doSearch();
        };
    }

    function promptSearchIfEmpty() {
        const input = document.getElementById('rad-quick-search-input');
        if (input) {
            input.focus();
            input.style.borderColor = '#ef4444';
            input.style.boxShadow = '0 0 0 3px rgba(239, 68, 68, 0.2)';
            setTimeout(() => {
                input.style.borderColor = '';
                input.style.boxShadow = '';
            }, 2000);
        }
    }

    // Auto-cálculo de consulta inicial si la tarjeta está en blanco pero existen radios
    if (!currentSearchedRadio && currentRadiosList && currentRadiosList.length > 0) {
        const firstR = currentRadiosList[0];
        if (input) input.value = firstR.serial_number || firstR.radio_code || firstR.id;
        doSearch();
    }

    // BOTÓN: Ver Historial
    document.getElementById('btn-rad-view-history')?.addEventListener('click', () => {
        if (!currentSearchedRadio) {
            promptSearchIfEmpty();
            return;
        }
        showRadioHistoryModal(currentSearchedRadio.id);
    });

    // BOTÓN: Editar Radio
    document.getElementById('btn-rad-edit-item')?.addEventListener('click', () => {
        if (!currentSearchedRadio) {
            promptSearchIfEmpty();
            return;
        }
        openEditRadioModal(currentSearchedRadio.id);
    });

    // BOTÓN: Transferir Radio
    document.getElementById('btn-rad-transfer-item')?.addEventListener('click', () => {
        if (!currentSearchedRadio) {
            promptSearchIfEmpty();
            return;
        }
        openTransferRadioModal(currentSearchedRadio.id);
    });

    // BOTÓN: Reportar Problema
    document.getElementById('btn-rad-report-issue')?.addEventListener('click', async () => {
        if (!currentSearchedRadio) {
            alert('Por favor busca un radio primero.');
            return;
        }

        const newStatus = prompt(
            `Reportar novedad para el Radio #${currentSearchedRadio.radio_code} (${currentSearchedRadio.serial_number}):\n\n` +
            `Selecciona el nuevo estado:\n` +
            `1. Requiere Revisión\n` +
            `2. En Reparación\n` +
            `3. Dañado\n` +
            `4. Fuera de Servicio\n` +
            `5. No Localizado / Perdido\n\n` +
            `Ingresa el número o nombre del estado:`,
            '1'
        );

        if (!newStatus) return;

        let statusKey = 'requiere_revision';
        if (newStatus === '2' || newStatus.toLowerCase().includes('repara')) statusKey = 'en_reparacion';
        else if (newStatus === '3' || newStatus.toLowerCase().includes('dañ')) statusKey = 'danado';
        else if (newStatus === '4' || newStatus.toLowerCase().includes('fuera')) statusKey = 'fuera_servicio';
        else if (newStatus === '5' || newStatus.toLowerCase().includes('perd')) statusKey = 'perdido';

        const reason = prompt('Describe brevemente el problema u observación técnica:', 'Falla reportada por el usuario');
        if (reason === null) return;

        try {
            const res = await fetch(`/api/radios/${currentSearchedRadio.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: statusKey,
                    notes: (currentSearchedRadio.notes ? currentSearchedRadio.notes + ' | ' : '') + reason
                })
            });

            if (res.ok) {
                alert('¡Problema reportado exitosamente! El estado del radio ha sido actualizado.');
                doSearch();
                loadDashboard();
                loadRadiosList();
            } else {
                const err = await res.json();
                alert('Error al reportar problema: ' + (err.error || ''));
            }
        } catch(e) {
            alert('Error de conexión al reportar el problema.');
        }
    });
}

// -------------------------------------------------------------------------
// FUNCIONES AUXILIARES GLOBALES DE MODALES DE RADIO
// -------------------------------------------------------------------------
window.openEditRadioModal = async function (rId) {
    try {
        const rRes = await fetch(`/api/radios/${rId}`);
        if (!rRes.ok) return;
        const r = await rRes.json();

        document.getElementById('form-radio-item')?.reset();
        document.getElementById('rad-form-id').value = r.id;
        document.getElementById('rad-form-property').value = r.hotel_id;
        document.getElementById('rad-form-serial').value = r.serial_number || '';
        document.getElementById('rad-form-code').value = '#' + (r.radio_code || r.id);
        document.getElementById('rad-form-brand').value = r.brand || 'Motorola';
        document.getElementById('rad-form-model').value = r.model || 'R7';
        document.getElementById('rad-form-status').value = r.status || 'operativo';
        document.getElementById('rad-form-notes').value = r.notes || '';

        const hintEl = document.getElementById('rad-form-id-hint');
        if (hintEl) {
            hintEl.innerHTML = `<span style="color: #2563eb; font-weight: 700;"><i class="fa-solid fa-pen me-1"></i> Editando radio existente con ID #${r.radio_code || r.id}</span>`;
        }

        const titleEl = document.getElementById('modal-radio-title');
        if (titleEl) titleEl.innerText = `Editar Radio #${r.radio_code || r.id}`;

        openModal('modal-radio-item');
    } catch(e) {
        console.error('Error cargando radio para editar:', e);
    }
};

window.showRadioHistoryModal = async function (rId) {
    try {
        const rRes = await fetch(`/api/radios/${rId}`);
        if (!rRes.ok) return;
        const r = await rRes.json();

        const histTbody = document.getElementById('rad-modal-history-tbody');
        if (histTbody) {
            const history = r.history || [];
            if (history.length === 0) {
                histTbody.innerHTML = '<tr><td colspan="3" class="text-center text-secondary p-3">Sin eventos registrados en la bitácora.</td></tr>';
            } else {
                histTbody.innerHTML = history.map(h => `
                    <tr>
                        <td><small>${escapeHtml(h.timestamp || '')}</small></td>
                        <td><strong>${escapeHtml(h.user_name || 'Sistema')}</strong></td>
                        <td>${escapeHtml(h.detail || h.event_type)}</td>
                    </tr>
                `).join('');
            }
        }
        openModal('modal-radio-history');
    } catch(e) {
        console.error('Error cargando historial:', e);
    }
};

window.openTransferRadioModal = function (rId) {
    const assignIdInput = document.getElementById('rad-assign-radio-id');
    if (assignIdInput) assignIdInput.value = rId;
    document.getElementById('form-radio-assign')?.reset();
    openModal('modal-radio-assign');
};

// -------------------------------------------------------------------------
// 3. TAB INVENTARIO DE RADIOS
// -------------------------------------------------------------------------
async function loadRadiosList() {
    try {
        const tbody = document.getElementById('rad-inventory-tbody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center p-4 text-secondary"><i class="fa-solid fa-spinner fa-spin me-2"></i> Cargando inventario de radios...</td></tr>';
        }

        const res = await fetch(`/api/radios?hotel_id=${currentPropertyId}`);
        if (!res.ok) return;
        currentRadiosList = await res.json();

        if (!tbody) return;

        if (currentRadiosList.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center p-4 text-secondary">No se encontraron radios registrados en esta propiedad.</td></tr>';
            return;
        }

        tbody.innerHTML = currentRadiosList.map(r => `
            <tr>
                <td><strong>#${escapeHtml(r.radio_code || r.id)}</strong></td>
                <td><code>${escapeHtml(r.serial_number)}</code></td>
                <td>${escapeHtml(r.brand)} ${escapeHtml(r.model)}</td>
                <td><span class="badge badge-outline">${escapeHtml(r.property_sigla || 'Hotel')}</span></td>
                <td>${escapeHtml(r.department_name || '-')}</td>
                <td>${r.assigned_person ? escapeHtml(r.assigned_person.name) : '<span class="text-secondary">Sin Asignar</span>'}</td>
                <td>${renderStatusBadge(r.status)}</td>
                <td>
                    <button type="button" class="btn btn-sm btn-outline btn-assign-r" data-id="${r.id}" title="Asignar"><i class="fa-solid fa-user-pen"></i></button>
                    <button type="button" class="btn btn-sm btn-outline btn-edit-r" data-id="${r.id}" title="Editar"><i class="fa-solid fa-pen"></i></button>
                    <button type="button" class="btn btn-sm btn-outline btn-hist-r" data-id="${r.id}" title="Historial"><i class="fa-solid fa-history"></i></button>
                </td>
            </tr>
        `).join('');

        tbody.querySelectorAll('.btn-assign-r').forEach(btn => {
            btn.onclick = function() {
                openTransferRadioModal(this.getAttribute('data-id'));
            };
        });

        tbody.querySelectorAll('.btn-edit-r').forEach(btn => {
            btn.onclick = function() {
                openEditRadioModal(this.getAttribute('data-id'));
            };
        });

        tbody.querySelectorAll('.btn-hist-r').forEach(btn => {
            btn.onclick = function() {
                showRadioHistoryModal(this.getAttribute('data-id'));
            };
        });

    } catch (e) {
        console.error('Error cargando inventario de radios:', e);
    }
}

// -------------------------------------------------------------------------
// 4. TAB INVENTARIO FORMAL PASO A PASO
// -------------------------------------------------------------------------
async function loadFormalInventories() {
    try {
        const res = await fetch(`/api/radios?hotel_id=${currentPropertyId}`);
        if (!res.ok) return;
        const radios = await res.json();
        const tbody = document.getElementById('rad-formal-inv-table-tbody');
        if (!tbody) return;

        if (radios.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center p-4 text-secondary">No hay radios disponibles para auditar en esta selección.</td></tr>';
            return;
        }

        tbody.innerHTML = radios.map(r => `
            <tr data-radio-id="${r.id}">
                <td><input type="checkbox" class="chk-formal-item" value="${r.id}" checked></td>
                <td><strong>#${escapeHtml(r.radio_code || r.id)}</strong></td>
                <td><code>${escapeHtml(r.serial_number)}</code></td>
                <td>${r.assigned_person ? escapeHtml(r.assigned_person.name) : '<span class="text-secondary">Sin Asignar</span>'}</td>
                <td>${renderStatusBadge(r.status)}</td>
                <td>
                    <select class="form-control form-control-sm rad-inv-status-sel" style="height: 32px; font-weight: 600;">
                        <option value="operativo" ${r.status === 'operativo' ? 'selected' : ''}>🟢 Operativo</option>
                        <option value="requiere_revision" ${r.status === 'requiere_revision' ? 'selected' : ''}>🟡 Requiere revisión</option>
                        <option value="en_reparacion" ${r.status === 'en_reparacion' ? 'selected' : ''}>🟠 En reparación</option>
                        <option value="danado" ${r.status === 'danado' ? 'selected' : ''}>🔴 Dañado</option>
                        <option value="perdido" ${r.status === 'perdido' ? 'selected' : ''}>⚫ No localizado</option>
                    </select>
                </td>
                <td><input type="text" class="form-control form-control-sm rad-inv-notes-inp" placeholder="Observaciones de auditoría..." value="${escapeHtml(r.notes || '')}" style="height: 32px;"></td>
                <td>
                    <button class="btn btn-sm btn-icon text-primary" onclick="showRadioHistoryModal(${r.id})" title="Ver Bitácora"><i class="fa-solid fa-history"></i></button>
                </td>
            </tr>
        `).join('');

        // Manejador del Checkbox 'Seleccionar Todos'
        const chkAll = document.getElementById('chk-rad-inv-all');
        if (chkAll) {
            chkAll.checked = true;
            chkAll.onchange = function () {
                document.querySelectorAll('.chk-formal-item').forEach(c => c.checked = chkAll.checked);
            };
        }

        // BOTÓN: Finalizar Inventario
        const finishBtn = document.getElementById('btn-finish-formal-inv');
        if (finishBtn) {
            finishBtn.onclick = async function () {
                const checkedRows = Array.from(document.querySelectorAll('#rad-formal-inv-table-tbody tr')).filter(tr => {
                    const chk = tr.querySelector('.chk-formal-item');
                    return chk && chk.checked;
                });

                if (checkedRows.length === 0) {
                    alert('Debes seleccionar al menos un radio verificado en la lista para finalizar el inventario.');
                    return;
                }

                if (!confirm(`¿Deseas finalizar el inventario formal de ${checkedRows.length} radios auditados?`)) return;

                finishBtn.disabled = true;
                finishBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i> Guardando Auditoría...';

                try {
                    let updatedCount = 0;
                    for (const tr of checkedRows) {
                        const rId = tr.getAttribute('data-radio-id');
                        const newStatus = tr.querySelector('.rad-inv-status-sel')?.value;
                        const newNotes = tr.querySelector('.rad-inv-notes-inp')?.value;

                        if (rId && newStatus) {
                            await fetch(`/api/radios/${rId}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ status: newStatus, notes: newNotes })
                            });
                            updatedCount++;
                        }
                    }

                    alert(`¡Inventario Formal Completado con Éxito!\nSe verificaron y actualizaron ${updatedCount} radios.`);
                    loadDashboard();
                    loadRadiosList();
                    loadFormalInventories();
                } catch(e) {
                    alert('Error al guardar el inventario formal.');
                } finally {
                    finishBtn.disabled = false;
                    finishBtn.innerHTML = '<i class="fa-solid fa-check me-1"></i> Finalizar Inventario';
                }
            };
        }

    } catch(e) { 
        console.error('Error en loadFormalInventories:', e); 
    }
}

// -------------------------------------------------------------------------
// 5. TAB MI INVENTARIO
// -------------------------------------------------------------------------
async function loadMyInventory() {
    try {
        const res = await fetch(`/api/radios?hotel_id=${currentPropertyId}`);
        if (!res.ok) return;
        const radios = await res.json();
        const tbody = document.getElementById('rad-my-inv-tbody');
        if (!tbody) return;

        const assigned = radios.filter(r => r.assigned_person && r.assigned_person.name);
        if (assigned.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4 text-secondary">No tienes radios asignados directamente.</td></tr>';
            return;
        }

        tbody.innerHTML = assigned.map(r => `
            <tr>
                <td><strong>#${escapeHtml(r.radio_code || r.id)}</strong></td>
                <td><code>${escapeHtml(r.serial_number)}</code></td>
                <td>${escapeHtml(r.brand)} ${escapeHtml(r.model)}</td>
                <td>${escapeHtml(r.assigned_person.assignedDate || 'Reciente')}</td>
                <td>${renderStatusBadge(r.status)}</td>
            </tr>
        `).join('');
    } catch(e) {
        console.error('Error en loadMyInventory:', e);
    }
}

// -------------------------------------------------------------------------
// 6. TAB ASIGNACIONES
// -------------------------------------------------------------------------
async function loadAssignments() {
    try {
        const res = await fetch(`/api/radios?hotel_id=${currentPropertyId}`);
        if (!res.ok) return;
        const data = await res.json();
        const tbody = document.getElementById('rad-assignments-tbody');
        if (tbody) {
            const assignedItems = data.filter(r => r.assigned_person && r.assigned_person.name);
            if (assignedItems.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4 text-secondary">Sin asignaciones registradas.</td></tr>';
                return;
            }
            tbody.innerHTML = assignedItems.map(r => `
                <tr>
                    <td><strong>#${escapeHtml(r.radio_code || r.id)}</strong> (${escapeHtml(r.serial_number)})</td>
                    <td><strong>${escapeHtml(r.assigned_person.name)}</strong></td>
                    <td>${escapeHtml(r.department_name || '-')}</td>
                    <td>${escapeHtml(r.assigned_person.assignedDate || 'Reciente')}</td>
                    <td>${escapeHtml(r.assigned_person.position || 'Custodio')}</td>
                </tr>
            `).join('');
        }
    } catch(e) { 
        console.error('Error en loadAssignments:', e); 
    }
}

// -------------------------------------------------------------------------
// 7. TAB REPORTES
// -------------------------------------------------------------------------
async function loadReports() {
    try {
        const res = await fetch(`/api/radios/dashboard?hotel_id=${currentPropertyId}`);
        if (!res.ok) return;
        const data = await res.json();
        const tbody = document.getElementById('rad-reports-tbody');
        if (tbody) {
            const history = data.recent_history || [];
            if (history.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center p-4 text-secondary">Sin eventos recientes de auditoría.</td></tr>';
                return;
            }
            tbody.innerHTML = history.map(h => `
                <tr>
                    <td><small>${escapeHtml(h.timestamp || '')}</small></td>
                    <td><strong>${escapeHtml(h.user_name || 'Sistema')}</strong></td>
                    <td><span class="badge badge-outline">${escapeHtml(h.event_type)}</span></td>
                    <td>#${escapeHtml(h.radio_id || '-')}</td>
                    <td>${escapeHtml(h.detail || '-')}</td>
                </tr>
            `).join('');
        }
    } catch(e) {
        console.error('Error en loadReports:', e);
    }
}

// -------------------------------------------------------------------------
// 8. TAB BAJAS Y DECOMISOS
// -------------------------------------------------------------------------
async function loadDecommissions() {
    const tbody = document.getElementById('rad-decommissions-tbody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--color-text-muted); padding: 16px;"><i class="fa-solid fa-spinner fa-spin me-2"></i> Cargando bajas y decomisos...</td></tr>';

    try {
        const res = await fetch(`/api/radios/decommissions?hotel_id=${currentPropertyId}`);
        if (!res.ok) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--color-danger); padding: 16px;">Error al cargar decomisos</td></tr>';
            return;
        }

        const data = await res.json();
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--color-text-secondary); padding: 16px;">No hay radios en estado de decomiso o baja en esta propiedad.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(item => `
            <tr>
                <td><strong>${escapeHtml(item.property_sigla || '')}</strong></td>
                <td><span class="badge badge-secondary" style="font-family: monospace;">#${escapeHtml(item.radio_code || item.id)}</span></td>
                <td><code>${escapeHtml(item.serial_number || '-')}</code></td>
                <td>${escapeHtml(item.brand || '')} ${escapeHtml(item.model || '-')}</td>
                <td>${escapeHtml(item.department_name || '-')}</td>
                <td><span class="badge badge-danger">${escapeHtml(item.status || 'Decomisado')}</span></td>
                <td><small style="color: var(--color-text-secondary);">${escapeHtml(item.decommission_reason || 'Sin razón especificada')}</small></td>
                <td><small>${escapeHtml(item.decommission_date || '-')}</small></td>
                <td><small style="font-weight: 600;">${escapeHtml(item.decommission_user || '-')}</small></td>
            </tr>
        `).join('');
    } catch(err) {
        console.error('Error cargando decomisos:', err);
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: var(--color-danger); padding: 16px;">Error de conexión al cargar decomisos</td></tr>';
    }
}

// -------------------------------------------------------------------------
// 9. TAB CONFIGURACIÓN: DEPARTAMENTOS Y RANGOS DE IDS
// -------------------------------------------------------------------------
let allPropertyDepartments = [];

async function updateSuggestedRadioId() {
    const propSel = document.getElementById('rad-form-property');
    const deptSel = document.getElementById('rad-form-dept');
    const subdeptSel = document.getElementById('rad-form-area');
    const codeInput = document.getElementById('rad-form-code');
    const hintEl = document.getElementById('rad-form-id-hint');

    if (!propSel || !deptSel || !codeInput) return;

    const propId = propSel.value;
    const deptId = deptSel.value;
    const subdeptId = (subdeptSel && !subdeptSel.disabled) ? subdeptSel.value : '';

    if (!propId || !deptId) {
        codeInput.value = '----';
        codeInput.style.color = '#94a3b8';
        codeInput.style.borderColor = '#cbd5e1';
        if (hintEl) hintEl.innerHTML = '<span style="color: #64748b;"><i class="fa-solid fa-hand-pointer text-primary me-1"></i> Selecciona un Departamento para identificar su bloque y calcular el ID libre más bajo.</span>';
        return;
    }

    // Verificar si el departamento requiere subdepartamento
    const mainDept = allPropertyDepartments.find(d => String(d.id) === String(deptId));
    const subdepts = allPropertyDepartments.filter(d => String(d.parent_department_id) === String(deptId));

    if (subdepts.length > 0 && !subdeptId) {
        codeInput.value = '----';
        codeInput.style.color = '#d97706';
        codeInput.style.borderColor = '#f59e0b';
        if (hintEl) hintEl.innerHTML = '<span style="color: #d97706; font-weight: 700;"><i class="fa-solid fa-hand-pointer me-1"></i> Selecciona un Subdepartamento para identificar su bloque de 35 IDs.</span>';
        return;
    }

    // Preasignación instantánea mientras confirma con el servidor
    const targetId = subdeptId || deptId;
    const targetDept = allPropertyDepartments.find(d => String(d.id) === String(targetId));
    if (targetDept && targetDept.id_range_start) {
        codeInput.value = '#' + targetDept.id_range_start;
        codeInput.style.color = '#1d4ed8';
        codeInput.style.borderColor = '#3b82f6';
        if (hintEl) {
            hintEl.innerHTML = `<span style="color: #15803d; font-weight: 700; font-size: 13px;"><i class="fa-solid fa-circle-check me-1"></i> ID #${targetDept.id_range_start} asignado en bloque [${targetDept.id_range_start} – ${targetDept.id_range_end}] (${escapeHtml(targetDept.name)}).</span>`;
        }
    } else {
        codeInput.value = '...';
        if (hintEl) hintEl.innerHTML = '<span style="color: #2563eb;"><i class="fa-solid fa-spinner fa-spin me-1"></i> Verificando disponibilidad de IDs en tiempo real...</span>';
    }

    try {
        let url = `/api/radios/next-available-id?hotel_id=${encodeURIComponent(propId)}&department_id=${encodeURIComponent(deptId)}`;
        if (subdeptId) {
            url += `&subdepartment_id=${encodeURIComponent(subdeptId)}`;
        }

        const res = await fetch(url, {
            headers: { 'Accept': 'application/json' }
        });
        if (!res.ok) {
            // Si el servidor tardó, mantener la preasignación local si existe
            if (!targetDept || !targetDept.id_range_start) {
                codeInput.value = '----';
                codeInput.style.color = '#ef4444';
                codeInput.style.borderColor = '#f87171';
                if (hintEl) hintEl.innerHTML = `<span style="color: #dc2626; font-weight: 600;"><i class="fa-solid fa-triangle-exclamation me-1"></i> No se pudo verificar el ID.</span>`;
            }
            return;
        }

        const data = await res.json();
        if (data.available && data.next_id) {
            codeInput.value = '#' + data.next_id;
            codeInput.style.color = '#1d4ed8';
            codeInput.style.borderColor = '#3b82f6';
            if (hintEl) {
                const rangeTxt = (data.range_start && data.range_end) ? `[${data.range_start} – ${data.range_end}]` : '';
                const areaTxt = data.subdepartment_name ? ` (${escapeHtml(data.subdepartment_name)})` : (data.department_name ? ` (${escapeHtml(data.department_name)})` : '');
                hintEl.innerHTML = `<span style="color: #15803d; font-weight: 700; font-size: 13px;"><i class="fa-solid fa-circle-check me-1"></i> ID #${data.next_id} asignado automáticamente en bloque ${rangeTxt}${areaTxt}.</span>`;
            }
        } else if (data.available === false) {
            codeInput.value = 'AGOTADO';
            codeInput.style.color = '#dc2626';
            codeInput.style.borderColor = '#ef4444';
            if (hintEl) {
                hintEl.innerHTML = `<span style="color: #dc2626; font-weight: 700;"><i class="fa-solid fa-circle-xmark me-1"></i> ${escapeHtml(data.error || 'Bloque sin IDs disponibles.')}</span>`;
            }
        }
    } catch(err) {
        console.error('Error calculando próximo ID:', err);
    }
}

// -------------------------------------------------------------------------
// 9. TAB CONFIGURACIÓN: DEPARTAMENTOS Y RANGOS DE IDS
// -------------------------------------------------------------------------
async function loadDepartmentsForForms() {
    try {
        const queryProp = (currentPropertyId && currentPropertyId !== 'all') ? currentPropertyId : '';
        const url = queryProp ? `/api/radios/departments?hotel_id=${queryProp}` : '/api/radios/departments';
        const res = await fetch(url);
        if (!res.ok) return;
        allPropertyDepartments = await res.json();

        const tbody = document.getElementById('rad-depts-tbody');
        const formDept = document.getElementById('rad-form-dept');
        const formArea = document.getElementById('rad-form-area');
        const formProp = document.getElementById('rad-form-property');

        // 1. Renderizar tabla de Configuración de Departamentos
        if (tbody) {
            if (allPropertyDepartments.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center p-3 text-secondary">No hay departamentos configurados.</td></tr>';
            } else {
                const mainDepts = allPropertyDepartments.filter(d => !d.parent_department_id);
                tbody.innerHTML = mainDepts.map(main => {
                    const subdepts = allPropertyDepartments.filter(d => d.parent_department_id === main.id);
                    const subBadges = subdepts.length > 0
                        ? subdepts.map(s => `
                            <span class="badge badge-secondary me-1 mb-1" style="font-size: 11.5px; padding: 4px 8px; display: inline-flex; align-items: center; gap: 4px;">
                                ${escapeHtml(s.name)} 
                                <span style="font-family: monospace; opacity: 0.85;">(${s.id_range_start || ''}–${s.id_range_end || ''})</span>
                                <button class="btn-delete-dept" data-id="${s.id}" data-name="${escapeHtml(s.name)}" title="Eliminar Subdepartamento" style="background:none; border:none; color:#ef4444; padding:0 2px; cursor:pointer; font-size:12px;">
                                    <i class="fa-solid fa-xmark"></i>
                                </button>
                            </span>
                          `).join(' ')
                        : '<span class="badge badge-outline text-muted" style="font-size: 11.5px; padding: 4px 8px;">Bloque Directo</span>';

                    return `
                        <tr>
                            <td><span class="badge badge-outline" style="font-weight: 700;">${escapeHtml(main.hotel_name || main.hotel_sigla || 'Propiedad')}</span></td>
                            <td><strong style="color: var(--color-primary); font-size: 13.5px;">${escapeHtml(main.name)}</strong></td>
                            <td style="max-width: 500px; line-height: 1.6;">${subBadges}</td>
                            <td><span class="badge badge-primary" style="font-size: 12px;">${main.radios_count || 0} Radios</span></td>
                            <td style="text-align: right;">
                                <button class="btn btn-sm btn-icon text-danger btn-delete-dept" data-id="${main.id}" data-name="${escapeHtml(main.name)}" title="Eliminar Departamento Principal">
                                    <i class="fa-solid fa-trash"></i>
                                </button>
                            </td>
                        </tr>
                    `;
                }).join('');

                tbody.querySelectorAll('.btn-delete-dept').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const deptId = btn.getAttribute('data-id');
                        const deptName = btn.getAttribute('data-name');
                        if (!confirm(`¿Estás seguro de eliminar el departamento "${deptName}"?`)) return;

                        try {
                            const res = await fetch(`/api/radios/departments/${deptId}`, { method: 'DELETE' });
                            let data = {};
                            try { data = await res.json(); } catch(e) {}
                            
                            if (res.ok) {
                                alert(data.message || 'Departamento eliminado correctamente.');
                                loadDepartmentsForForms();
                                loadRadioIdRanges();
                            } else {
                                alert(data.error || `Error (${res.status}) al eliminar el departamento.`);
                            }
                        } catch (err) {
                            console.error('Error al eliminar departamento:', err);
                            alert('Error de conexión al eliminar departamento.');
                        }
                    });
                });
            }
        }

        // 2. Poblar selectores de Departamento y Subdepartamento en el modal
        if (formDept) {
            const currentSelectedProp = formProp ? formProp.value : (currentPropertyId !== 'all' ? currentPropertyId : (userProperties[0]?.id || ''));
            const propMainDepts = allPropertyDepartments.filter(d => !d.parent_department_id && (!currentSelectedProp || String(d.hotel_id) === String(currentSelectedProp)));

            formDept.innerHTML = '<option value="">-- Seleccione Departamento Principal --</option>' + 
                propMainDepts.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');

            // Evento onchange para cargar subdepartamentos
            formDept.onchange = function() {
                const selectedDeptId = this.value;
                if (!selectedDeptId) {
                    if (formArea) {
                        formArea.innerHTML = '<option value="">-- Seleccione Departamento Primero --</option>';
                        formArea.disabled = true;
                    }
                    updateSuggestedRadioId();
                    return;
                }

                const subdepts = allPropertyDepartments.filter(d => String(d.parent_department_id) === String(selectedDeptId));
                if (formArea) {
                    if (subdepts.length > 0) {
                        formArea.disabled = false;
                        formArea.innerHTML = '<option value="">-- Seleccione Subdepartamento --</option>' +
                            subdepts.map(s => {
                                const rangeText = (s.id_range_start && s.id_range_end) ? ` [${s.id_range_start}–${s.id_range_end}]` : '';
                                return `<option value="${s.id}">${escapeHtml(s.name)}${rangeText}</option>`;
                            }).join('');
                    } else {
                        formArea.innerHTML = '<option value="">No aplica (Bloque Directo)</option>';
                        formArea.disabled = true;
                    }
                }
                updateSuggestedRadioId();
            };

            if (formArea) {
                formArea.onchange = function() {
                    updateSuggestedRadioId();
                };
            }

            if (formProp) {
                formProp.onchange = function() {
                    const newPropId = this.value;
                    const filteredDepts = allPropertyDepartments.filter(d => !d.parent_department_id && (!newPropId || String(d.hotel_id) === String(newPropId)));
                    formDept.innerHTML = '<option value="">-- Seleccione Departamento Principal --</option>' + 
                        filteredDepts.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');
                    if (formArea) {
                        formArea.innerHTML = '<option value="">-- Seleccione Departamento Primero --</option>';
                        formArea.disabled = true;
                    }
                    updateSuggestedRadioId();
                };
            }
        }
    } catch(e) { 
        console.error('Error en loadDepartmentsForForms:', e); 
    }
}

async function loadRadioIdRanges() {
    const tbody = document.getElementById('rad-id-ranges-tbody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="11" style="text-align: center; color: var(--color-text-muted); padding: 16px;"><i class="fa-solid fa-spinner fa-spin me-2"></i> Cargando bloques de IDs...</td></tr>';

    try {
        const url = (currentPropertyId && currentPropertyId !== 'all')
            ? `/api/radios/id-ranges?hotel_id=${currentPropertyId}`
            : '/api/radios/id-ranges';

        const res = await fetch(url);
        if (!res.ok) {
            tbody.innerHTML = '<tr><td colspan="11" style="text-align: center; color: var(--color-danger); padding: 16px;">Error al cargar rangos de IDs</td></tr>';
            return;
        }

        const data = await res.json();
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" style="text-align: center; color: var(--color-text-secondary); padding: 16px;">No hay rangos de IDs configurados en esta propiedad.</td></tr>';
            return;
        }

        tbody.innerHTML = data.map(r => {
            const availBadge = (r.available_count > 0)
                ? `<span class="badge badge-success" style="font-weight: 700;">${r.available_count}</span>`
                : `<span class="badge badge-danger" style="font-weight: 700;">0 (Agotado)</span>`;
            
            const nextIdDisplay = r.next_available_id 
                ? `<strong style="color: var(--color-primary); font-family: monospace; font-size: 13px;">#${r.next_available_id}</strong>` 
                : '<span class="badge badge-danger">Agotado</span>';

            const subdeptDisplay = r.subdepartment_name 
                ? `<span class="badge badge-secondary" style="font-size: 11.5px; font-weight: 600;">${escapeHtml(r.subdepartment_name)}</span>`
                : `<span class="badge badge-outline" style="font-size: 11px; color: #64748b;">Directo</span>`;

            const pct = r.occupancy_pct || 0;
            const pctColor = pct >= 90 ? '#dc2626' : (pct >= 60 ? '#f59e0b' : '#10b981');

            return `
                <tr>
                    <td><strong>${escapeHtml(r.hotel_sigla || r.hotel_name || '')}</strong></td>
                    <td><span style="font-weight: 700; color: #1e293b;">${escapeHtml(r.department_name || '')}</span></td>
                    <td>${subdeptDisplay}</td>
                    <td><span style="font-family: monospace; font-weight: 700; color: var(--color-primary);">${r.range_start} – ${r.range_end}</span></td>
                    <td><span style="font-weight: 600;">${r.total_capacity || 35}</span></td>
                    <td><span style="font-weight: 600;">${r.used_count || 0}</span></td>
                    <td>${availBadge}</td>
                    <td>${nextIdDisplay}</td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <div style="flex: 1; background: #e2e8f0; height: 6px; border-radius: 3px; min-width: 40px; overflow: hidden;">
                                <div style="width: ${pct}%; background: ${pctColor}; height: 100%;"></div>
                            </div>
                            <span style="font-size: 11px; font-weight: 700; color: ${pctColor};">${pct}%</span>
                        </div>
                    </td>
                    <td><span class="badge ${r.active ? 'badge-success' : 'badge-secondary'}">${r.active ? 'Activo' : 'Inactivo'}</span></td>
                    <td>
                        <button class="btn btn-sm btn-icon text-danger btn-delete-id-range" data-id="${r.id}" title="Eliminar Rango">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        tbody.querySelectorAll('.btn-delete-id-range').forEach(btn => {
            btn.addEventListener('click', async () => {
                const rangeId = btn.getAttribute('data-id');
                if (!confirm('¿Deseas eliminar este rango de IDs?')) return;
                try {
                    const res = await fetch(`/api/radios/id-ranges/${rangeId}`, { method: 'DELETE' });
                    if (res.ok) {
                        loadRadioIdRanges();
                    } else {
                        const err = await res.json();
                        alert(err.error || 'Error al eliminar rango');
                    }
                } catch(e) {
                    alert('Error de conexión al eliminar rango');
                }
            });
        });

    } catch(err) {
        console.error('Error cargando rangos de IDs:', err);
        tbody.innerHTML = '<tr><td colspan="11" style="text-align: center; color: var(--color-danger); padding: 16px;">Error de conexión al cargar rangos de IDs</td></tr>';
    }
}

// -------------------------------------------------------------------------
// CARGA DE PROPIEDADES Y USUARIO ACTUAL
// -------------------------------------------------------------------------
async function loadAuthorizedProperties() {
    try {
        const res = await fetch('/api/radios/properties');
        if (!res.ok) return;
        userProperties = await res.json();

        const mainSel = document.getElementById('radio-property-selector');
        const importSel = document.getElementById('rad-import-property');
        const stepProp = document.getElementById('rad-finv-prop-step');

        if (!userProperties || userProperties.length === 0) {
            if (mainSel) mainSel.innerHTML = '<option value="">Sin propiedades asignadas</option>';
            return;
        }

        let opts = '<option value="all">Todas las Propiedades</option>';
        let singleOpts = '';

        userProperties.forEach(p => {
            opts += `<option value="${p.id}">${escapeHtml(p.name)} (${escapeHtml(p.sigla)})</option>`;
            singleOpts += `<option value="${p.id}">${escapeHtml(p.name)} (${escapeHtml(p.sigla)})</option>`;
        });

        if (mainSel) {
            mainSel.innerHTML = opts;
            mainSel.onchange = function () {
                currentPropertyId = this.value;
                const activeTab = document.querySelector('.radio-sidebar-nav-item.active')?.getAttribute('data-tab') || 'tab-dashboard';
                window.switchRadioTab(activeTab);
            };
        }

        if (importSel) importSel.innerHTML = singleOpts;
        if (stepProp) stepProp.innerHTML = singleOpts;

    } catch (err) {
        console.error('Error cargando propiedades autorizadas:', err);
    }
}

async function loadCurrentUser() {
    try {
        const res = await fetch('/api/me');
        if (res.ok) {
            const data = await res.json();
            const u = data.user;
            if (u) {
                const initials = u.username ? u.username.substring(0, 2).toUpperCase() : 'US';
                const avatarEl = document.getElementById('rad-user-avatar');
                const nameEl = document.getElementById('rad-user-name');
                const welcomeNameEl = document.getElementById('rad-dash-welcome-name');
                const roleEl = document.getElementById('rad-user-role');

                if (avatarEl) avatarEl.innerText = initials;
                if (nameEl) nameEl.innerText = u.username;
                if (welcomeNameEl) welcomeNameEl.innerText = u.username;
                if (roleEl) roleEl.innerText = u.role || 'Administrador';
            }
        }
    } catch (e) {
        console.error('Error cargando usuario actual:', e);
    }
}

// -------------------------------------------------------------------------
// INICIALIZADOR PRINCIPAL Y VINCULACIÓN DE FORMULARIOS
// -------------------------------------------------------------------------
function initRadiosModule() {
    if (!document.getElementById('view-radios')) return;

    // Delegación Segura de Clicks para navegación de solapas
    document.addEventListener('click', function (e) {
        const item = e.target.closest('[data-tab]');
        if (item && (item.classList.contains('radio-sidebar-nav-item') || item.classList.contains('radio-tab-btn'))) {
            e.preventDefault();
            const targetTab = item.getAttribute('data-tab');
            if (targetTab) window.switchRadioTab(targetTab);
        }
    });

    // Botones para abrir modal de nuevo radio
    document.getElementById('btn-sidebar-new-radio')?.addEventListener('click', () => window.openNewRadioModal());
    document.getElementById('btn-radio-top-new')?.addEventListener('click', () => window.openNewRadioModal());
    document.getElementById('btn-add-radio-inventory-tab')?.addEventListener('click', () => window.openNewRadioModal());

    // Auxiliares para Modal de Departamentos: Filtrado por propiedad y cálculo de bloques
    async function populateModalDeptParent(hotelId) {
        const parentSel = document.getElementById('modal-dept-parent');
        if (!parentSel) return;
        if (!hotelId) {
            parentSel.innerHTML = '<option value="">Es Departamento Principal (Sin Padre)</option>';
            updateDeptIDRangePreview();
            return;
        }
        try {
            const res = await fetch(`/api/radios/departments?hotel_id=${hotelId}`);
            if (res.ok) {
                const depts = await res.json();
                const mainDepts = depts.filter(d => !d.parent_department_id);
                parentSel.innerHTML = '<option value="">Es Departamento Principal (Sin Padre)</option>' + 
                    mainDepts.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');
            }
        } catch(e) {
            console.error('Error cargando departamentos padre:', e);
        }
        updateDeptIDRangePreview();
    }

    async function updateDeptIDRangePreview() {
        const previewEl = document.getElementById('dept-range-preview-text');
        const qtyInput = document.getElementById('modal-dept-id-qty');
        const autoCheck = document.getElementById('modal-dept-auto-range');
        const hotelSel = document.getElementById('modal-dept-hotel');
        
        if (!previewEl || !qtyInput || !autoCheck || !hotelSel) return;
        
        if (!autoCheck.checked) {
            previewEl.style.display = 'none';
            return;
        }
        previewEl.style.display = 'block';
        
        const hotelId = hotelSel.value;
        const qty = parseInt(qtyInput.value) || 35;
        if (!hotelId) return;

        try {
            const res = await fetch(`/api/radios/id-ranges?hotel_id=${hotelId}`);
            let currentMax = 1000;
            if (res.ok) {
                const ranges = await res.json();
                ranges.forEach(r => {
                    if (r.range_end && r.range_end > currentMax) currentMax = r.range_end;
                });
            }
            const resD = await fetch(`/api/radios/departments?hotel_id=${hotelId}`);
            if (resD.ok) {
                const depts = await resD.json();
                depts.forEach(d => {
                    if (d.id_range_end && d.id_range_end > currentMax) currentMax = d.id_range_end;
                });
            }
            
            const nextStart = currentMax + 1;
            const nextEnd = nextStart + qty - 1;
            previewEl.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles me-1"></i> Bloque sugerido: <strong style="font-family: monospace;">[${nextStart} – ${nextEnd}]</strong> (${qty} IDs secuenciales)`;
        } catch(e) {
            previewEl.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles me-1"></i> Se asignará automáticamente el bloque posterior al último bloque registrado.`;
        }
    }

    // Botón abrir modal de Departamento
    document.getElementById('btn-open-modal-dept')?.addEventListener('click', async () => {
        const modal = document.getElementById('modal-radio-dept');
        if (!modal) return;
        modal.classList.add('active');

        const hotelSel = document.getElementById('modal-dept-hotel');
        if (hotelSel && userProperties.length > 0) {
            hotelSel.innerHTML = userProperties.map(p => `<option value="${p.id}">${escapeHtml(p.name)} (${escapeHtml(p.sigla)})</option>`).join('');
            if (currentPropertyId !== 'all') {
                hotelSel.value = currentPropertyId;
            }
            
            hotelSel.onchange = function() {
                populateModalDeptParent(this.value);
            };
            await populateModalDeptParent(hotelSel.value);
        }

        document.getElementById('modal-dept-parent')?.addEventListener('change', updateDeptIDRangePreview);
        document.getElementById('modal-dept-id-qty')?.addEventListener('input', updateDeptIDRangePreview);
        document.getElementById('modal-dept-auto-range')?.addEventListener('change', function() {
            const qtyWrapper = document.getElementById('wrapper-dept-range-qty');
            if (qtyWrapper) qtyWrapper.style.display = this.checked ? 'flex' : 'none';
            updateDeptIDRangePreview();
        });
    });

    // Botón abrir modal de Rango de IDs
    document.getElementById('btn-open-modal-id-range')?.addEventListener('click', async () => {
        const modal = document.getElementById('modal-radio-id-range');
        if (!modal) return;
        modal.classList.add('active');

        const hotelSel = document.getElementById('modal-range-hotel');
        const deptSel = document.getElementById('modal-range-dept');

        if (hotelSel && userProperties.length > 0) {
            hotelSel.innerHTML = userProperties.map(p => `<option value="${p.id}">${escapeHtml(p.name)} (${escapeHtml(p.sigla)})</option>`).join('');
            if (currentPropertyId !== 'all') {
                hotelSel.value = currentPropertyId;
            }
            loadDeptsForRange(hotelSel.value);
            hotelSel.onchange = () => loadDeptsForRange(hotelSel.value);
        }

        async function loadDeptsForRange(hId) {
            if (!deptSel) return;
            try {
                const res = await fetch(`/api/radios/departments?hotel_id=${hId}`);
                if (res.ok) {
                    const depts = await res.json();
                    deptSel.innerHTML = depts.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');
                }
            } catch(e) {}
        }
    });

    // Submit Guardar Departamento
    document.getElementById('form-radio-dept')?.addEventListener('submit', async function (e) {
        e.preventDefault();
        const hotelId = document.getElementById('modal-dept-hotel').value;
        const name = document.getElementById('modal-dept-name').value.trim();
        const parentId = document.getElementById('modal-dept-parent')?.value || '';
        const autoRange = document.getElementById('modal-dept-auto-range')?.checked || false;
        const idQty = parseInt(document.getElementById('modal-dept-id-qty')?.value || '35');

        try {
            const res = await fetch('/api/radios/departments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    hotel_id: parseInt(hotelId),
                    name: name,
                    parent_department_id: parentId ? parseInt(parentId) : null,
                    auto_range: autoRange,
                    id_qty: idQty
                })
            });

            if (res.ok) {
                closeModal('modal-radio-dept');
                document.getElementById('form-radio-dept').reset();
                alert('Departamento registrado correctamente.');
                loadDepartmentsForForms();
                loadRadioIdRanges();
            } else {
                const err = await res.json();
                alert('Error al registrar departamento: ' + (err.error || 'Error desconocido'));
            }
        } catch (err) {
            console.error('Error registrando departamento:', err);
        }
    });

    // Submit Guardar Rango de IDs
    document.getElementById('form-radio-id-range')?.addEventListener('submit', async function (e) {
        e.preventDefault();
        const hotelId = parseInt(document.getElementById('modal-range-hotel').value);
        const deptId = parseInt(document.getElementById('modal-range-dept').value);
        const rangeStart = parseInt(document.getElementById('modal-range-start').value);
        const rangeEnd = parseInt(document.getElementById('modal-range-end').value);

        if (rangeEnd < rangeStart) {
            alert('El ID final debe ser mayor o igual al ID inicial.');
            return;
        }

        try {
            const res = await fetch('/api/radios/id-ranges', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    hotel_id: hotelId,
                    department_id: deptId,
                    range_start: rangeStart,
                    range_end: rangeEnd
                })
            });

            if (res.ok) {
                closeModal('modal-radio-id-range');
                document.getElementById('form-radio-id-range').reset();
                alert('Rango de IDs registrado correctamente.');
                loadRadioIdRanges();
            } else {
                const err = await res.json();
                alert('Error al registrar rango: ' + (err.error || 'Error desconocido'));
            }
        } catch (err) {
            console.error('Error registrando rango:', err);
        }
    });

    // -------------------------------------------------------------------
    // NUEVA FUNCIONALIDAD: AMPLIACIÓN Y REASIGNACIÓN RÁPIDA DE IDs
    // -------------------------------------------------------------------
    function initQuickExpandIdModal() {
        const btnOpen = document.getElementById('btn-open-modal-id-quick-expand');
        const modal = document.getElementById('modal-radio-id-quick-expand');
        const form = document.getElementById('form-quick-expand-id');
        if (!modal || !form) return;

        const hotelSel = document.getElementById('quick-hotel-select');
        const deptSel = document.getElementById('quick-dept-select');
        const subdeptSel = document.getElementById('quick-subdept-select');
        const sourceSubdeptSel = document.getElementById('quick-source-subdept-select');
        const modeExpandRadio = document.getElementById('mode-auto-expand');
        const modeReallocateRadio = document.getElementById('mode-reallocate');
        const panelExpand = document.getElementById('panel-mode-expand');
        const panelReallocate = document.getElementById('panel-mode-reallocate');
        const statusMsg = document.getElementById('quick-expand-status-msg');
        const badgeFree = document.getElementById('badge-source-free-count');

        window.openQuickExpandIdModal = async function() {
            statusMsg.style.display = 'none';
            form.reset();

            let allowedHotels = (typeof userRadioProperties !== 'undefined' && userRadioProperties.length > 0) ? userRadioProperties : [];
            if (!allowedHotels || allowedHotels.length === 0) {
                try {
                    const res = await fetch('/api/radios/properties');
                    if (res.ok) {
                        allowedHotels = await res.json();
                        if (typeof userRadioProperties !== 'undefined') userRadioProperties = allowedHotels;
                    }
                } catch (e) {
                    console.error('Error al obtener propiedades para modal:', e);
                }
            }

            hotelSel.innerHTML = allowedHotels.map(h => `<option value="${h.id}">${escapeHtml(h.sigla || h.name)} - ${escapeHtml(h.name)}</option>`).join('');

            if (typeof currentPropertyId !== 'undefined' && currentPropertyId && currentPropertyId !== 'all') {
                hotelSel.value = currentPropertyId;
            }

            await updateDepts();
            modal.classList.add('active');
        };

        if (btnOpen) {
            btnOpen.addEventListener('click', (e) => {
                e.preventDefault();
                window.openQuickExpandIdModal();
            });
        }

        async function updateDepts() {
            const hId = hotelSel.value;
            if (!hId) return;

            try {
                const res = await fetch(`/api/radios/departments?hotel_id=${hId}`);
                if (res.ok) {
                    const depts = await res.json();
                    const mainDepts = depts.filter(d => !d.parent_department_id);
                    deptSel.innerHTML = mainDepts.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');
                    await updateSubdepts();
                }
            } catch (err) {
                console.error('Error cargando departamentos:', err);
            }
        }

        async function updateSubdepts() {
            const hId = hotelSel.value;
            const dId = deptSel.value;
            subdeptSel.innerHTML = '<option value="">Aplica al Departamento Principal Directamente</option>';
            sourceSubdeptSel.innerHTML = '<option value="">Selecciona Subdepartamento Origen...</option>';

            if (!hId || !dId) return;

            try {
                const res = await fetch(`/api/radios/departments?hotel_id=${hId}`);
                if (res.ok) {
                    const depts = await res.json();
                    const subDepts = depts.filter(d => d.parent_department_id == dId);

                    if (subDepts.length > 0) {
                        subdeptSel.innerHTML += subDepts.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
                        sourceSubdeptSel.innerHTML = subDepts.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
                        document.getElementById('wrapper-radio-mode-reallocate').style.display = 'block';
                    } else {
                        // Si no hay subdepartamentos, ocultar opción de reasignación
                        modeExpandRadio.checked = true;
                        togglePanels();
                        document.getElementById('wrapper-radio-mode-reallocate').style.display = 'none';
                    }
                    await updateSourceFreeIds();
                }
            } catch (err) {
                console.error('Error cargando subdepartamentos:', err);
            }
        }

        async function updateSourceFreeIds() {
            const hId = hotelSel.value;
            const dId = deptSel.value;
            const sourceSubId = sourceSubdeptSel.value;

            if (!hId || !dId || !sourceSubId) {
                badgeFree.textContent = '0 disponibles';
                return;
            }

            try {
                let freeCount = null;
                const res = await fetch(`/api/radios/id-ranges/subdept-free-ids?hotel_id=${hId}&department_id=${dId}`);
                if (res.ok) {
                    const list = await res.json();
                    const targetInfo = list.find(item => item.subdepartment_id == sourceSubId);
                    if (targetInfo) {
                        freeCount = targetInfo.free_ids_count;
                    }
                }

                // Fallback a /api/radios/id-ranges si no se obtuvo por subdept-free-ids
                if (freeCount === null || freeCount === undefined) {
                    const resRanges = await fetch(`/api/radios/id-ranges?hotel_id=${hId}`);
                    if (resRanges.ok) {
                        const ranges = await resRanges.json();
                        const targetRange = ranges.find(r => r.subdepartment_id == sourceSubId);
                        if (targetRange) {
                            freeCount = targetRange.available_count;
                        }
                    }
                }

                const finalCount = freeCount !== null && freeCount !== undefined ? freeCount : 0;
                badgeFree.textContent = `${finalCount} IDs libres sin asignar`;
                badgeFree.className = finalCount > 0 ? 'badge bg-success' : 'badge bg-secondary';
                const qtyInput = document.getElementById('quick-transfer-qty');
                if (qtyInput) qtyInput.max = finalCount || 1;

            } catch (e) {
                console.error('Error consultando IDs libres:', e);
                badgeFree.textContent = '0 disponibles';
            }
        }

        function togglePanels() {
            if (modeExpandRadio.checked) {
                panelExpand.style.display = 'block';
                panelReallocate.style.display = 'none';
            } else {
                panelExpand.style.display = 'none';
                panelReallocate.style.display = 'block';
                updateSourceFreeIds();
            }
        }

        hotelSel.addEventListener('change', updateDepts);
        deptSel.addEventListener('change', updateSubdepts);
        sourceSubdeptSel.addEventListener('change', updateSourceFreeIds);
        modeExpandRadio.addEventListener('change', togglePanels);
        modeReallocateRadio.addEventListener('change', togglePanels);

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            statusMsg.style.display = 'none';

            const btnSubmit = document.getElementById('btn-submit-quick-expand-action');
            const originalBtnHtml = btnSubmit ? btnSubmit.innerHTML : '';

            const mode = document.querySelector('input[name="quick_mode"]:checked').value;
            const hId = parseInt(hotelSel.value);
            const dId = parseInt(deptSel.value);
            const sId = subdeptSel.value ? parseInt(subdeptSel.value) : null;

            if (mode === 'expand') {
                const count = parseInt(document.getElementById('quick-expand-qty').value);
                if (!count || count <= 0) {
                    statusMsg.style.display = 'block';
                    statusMsg.className = 'alert alert-danger';
                    statusMsg.textContent = 'Ingresa una cantidad válida de IDs a agregar mayor a 0.';
                    return;
                }

                try {
                    if (btnSubmit) { btnSubmit.disabled = true; btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i> Procesando...'; }

                    const res = await fetch('/api/radios/id-ranges/expand', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            hotel_id: hId,
                            department_id: dId,
                            subdepartment_id: sId,
                            count: count
                        })
                    });

                    const result = await res.json();
                    if (res.ok) {
                        alert(result.message || 'Rango ampliado correctamente.');
                        modal.classList.remove('active');
                        if (typeof loadRadioIdRanges === 'function') loadRadioIdRanges();
                    } else {
                        statusMsg.style.display = 'block';
                        statusMsg.className = 'alert alert-danger';
                        statusMsg.textContent = result.error || 'Error al ampliar rango de IDs';
                    }
                } catch (err) {
                    console.error('Error al ampliar IDs:', err);
                    statusMsg.style.display = 'block';
                    statusMsg.className = 'alert alert-danger';
                    statusMsg.textContent = 'Error de conexión con el servidor.';
                } finally {
                    if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.innerHTML = originalBtnHtml; }
                }
            } else if (mode === 'reallocate') {
                const sourceSubId = sourceSubdeptSel.value ? parseInt(sourceSubdeptSel.value) : null;
                const targetSubId = sId;

                if (!sourceSubId) {
                    statusMsg.style.display = 'block';
                    statusMsg.className = 'alert alert-danger';
                    statusMsg.textContent = 'Debes seleccionar un subdepartamento origen.';
                    return;
                }

                if (!targetSubId) {
                    statusMsg.style.display = 'block';
                    statusMsg.className = 'alert alert-danger';
                    statusMsg.textContent = 'Debes seleccionar un subdepartamento destino en el campo "Subdepartamento (Destino de IDs)".';
                    return;
                }

                if (sourceSubId === targetSubId) {
                    statusMsg.style.display = 'block';
                    statusMsg.className = 'alert alert-danger';
                    statusMsg.textContent = 'El subdepartamento origen y destino deben ser diferentes.';
                    return;
                }

                const count = parseInt(document.getElementById('quick-transfer-qty').value);
                if (!count || count <= 0) {
                    statusMsg.style.display = 'block';
                    statusMsg.className = 'alert alert-danger';
                    statusMsg.textContent = 'Ingresa una cantidad válida de IDs a transferir mayor a 0.';
                    return;
                }

                try {
                    if (btnSubmit) { btnSubmit.disabled = true; btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i> Transferiendo...'; }

                    const res = await fetch('/api/radios/id-ranges/reallocate', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            hotel_id: hId,
                            source_subdepartment_id: sourceSubId,
                            target_subdepartment_id: targetSubId,
                            count: count
                        })
                    });

                    let result = {};
                    try {
                        result = await res.json();
                    } catch (jsonErr) {
                        result = { error: `Respuesta del servidor no válida (Código: ${res.status} ${res.statusText})` };
                    }

                    if (res.ok) {
                        alert(result.message || 'IDs transferidos correctamente.');
                        modal.classList.remove('active');
                        if (typeof loadRadioIdRanges === 'function') loadRadioIdRanges();
                    } else {
                        if (res.status === 401) {
                            alert('Tu sesión ha expirado. Por favor inicia sesión nuevamente.');
                            window.location.reload();
                            return;
                        }
                        statusMsg.style.display = 'block';
                        statusMsg.className = 'alert alert-danger';
                        statusMsg.textContent = result.error || `Error (${res.status}): No se pudo reasignar IDs`;
                    }
                } catch (err) {
                    console.error('Error al transferir IDs:', err);
                    statusMsg.style.display = 'block';
                    statusMsg.className = 'alert alert-danger';
                    statusMsg.textContent = 'Error de red o conexión al servidor. Revisa tu conexión a internet.';
                } finally {
                    if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.innerHTML = originalBtnHtml; }
                }
            }
        });
    }

    // Inicializar listener del modal rápido
    initQuickExpandIdModal();

    // Submit Guardar / Editar Radio
    document.getElementById('form-radio-item')?.addEventListener('submit', async function (e) {
        e.preventDefault();
        const rId = document.getElementById('rad-form-id')?.value;
        const deptId = document.getElementById('rad-form-dept')?.value;
        const subdeptEl = document.getElementById('rad-form-area');
        const subdeptId = (subdeptEl && !subdeptEl.disabled && subdeptEl.value) ? subdeptEl.value : null;

        const payload = {
            hotel_id: document.getElementById('rad-form-property').value,
            serial_number: document.getElementById('rad-form-serial').value.trim(),
            brand: document.getElementById('rad-form-brand').value.trim(),
            model: document.getElementById('rad-form-model').value.trim(),
            department_id: deptId ? parseInt(deptId) : null,
            subdepartment_id: subdeptId ? parseInt(subdeptId) : null,
            status: document.getElementById('rad-form-status').value,
            notes: document.getElementById('rad-form-notes').value.trim()
        };

        const url = rId ? `/api/radios/${rId}` : '/api/radios';
        const method = rId ? 'PUT' : 'POST';

        try {
            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const savedRadio = await res.json();
                closeModal('modal-radio-item');
                alert(rId ? `Radio actualizado exitosamente.` : `¡Radio registrado con éxito!\nID Asignado: #${savedRadio.radio_code}\nSerial: ${savedRadio.serial_number}`);
                loadDashboard();
                loadRadiosList();
                loadRadioIdRanges();
            } else {
                const err = await res.json();
                alert('Error al guardar radio: ' + (err.error || 'Error desconocido'));
            }
        } catch (err) {
            console.error('Error guardando radio:', err);
        }
    });

    // Submit Asignar Radio
    document.getElementById('form-radio-assign')?.addEventListener('submit', async function (e) {
        e.preventDefault();
        const radioId = document.getElementById('rad-assign-radio-id').value;
        const payload = {
            name: document.getElementById('rad-assign-name').value.trim(),
            employee_id: document.getElementById('rad-assign-emp-id').value.trim(),
            position: document.getElementById('rad-assign-position').value.trim(),
            notes: document.getElementById('rad-assign-notes').value.trim()
        };

        try {
            const res = await fetch(`/api/radios/${radioId}/assign`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                closeModal('modal-radio-assign');
                alert('Radio asignado exitosamente.');
                loadRadiosList();
            } else {
                const err = await res.json();
                alert('Error al asignar el radio: ' + (err.error || ''));
            }
        } catch (err) {
            console.error('Error asignando radio:', err);
        }
    });

    // Submit Importación Masiva Excel / CSV
    document.getElementById('form-radio-import')?.addEventListener('submit', async function (e) {
        e.preventDefault();
        const propId = document.getElementById('rad-import-property').value;
        const fileInput = document.getElementById('rad-import-file');
        const statusSpan = document.getElementById('import-excel-status');

        if (!fileInput.files || fileInput.files.length === 0) {
            alert('Por favor selecciona un archivo Excel o CSV.');
            return;
        }

        const file = fileInput.files[0];
        if (statusSpan) statusSpan.innerText = 'Leyendo archivo...';

        const reader = new FileReader();
        reader.onload = async function (evt) {
            try {
                const content = evt.target.result;
                const lines = content.split(/\r\n|\n/);
                const radiosData = [];

                for (let i = 1; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line) continue;
                    const parts = line.split(',');
                    if (parts.length >= 1 && parts[0].trim()) {
                        radiosData.push({
                            serial_number: parts[0].trim(),
                            radio_code: parts[1] ? parts[1].trim() : '',
                            brand: parts[2] ? parts[2].trim() : 'Motorola',
                            model: parts[3] ? parts[3].trim() : 'R7',
                            status: parts[4] ? parts[4].trim() : 'operativo',
                            notes: parts[5] ? parts[5].trim() : 'Importado vía archivo'
                        });
                    }
                }

                if (radiosData.length === 0) {
                    if (statusSpan) statusSpan.innerText = 'No se encontraron filas con datos.';
                    alert('No se encontraron registros válidos en el archivo.');
                    return;
                }

                if (statusSpan) statusSpan.innerText = `Cargando ${radiosData.length} registros...`;

                const res = await fetch('/api/radios/import-excel', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        hotel_id: parseInt(propId),
                        radios: radiosData
                    })
                });

                if (res.ok) {
                    const result = await res.json();
                    if (statusSpan) statusSpan.innerText = result.message || 'Importación completada.';
                    alert(result.message || 'Importación completada con éxito.');
                    document.getElementById('form-radio-import').reset();
                    loadDashboard();
                    loadRadiosList();
                } else {
                    const err = await res.json();
                    if (statusSpan) statusSpan.innerText = 'Error en la importación.';
                    alert('Error en la importación: ' + (err.error || ''));
                }
            } catch (err) {
                console.error('Error importando radios:', err);
                if (statusSpan) statusSpan.innerText = 'Error procesando archivo.';
            }
        };
        reader.readAsText(file);
    });

    // Notificaciones header
    document.querySelector('.radios-header-icon-btn')?.addEventListener('click', () => {
        const dVal = document.getElementById('rad-stat-danados')?.innerText || '0';
        const rVal = document.getElementById('rad-stat-revision')?.innerText || '0';
        const pVal = document.getElementById('rad-stat-perdidos')?.innerText || '0';
        alert(`🔔 Panel de Alertas TEC-RADIOS:\n\n• Radios Requieren Revisión: ${rVal}\n• Radios Dañados / En Reparación: ${dVal}\n• Radios No Localizados: ${pVal}\n\nRevisa el panel de alertas en la pestaña Inicio.`);
    });

    // Cargas iniciales
    loadCurrentUser();
    loadDashboard();
    loadAuthorizedProperties().then(() => {
        loadDashboard();
    });
}

// Auto-ejecución inmediata
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initRadiosModule();
        loadDashboard();
    });
} else {
    initRadiosModule();
    loadDashboard();
}
