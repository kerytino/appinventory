/**
 * Módulo de Préstamos y Productos Demo (Evaluación de Proveedores)
 * Control, Resguardo, Despacho, Devolución y Conversión a Inventario
 */

document.addEventListener('DOMContentLoaded', () => {
    let allLoans = [];
    let allWarehouses = [];
    let allHotels = [];
    let allTechnicians = [];
    let allProviders = [];
    let allCatalog = [];
    let currentStatusFilter = 'all';
    let currentProviderFilter = 'all';
    let currentWarehouseFilter = 'all';
    let currentSearchTerm = '';

    // --- Helpers de Formato ---
    function formatCurrency(val) {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);
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

    function getLoanStatusBadge(status) {
        switch (status) {
            case 'En Evaluación / Stock':
                return `<span class="status-badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3);"><i class="fa-solid fa-warehouse"></i> En Almacén</span>`;
            case 'En Pruebas / Instalado':
                return `<span class="status-badge" style="background: rgba(2, 132, 199, 0.15); color: #0284c7; border: 1px solid rgba(2, 132, 199, 0.3);"><i class="fa-solid fa-flask-vial"></i> En Pruebas</span>`;
            case 'Devuelto al Proveedor':
                return `<span class="status-badge" style="background: rgba(100, 116, 139, 0.15); color: #64748b; border: 1px solid rgba(100, 116, 139, 0.3);"><i class="fa-solid fa-handshake-slash"></i> Devuelto</span>`;
            case 'Comprado / Adquirido':
                return `<span class="status-badge" style="background: rgba(139, 92, 246, 0.15); color: #8b5cf6; border: 1px solid rgba(139, 92, 246, 0.3);"><i class="fa-solid fa-cart-shopping"></i> Comprado</span>`;
            case 'Averiado':
                return `<span class="status-badge" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3);"><i class="fa-solid fa-triangle-exclamation"></i> Averiado</span>`;
            default:
                return `<span class="status-badge badge-secondary">${escapeHtml(status)}</span>`;
        }
    }

    // --- Carga Inicial de Datos Auxiliares ---
    async function loadAuxiliaryData() {
        try {
            const [whRes, hotRes, techRes, provRes, catRes] = await Promise.all([
                fetch('/api/settings/warehouses'),
                fetch('/api/settings/hotels'),
                fetch('/api/settings/technicians'),
                fetch('/api/settings/providers'),
                fetch('/api/settings/catalog')
            ]);

            allWarehouses = whRes.ok ? await whRes.json() : [];
            allHotels = hotRes.ok ? await hotRes.json() : [];
            allTechnicians = techRes.ok ? await techRes.json() : [];
            allProviders = provRes.ok ? await provRes.json() : [];
            allCatalog = catRes.ok ? await catRes.json() : [];

            populateFilterDropdowns();
            populateFormDropdowns();
        } catch (e) {
            console.error('Error cargando datos auxiliares para préstamos:', e);
        }
    }

    function populateFilterDropdowns() {
        const provFilter = document.getElementById('loan-provider-filter');
        if (provFilter) {
            provFilter.innerHTML = '<option value="all">Todos los Proveedores</option>';
            allProviders.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.name;
                opt.innerText = p.name;
                provFilter.appendChild(opt);
            });
        }

        const whFilter = document.getElementById('loan-warehouse-filter');
        if (whFilter) {
            whFilter.innerHTML = '<option value="all">Todos los Almacenes</option>';
            allWarehouses.forEach(w => {
                const opt = document.createElement('option');
                opt.value = w.name;
                opt.innerText = w.name;
                whFilter.appendChild(opt);
            });
        }
    }

    function populateFormDropdowns() {
        // Tipos de Equipo
        const typeSelect = document.getElementById('loan-type');
        if (typeSelect) {
            typeSelect.innerHTML = '<option value="" disabled selected>Seleccione Tipo...</option>';
            const types = Array.from(new Set(allCatalog.map(c => c.type).filter(Boolean)));
            if (types.length === 0) {
                ['ACCESS POINT', 'SWITCH', 'FIREWALL', 'TRANSCEIVER', 'ROUTER', 'SERVIDOR', 'CABLEADO', 'OTRO'].forEach(t => types.push(t));
            }
            types.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t;
                opt.innerText = t;
                typeSelect.appendChild(opt);
            });
        }

        // Proveedores (Datalist para permitir seleccionar o escribir uno nuevo)
        const provDataList = document.getElementById('loan-provider-list');
        if (provDataList) {
            provDataList.innerHTML = '';
            allProviders.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.name;
                provDataList.appendChild(opt);
            });
        }

        // Almacenes
        const whSelect = document.getElementById('loan-warehouse');
        const retWhSelect = document.getElementById('return-loan-warehouse');
        const convWhSelect = document.getElementById('convert-loan-warehouse');
        
        [whSelect, retWhSelect, convWhSelect].forEach(sel => {
            if (sel) {
                sel.innerHTML = '<option value="" disabled selected>Seleccione Almacén...</option>';
                allWarehouses.forEach(w => {
                    const opt = document.createElement('option');
                    opt.value = w.name;
                    opt.innerText = w.name;
                    sel.appendChild(opt);
                });
            }
        });

        // Hoteles / Locaciones
        const dispLocSelect = document.getElementById('dispatch-loan-location');
        const convLocSelect = document.getElementById('convert-loan-location');
        [dispLocSelect, convLocSelect].forEach(sel => {
            if (sel) {
                sel.innerHTML = '<option value="" disabled selected>Seleccione Hotel / Destino...</option>';
                allHotels.forEach(h => {
                    const opt = document.createElement('option');
                    opt.value = h.name;
                    opt.innerText = h.name + (h.sigla ? ` (${h.sigla})` : '');
                    sel.appendChild(opt);
                });
            }
        });

        // Técnicos
        const techSelect = document.getElementById('dispatch-loan-technician');
        if (techSelect) {
            techSelect.innerHTML = '<option value="" disabled selected>Seleccione Técnico...</option>';
            allTechnicians.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.name;
                opt.innerText = t.name;
                techSelect.appendChild(opt);
            });
        }
    }

    // --- Carga y Render de Préstamos ---
    async function fetchLoans() {
        try {
            const res = await fetch('/api/loans');
            if (res.ok) {
                allLoans = await res.json();
                renderLoansKPIs();
                renderLoansTable();
            } else {
                if (window.showToast) window.showToast('Error cargando lista de préstamos', 'error');
            }
        } catch (err) {
            console.error('Error fetching loans:', err);
            if (window.showToast) window.showToast('Error de conexión', 'error');
        }
    }

    function renderLoansKPIs() {
        const total = allLoans.length;
        const stockCount = allLoans.filter(l => l.status === 'En Evaluación / Stock').reduce((sum, l) => sum + (l.quantity || 1), 0);
        const testingCount = allLoans.filter(l => l.status === 'En Pruebas / Instalado').reduce((sum, l) => sum + (l.quantity || 1), 0);
        const urgentLoans = allLoans.filter(l => (l.is_overdue || l.is_near_expiry) && (l.status === 'En Evaluación / Stock' || l.status === 'En Pruebas / Instalado'));
        const urgentCount = urgentLoans.length;
        
        const totalValue = allLoans
            .filter(l => l.status === 'En Evaluación / Stock' || l.status === 'En Pruebas / Instalado')
            .reduce((sum, l) => sum + ((l.value || 0) * (l.quantity || 1)), 0);

        document.getElementById('stat-loans-total').innerText = total;
        document.getElementById('stat-loans-stock').innerText = stockCount;
        document.getElementById('stat-loans-testing').innerText = testingCount;
        document.getElementById('stat-loans-urgent').innerText = urgentCount;
        document.getElementById('stat-loans-value').innerText = formatCurrency(totalValue);

        const urgentCard = document.getElementById('card-loans-urgent');
        if (urgentCard) {
            if (urgentCount > 0) {
                urgentCard.style.boxShadow = '0 0 15px rgba(239, 68, 68, 0.25)';
                urgentCard.style.borderColor = 'rgba(239, 68, 68, 0.5)';
            } else {
                urgentCard.style.boxShadow = 'none';
                urgentCard.style.borderColor = 'var(--color-border)';
            }
        }
    }

    function renderLoansTable() {
        const tbody = document.getElementById('loans-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        const st = currentSearchTerm.toLowerCase().trim();

        const filtered = allLoans.filter(l => {
            // Status Filter
            if (currentStatusFilter !== 'all' && l.status !== currentStatusFilter) return false;

            // Provider Filter
            if (currentProviderFilter !== 'all' && (l.provider || '').toLowerCase() !== currentProviderFilter.toLowerCase()) return false;

            // Warehouse Filter
            if (currentWarehouseFilter !== 'all' && (l.warehouse || '').toLowerCase() !== currentWarehouseFilter.toLowerCase()) return false;

            // Search Term
            if (st) {
                const matchName = (l.name || '').toLowerCase().includes(st);
                const matchBrand = (l.brand || '').toLowerCase().includes(st);
                const matchModel = (l.model || '').toLowerCase().includes(st);
                const matchSerial = (l.serial_number || '').toLowerCase().includes(st);
                const matchMac = (l.mac_address || '').toLowerCase().includes(st);
                const matchProv = (l.provider || '').toLowerCase().includes(st);
                const matchLoc = (l.location || '').toLowerCase().includes(st);
                const matchWh = (l.warehouse || '').toLowerCase().includes(st);
                const matchType = (l.type || '').toLowerCase().includes(st);
                return (matchName || matchBrand || matchModel || matchSerial || matchMac || matchProv || matchLoc || matchWh || matchType);
            }

            return true;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="11" style="text-align: center; color: var(--color-text-secondary); padding: 36px 20px;">
                        <i class="fa-solid fa-box-open" style="font-size: 2.5rem; color: var(--color-border); margin-bottom: 10px; display: block;"></i>
                        No se encontraron equipos en préstamo o demos registrados con los filtros seleccionados.
                    </td>
                </tr>
            `;
            return;
        }

        filtered.forEach(l => {
            const tr = document.createElement('tr');

            // Location or Warehouse display
            let locOrWh = '-';
            if (l.status === 'En Pruebas / Instalado' && l.location) {
                locOrWh = `<div><strong style="color:#0284c7;"><i class="fa-solid fa-location-dot"></i> ${escapeHtml(l.location)}</strong></div>`;
                if (l.dispatched_by) {
                    locOrWh += `<small style="color:var(--color-text-secondary)">Resp: ${escapeHtml(l.dispatched_by)}</small>`;
                }
            } else if (l.warehouse) {
                locOrWh = `<span class="badge badge-info"><i class="fa-solid fa-warehouse"></i> ${escapeHtml(l.warehouse)}</span>`;
            }

            // Expiry / Return Date Badge
            let expiryBadge = '-';
            if (l.status === 'Devuelto al Proveedor') {
                expiryBadge = `<span style="font-size: 11px; color: var(--color-text-secondary);"><i class="fa-solid fa-calendar-check"></i> Retornado (${escapeHtml(l.returned_date || l.expected_return_date)})</span>`;
            } else if (l.status === 'Comprado / Adquirido') {
                expiryBadge = `<span style="font-size: 11px; color: #8b5cf6; font-weight: 600;"><i class="fa-solid fa-cart-check"></i> Adquirido Propio</span>`;
            } else if (l.expected_return_date) {
                if (l.is_overdue) {
                    expiryBadge = `<span class="badge badge-danger" style="background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.4);" title="¡Demo Vencido! Debió devolverse el ${l.expected_return_date}"><i class="fa-solid fa-triangle-exclamation"></i> ¡Vencido! (${escapeHtml(l.expected_return_date)})</span>`;
                } else if (l.is_near_expiry) {
                    expiryBadge = `<span class="badge badge-warning" style="background: rgba(245,158,11,0.15); color: #f59e0b; border: 1px solid rgba(245,158,11,0.4);" title="Vence en ${l.days_remaining} días"><i class="fa-solid fa-clock"></i> Vence en ${l.days_remaining}d (${escapeHtml(l.expected_return_date)})</span>`;
                } else {
                    expiryBadge = `<span style="font-size: 12px; color: var(--color-text);"><i class="fa-regular fa-calendar"></i> ${escapeHtml(l.expected_return_date)}</span>`;
                }
            }

            // Provider Badge
            const provBadge = l.provider 
                ? `<span class="badge" style="background: rgba(99, 102, 241, 0.12); color: #6366f1; border: 1px solid rgba(99, 102, 241, 0.3); font-weight: 600;"><i class="fa-solid fa-building-shield"></i> ${escapeHtml(l.provider)}</span>`
                : '-';

            // Action Buttons based on status
            let actionButtons = `
                <button class="action-btn edit" title="Editar Información" onclick="window.editLoan(${l.id})"><i class="fa-solid fa-pen"></i></button>
            `;

            if (l.status === 'En Evaluación / Stock') {
                actionButtons += `
                    <button class="action-btn" style="color: #0284c7;" title="Despachar a Pruebas / Hotel" onclick="window.openDispatchLoan(${l.id})"><i class="fa-solid fa-truck-ramp-box"></i></button>
                    <button class="action-btn" style="color: #64748b;" title="Devolver al Proveedor" onclick="window.openProviderReturnLoan(${l.id})"><i class="fa-solid fa-handshake-slash"></i></button>
                    <button class="action-btn" style="color: #10b981;" title="Comprar / Transferir a Inventario" onclick="window.openConvertLoan(${l.id})"><i class="fa-solid fa-cart-shopping"></i></button>
                `;
            } else if (l.status === 'En Pruebas / Instalado') {
                actionButtons += `
                    <button class="action-btn" style="color: #10b981;" title="Retornar a Almacén de Resguardo" onclick="window.openReturnWarehouseLoan(${l.id})"><i class="fa-solid fa-boxes-stacked"></i></button>
                    <button class="action-btn" style="color: #64748b;" title="Devolver al Proveedor" onclick="window.openProviderReturnLoan(${l.id})"><i class="fa-solid fa-handshake-slash"></i></button>
                    <button class="action-btn" style="color: #8b5cf6;" title="Comprar / Transferir a Inventario" onclick="window.openConvertLoan(${l.id})"><i class="fa-solid fa-cart-shopping"></i></button>
                `;
            }

            actionButtons += `
                <button class="action-btn delete" title="Eliminar Registro" onclick="window.deleteLoan(${l.id})"><i class="fa-solid fa-trash"></i></button>
            `;

            tr.innerHTML = `
                <td>#${l.id}</td>
                <td>
                    <strong style="color: var(--color-text);">${escapeHtml(l.name)}</strong>
                    ${l.notes ? `<div style="font-size: 11px; color: var(--color-text-secondary); margin-top: 2px; max-width: 260px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(l.notes)}"><i class="fa-regular fa-note-sticky"></i> ${escapeHtml(l.notes)}</div>` : ''}
                </td>
                <td style="text-align: center; font-weight: 700;">${l.quantity || 1}</td>
                <td><strong>${escapeHtml(l.type)}</strong><br><small style="color:var(--color-text-secondary)">${escapeHtml(l.brand || '-')} / ${escapeHtml(l.model || '-')}</small></td>
                <td><small>MAC: ${escapeHtml(l.mac_address || '-')}<br>S/N: ${escapeHtml(l.serial_number || '-')}</small></td>
                <td>${provBadge}</td>
                <td>${locOrWh}</td>
                <td>${getLoanStatusBadge(l.status)}</td>
                <td>${expiryBadge}</td>
                <td style="font-weight: 600;">${formatCurrency(l.value)}</td>
                <td style="text-align: center; white-space: nowrap;">${actionButtons}</td>
            `;

            tbody.appendChild(tr);
        });
    }

    // --- Filtros y Eventos de Búsqueda ---
    document.querySelectorAll('#loan-status-tabs .btn-filter-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#loan-status-tabs .btn-filter-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentStatusFilter = btn.getAttribute('data-status');
            renderLoansTable();
        });
    });

    document.getElementById('loan-provider-filter')?.addEventListener('change', (e) => {
        currentProviderFilter = e.target.value;
        renderLoansTable();
    });

    document.getElementById('loan-warehouse-filter')?.addEventListener('change', (e) => {
        currentWarehouseFilter = e.target.value;
        renderLoansTable();
    });

    document.getElementById('loan-search-input')?.addEventListener('input', (e) => {
        currentSearchTerm = e.target.value;
        renderLoansTable();
    });

    // --- Modales y Formularios ---

    // 1. Modal Nuevo / Editar Préstamo
    const loanModal = document.getElementById('loan-modal');
    const loanForm = document.getElementById('loan-form');

    document.getElementById('btn-new-loan')?.addEventListener('click', () => {
        openLoanModal('add');
    });

    function openLoanModal(mode, loan = null) {
        if (!loanModal || !loanForm) return;
        loanForm.reset();

        const today = new Date().toISOString().split('T')[0];
        document.getElementById('loan-received-date').value = today;

        if (mode === 'add') {
            document.getElementById('loan-modal-title').innerText = 'Registrar Préstamo / Producto Demo';
            document.getElementById('loan-id').value = '';
            document.getElementById('loan-quantity').value = 1;
            document.getElementById('loan-value').value = '0.00';
            if (allWarehouses.length > 0) {
                document.getElementById('loan-warehouse').value = allWarehouses[0].name;
            }
        } else if (mode === 'edit' && loan) {
            document.getElementById('loan-modal-title').innerText = `Editar Demo #${loan.id}`;
            document.getElementById('loan-id').value = loan.id;
            document.getElementById('loan-name').value = loan.name;
            document.getElementById('loan-type').value = loan.type;
            document.getElementById('loan-provider').value = loan.provider;
            document.getElementById('loan-brand').value = loan.brand;
            document.getElementById('loan-model').value = loan.model;
            document.getElementById('loan-serial').value = loan.serial_number;
            document.getElementById('loan-mac').value = loan.mac_address;
            document.getElementById('loan-quantity').value = loan.quantity || 1;
            document.getElementById('loan-value').value = loan.value || 0;
            document.getElementById('loan-received-date').value = loan.received_date || today;
            document.getElementById('loan-expected-return-date').value = loan.expected_return_date || '';
            document.getElementById('loan-warehouse').value = loan.warehouse || '';
            document.getElementById('loan-notes').value = loan.notes || '';
        }

        loanModal.classList.add('active');
    }

    document.getElementById('btn-close-loan-modal')?.addEventListener('click', () => loanModal.classList.remove('active'));
    document.getElementById('btn-cancel-loan')?.addEventListener('click', () => loanModal.classList.remove('active'));

    loanForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('loan-id').value;
        const payload = {
            name: document.getElementById('loan-name').value.trim(),
            type: document.getElementById('loan-type').value,
            provider: document.getElementById('loan-provider').value,
            brand: document.getElementById('loan-brand').value.trim(),
            model: document.getElementById('loan-model').value.trim(),
            serial_number: document.getElementById('loan-serial').value.trim(),
            mac_address: document.getElementById('loan-mac').value.trim(),
            quantity: parseInt(document.getElementById('loan-quantity').value, 10) || 1,
            value: parseFloat(document.getElementById('loan-value').value) || 0.0,
            received_date: document.getElementById('loan-received-date').value,
            expected_return_date: document.getElementById('loan-expected-return-date').value,
            warehouse: document.getElementById('loan-warehouse').value,
            notes: document.getElementById('loan-notes').value.trim()
        };

        const url = id ? `/api/loans/${id}` : '/api/loans';
        const method = id ? 'PUT' : 'POST';

        try {
            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                if (window.showToast) window.showToast(id ? 'Préstamo actualizado' : 'Préstamo registrado exitosamente', 'success');
                loanModal.classList.remove('active');
                await loadAuxiliaryData();
                await fetchLoans();
            } else {
                const err = await res.json();
                if (window.showToast) window.showToast(err.error || 'Error al guardar', 'error');
            }
        } catch (err) {
            if (window.showToast) window.showToast('Error de conexión', 'error');
        }
    });

    document.getElementById('btn-quick-add-provider')?.addEventListener('click', () => {
        const inp = document.getElementById('loan-provider');
        const provName = inp ? inp.value.trim() : '';
        if (typeof window.openProviderModal === 'function') {
            window.openProviderModal('add', null, provName, (savedProv) => {
                if (savedProv && savedProv.name) {
                    if (inp) inp.value = savedProv.name;
                    loadAuxiliaryData();
                }
            });
        }
    });

    // 2. Modal Despacho a Pruebas
    const dispatchModal = document.getElementById('loan-dispatch-modal');
    const dispatchForm = document.getElementById('loan-dispatch-form');

    window.openDispatchLoan = function(id) {
        const loan = allLoans.find(l => l.id === id);
        if (!loan || !dispatchModal) return;

        document.getElementById('dispatch-loan-id').value = loan.id;
        document.getElementById('dispatch-loan-name-display').innerText = loan.name;
        document.getElementById('dispatch-loan-detail-display').innerText = `${loan.type} • ${loan.brand || '-'} / ${loan.model || '-'} (S/N: ${loan.serial_number || 'n/a'}) • Proveedor: ${loan.provider}`;
        document.getElementById('dispatch-loan-location').value = '';
        document.getElementById('dispatch-loan-technician').value = '';
        document.getElementById('dispatch-loan-notes').value = '';

        dispatchModal.classList.add('active');
    };

    document.getElementById('btn-close-dispatch-loan-modal')?.addEventListener('click', () => dispatchModal.classList.remove('active'));
    document.getElementById('btn-cancel-dispatch-loan')?.addEventListener('click', () => dispatchModal.classList.remove('active'));

    dispatchForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('dispatch-loan-id').value;
        const payload = {
            location: document.getElementById('dispatch-loan-location').value,
            dispatched_by: document.getElementById('dispatch-loan-technician').value,
            notes: document.getElementById('dispatch-loan-notes').value.trim()
        };

        try {
            const res = await fetch(`/api/loans/${id}/dispatch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                if (window.showToast) window.showToast('Equipo despachado a pruebas', 'success');
                dispatchModal.classList.remove('active');
                await fetchLoans();
            } else {
                const err = await res.json();
                if (window.showToast) window.showToast(err.error || 'Error al despachar', 'error');
            }
        } catch (err) {
            if (window.showToast) window.showToast('Error de conexión', 'error');
        }
    });

    // 3. Modal Retorno a Almacén
    const returnModal = document.getElementById('loan-return-modal');
    const returnForm = document.getElementById('loan-return-form');

    window.openReturnWarehouseLoan = function(id) {
        const loan = allLoans.find(l => l.id === id);
        if (!loan || !returnModal) return;

        document.getElementById('return-loan-id').value = loan.id;
        document.getElementById('return-loan-name-display').innerText = loan.name;
        document.getElementById('return-loan-detail-display').innerText = `Actualmente en: ${loan.location || 'Sin ubicación'} • Responsable: ${loan.dispatched_by || '-'}`;
        document.getElementById('return-loan-warehouse').value = allWarehouses.length > 0 ? allWarehouses[0].name : '';
        document.getElementById('return-loan-notes').value = '';

        returnModal.classList.add('active');
    };

    document.getElementById('btn-close-return-loan-modal')?.addEventListener('click', () => returnModal.classList.remove('active'));
    document.getElementById('btn-cancel-return-loan')?.addEventListener('click', () => returnModal.classList.remove('active'));

    returnForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('return-loan-id').value;
        const payload = {
            warehouse: document.getElementById('return-loan-warehouse').value,
            notes: document.getElementById('return-loan-notes').value.trim()
        };

        try {
            const res = await fetch(`/api/loans/${id}/return-to-warehouse`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                if (window.showToast) window.showToast('Equipo reingresado a almacén', 'success');
                returnModal.classList.remove('active');
                await fetchLoans();
            } else {
                const err = await res.json();
                if (window.showToast) window.showToast(err.error || 'Error al reingresar', 'error');
            }
        } catch (err) {
            if (window.showToast) window.showToast('Error de conexión', 'error');
        }
    });

    // 4. Modal Devolución Formal al Proveedor
    const provReturnModal = document.getElementById('loan-provider-return-modal');
    const provReturnForm = document.getElementById('loan-provider-return-form');

    window.openProviderReturnLoan = function(id) {
        const loan = allLoans.find(l => l.id === id);
        if (!loan || !provReturnModal) return;

        const today = new Date().toISOString().split('T')[0];
        document.getElementById('provider-return-loan-id').value = loan.id;
        document.getElementById('provider-return-name-display').innerText = loan.name;
        document.getElementById('provider-return-detail-display').innerText = `Proveedor: ${loan.provider} • S/N: ${loan.serial_number || 'n/a'} • Valor: ${formatCurrency(loan.value)}`;
        document.getElementById('provider-return-date').value = today;
        document.getElementById('provider-return-notes').value = '';

        provReturnModal.classList.add('active');
    };

    document.getElementById('btn-close-provider-return-modal')?.addEventListener('click', () => provReturnModal.classList.remove('active'));
    document.getElementById('btn-cancel-provider-return')?.addEventListener('click', () => provReturnModal.classList.remove('active'));

    provReturnForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('provider-return-loan-id').value;
        const payload = {
            returned_date: document.getElementById('provider-return-date').value,
            notes: document.getElementById('provider-return-notes').value.trim()
        };

        try {
            const res = await fetch(`/api/loans/${id}/return-to-provider`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                if (window.showToast) window.showToast('Devolución al proveedor registrada', 'success');
                provReturnModal.classList.remove('active');
                await fetchLoans();
            } else {
                const err = await res.json();
                if (window.showToast) window.showToast(err.error || 'Error al devolver', 'error');
            }
        } catch (err) {
            if (window.showToast) window.showToast('Error de conexión', 'error');
        }
    });

    // 5. Modal Convertir a Inventario Propio
    const convertModal = document.getElementById('loan-convert-modal');
    const convertForm = document.getElementById('loan-convert-form');
    const convertStatusSelect = document.getElementById('convert-loan-status');

    convertStatusSelect?.addEventListener('change', (e) => {
        const val = e.target.value;
        const groupWh = document.getElementById('group-convert-warehouse');
        const groupLoc = document.getElementById('group-convert-location');
        if (val === 'En Stock') {
            if (groupWh) groupWh.style.display = 'block';
            if (groupLoc) groupLoc.style.display = 'none';
        } else {
            if (groupWh) groupWh.style.display = 'none';
            if (groupLoc) groupLoc.style.display = 'block';
        }
    });

    window.openConvertLoan = function(id) {
        const loan = allLoans.find(l => l.id === id);
        if (!loan || !convertModal) return;

        document.getElementById('convert-loan-id').value = loan.id;
        document.getElementById('convert-loan-name-display').innerText = `Comprar: ${loan.name}`;
        document.getElementById('convert-loan-detail-display').innerText = `${loan.type} • ${loan.brand || '-'} / ${loan.model || '-'} (S/N: ${loan.serial_number || 'n/a'}) • Proveedor: ${loan.provider}`;
        document.getElementById('convert-loan-value').value = loan.value || 0;

        if (loan.status === 'En Pruebas / Instalado' && loan.location) {
            convertStatusSelect.value = 'Despachado / Instalado';
            document.getElementById('group-convert-warehouse').style.display = 'none';
            document.getElementById('group-convert-location').style.display = 'block';
            document.getElementById('convert-loan-location').value = loan.location;
        } else {
            convertStatusSelect.value = 'En Stock';
            document.getElementById('group-convert-warehouse').style.display = 'block';
            document.getElementById('group-convert-location').style.display = 'none';
            if (allWarehouses.length > 0) {
                document.getElementById('convert-loan-warehouse').value = loan.warehouse || allWarehouses[0].name;
            }
        }

        convertModal.classList.add('active');
    };

    document.getElementById('btn-close-convert-loan-modal')?.addEventListener('click', () => convertModal.classList.remove('active'));
    document.getElementById('btn-cancel-convert-loan')?.addEventListener('click', () => convertModal.classList.remove('active'));

    convertForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('convert-loan-id').value;
        const status = convertStatusSelect.value;
        const payload = {
            status: status,
            warehouse: status === 'En Stock' ? document.getElementById('convert-loan-warehouse').value : '',
            location: status === 'Despachado / Instalado' ? document.getElementById('convert-loan-location').value : '',
            value: parseFloat(document.getElementById('convert-loan-value').value) || 0
        };

        try {
            const res = await fetch(`/api/loans/${id}/convert-to-inventory`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                const data = await res.json();
                if (window.showToast) window.showToast(data.message || 'Equipo transferido a Inventario General', 'success');
                convertModal.classList.remove('active');
                await fetchLoans();
            } else {
                const err = await res.json();
                if (window.showToast) window.showToast(err.error || 'Error al convertir', 'error');
            }
        } catch (err) {
            if (window.showToast) window.showToast('Error de conexión', 'error');
        }
    });

    // 6. Global Action Helpers
    window.editLoan = function(id) {
        const loan = allLoans.find(l => l.id === id);
        if (loan) openLoanModal('edit', loan);
    };

    window.deleteLoan = async function(id) {
        const loan = allLoans.find(l => l.id === id);
        const name = loan ? loan.name : `#${id}`;
        if (!confirm(`¿Estás seguro de que deseas eliminar el registro de préstamo "${name}"?`)) return;

        try {
            const res = await fetch(`/api/loans/${id}`, { method: 'DELETE' });
            if (res.ok) {
                if (window.showToast) window.showToast('Registro de préstamo eliminado', 'success');
                await fetchLoans();
            } else {
                const err = await res.json();
                if (window.showToast) window.showToast(err.error || 'Error al eliminar', 'error');
            }
        } catch (err) {
            if (window.showToast) window.showToast('Error de conexión', 'error');
        }
    };

    // --- Exportar CSV ---
    document.getElementById('btn-export-loans-csv')?.addEventListener('click', () => {
        if (allLoans.length === 0) {
            if (window.showToast) window.showToast('No hay datos para exportar', 'warning');
            return;
        }

        const headers = ['ID', 'Nombre', 'Tipo', 'Marca', 'Modelo', 'Serial', 'MAC', 'Proveedor', 'Estado', 'Almacen', 'Ubicacion', 'Responsable', 'Fecha Recepcion', 'Limite Devolucion', 'Fecha Retorno', 'Cantidad', 'Valor Unitario', 'Valor Total', 'Notas'];
        const rows = allLoans.map(l => [
            l.id,
            `"${(l.name || '').replace(/"/g, '""')}"`,
            `"${(l.type || '').replace(/"/g, '""')}"`,
            `"${(l.brand || '').replace(/"/g, '""')}"`,
            `"${(l.model || '').replace(/"/g, '""')}"`,
            `"${(l.serial_number || '').replace(/"/g, '""')}"`,
            `"${(l.mac_address || '').replace(/"/g, '""')}"`,
            `"${(l.provider || '').replace(/"/g, '""')}"`,
            `"${(l.status || '').replace(/"/g, '""')}"`,
            `"${(l.warehouse || '').replace(/"/g, '""')}"`,
            `"${(l.location || '').replace(/"/g, '""')}"`,
            `"${(l.dispatched_by || '').replace(/"/g, '""')}"`,
            l.received_date || '',
            l.expected_return_date || '',
            l.returned_date || '',
            l.quantity || 1,
            l.value || 0,
            (l.value || 0) * (l.quantity || 1),
            `"${(l.notes || '').replace(/"/g, '""')}"`
        ]);

        const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `Reporte_Prestamos_Demos_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });

    // --- Arranque ---
    loadAuxiliaryData();
    fetchLoans();
});
