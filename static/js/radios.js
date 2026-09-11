// =========================================================================
// CONTROLADOR JAVASCRIPT - TEC-RADIOS (MÓDULO DE GESTIÓN DE RADIOS)
// SISTEMA ROBUSTO, REACTIVO Y TOTALMENTE MODULAR
// =========================================================================

let userProperties = [];
let currentPropertyId = 'all';
let currentRadiosList = [];
let statusChartInstance = null;
let activeFormalInventory = null;

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

window.openNewRadioModal = async function () {
    const modal = document.getElementById('modal-radio-item');
    if (modal) {
        document.getElementById('form-radio-item')?.reset();
        const idField = document.getElementById('rad-form-id');
        if (idField) idField.value = '';
        
        const urlInp = document.getElementById('rad-form-image-url');
        if (urlInp) urlInp.value = '';
        const previewImg = document.getElementById('rad-form-img-preview');
        if (previewImg) previewImg.src = '/static/img/default_radio.svg';
        const fileInp = document.getElementById('rad-form-image-input');
        if (fileInp) fileInp.value = '';

        const nameInp = document.getElementById('rad-form-assigned-name');
        if (nameInp) nameInp.value = '';
        const empInp = document.getElementById('rad-form-assigned-emp-id');
        if (empInp) empInp.value = '';
        const posInp = document.getElementById('rad-form-assigned-position');
        if (posInp) posInp.value = '';

        const codeInput = document.getElementById('rad-form-code');
        if (codeInput) {
            codeInput.value = '----';
            codeInput.placeholder = 'Calculando...';
        }

        const hintEl = document.getElementById('rad-form-id-hint');
        if (hintEl) {
            hintEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-primary me-1"></i> Identificando bloque de IDs disponible...';
        }

        const titleEl = document.getElementById('modal-radio-title');
        if (titleEl) titleEl.innerText = 'Nuevo Radio';

        // Asegurar que userProperties esté cargado
        if (!userProperties || userProperties.length === 0) {
            try {
                const pRes = await fetch('/api/radios/properties');
                if (pRes.ok) userProperties = await pRes.json();
            } catch(e) {}
        }

        const propSel = document.getElementById('rad-form-property');
        if (propSel && userProperties && userProperties.length > 0) {
            propSel.innerHTML = userProperties.map(p => `<option value="${p.id}">${escapeHtml(p.name)} (${escapeHtml(p.sigla)})</option>`).join('');
            if (currentPropertyId !== 'all') {
                propSel.value = currentPropertyId;
            }
        }
        await loadDepartmentsForForms(propSel ? propSel.value : null);
        const deptSel = document.getElementById('rad-form-dept');
        if (deptSel && deptSel.options.length > 1) {
            deptSel.selectedIndex = 1;
            deptSel.dispatchEvent(new Event('change'));
        }
        modal.classList.add('active');
    }
};

// -------------------------------------------------------------------------
// NAVEGACIÓN GLOBAL DE PESTAÑAS (TABS)
// -------------------------------------------------------------------------
window.switchRadioTab = function (targetTab) {
    if (!targetTab) return;

    if (targetTab === 'tab-depts' && window.canAccessRadioConfig === false) {
        if (window.showToast) showToast('No tienes permiso para acceder al módulo de configuración de TEC-RADIOS', 'error');
        return;
    }

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

    // 1. Título dinámico del header según el módulo activo
    const TAB_TITLES = {
        'tab-dashboard': 'Inicio',
        'tab-inventory': isRadioQueryUser ? 'Mis Radios' : 'Radios de Comunicación',
        'tab-search': 'Consultar Radio',
        'tab-incidents': 'Reportar Incidencia',
        'tab-formal-inv': 'Inventario de Radios',
        'tab-my-inv': 'Mi Inventario',
        'tab-assignments': 'Asignaciones',
        'tab-reports': 'Reportes',
        'tab-decommissions': 'Bajas y Decomisos',
        'tab-depts': 'Configuración'
    };
    const pageTitleEl = document.querySelector('.page-title') || document.getElementById('page-title');
    if (pageTitleEl && TAB_TITLES[targetTab]) {
        pageTitleEl.textContent = TAB_TITLES[targetTab];
    }

    // Bloqueo de seguridad Frontend para usuarios de consulta
    const adminOnlyTabs = ['tab-formal-inv', 'tab-my-inv', 'tab-assignments', 'tab-reports', 'tab-decommissions', 'tab-depts'];
    if (isRadioQueryUser && adminOnlyTabs.includes(targetTab)) {
        if (window.showToast) showToast('Acceso denegado. Módulo administrativo no disponible para tu perfil.', 'error');
        else alert('Acceso denegado. Módulo administrativo no disponible para tu perfil de consulta.');
        switchRadioTab('tab-dashboard');
        return;
    }

    // 2. Control de visibilidad del filtro de propiedad en el header
    const propContainer = document.querySelector('.radios-header-property');
    if (propContainer) {
        if (isRadioQueryUser || targetTab === 'tab-formal-inv' || targetTab === 'tab-search' || targetTab === 'tab-incidents') {
            propContainer.style.display = 'none';
        } else {
            propContainer.style.display = 'flex';
        }
    }

    // 3. Control de visibilidad del botón "+ Nuevo Radio" en el header
    const topNewBtn = document.getElementById('btn-radio-top-new');
    if (topNewBtn) {
        if (!isRadioQueryUser && targetTab === 'tab-inventory') {
            topNewBtn.style.display = 'inline-flex';
        } else {
            topNewBtn.style.display = 'none';
        }
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
        case 'tab-incidents':
            loadIncidentsTab();
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

// Variables de Rol y Estado de Consulta
let isRadioQueryUser = (typeof window !== 'undefined' && typeof window.IS_RADIO_QUERY_USER !== 'undefined') ? window.IS_RADIO_QUERY_USER : false;
let queryStatusDonutInstance = null;
let queryUserProperties = [];
let querySelectedProp = 'all';
let querySelectedDept = 'all';
let querySelectedSubdept = 'all';

// -------------------------------------------------------------------------
// 1. TAB DASHBOARD (BIFURCACIÓN DUAL: CONSULTA vs ADMINISTRATIVO)
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
            return;
        }
        const data = await res.json();
        console.log('[TEC-RADIOS] Datos recibidos del dashboard:', data);

        // Detectar si el usuario tiene rol de consulta o encargado
        const radioRole = data.radio_role || (window.RADIO_ROLE || 'admin');
        if (typeof window !== 'undefined' && typeof window.IS_RADIO_QUERY_USER !== 'undefined') {
            isRadioQueryUser = window.IS_RADIO_QUERY_USER;
        } else {
            isRadioQueryUser = (radioRole === 'viewer' || radioRole === 'dept_manager') && !data.is_admin;
        }

        // Ajustar interfaz según rol
        const queryContainer = document.getElementById('rad-dash-query-container');
        const adminContainer = document.getElementById('rad-dash-admin-container');

        if (isRadioQueryUser) {
            if (queryContainer) queryContainer.style.display = 'block';
            if (adminContainer) adminContainer.style.display = 'none';

            // Ocultar botones de navegación y acciones administrativas
            document.querySelectorAll('.rad-admin-only-tab').forEach(el => el.style.display = 'none');
            document.querySelectorAll('.rad-admin-only-action').forEach(el => el.style.display = 'none');
            const topPropFilter = document.querySelector('.radios-header-property');
            if (topPropFilter) topPropFilter.style.display = 'none';

            // Cargar dashboard de consulta especializado
            await renderQueryDashboardData(data);
            return;
        } else {
            if (queryContainer) queryContainer.style.display = 'none';
            if (adminContainer) adminContainer.style.display = 'block';
            document.querySelectorAll('.rad-admin-only-tab').forEach(el => el.style.display = 'flex');
            document.querySelectorAll('.rad-admin-only-action').forEach(el => el.style.display = 'inline-flex');
            const topPropFilter = document.querySelector('.radios-header-property');
            if (topPropFilter) topPropFilter.style.display = 'flex';
        }

        // =========================================================
        // DASHBOARD ADMINISTRATIVO ORIGINAL (SIN MODIFICACIONES)
        // =========================================================
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

// -------------------------------------------------------------------------
// RENDERIZADO DEL DASHBOARD EXCLUSIVO DE CONSULTA
// -------------------------------------------------------------------------
async function renderQueryDashboardData(data) {
    // 1. Nombre de usuario en saludo
    const userEl = document.getElementById('rad-qdash-welcome-user');
    if (userEl && data.user_name) {
        userEl.textContent = data.user_name;
    }

    queryUserProperties = data.assigned_properties || [];

    // 2. Poblar Filtro de Propiedades
    const propSel = document.getElementById('rad-qfilter-prop');
    if (propSel) {
        const totalProps = queryUserProperties.length;
        let propOpts = `<option value="all">Todas mis propiedades (${totalProps})</option>`;
        queryUserProperties.forEach(p => {
            propOpts += `<option value="${p.id}" ${querySelectedProp == p.id ? 'selected' : ''}>${escapeHtml(p.name)}</option>`;
        });
        propSel.innerHTML = propOpts;
    }

    // 3. Poblar Filtro de Departamentos (Dependiente)
    const deptSel = document.getElementById('rad-qfilter-dept');
    if (deptSel) {
        let deptList = data.by_department || [];
        let deptOpts = `<option value="all">Todos los departamentos</option>`;
        deptList.forEach(d => {
            deptOpts += `<option value="${d.id}" ${querySelectedDept == d.id ? 'selected' : ''}>${escapeHtml(d.name)}</option>`;
        });
        deptSel.innerHTML = deptOpts;
    }

    // 4. Poblar Filtro de Subdepartamentos (Dependiente)
    const subdeptSel = document.getElementById('rad-qfilter-subdept');
    if (subdeptSel) {
        let subdeptList = data.by_subdepartment || [];
        let subOpts = `<option value="all">Todos los subdepartamentos</option>`;
        subdeptList.forEach(s => {
            subOpts += `<option value="${s.id}" ${querySelectedSubdept == s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`;
        });
        subdeptSel.innerHTML = subOpts;
    }

    // 5. 4 Cards de Indicadores KPIs
    const total = data.total || 0;
    const operativos = data.operativo || 0;
    const reparacion = data.en_reparacion || 0;
    const fuera = (data.fuera_servicio || 0) + (data.danado || 0);

    const calcPct = (val) => (total > 0 ? Math.round((val / total) * 100) : 0) + '%';

    const elTotal = document.getElementById('rad-qstat-total');
    if (elTotal) elTotal.innerText = total;

    const elSubProps = document.getElementById('rad-qstat-sub-props');
    if (elSubProps) {
        const pCount = querySelectedProp === 'all' ? queryUserProperties.length : 1;
        elSubProps.innerText = `en ${pCount} ${pCount === 1 ? 'propiedad' : 'propiedades'}`;
    }

    const elOp = document.getElementById('rad-qstat-operativos');
    if (elOp) elOp.innerText = operativos;
    const elOpPct = document.getElementById('rad-qstat-operativos-pct');
    if (elOpPct) elOpPct.innerText = calcPct(operativos);

    const elRep = document.getElementById('rad-qstat-reparacion');
    if (elRep) elRep.innerText = reparacion;
    const elRepPct = document.getElementById('rad-qstat-reparacion-pct');
    if (elRepPct) elRepPct.innerText = calcPct(reparacion);

    const elFue = document.getElementById('rad-qstat-fuera');
    if (elFue) elFue.innerText = fuera;
    const elFuePct = document.getElementById('rad-qstat-fuera-pct');
    if (elFuePct) elFuePct.innerText = calcPct(fuera);

    // 6. Gráfico / Barras: Radios por Propiedad
    const propBarsContainer = document.getElementById('rad-qprop-bars-list');
    if (propBarsContainer) {
        const propList = data.by_property || [];
        if (propList.length === 0) {
            propBarsContainer.innerHTML = '<div style="text-align: center; color: #94a3b8; font-size: 12px; padding: 20px;">Sin datos de propiedades.</div>';
        } else {
            const maxVal = Math.max(...propList.map(p => p.count), 1);
            propBarsContainer.innerHTML = propList.map(p => {
                const pct = Math.round((p.count / maxVal) * 100);
                return `
                    <div class="query-bar-row">
                        <span class="query-bar-label" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</span>
                        <div class="query-bar-track">
                            <div class="query-bar-fill" style="width: ${p.count > 0 ? Math.max(pct, 10) : 0}%;"></div>
                        </div>
                        <span class="query-bar-val">${p.count}</span>
                    </div>
                `;
            }).join('');
        }
    }

    // 7. Gráfico Donut Chart.js: Estado de los Radios con total central
    renderQueryStatusDonutChart(total, operativos, reparacion, fuera);

    // 8. Barras: Radios por Subdepartamento
    const subdeptBarsContainer = document.getElementById('rad-qsubdept-bars-list');
    if (subdeptBarsContainer) {
        const subList = data.by_subdepartment || [];
        if (subList.length === 0) {
            subdeptBarsContainer.innerHTML = '<div style="text-align: center; color: #94a3b8; font-size: 12px; padding: 20px;">Sin subdepartamentos con radios asignados.</div>';
        } else {
            const maxVal = Math.max(...subList.map(s => s.count), 1);
            subdeptBarsContainer.innerHTML = subList.map(s => {
                const pct = Math.round((s.count / maxVal) * 100);
                return `
                    <div class="query-bar-row">
                        <span class="query-bar-label" title="${escapeHtml(s.name)}">${escapeHtml(s.name)}</span>
                        <div class="query-bar-track">
                            <div class="query-bar-fill" style="width: ${s.count > 0 ? Math.max(pct, 10) : 0}%;"></div>
                        </div>
                        <span class="query-bar-val">${s.count}</span>
                    </div>
                `;
            }).join('');
        }
    }

    // 9. Tabla: Mis Radios Asignados (6 columnas limpias)
    const tableTbody = document.getElementById('rad-qtable-assigned-tbody');
    if (tableTbody) {
        const radiosList = data.recent_radios || [];
        if (radiosList.length === 0) {
            tableTbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #94a3b8; padding: 24px;">No tienes radios asignados en esta selección.</td></tr>';
        } else {
            tableTbody.innerHTML = radiosList.map(r => {
                let badgeHtml = '';
                if (r.status === 'operativo') {
                    badgeHtml = `<span class="query-badge-operativo"><i class="fa-solid fa-circle-check"></i> Operativo</span>`;
                } else if (r.status === 'en_reparacion' || r.status === 'requiere_revision') {
                    badgeHtml = `<span class="query-badge-reparacion"><i class="fa-solid fa-triangle-exclamation"></i> En Reparación</span>`;
                } else {
                    badgeHtml = `<span class="query-badge-fuera"><i class="fa-solid fa-circle-xmark"></i> Fuera de Servicio</span>`;
                }

                return `
                    <tr style="cursor: pointer;" onclick="consultSingleRadio('${escapeHtml(r.serial_number || r.radio_code)}')">
                        <td><strong style="color: #0f172a; font-family: monospace;">#${escapeHtml(r.radio_code || r.id)}</strong></td>
                        <td style="font-family: monospace; font-size: 11.5px;">${escapeHtml(r.serial_number || '-')}</td>
                        <td>${escapeHtml(r.model || 'Motorola DP4400')}</td>
                        <td>${escapeHtml(r.property_sigla || r.property_name || 'Hotel')}</td>
                        <td><span style="font-weight: 600; color: #334155;">${escapeHtml(r.assigned_person_name || 'Sin Asignar')}</span></td>
                        <td>${badgeHtml}</td>
                    </tr>
                `;
            }).join('');
        }
    }

    // 10. Lista: Mis Propiedades Asignadas
    const propsListEl = document.getElementById('rad-qdash-assigned-props-list');
    if (propsListEl) {
        if (queryUserProperties.length === 0) {
            propsListEl.innerHTML = '<div style="color: #94a3b8; font-size: 12px;">Sin propiedades asignadas.</div>';
        } else {
            propsListEl.innerHTML = queryUserProperties.map(p => `
                <div class="query-prop-item">
                    <i class="fa-solid fa-hotel" style="color: #64748b; font-size: 13px;"></i>
                    <span>${escapeHtml(p.name)}</span>
                </div>
            `).join('');
        }
    }

    // Inicializar listeners de filtros dependientes
    initQueryFiltersListeners();
}

// -------------------------------------------------------------------------
// DONUT CHART PARA EL DASHBOARD DE CONSULTA
// -------------------------------------------------------------------------
function renderQueryStatusDonutChart(total, op, rep, fuera) {
    const centerTotalEl = document.getElementById('rad-qdonut-center-total');
    if (centerTotalEl) {
        centerTotalEl.textContent = total;
    }

    const calcPctStr = (val) => `${val} (${total > 0 ? Math.round((val / total) * 100) : 0}%)`;

    const elLegOp = document.getElementById('rad-qleg-op');
    if (elLegOp) elLegOp.innerText = calcPctStr(op);
    const elLegRep = document.getElementById('rad-qleg-rep');
    if (elLegRep) elLegRep.innerText = calcPctStr(rep);
    const elLegFu = document.getElementById('rad-qleg-fuera');
    if (elLegFu) elLegFu.innerText = calcPctStr(fuera);

    const canvas = document.getElementById('rad-qstatus-donut-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (queryStatusDonutInstance) {
        queryStatusDonutInstance.destroy();
    }

    if (typeof Chart !== 'undefined') {
        queryStatusDonutInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Operativo', 'En Reparación', 'Fuera de Servicio'],
                datasets: [{
                    data: total > 0 ? [op, rep, fuera] : [1, 0, 0],
                    backgroundColor: total > 0 ? ['#10b981', '#f59e0b', '#ef4444'] : ['#e2e8f0', '#e2e8f0', '#e2e8f0'],
                    borderWidth: 3,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '76%',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        enabled: total > 0,
                        callbacks: {
                            label: function (context) {
                                const val = context.raw || 0;
                                const pct = total > 0 ? Math.round((val / total) * 100) : 0;
                                return ` ${context.label}: ${val} (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });
    }
}

// -------------------------------------------------------------------------
// FILTROS DEPENDIENTES DASHBOARD CONSULTA
// -------------------------------------------------------------------------
function initQueryFiltersListeners() {
    const propSel = document.getElementById('rad-qfilter-prop');
    const deptSel = document.getElementById('rad-qfilter-dept');
    const subdeptSel = document.getElementById('rad-qfilter-subdept');
    const btnClear = document.getElementById('btn-rad-qfilter-clear');
    const btnReportNow = document.getElementById('btn-qdash-report-now');
    const btnVerTodasProps = document.getElementById('btn-qdash-all-props');

    if (propSel && !propSel._hasQueryListener) {
        propSel._hasQueryListener = true;
        propSel.addEventListener('change', async () => {
            querySelectedProp = propSel.value;
            querySelectedDept = 'all';
            querySelectedSubdept = 'all';
            await refreshQueryDashboard();
        });
    }

    if (deptSel && !deptSel._hasQueryListener) {
        deptSel._hasQueryListener = true;
        deptSel.addEventListener('change', async () => {
            querySelectedDept = deptSel.value;
            querySelectedSubdept = 'all';
            await refreshQueryDashboard();
        });
    }

    if (subdeptSel && !subdeptSel._hasQueryListener) {
        subdeptSel._hasQueryListener = true;
        subdeptSel.addEventListener('change', async () => {
            querySelectedSubdept = subdeptSel.value;
            await refreshQueryDashboard();
        });
    }

    if (btnClear && !btnClear._hasQueryListener) {
        btnClear._hasQueryListener = true;
        btnClear.addEventListener('click', async () => {
            querySelectedProp = 'all';
            querySelectedDept = 'all';
            querySelectedSubdept = 'all';
            await refreshQueryDashboard();
        });
    }

    if (btnReportNow && !btnReportNow._hasQueryListener) {
        btnReportNow._hasQueryListener = true;
        btnReportNow.addEventListener('click', () => {
            openRadioIncidentModal();
        });
    }

    if (btnVerTodasProps && !btnVerTodasProps._hasQueryListener) {
        btnVerTodasProps._hasQueryListener = true;
        btnVerTodasProps.addEventListener('click', async () => {
            querySelectedProp = 'all';
            querySelectedDept = 'all';
            querySelectedSubdept = 'all';
            await refreshQueryDashboard();
        });
    }
}

async function refreshQueryDashboard() {
    const params = new URLSearchParams();
    if (querySelectedProp && querySelectedProp !== 'all') params.append('hotel_id', querySelectedProp);
    if (querySelectedDept && querySelectedDept !== 'all') params.append('department_id', querySelectedDept);
    if (querySelectedSubdept && querySelectedSubdept !== 'all') params.append('subdepartment_id', querySelectedSubdept);

    const url = `/api/radios/dashboard?${params.toString()}`;
    try {
        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            await renderQueryDashboardData(data);
        }
    } catch (e) {
        console.error('Error al actualizar dashboard de consulta:', e);
    }
}

window.consultSingleRadio = function(query) {
    if (!query) return;
    switchRadioTab('tab-search');
    const input = document.getElementById('rad-quick-search-input');
    if (input) {
        input.value = query;
        const btn = document.getElementById('btn-rad-quick-search');
        if (btn) btn.click();
    }
};

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

    // Ajustar visibilidad de botones según rol de consulta
    if (isRadioQueryUser) {
        const btnEdit = document.getElementById('btn-rad-edit-item');
        if (btnEdit) btnEdit.style.display = 'none';
        const btnTrans = document.getElementById('btn-rad-transfer-item');
        if (btnTrans) btnTrans.style.display = 'none';
    }

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
                if (elProp) elProp.innerText = r.property_sigla || r.property_name || 'Hotel';

                const elDept = document.getElementById('rad-card-dept');
                if (elDept) elDept.innerText = r.department_name || 'General';

                const elArea = document.getElementById('rad-card-area');
                if (elArea) elArea.innerText = r.subdepartment_name || r.area_name || '-';

                const elAss = document.getElementById('rad-card-assigned');
                if (elAss) elAss.innerText = r.assigned_person ? r.assigned_person.name : (r.assigned_person_name || 'Sin Asignar');

                const elEmpNum = document.getElementById('rad-card-emp-num');
                if (elEmpNum) elEmpNum.innerText = r.assigned_person ? (r.assigned_person.employeeId || '-') : (r.assigned_employee_id || '-');

                const elAssignDate = document.getElementById('rad-card-assign-date');
                if (elAssignDate) elAssignDate.innerText = r.assigned_person ? (r.assigned_person.assignedDate || '-') : '-';

                const elObs = document.getElementById('rad-card-obs');
                if (elObs) elObs.innerText = r.notes || 'Sin novedades.';

                const statusBadge = document.getElementById('rad-card-status-badge');
                if (statusBadge) statusBadge.innerHTML = renderStatusBadge(r.status);

                const cardImg = document.getElementById('rad-card-img');
                if (cardImg) {
                    let imgUrl = r.image_url || r.imageUrl || '';
                    if (!imgUrl || imgUrl === '/static/img/default_radio.svg') {
                        const m = (r.model || '').toUpperCase().replace(/\s+|-/g, '');
                        if (m.includes('DEP450') || m.includes('450')) imgUrl = '/static/img/dep450.jpg';
                        else if (m.includes('DEP250') || m.includes('250')) imgUrl = '/static/img/dep250.jpg';
                        else imgUrl = '/static/img/default_radio.svg';
                    }
                    cardImg.src = imgUrl;
                }

                // Ajustar botones en la ficha
                if (isRadioQueryUser) {
                    const btnEdit = document.getElementById('btn-rad-edit-item');
                    if (btnEdit) btnEdit.style.display = 'none';
                    const btnTrans = document.getElementById('btn-rad-transfer-item');
                    if (btnTrans) btnTrans.style.display = 'none';
                }
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

    // BOTÓN: Reportar Problema -> Abre el modal formal de Incidencia
    document.getElementById('btn-rad-report-issue')?.addEventListener('click', () => {
        if (!currentSearchedRadio) {
            promptSearchIfEmpty();
            return;
        }
        openRadioIncidentModal(currentSearchedRadio.id);
    });
}

// -------------------------------------------------------------------------
// GESTIÓN DE INCIDENCIAS (MÓDULO Y MODAL)
// -------------------------------------------------------------------------
let cachedRadioIncidents = [];

async function loadIncidentsTab() {
    const tbody = document.getElementById('rad-incidents-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: #94a3b8; padding: 20px;"><i class="fa-solid fa-spinner fa-spin me-1"></i> Cargando incidencias...</td></tr>';

    try {
        const res = await fetch('/api/radios/incidents');
        if (!res.ok) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: #ef4444; padding: 20px;">Error al cargar incidencias del servidor.</td></tr>';
            return;
        }
        const incidents = await res.json();
        cachedRadioIncidents = incidents;

        if (incidents.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: #94a3b8; padding: 24px;">No hay incidencias ni reportes registrados.</td></tr>';
            return;
        }

        tbody.innerHTML = incidents.map(inc => {
            const pColor = inc.priority === 'Crítica' ? '#dc2626' : (inc.priority === 'Alta' ? '#ea580c' : '#475569');
            const stColor = inc.status === 'Resuelta' ? 'bg-success' : (inc.status === 'En Proceso' ? 'bg-warning text-dark' : 'bg-danger');

            return `
                <tr>
                    <td><small style="font-weight: 600; color: #64748b;">${escapeHtml(inc.created_at || 'Reciente')}</small></td>
                    <td><strong style="color: #0f172a; font-family: monospace;">#${escapeHtml(inc.radio_code || '-')}</strong> <br><small style="color: #64748b; font-family: monospace;">${escapeHtml(inc.serial_number || '')}</small></td>
                    <td>${escapeHtml(inc.hotel_name || 'Propiedad')}</td>
                    <td>${escapeHtml(inc.department_name || 'General')}</td>
                    <td><strong>${escapeHtml(inc.issue_type)}</strong><br><small style="color: #64748b;">${escapeHtml(inc.description || '')}</small></td>
                    <td><span style="color: ${pColor}; font-weight: 800; font-size: 11.5px;"><i class="fa-solid fa-circle-exclamation me-1"></i> ${escapeHtml(inc.priority)}</span></td>
                    <td><span style="font-weight: 600;">${escapeHtml(inc.reported_by || 'Usuario')}</span></td>
                    <td><span class="badge ${stColor}" style="font-size: 11px; padding: 4px 8px;">${escapeHtml(inc.status || 'Abierta')}</span></td>
                    <td style="text-align: right;">
                        <button type="button" class="btn btn-outline btn-sm" onclick="consultSingleRadio('${escapeHtml(inc.serial_number || inc.radio_code)}')" style="font-size: 11px; padding: 3px 8px;">
                            <i class="fa-solid fa-eye me-1"></i> Ver Radio
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (e) {
        console.error('Error al cargar incidencias:', e);
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: #ef4444; padding: 20px;">Error de red al consultar incidencias.</td></tr>';
    }
}

// -------------------------------------------------------------------------
// BUSCADOR Y REPORTE DE INCIDENCIAS DE RADIOS
// -------------------------------------------------------------------------
let currentSelectedIncidentRadio = null;

async function searchRadioForIncident(searchTerm) {
    const term = (searchTerm || document.getElementById('inc-radio-search-input')?.value || '').trim();
    const idInput = document.getElementById('inc-radio-id');
    const feedbackEl = document.getElementById('inc-radio-search-feedback');
    const btnSearch = document.getElementById('btn-inc-radio-search');

    const idEl = document.getElementById('inc-preview-id');
    const serialEl = document.getElementById('inc-preview-serial');
    const modelEl = document.getElementById('inc-preview-model');
    const propEl = document.getElementById('inc-preview-prop');
    const deptEl = document.getElementById('inc-preview-dept');
    const subdeptEl = document.getElementById('inc-preview-subdept');
    const userEl = document.getElementById('inc-preview-user');

    if (!term) {
        if (feedbackEl) {
            feedbackEl.style.display = 'block';
            feedbackEl.style.color = '#dc2626';
            feedbackEl.innerHTML = '<i class="fa-solid fa-circle-exclamation me-1"></i> Por favor escribe un ID o número de serie.';
        }
        return false;
    }

    try {
        if (btnSearch) {
            btnSearch.disabled = true;
            btnSearch.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        }

        // Buscar en la lista de radios autorizados
        let targetRadio = null;
        if (window.allAuthorizedRadiosList && window.allAuthorizedRadiosList.length > 0) {
            const cleanTerm = term.toLowerCase().replace('#', '');
            targetRadio = window.allAuthorizedRadiosList.find(r => 
                String(r.id) === cleanTerm || 
                String(r.radio_code || '').toLowerCase() === cleanTerm || 
                String(r.serial_number || '').toLowerCase() === cleanTerm
            );
        }

        // Si no se encuentra en memoria, buscar vía API
        if (!targetRadio) {
            const res = await fetch(`/api/radios?search=${encodeURIComponent(term)}`);
            if (res.ok) {
                const list = await res.json();
                if (list && list.length > 0) {
                    const cleanTerm = term.toLowerCase().replace('#', '');
                    targetRadio = list.find(r => 
                        String(r.id) === cleanTerm || 
                        String(r.radio_code || '').toLowerCase() === cleanTerm || 
                        String(r.serial_number || '').toLowerCase() === cleanTerm
                    ) || list[0];
                }
            }
        }

        if (targetRadio) {
            currentSelectedIncidentRadio = targetRadio;
            if (idInput) idInput.value = targetRadio.id;

            if (idEl) idEl.textContent = '#' + (targetRadio.radio_code || targetRadio.id);
            if (serialEl) serialEl.textContent = targetRadio.serial_number || '-';
            if (modelEl) modelEl.textContent = `${targetRadio.brand || 'Motorola'} ${targetRadio.model || ''}`;
            if (propEl) propEl.textContent = targetRadio.property_name || targetRadio.property_sigla || 'Hotel';
            if (deptEl) deptEl.textContent = targetRadio.department_name || '-';
            if (subdeptEl) subdeptEl.textContent = targetRadio.subdepartment_name || '-';
            
            const cust = targetRadio.assigned_person_name || targetRadio.assigned_person?.name || targetRadio.assignedPerson?.name;
            if (userEl) userEl.textContent = cust ? `${cust} (${targetRadio.assigned_position || 'Responsable'})` : 'Sin Asignar (En Almacén)';

            if (feedbackEl) {
                feedbackEl.style.display = 'block';
                feedbackEl.style.color = '#16a34a';
                feedbackEl.innerHTML = `<i class="fa-solid fa-circle-check me-1"></i> Radio <strong>#${targetRadio.radio_code || targetRadio.id}</strong> (${targetRadio.serial_number}) identificado correctamente.`;
            }
            return true;
        } else {
            currentSelectedIncidentRadio = null;
            if (idInput) idInput.value = '';
            if (idEl) idEl.textContent = '-';
            if (serialEl) serialEl.textContent = '-';
            if (modelEl) modelEl.textContent = '-';
            if (propEl) propEl.textContent = '-';
            if (deptEl) deptEl.textContent = '-';
            if (subdeptEl) subdeptEl.textContent = '-';
            if (userEl) userEl.textContent = '-';

            if (feedbackEl) {
                feedbackEl.style.display = 'block';
                feedbackEl.style.color = '#dc2626';
                feedbackEl.innerHTML = `<i class="fa-solid fa-circle-xmark me-1"></i> No se encontró ningún radio con ID o Serial "<strong>${escapeHtml(term)}</strong>".`;
            }
            return false;
        }
    } catch (err) {
        console.error('Error buscando radio para reporte:', err);
        if (feedbackEl) {
            feedbackEl.style.display = 'block';
            feedbackEl.style.color = '#dc2626';
            feedbackEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation me-1"></i> Error al conectar con el servidor.';
        }
        return false;
    } finally {
        if (btnSearch) {
            btnSearch.disabled = false;
            btnSearch.innerHTML = '<i class="fa-solid fa-check"></i> OK';
        }
    }
}

async function openRadioIncidentModal(preselectedRadioId = null) {
    const modal = document.getElementById('modal-radio-incident');
    const form = document.getElementById('form-radio-incident');
    const searchInput = document.getElementById('inc-radio-search-input');
    const idInput = document.getElementById('inc-radio-id');
    const feedbackEl = document.getElementById('inc-radio-search-feedback');
    const statusMsg = document.getElementById('inc-status-msg');

    if (!modal || !form) return;

    if (statusMsg) statusMsg.style.display = 'none';
    if (feedbackEl) feedbackEl.style.display = 'none';
    form.reset();
    if (idInput) idInput.value = '';

    // Limpiar preview
    document.getElementById('inc-preview-id').textContent = '-';
    document.getElementById('inc-preview-serial').textContent = '-';
    document.getElementById('inc-preview-model').textContent = '-';
    document.getElementById('inc-preview-prop').textContent = '-';
    document.getElementById('inc-preview-dept').textContent = '-';
    document.getElementById('inc-preview-subdept').textContent = '-';
    document.getElementById('inc-preview-user').textContent = '-';

    // Cargar caché de radios autorizados si está vacía
    try {
        if (!window.allAuthorizedRadiosList || window.allAuthorizedRadiosList.length === 0) {
            const res = await fetch('/api/radios');
            if (res.ok) window.allAuthorizedRadiosList = await res.json();
        }
    } catch (e) {
        console.error('Error precargando radios:', e);
    }

    // Configurar listener del botón OK y tecla Enter
    const btnSearch = document.getElementById('btn-inc-radio-search');
    if (btnSearch && !btnSearch._hasClickListener) {
        btnSearch._hasClickListener = true;
        btnSearch.addEventListener('click', () => searchRadioForIncident());
    }
    if (searchInput && !searchInput._hasKeydownListener) {
        searchInput._hasKeydownListener = true;
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                searchRadioForIncident();
            }
        });
    }

    if (preselectedRadioId) {
        if (searchInput) searchInput.value = preselectedRadioId;
        searchRadioForIncident(preselectedRadioId);
    }

    modal.classList.add('active');
    setTimeout(() => {
        if (searchInput) searchInput.focus();
    }, 150);
}

// -------------------------------------------------------------------------
// NOTIFICACIONES EXCLUSIVAS DE TEC-RADIOS Y ALERTAS EN PANTALLA EN VIVO
// -------------------------------------------------------------------------
window._lastKnownNotifCount = 0;
window._knownNotifIds = new Set();

window.showLiveRadioAlertToast = function (title, message, incidentId = null, priority = 'Media') {
    let container = document.getElementById('live-radio-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'live-radio-toast-container';
        container.style.cssText = 'position: fixed; top: 24px; right: 24px; z-index: 999999; display: flex; flex-direction: column; gap: 12px; pointer-events: none; max-width: 420px; width: 90vw;';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'live-radio-toast-card';
    const borderColor = priority === 'Crítica' ? '#dc2626' : (priority === 'Alta' ? '#ea580c' : '#2563eb');
    const iconColor = priority === 'Crítica' ? '#dc2626' : (priority === 'Alta' ? '#ea580c' : '#2563eb');
    const iconBg = priority === 'Crítica' ? '#fee2e2' : (priority === 'Alta' ? '#ffedd5' : '#eff6ff');

    toast.style.cssText = `
        background: #ffffff;
        border-radius: 14px;
        box-shadow: 0 16px 36px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.06);
        border-left: 6px solid ${borderColor};
        padding: 16px 18px;
        pointer-events: auto;
        display: flex;
        gap: 12px;
        align-items: flex-start;
        animation: slideInRight 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        transition: all 0.3s ease;
    `;

    toast.innerHTML = `
        <div style="width: 38px; height: 38px; border-radius: 10px; background: ${iconBg}; color: ${iconColor}; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0;">
            <i class="fa-solid fa-triangle-exclamation"></i>
        </div>
        <div style="flex: 1; min-width: 0;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <span style="font-weight: 800; font-size: 13.5px; color: #0f172a;">${escapeHtml(title)}</span>
                <button type="button" class="btn-close-toast" style="background: none; border: none; color: #94a3b8; font-size: 14px; cursor: pointer; padding: 0 4px;"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <p style="margin: 0 0 8px 0; font-size: 12.5px; color: #475569; line-height: 1.4;">${escapeHtml(message)}</p>
            <div style="display: flex; gap: 8px; align-items: center;">
                ${incidentId ? `<button type="button" class="btn-view-inc" style="background: #0f172a; color: #fff; border: none; border-radius: 6px; padding: 4px 10px; font-size: 11.5px; font-weight: 700; cursor: pointer;"><i class="fa-solid fa-arrow-right me-1"></i> Ver Incidencia</button>` : ''}
                <span style="font-size: 11px; color: #94a3b8;"><i class="fa-regular fa-clock me-1"></i> Notificación en vivo</span>
            </div>
        </div>
    `;

    toast.querySelector('.btn-close-toast')?.addEventListener('click', () => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(50px)';
        setTimeout(() => toast.remove(), 300);
    });

    toast.querySelector('.btn-view-inc')?.addEventListener('click', () => {
        if (typeof switchRadioTab === 'function') switchRadioTab('tab-incidents');
        toast.remove();
    });

    container.appendChild(toast);

    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(50px)';
            setTimeout(() => toast.remove(), 300);
        }
    }, 10000);
};

async function loadRadioNotifications() {
    try {
        const res = await fetch('/api/radios/notifications');
        if (!res.ok) return;
        const data = await res.json();
        const unreadCount = data.unread_count || 0;
        const notifs = data.notifications || [];

        // Detectar si hay nuevas alertas no leídas para mostrarlas en pantalla a Administradores
        notifs.forEach(n => {
            if (!n.is_read && n.id && !window._knownNotifIds.has(n.id)) {
                window._knownNotifIds.add(n.id);
                // Si la página ya estaba inicializada, emitir el toast en vivo
                if (window._hasInitialNotifCheck) {
                    showLiveRadioAlertToast(n.title || 'Alerta de Radio', n.message || '', n.incident_id, n.priority || 'Media');
                }
            }
        });
        window._hasInitialNotifCheck = true;

        // Actualizar campana en header si existe indicador
        const bellIconBtn = document.getElementById('btn-notifications-icon');
        if (bellIconBtn) {
            let dot = bellIconBtn.querySelector('.rad-notif-dot');
            if (unreadCount > 0) {
                if (!dot) {
                    dot = document.createElement('span');
                    dot.className = 'rad-notif-dot';
                    dot.style.cssText = 'position: absolute; top: 4px; right: 4px; width: 8px; height: 8px; background: #ef4444; border-radius: 50%; border: 1.5px solid #fff; box-shadow: 0 0 6px #ef4444;';
                    bellIconBtn.appendChild(dot);
                }
            } else if (dot) {
                dot.remove();
            }
        }

        // Renderizar en modal si está abierto
        const listContainer = document.getElementById('rad-notifications-list');
        if (listContainer) {
            if (notifs.length === 0) {
                listContainer.innerHTML = '<div style="text-align: center; color: #94a3b8; padding: 30px; font-size: 13px;">Sin notificaciones pendientes de TEC-RADIOS.</div>';
            } else {
                listContainer.innerHTML = notifs.map(n => `
                    <div class="rad-notif-item ${!n.is_read ? 'unread' : ''}" style="display: flex; gap: 12px; padding: 12px 14px; border-radius: 10px; background: ${n.is_read ? '#f8fafc' : '#eff6ff'}; border: 1px solid ${n.is_read ? '#e2e8f0' : '#bfdbfe'};">
                        <div style="width: 32px; height: 32px; border-radius: 8px; background: ${n.is_read ? '#e2e8f0' : '#dbeafe'}; color: ${n.is_read ? '#64748b' : '#2563eb'}; display: flex; align-items: center; justify-content: center; font-size: 14px; flex-shrink: 0;">
                            <i class="fa-solid fa-triangle-exclamation"></i>
                        </div>
                        <div style="flex: 1;">
                            <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 2px;">
                                <strong style="font-size: 13px; color: #0f172a;">${escapeHtml(n.title)}</strong>
                                <small style="font-size: 11px; color: #64748b;">${escapeHtml(n.created_at || 'Reciente')}</small>
                            </div>
                            <p style="font-size: 12px; color: #475569; margin: 0 0 6px 0; line-height: 1.4;">${escapeHtml(n.message)}</p>
                            ${n.incident_id ? `<button type="button" class="btn btn-link btn-sm p-0" onclick="closeModal('modal-radio-notifications'); switchRadioTab('tab-incidents');" style="font-size: 11.5px; font-weight: 700; color: #2563eb; text-decoration: none;"><i class="fa-solid fa-arrow-right me-1"></i> Abrir Incidencia</button>` : ''}
                        </div>
                    </div>
                `).join('');
            }
        }
    } catch (e) {
        console.error('Error al cargar notificaciones de radios:', e);
    }
}

// Sondeo periódico cada 15 segundos para administradores
if (!window._radioNotifInterval) {
    window._radioNotifInterval = setInterval(() => {
        loadRadioNotifications();
    }, 15000);
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

        // 1. Asegurar carga de propiedades autorizadas
        if (!userProperties || userProperties.length === 0) {
            try {
                const pRes = await fetch('/api/radios/properties');
                if (pRes.ok) userProperties = await pRes.json();
            } catch(e) {
                console.error('Error cargando propiedades:', e);
            }
        }

        // 2. Cargar y seleccionar la Propiedad / Hotel del Radio
        const propSel = document.getElementById('rad-form-property');
        if (propSel && userProperties && userProperties.length > 0) {
            propSel.innerHTML = userProperties.map(p => `<option value="${p.id}">${escapeHtml(p.name)} (${escapeHtml(p.sigla)})</option>`).join('');
            const targetPropId = String(r.hotel_id || r.propertyId || '');
            if (targetPropId) {
                propSel.value = targetPropId;
            }
        }

        // 3. Cargar departamentos de la propiedad a la que pertenece el radio
        const hotelIdToLoad = r.hotel_id || r.propertyId || (propSel ? propSel.value : null);
        await loadDepartmentsForForms(hotelIdToLoad);

        // 4. Seleccionar departamento actual y poblar subdepartamentos
        const deptSel = document.getElementById('rad-form-dept');
        if (deptSel && r.department_id) {
            deptSel.value = String(r.department_id);
            deptSel.dispatchEvent(new Event('change'));
        }

        // 5. Seleccionar subdepartamento actual si existe
        const areaSel = document.getElementById('rad-form-area');
        if (areaSel && r.subdepartment_id) {
            areaSel.value = String(r.subdepartment_id);
        }

        document.getElementById('rad-form-serial').value = r.serial_number || '';
        document.getElementById('rad-form-code').value = '#' + (r.radio_code || r.id);
        document.getElementById('rad-form-brand').value = r.brand || 'Motorola';
        document.getElementById('rad-form-model').value = r.model || 'R7';
        document.getElementById('rad-form-status').value = r.status || 'operativo';
        document.getElementById('rad-form-notes').value = r.notes || '';

        const imgUrl = r.image_url || r.imageUrl || '';
        const urlInp = document.getElementById('rad-form-image-url');
        if (urlInp) urlInp.value = imgUrl;
        const previewImg = document.getElementById('rad-form-img-preview');
        let previewSrc = imgUrl;
        if (!previewSrc || previewSrc === '/static/img/default_radio.svg') {
            const m = (r.model || '').toUpperCase().replace(/\s+|-/g, '');
            if (m.includes('DEP450') || m.includes('450')) previewSrc = '/static/img/dep450.jpg';
            else if (m.includes('DEP250') || m.includes('250')) previewSrc = '/static/img/dep250.jpg';
            else previewSrc = '/static/img/default_radio.svg';
        }
        if (previewImg) previewImg.src = previewSrc;
        const fileInp = document.getElementById('rad-form-image-input');
        if (fileInp) fileInp.value = '';

        const ap = r.assigned_person || r.assignedPerson;
        const nameInp = document.getElementById('rad-form-assigned-name');
        if (nameInp) nameInp.value = ap ? (ap.name || '') : '';
        const empInp = document.getElementById('rad-form-assigned-emp-id');
        if (empInp) empInp.value = ap ? (ap.employeeId || ap.employee_id || '') : '';
        const posInp = document.getElementById('rad-form-assigned-position');
        if (posInp) posInp.value = ap ? (ap.position || '') : '';

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

window.openAssignRadioModal = async function (rId) {
    const assignIdInput = document.getElementById('rad-assign-radio-id');
    if (assignIdInput) assignIdInput.value = rId;
    document.getElementById('form-radio-assign')?.reset();

    let r = (typeof currentRadiosList !== 'undefined' && currentRadiosList) ? currentRadiosList.find(x => String(x.id) === String(rId)) : null;
    if (!r) {
        try {
            const res = await fetch(`/api/radios/${rId}`);
            if (res.ok) r = await res.json();
        } catch(e){}
    }
    if (r && (r.assigned_person || r.assignedPerson)) {
        const ap = r.assigned_person || r.assignedPerson;
        const nameInp = document.getElementById('rad-assign-name');
        if (nameInp) nameInp.value = ap.name || '';
        const empIdInp = document.getElementById('rad-assign-emp-id');
        if (empIdInp) empIdInp.value = ap.employeeId || ap.employee_id || '';
        const posInp = document.getElementById('rad-assign-position');
        if (posInp) posInp.value = ap.position || '';
    }

    openModal('modal-radio-assign');
};

// -------------------------------------------------------------------------
// 3. TAB INVENTARIO DE RADIOS & FILTROS DE ESTADO INTERACTIVOS
// -------------------------------------------------------------------------
window.currentRadiosStatusFilter = 'all';

window.filterRadiosByDashboardStatus = function (statusKey) {
    window.currentRadiosStatusFilter = statusKey || 'all';
    switchRadioTab('tab-inventory');
    const sel = document.getElementById('rad-filter-status-select');
    if (sel) sel.value = window.currentRadiosStatusFilter;
    updateActiveFilterBadge(window.currentRadiosStatusFilter);
    loadRadiosList(window.currentRadiosStatusFilter);
};

function updateActiveFilterBadge(statusKey) {
    const badge = document.getElementById('rad-active-filter-badge');
    const label = document.getElementById('rad-active-filter-label');
    if (!badge || !label) return;
    if (statusKey && statusKey !== 'all') {
        const meta = STATUS_MAP[statusKey] || { label: statusKey };
        label.textContent = meta.label || statusKey;
        badge.style.display = 'inline-flex';
    } else {
        badge.style.display = 'none';
    }
}

async function loadRadiosList(statusFilterOverride = null) {
    try {
        const tbody = document.getElementById('rad-inventory-tbody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center p-4 text-secondary"><i class="fa-solid fa-spinner fa-spin me-2"></i> Cargando inventario de radios...</td></tr>';
        }

        const selStatus = document.getElementById('rad-filter-status-select');
        const activeStatus = statusFilterOverride !== null ? statusFilterOverride : (selStatus ? selStatus.value : (window.currentRadiosStatusFilter || 'all'));
        window.currentRadiosStatusFilter = activeStatus;
        updateActiveFilterBadge(activeStatus);

        const searchInp = document.getElementById('rad-inventory-search-input');
        const searchTerm = searchInp ? searchInp.value.trim() : '';

        const params = new URLSearchParams();
        if (currentPropertyId && currentPropertyId !== 'all') {
            params.append('hotel_id', currentPropertyId);
        }
        if (activeStatus && activeStatus !== 'all') {
            params.append('status', activeStatus);
        }
        if (searchTerm) {
            params.append('search', searchTerm);
        }

        const res = await fetch(`/api/radios?${params.toString()}`);
        if (!res.ok) return;
        currentRadiosList = await res.json();

        if (!tbody) return;

        if (currentRadiosList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center p-4 text-secondary">No se encontraron radios ${activeStatus !== 'all' ? `con estado "${STATUS_MAP[activeStatus]?.label || activeStatus}"` : ''} en esta selección.</td></tr>`;
            return;
        }

        tbody.innerHTML = currentRadiosList.map(r => {
            const actionsHtml = isRadioQueryUser
                ? `<button type="button" class="btn btn-sm btn-outline btn-hist-r" data-id="${r.id}" title="Historial"><i class="fa-solid fa-history"></i></button>`
                : `
                    <button type="button" class="btn btn-sm btn-outline btn-assign-r" data-id="${r.id}" title="Asignar"><i class="fa-solid fa-user-pen"></i></button>
                    <button type="button" class="btn btn-sm btn-outline btn-edit-r" data-id="${r.id}" title="Editar"><i class="fa-solid fa-pen"></i></button>
                    <button type="button" class="btn btn-sm btn-outline btn-hist-r" data-id="${r.id}" title="Historial"><i class="fa-solid fa-history"></i></button>
                `;

            return `
                <tr>
                    <td><strong>#${escapeHtml(r.radio_code || r.id)}</strong></td>
                    <td><code>${escapeHtml(r.serial_number)}</code></td>
                    <td>${escapeHtml(r.brand)} ${escapeHtml(r.model)}</td>
                    <td><span class="badge badge-outline">${escapeHtml(r.property_sigla || 'Hotel')}</span></td>
                    <td>${escapeHtml(r.department_name || '-')}</td>
                    <td>${r.assigned_person ? escapeHtml(r.assigned_person.name) : (r.assigned_person_name ? escapeHtml(r.assigned_person_name) : '<span class="text-secondary">Sin Asignar</span>')}</td>
                    <td>${renderStatusBadge(r.status)}</td>
                    <td style="text-align: right;">
                        ${actionsHtml}
                    </td>
                </tr>
            `;
        }).join('');

        tbody.querySelectorAll('.btn-assign-r').forEach(btn => {
            btn.onclick = function() {
                openAssignRadioModal(this.getAttribute('data-id'));
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

        // Configurar listeners de la barra de filtros de inventario (solo una vez)
        if (selStatus && !selStatus._hasChangeListener) {
            selStatus._hasChangeListener = true;
            selStatus.addEventListener('change', () => {
                loadRadiosList(selStatus.value);
            });
        }

        const btnClearFilter = document.getElementById('btn-clear-status-filter');
        if (btnClearFilter && !btnClearFilter._hasClickListener) {
            btnClearFilter._hasClickListener = true;
            btnClearFilter.addEventListener('click', () => {
                if (selStatus) selStatus.value = 'all';
                loadRadiosList('all');
            });
        }

        if (searchInp && !searchInp._hasInputListener) {
            searchInp._hasInputListener = true;
            let debounceTimeout = null;
            searchInp.addEventListener('input', () => {
                clearTimeout(debounceTimeout);
                debounceTimeout = setTimeout(() => {
                    loadRadiosList(selStatus ? selStatus.value : 'all');
                }, 300);
            });
        }

    } catch (e) {
        console.error('Error cargando inventario de radios:', e);
    }
}

// -------------------------------------------------------------------------
// 4. TAB INVENTARIO FORMAL PASO A PASO
// -------------------------------------------------------------------------
async function loadFormalInventories() {
    const propSelect = document.getElementById('rad-formal-property');
    if (propSelect) {
        if (!userProperties || userProperties.length === 0) {
            try {
                const res = await fetch('/api/radios/properties');
                if (res.ok) userProperties = await res.json();
            } catch (e) {
                console.error('Error cargando propiedades autorizadas:', e);
            }
        }
        if (userProperties && userProperties.length) {
            propSelect.innerHTML = userProperties.map(p => `<option value="${p.id}">${escapeHtml(p.name)} (${escapeHtml(p.sigla)})</option>`).join('');
            if (currentPropertyId !== 'all') propSelect.value = currentPropertyId;
        }
    }
    
    const btnTop = document.getElementById('btn-start-formal-inv');
    const btnMain = document.getElementById('btn-start-formal-inv-main');
    if (btnTop) btnTop.onclick = startFormalInventory;
    if (btnMain) btnMain.onclick = startFormalInventory;

    const btnFinish = document.getElementById('btn-finish-formal-inv');
    if (btnFinish) btnFinish.onclick = finishFormalInventory;

    const btnCancel = document.getElementById('btn-cancel-formal-inv');
    if (btnCancel) btnCancel.onclick = cancelFormalInventory;

    const searchInp = document.getElementById('rad-formal-search');
    if (searchInp) searchInp.oninput = renderFormalInventoryItems;

    if (activeFormalInventory) renderFormalInventoryItems();
}

async function startFormalInventory() {
    const propertyId = document.getElementById('rad-formal-property')?.value;
    if (!propertyId) return alert('Por favor, selecciona una propiedad autorizada.');

    const btnTop = document.getElementById('btn-start-formal-inv');
    const btnMain = document.getElementById('btn-start-formal-inv-main');
    const origTop = btnTop ? btnTop.innerHTML : '';
    const origMain = btnMain ? btnMain.innerHTML : '';

    try {
        if (btnTop) { btnTop.disabled = true; btnTop.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i> Iniciando...'; }
        if (btnMain) { btnMain.disabled = true; btnMain.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i> Iniciando...'; }

        const res = await fetch('/api/radios/inventories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hotel_id: parseInt(propertyId) })
        });
        const data = await res.json();
        if (!res.ok) {
            alert(data.error || 'No se pudo iniciar el inventario.');
            return;
        }
        openFormalInventory(data);
    } catch (err) {
        console.error('Error iniciando inventario:', err);
        alert('Error de conexión con el servidor al iniciar el inventario.');
    } finally {
        if (btnTop) { btnTop.disabled = false; btnTop.innerHTML = origTop; }
        if (btnMain) { btnMain.disabled = false; btnMain.innerHTML = origMain; }
    }
}

function openFormalInventory(inventory) {
    activeFormalInventory = inventory;
    document.getElementById('rad-formal-start').style.display = 'none';
    document.getElementById('rad-formal-workspace').style.display = 'block';
    document.getElementById('btn-start-formal-inv').style.display = 'none';
    document.getElementById('btn-finish-formal-inv').style.display = 'inline-block';
    const btnCancel = document.getElementById('btn-cancel-formal-inv');
    if (btnCancel) btnCancel.style.display = 'inline-block';
    document.getElementById('rad-formal-title').textContent = `${inventory.inventory_code} · ${inventory.property_name}`;
    renderFormalInventoryItems();
}

function renderFormalInventoryItems() {
    if (!activeFormalInventory) return;
    const term = (document.getElementById('rad-formal-search')?.value || '').toLowerCase().trim();
    const items = activeFormalInventory.items.filter(i => [
        i.radio_code, 
        i.serialNumber, 
        i.radio_brand,
        i.radio_model,
        i.full_location,
        i.department_name,
        i.subdepartment_name,
        i.assignedPerson?.name, 
        i.assignedPerson?.employeeId
    ].join(' ').toLowerCase().includes(term));

    const tbody = document.getElementById('rad-formal-inv-table-tbody');
    const confirmed = activeFormalInventory.items.filter(i => i.confirmed).length;
    document.getElementById('rad-formal-progress').textContent = `${confirmed} verificados · ${activeFormalInventory.items.length - confirmed} pendientes`;
    
    tbody.innerHTML = items.map(i => {
        const person = i.assignedPerson || {};
        const brandModel = `${escapeHtml(i.radio_brand || 'Motorola')} ${escapeHtml(i.radio_model || '')}`.trim();
        const locBadge = escapeHtml(i.full_location || 'Sin Asignar');

        return `<tr data-item-id="${i.id}" data-radio-id="${i.radioId}">
          <td style="text-align: center;"><input type="checkbox" class="chk-formal-item" ${i.confirmed ? 'checked' : ''} style="width: 18px; height: 18px; cursor: pointer;"></td>
          <td><strong style="color:#2563eb;">#${escapeHtml(i.radio_code)}</strong></td>
          <td><code style="font-size: 0.85rem; font-weight: 700;">${escapeHtml(i.serialNumber)}</code></td>
          <td><span style="font-size: 0.83rem; font-weight: 600; color: #334155;">${brandModel}</span></td>
          <td><span class="badge bg-light text-dark border" style="font-size: 0.78rem; font-weight: 600;" id="loc-badge-${i.id}"><i class="fa-solid fa-building me-1 text-primary"></i> ${locBadge}</span></td>
          <td>
            <input class="form-control form-control-sm inv-person mb-1" value="${escapeHtml(person.name || '')}" placeholder="Custodio" style="font-weight: 600;">
            <div style="display: flex; gap: 4px;">
                <input class="form-control form-control-sm inv-employee" value="${escapeHtml(person.employeeId || '')}" placeholder="Ficha" style="font-size: 0.78rem; width: 45%;">
                <input class="form-control form-control-sm inv-position" value="${escapeHtml(person.position || '')}" placeholder="Cargo" style="font-size: 0.78rem; width: 55%;">
            </div>
          </td>
          <td>${renderStatusBadge(i.previousStatus)}</td>
          <td><select class="form-control form-control-sm rad-inv-status-sel">${['operativo','requiere_revision','en_reparacion','danado','perdido','fuera_servicio','disponible','en_almacen'].map(s => `<option value="${s}" ${i.verifiedStatus === s ? 'selected' : ''}>${STATUS_MAP[s].label}</option>`).join('')}</select></td>
          <td style="text-align: center;">
            <button type="button" class="btn btn-sm btn-outline-primary btn-transfer-item" onclick="openTransferRadioModal('${i.id}', '${i.radioId}')" title="Transferir a otro departamento">
                <i class="fa-solid fa-right-left me-1"></i> Transferir
            </button>
          </td>
          <td><input class="form-control form-control-sm rad-inv-notes-inp" value="${escapeHtml(i.notes || '')}" placeholder="Condición, ubicación u observación"></td>
        </tr>`;
    }).join('') || '<tr><td colspan="10" class="text-center p-4 text-secondary">No hay coincidencias.</td></tr>';
}

window.openTransferRadioModal = async function(arg1, arg2) {
    let itemId = null;
    let radioId = null;
    let radioCode = '----';
    let serialNumber = '----';
    let fullLocation = 'Sin Asignar';
    let hotelId = null;
    let currentDeptId = null;
    let currentSubdeptId = null;

    let currentPersonText = 'Sin Asignar';
    let currentAp = null;

    if (activeFormalInventory && arg2) {
        itemId = arg1;
        radioId = arg2;
        const item = activeFormalInventory.items.find(i => String(i.id) === String(itemId));
        if (item) {
            radioCode = item.radio_code || item.radioCode || '----';
            serialNumber = item.serialNumber || item.serial_number || '----';
            fullLocation = item.full_location || 'Sin Asignar';
            hotelId = activeFormalInventory.hotel_id;
            currentDeptId = item.department_id;
            currentSubdeptId = item.subdepartment_id;
            currentAp = item.assigned_person || item.assignedPerson || { name: item.assigned_person_name };
        }
    } else {
        radioId = arg1 || (currentSearchedRadio ? currentSearchedRadio.id : null);
        if (!radioId) return;
        try {
            const res = await fetch(`/api/radios/${radioId}`);
            if (res.ok) {
                const r = await res.json();
                radioCode = r.radio_code || r.id;
                serialNumber = r.serial_number;
                const dN = r.department_name || '';
                const sN = r.subdepartment_name || '';
                fullLocation = (dN && sN) ? `${dN} > ${sN}` : (dN || sN || 'Sin Asignar');
                hotelId = r.hotel_id;
                currentDeptId = r.department_id;
                currentSubdeptId = r.subdepartment_id;
                currentAp = r.assigned_person || r.assignedPerson;
            }
        } catch(err) {
            console.error('Error al obtener detalles del radio:', err);
        }
    }

    if (currentAp && currentAp.name) {
        currentPersonText = `${currentAp.name}${currentAp.employeeId ? ' (Ficha: ' + currentAp.employeeId + ')' : ''}`;
    }

    document.getElementById('trans-item-id').value = itemId || '';
    document.getElementById('trans-radio-id').value = radioId || '';
    document.getElementById('trans-radio-title').textContent = `#${radioCode} · Serial: ${serialNumber}`;
    document.getElementById('trans-radio-current-loc').textContent = `Ubicación Actual: ${fullLocation}`;

    const curPersonEl = document.getElementById('trans-radio-current-person');
    if (curPersonEl) curPersonEl.textContent = `Custodio Actual: ${currentPersonText}`;

    const pNameInp = document.getElementById('trans-person-name');
    if (pNameInp) pNameInp.value = currentAp ? (currentAp.name || '') : '';
    const pEmpInp = document.getElementById('trans-person-emp-id');
    if (pEmpInp) pEmpInp.value = currentAp ? (currentAp.employeeId || currentAp.employee_id || '') : '';
    const pPosInp = document.getElementById('trans-person-position');
    if (pPosInp) pPosInp.value = currentAp ? (currentAp.position || '') : '';

    document.getElementById('trans-notes-input').value = '';
    document.getElementById('trans-status-msg').style.display = 'none';

    if (!hotelId && typeof currentPropertyId !== 'undefined' && currentPropertyId !== 'all') {
        hotelId = currentPropertyId;
    }

    const deptSel = document.getElementById('trans-dept-select');
    const subdeptSel = document.getElementById('trans-subdept-select');

    try {
        const url = hotelId ? `/api/radios/departments?hotel_id=${hotelId}` : `/api/radios/departments`;
        const res = await fetch(url);
        if (res.ok) {
            const depts = await res.json();
            const mainDepts = depts.filter(d => !d.parent_department_id);
            deptSel.innerHTML = '<option value="">-- Seleccionar Departamento --</option>' + 
                mainDepts.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');

            deptSel.onchange = function() {
                const selectedDeptId = this.value;
                const subDepts = depts.filter(d => d.parent_department_id == selectedDeptId);
                subdeptSel.innerHTML = '<option value="">Aplica al Departamento Principal Directamente</option>';
                if (subDepts.length > 0) {
                    subdeptSel.innerHTML += subDepts.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
                }
            };

            if (currentDeptId) {
                deptSel.value = currentDeptId;
                deptSel.dispatchEvent(new Event('change'));
                if (currentSubdeptId) subdeptSel.value = currentSubdeptId;
            } else {
                deptSel.dispatchEvent(new Event('change'));
            }
        }
    } catch(err) {
        console.error('Error al cargar departamentos para transferencia:', err);
    }

    openModal('modal-radio-transfer-inv');
};

function initTransferRadioModalListener() {
    const btnSubmit = document.getElementById('btn-submit-transfer-radio');
    if (!btnSubmit) return;

    btnSubmit.onclick = async function() {
        const radioId = document.getElementById('trans-radio-id').value;
        const itemId = document.getElementById('trans-item-id').value;
        const deptId = document.getElementById('trans-dept-select').value;
        const subdeptId = document.getElementById('trans-subdept-select').value;
        const notes = document.getElementById('trans-notes-input').value.trim();
        const statusMsg = document.getElementById('trans-status-msg');

        const origHtml = btnSubmit.innerHTML;
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i> Guardando...';

        try {
            const res = await fetch(`/api/radios/${radioId}/transfer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    department_id: deptId ? parseInt(deptId) : null,
                    subdepartment_id: subdeptId ? parseInt(subdeptId) : null,
                    notes: notes,
                    assigned_person_name: document.getElementById('trans-person-name')?.value.trim() || '',
                    assigned_employee_id: document.getElementById('trans-person-emp-id')?.value.trim() || '',
                    assigned_position: document.getElementById('trans-person-position')?.value.trim() || ''
                })
            });

            const data = await res.json();
            if (res.ok) {
                alert(data.message || 'Radio transferido con éxito.');
                closeModal('modal-radio-transfer-inv');

                if (activeFormalInventory && itemId) {
                    const item = activeFormalInventory.items.find(i => String(i.id) === String(itemId));
                    if (item) {
                        item.department_id = data.radio.department_id;
                        item.department_name = data.radio.department_name;
                        item.subdepartment_id = data.radio.subdepartment_id;
                        item.subdepartment_name = data.radio.subdepartment_name;
                        const dN = data.radio.department_name || '';
                        const sN = data.radio.subdepartment_name || '';
                        item.full_location = (dN && sN) ? `${dN} > ${sN}` : (dN || sN || 'Sin Asignar');
                    }
                    renderFormalInventoryItems();
                }

                if (currentSearchedRadio && String(currentSearchedRadio.id) === String(radioId)) {
                    currentSearchedRadio.department_name = data.radio.department_name;
                    currentSearchedRadio.subdepartment_name = data.radio.subdepartment_name;
                    const elDept = document.getElementById('rad-card-dept');
                    if (elDept) elDept.innerText = data.radio.department_name || 'General';
                    const elArea = document.getElementById('rad-card-area');
                    if (elArea) elArea.innerText = data.radio.subdepartment_name || '-';
                }
                loadRadiosList();
            } else {
                statusMsg.style.display = 'block';
                statusMsg.textContent = data.error || 'No se pudo realizar la transferencia.';
            }
        } catch(err) {
            console.error('Error al transferir radio:', err);
            statusMsg.style.display = 'block';
            statusMsg.textContent = 'Error de conexión con el servidor.';
        } finally {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = origHtml;
        }
    };
}

async function finishFormalInventory() {
    if (!activeFormalInventory) return;
    const rows = [...document.querySelectorAll('#rad-formal-inv-table-tbody tr[data-item-id]')];
    rows.forEach(row => {
        const item = activeFormalInventory.items.find(i => String(i.id) === row.dataset.itemId);
        item.confirmed = row.querySelector('.chk-formal-item').checked;
        item.verifiedStatus = row.querySelector('.rad-inv-status-sel').value;
        item.notes = row.querySelector('.rad-inv-notes-inp').value;
        item.assignedPerson = { 
            name: row.querySelector('.inv-person').value, 
            employeeId: row.querySelector('.inv-employee').value, 
            position: row.querySelector('.inv-position')?.value || '' 
        };
    });
    const pending = activeFormalInventory.items.filter(i => !i.confirmed).length;
    if (!confirm(`Finalizar inventario: ${pending} radio(s) quedarán pendientes por inventariar. Podrás continuarlo después.`)) return;
    const res = await fetch(`/api/radios/inventories/${activeFormalInventory.id}`, {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({status:'completado', items:activeFormalInventory.items})});
    const data = await res.json();
    if (!res.ok) return alert(data.error || 'No se pudo finalizar el inventario.');
    activeFormalInventory = null;
    alert(`Inventario finalizado con éxito.`);
    document.getElementById('rad-formal-start').style.display = 'block';
    document.getElementById('rad-formal-workspace').style.display = 'none';
    document.getElementById('btn-start-formal-inv').style.display = 'inline-block';
    document.getElementById('btn-finish-formal-inv').style.display = 'none';
    const btnCancel = document.getElementById('btn-cancel-formal-inv');
    if (btnCancel) btnCancel.style.display = 'none';
    loadDashboard();
}

async function cancelFormalInventory() {
    if (!activeFormalInventory) return;
    if (!confirm('¿Estás seguro de cancelar este inventario en curso? Se eliminará este borrador y los avances no guardados se descartarán.')) return;
    try {
        const res = await fetch(`/api/radios/inventories/${activeFormalInventory.id}`, { method: 'DELETE' });
        if (!res.ok) {
            const data = await res.json();
            return alert(data.error || 'No se pudo cancelar el inventario.');
        }
        activeFormalInventory = null;
        alert('Inventario cancelado correctamente.');
        document.getElementById('rad-formal-start').style.display = 'block';
        document.getElementById('rad-formal-workspace').style.display = 'none';
        document.getElementById('btn-start-formal-inv').style.display = 'inline-block';
        document.getElementById('btn-finish-formal-inv').style.display = 'none';
        const btnCancel = document.getElementById('btn-cancel-formal-inv');
        if (btnCancel) btnCancel.style.display = 'none';
        loadDashboard();
    } catch(err) {
        console.error('Error cancelando inventario:', err);
        alert('Error de conexión al cancelar el inventario.');
    }
}

// -------------------------------------------------------------------------
// 5. TAB MI INVENTARIO
// -------------------------------------------------------------------------
async function loadMyInventory() {
    try {
        const suffix = currentPropertyId !== 'all' ? `?hotel_id=${currentPropertyId}` : '';
        const res = await fetch(`/api/radios/inventories${suffix}`);
        if (!res.ok) return;
        const inventories = await res.json();
        const tbody = document.getElementById('rad-my-inv-tbody');
        if (!tbody) return;

        if (inventories.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center p-4 text-secondary">Aún no hay inventarios realizados.</td></tr>';
            return;
        }
        const now = Date.now();
        tbody.innerHTML = inventories.map(inv => {
            const old = inv.createdAt && (now - new Date(inv.createdAt).getTime()) >= 240 * 86400000;
            return `
            <tr>
                <td><strong>${escapeHtml(inv.inventory_code)}</strong></td><td>${escapeHtml(inv.property_name)}</td>
                <td>${escapeHtml(inv.createdAt)}</td><td>${inv.confirmedCount || 0} / ${inv.totalExpected}</td>
                <td>${escapeHtml(inv.status || '')}</td>
                <td><button class="btn btn-sm btn-outline btn-open-formal" data-id="${inv.id}">Ver / completar</button>
                ${old ? `<button class="btn btn-sm btn-danger-soft btn-delete-formal" data-id="${inv.id}">Eliminar</button>` : ''}</td>
            </tr>`;
        }).join('');
        tbody.querySelectorAll('.btn-open-formal').forEach(btn => btn.onclick = async () => {
            const detail = await fetch(`/api/radios/inventories/${btn.dataset.id}`).then(r => r.json());
            openFormalInventory(detail); window.switchRadioTab('tab-formal-inv');
        });
        tbody.querySelectorAll('.btn-delete-formal').forEach(btn => btn.onclick = async () => {
            if (!confirm('¿Eliminar este inventario histórico? Esta acción no se puede deshacer.')) return;
            const res = await fetch(`/api/radios/inventories/${btn.dataset.id}`, {method:'DELETE'});
            const data = await res.json();
            if (!res.ok) return alert(data.error || 'No se pudo eliminar.');
            loadMyInventory();
        });
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
    const isEditing = Boolean(document.getElementById('rad-form-id')?.value);
    if (isEditing) return; // Si estamos editando un radio existente, no cambiar su ID asignado

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
async function loadDepartmentsForForms(hotelIdOverride = null) {
    try {
        const formProp = document.getElementById('rad-form-property');
        let propIdToUse = hotelIdOverride;
        if (!propIdToUse) {
            propIdToUse = formProp?.value || (currentPropertyId !== 'all' ? currentPropertyId : '');
        }

        const url = propIdToUse ? `/api/radios/departments?hotel_id=${encodeURIComponent(propIdToUse)}` : '/api/radios/departments';
        const res = await fetch(url);
        if (!res.ok) return;
        allPropertyDepartments = await res.json();

        const tbody = document.getElementById('rad-depts-tbody');
        const formDept = document.getElementById('rad-form-dept');
        const formArea = document.getElementById('rad-form-area');

        // 1. Renderizar tabla de Configuración de Departamentos si existe el tbody
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
            const currentSelectedProp = propIdToUse || (formProp ? formProp.value : (currentPropertyId !== 'all' ? currentPropertyId : (userProperties[0]?.id || '')));
            const propMainDepts = allPropertyDepartments.filter(d => !d.parent_department_id && (!currentSelectedProp || String(d.hotel_id) === String(currentSelectedProp)));

            const prevDeptVal = formDept.value;
            formDept.innerHTML = '<option value="">-- Seleccione Departamento Principal --</option>' + 
                propMainDepts.map(d => `<option value="${d.id}">${escapeHtml(d.name)}</option>`).join('');

            if (prevDeptVal && propMainDepts.some(d => String(d.id) === String(prevDeptVal))) {
                formDept.value = prevDeptVal;
            }

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

            if (formProp && !formProp._hasChangeListener) {
                formProp._hasChangeListener = true;
                formProp.onchange = function() {
                    const newPropId = this.value;
                    loadDepartmentsForForms(newPropId);
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

                // Permisos de módulo TEC-RADIOS Configuración y TEC-INVENTORY
                const uPerms = Array.isArray(u.permissions) ? u.permissions : [];
                const canAccessConfig = (u.role === 'Admin') || uPerms.includes('all') || uPerms.includes('tec-radios:config');
                window.canAccessRadioConfig = canAccessConfig;

                const deptsNavBtn = document.getElementById('rad-nav-depts');
                if (deptsNavBtn) {
                    deptsNavBtn.style.display = canAccessConfig ? 'flex' : 'none';
                }

                // Aplicar visibilidad de pestañas del header global (TEC-INVENTORY vs TEC-RADIOS)
                if (typeof window.applyRolePermissions === 'function') {
                    try { window.applyRolePermissions(); } catch(e){}
                } else {
                    const INVENTORY_MODULES = ['dashboard', 'inventario', 'decomiso', 'reparaciones', 'prestamos', 'herramientas', 'despacho', 'pendientes', 'configuracion', 'pedidos'];
                    const hasInventoryAccess = (u.role === 'Admin') || uPerms.includes('all') || INVENTORY_MODULES.some(m => uPerms.includes(m));
                    const invTab = document.getElementById('app-tab-inventory');
                    if (invTab) {
                        invTab.style.display = hasInventoryAccess ? 'inline-flex' : 'none';
                    }
                }
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

    // Listener para previsualización y conversión de foto de radio
    const imgInput = document.getElementById('rad-form-image-input');
    if (imgInput) {
        imgInput.onchange = function(e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(evt) {
                    const dataUrl = evt.target.result;
                    const urlInp = document.getElementById('rad-form-image-url');
                    if (urlInp) urlInp.value = dataUrl;
                    const previewImg = document.getElementById('rad-form-img-preview');
                    if (previewImg) previewImg.src = dataUrl;
                };
                reader.readAsDataURL(file);
            }
        };
    }

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
            notes: document.getElementById('rad-form-notes').value.trim(),
            image_url: document.getElementById('rad-form-image-url')?.value || '',
            assigned_person_name: document.getElementById('rad-form-assigned-name')?.value.trim() || '',
            assigned_employee_id: document.getElementById('rad-form-assigned-emp-id')?.value.trim() || '',
            assigned_position: document.getElementById('rad-form-assigned-position')?.value.trim() || ''
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

    // Submit Formulario de Incidencias
    document.getElementById('form-radio-incident')?.addEventListener('submit', async function (e) {
        e.preventDefault();
        const btnSubmit = document.getElementById('btn-submit-incident');
        const statusMsg = document.getElementById('inc-status-msg');
        const originalText = btnSubmit ? btnSubmit.innerHTML : '';

        const radioId = document.getElementById('inc-radio-id')?.value;
        const issueType = document.getElementById('inc-issue-type')?.value;
        const description = document.getElementById('inc-description')?.value.trim();
        const priorityEl = document.querySelector('input[name="inc_priority"]:checked');
        const priority = priorityEl ? priorityEl.value : 'Media';

        if (!radioId) {
            if (statusMsg) {
                statusMsg.style.display = 'block';
                statusMsg.className = 'alert alert-danger';
                statusMsg.textContent = 'Por favor busca un radio por su ID o Serial y haz clic en OK antes de enviar.';
            }
            return;
        }

        if (!issueType || !description) {
            if (statusMsg) {
                statusMsg.style.display = 'block';
                statusMsg.className = 'alert alert-danger';
                statusMsg.textContent = 'Por favor completa el tipo de problema y la descripción detallada.';
            }
            return;
        }

        try {
            if (btnSubmit) { btnSubmit.disabled = true; btnSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i> Enviando...'; }

            const res = await fetch('/api/radios/incidents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    radio_id: parseInt(radioId),
                    issue_type: issueType,
                    description: description,
                    priority: priority
                })
            });

            const result = await res.json();
            if (res.ok) {
                closeModal('modal-radio-incident');
                // Alerta Toast visual en vivo
                const rCode = currentSelectedIncidentRadio ? (currentSelectedIncidentRadio.radio_code || currentSelectedIncidentRadio.id) : radioId;
                const rSerial = currentSelectedIncidentRadio ? currentSelectedIncidentRadio.serial_number : '';
                showLiveRadioAlertToast(
                    `¡Incidencia Reportada! Radio #${rCode}`,
                    `Se notificó al Administrador: "${issueType}" [Prioridad ${priority}]. ${description.substring(0, 70)}...`,
                    result.incident_id || result.id || null,
                    priority
                );

                loadDashboard();
                if (typeof loadIncidentsTab === 'function') loadIncidentsTab();
                loadRadioNotifications();
            } else {
                if (statusMsg) {
                    statusMsg.style.display = 'block';
                    statusMsg.className = 'alert alert-danger';
                    statusMsg.textContent = result.error || 'Error al registrar incidencia.';
                }
            }
        } catch (err) {
            console.error('Error enviando reporte de incidencia:', err);
            if (statusMsg) {
                statusMsg.style.display = 'block';
                statusMsg.className = 'alert alert-danger';
                statusMsg.textContent = 'Error de red o conexión al servidor.';
            }
        } finally {
            if (btnSubmit) { btnSubmit.disabled = false; btnSubmit.innerHTML = originalText; }
        }
    });

    // Botón abrir modal de incidencia desde tab
    document.getElementById('btn-open-modal-incident')?.addEventListener('click', () => {
        openRadioIncidentModal();
    });

    // Campana de notificaciones del Header
    document.getElementById('btn-notifications-icon')?.addEventListener('click', (e) => {
        e.preventDefault();
        openModal('modal-radio-notifications');
        loadRadioNotifications();
    });

    // Botón Marcar todas como leídas
    document.getElementById('btn-rad-notif-mark-all-read')?.addEventListener('click', async () => {
        try {
            await fetch('/api/radios/notifications/read-all', { method: 'POST' });
            loadRadioNotifications();
        } catch (e) {
            console.error('Error marcando notificaciones como leídas:', e);
        }
    });

    // Inicializar listener del modal de transferencia en inventario
    if (typeof initTransferRadioModalListener === 'function') {
        initTransferRadioModalListener();
    }

    // Cargas iniciales
    loadDashboard();
    loadRadioNotifications();
}

// Auto-ejecución inmediata
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initRadiosModule();
        loadDashboard();
        loadRadioNotifications();
    });
} else {
    initRadiosModule();
    loadDashboard();
    loadRadioNotifications();
}
