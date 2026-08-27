/**
 * pedidos.js - Módulo de Gestión de Pedidos y Solicitudes de Compra
 * The Excellence Collection - AppInventory
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- ESTADO LOCAL ---
    let ordersList = [];
    let currentOrder = null;
    let newOrderItems = [];
    let activeKpiFilter = 'all';
    let availableHotels = [];

    // --- ELEMENTOS DOM ---
    const tableBody = document.getElementById('orders-table-body');
    const searchInput = document.getElementById('order-search-input');
    const statusFilter = document.getElementById('filter-order-status');
    const priorityFilter = document.getElementById('filter-order-priority');
    const hotelFilter = document.getElementById('filter-order-hotel');
    const deptFilter = document.getElementById('filter-order-department');
    const btnResetFilters = document.getElementById('btn-reset-order-filters');
    const btnExportCsv = document.getElementById('btn-export-orders-csv');

    // Modales
    const orderCreateModal = document.getElementById('order-create-modal');
    const orderDetailModal = document.getElementById('order-detail-modal');
    const btnOpenNewOrder = document.getElementById('btn-open-new-order');
    const btnCloseCreateModal = document.getElementById('btn-close-order-create-modal');
    const btnCancelCreateModal = document.getElementById('btn-cancel-order-create');
    const btnCloseDetailModal = document.getElementById('btn-close-order-detail-modal');
    const btnCloseDetailFooter = document.getElementById('btn-close-order-detail-footer');

    // Formulario de creación
    const formCreateOrder = document.getElementById('form-create-order');
    const orderRequesterInput = document.getElementById('order-requester');
    const orderDateInput = document.getElementById('order-date');
    const orderHotelSelect = document.getElementById('order-hotel');
    const orderDeptSelect = document.getElementById('order-dept');
    const orderPrioritySelect = document.getElementById('order-priority');
    const orderNotesInput = document.getElementById('order-general-notes');
    const orderItemsContainer = document.getElementById('order-items-list-container');
    const orderItemsSummaryText = document.getElementById('order-items-summary-text');

    // Mini Builder de Artículos
    const quickItemBuilder = document.getElementById('quick-item-builder');
    const btnAddItemRow = document.getElementById('btn-add-item-row');
    const btnCancelBuilder = document.getElementById('btn-cancel-builder');
    const btnSaveBuilder = document.getElementById('btn-save-builder');
    const builderTitle = document.getElementById('builder-title');
    const builderIndex = document.getElementById('builder-index');
    const builderQty = document.getElementById('builder-qty');
    const builderDesc = document.getElementById('builder-desc');
    const builderRef = document.getElementById('builder-ref');
    const builderProvider = document.getElementById('builder-provider');
    const builderNotes = document.getElementById('builder-notes');

    // --- PERMISOS DE USUARIO ---
    let currentUserData = null;
    let userPerms = [];
    let userIsAdmin = false;

    // --- INICIALIZACIÓN ---
    init();

    async function init() {
        setupEventListeners();
        await checkUserPermissions();
        await loadHotels();
        await fetchOrders();
        setupCurrentUser();
    }

    async function checkUserPermissions() {
        try {
            const res = await fetch('/api/me');
            if (res.ok) {
                const data = await res.json();
                if (data.logged_in && data.user) {
                    currentUserData = data.user;
                    userIsAdmin = (data.user.role || '').toLowerCase() === 'admin';
                    userPerms = Array.isArray(data.user.permissions) ? data.user.permissions : [];
                    applyOrderUIPermissions();
                }
            }
        } catch (e) {
            console.warn('No se pudo verificar permisos de usuario:', e);
        }
    }

    function hasOrderPerm(perm) {
        if (userIsAdmin) return true;
        return userPerms.includes(perm);
    }

    function applyOrderUIPermissions() {
        // 1. Botón de Crear Nueva Solicitud
        if (btnOpenNewOrder) {
            btnOpenNewOrder.style.display = hasOrderPerm('pedidos:crear') ? '' : 'none';
        }

        // 2. Control de Pestaña Aprobación
        const tabApproval = document.querySelector('.modal-tab-btn[data-tab="approval"]');
        if (tabApproval) {
            tabApproval.style.display = hasOrderPerm('pedidos:aprobar') ? '' : 'none';
        }

        // 3. Control de Botones de Cotización
        const btnAddQuote = document.getElementById('btn-add-quote-row');
        if (btnAddQuote) {
            btnAddQuote.style.display = hasOrderPerm('pedidos:cotizar') ? '' : 'none';
        }

        // 4. Control de Botones de Órdenes de Compra
        const btnCreatePo = document.getElementById('btn-create-po-modal');
        if (btnCreatePo) {
            btnCreatePo.style.display = hasOrderPerm('pedidos:comprar') ? '' : 'none';
        }

        // 5. Control de Botones de Recepción
        const btnSaveRec = document.getElementById('btn-save-reception');
        if (btnSaveRec) {
            btnSaveRec.style.display = hasOrderPerm('pedidos:recibir') ? '' : 'none';
        }
    }

    function setupCurrentUser() {
        const today = new Date().toISOString().split('T')[0];
        if (orderDateInput) orderDateInput.value = today;

        // Nombre de usuario actual
        const username = currentUserData?.username || document.querySelector('.user-name')?.textContent?.trim() || 'Usuario Conectado';
        if (orderRequesterInput) orderRequesterInput.value = username;
    }

    async function loadHotels() {
        try {
            const res = await fetch('/api/hotels');
            if (res.ok) {
                availableHotels = await res.json();
                
                // Llenar selectores
                const optionsHtml = availableHotels.map(h => `<option value="${escapeHtml(h.name)}">${escapeHtml(h.name)}</option>`).join('');
                if (orderHotelSelect) {
                    orderHotelSelect.innerHTML = '<option value="">Selecciona Propiedad...</option>' + optionsHtml;
                }
                if (hotelFilter) {
                    hotelFilter.innerHTML = '<option value="all">Todas las Propiedades</option>' + optionsHtml;
                }
            }
        } catch (e) {
            console.warn('No se pudieron cargar los hoteles:', e);
        }
    }

    // --- CARGA Y RENDER DE SOLICITUDES ---
    async function fetchOrders() {
        try {
            const params = new URLSearchParams();
            if (activeKpiFilter && activeKpiFilter !== 'all') {
                params.append('status', activeKpiFilter);
            } else if (statusFilter && statusFilter.value !== 'all') {
                params.append('status', statusFilter.value);
            }

            if (priorityFilter && priorityFilter.value !== 'all') params.append('priority', priorityFilter.value);
            if (hotelFilter && hotelFilter.value !== 'all') params.append('hotel', hotelFilter.value);
            if (deptFilter && deptFilter.value !== 'all') params.append('department', deptFilter.value);
            if (searchInput && searchInput.value.trim()) params.append('search', searchInput.value.trim());

            const res = await fetch(`/api/orders?${params.toString()}`);
            if (!res.ok) throw new Error('Error al cargar órdenes');

            const data = await res.json();
            ordersList = data.orders || [];
            updateKpis(data.kpis || {});
            renderOrdersTable(ordersList);
        } catch (e) {
            console.error('Error fetching orders:', e);
            if (tableBody) {
                tableBody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--color-danger); padding: 30px;">Error al cargar las solicitudes: ${escapeHtml(e.message)}</td></tr>`;
            }
        }
    }

    function updateKpis(kpis) {
        document.getElementById('kpi-total-orders').textContent = kpis.total || 0;
        document.getElementById('kpi-pending-approval').textContent = kpis.pendientes_aprobacion || 0;
        document.getElementById('kpi-approved-orders').textContent = kpis.aprobadas || 0;
        document.getElementById('kpi-in-purchase').textContent = kpis.en_compras || 0;
        document.getElementById('kpi-pending-reception').textContent = kpis.pendientes_recepcion || 0;
        document.getElementById('kpi-received-orders').textContent = kpis.recibidas || 0;
    }

    function renderOrdersTable(orders) {
        if (!tableBody) return;

        if (!orders || orders.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align: center; padding: 48px 20px; color: var(--color-text-secondary);">
                        <div style="width: 56px; height: 56px; border-radius: 50%; background: rgba(0,0,0,0.04); display: flex; align-items: center; justify-content: center; margin: 0 auto 12px auto; font-size: 24px;">
                            <i class="fa-solid fa-cart-arrow-down" style="color: var(--color-text-secondary);"></i>
                        </div>
                        <div style="font-weight: 700; font-size: 15px; color: var(--color-text); margin-bottom: 4px;">No se encontraron solicitudes de compra</div>
                        <div style="font-size: 13px;">Ajusta los filtros de búsqueda o registra una nueva solicitud con el botón superior.</div>
                    </td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = orders.map(order => {
            const statusClass = getStatusClass(order.status);
            const priorityClass = getPriorityClass(order.priority);
            
            // Resumen de items
            const itemsCount = order.total_items || (order.items ? order.items.length : 0);
            const itemsSnippet = order.items && order.items.length > 0 
                ? order.items.slice(0, 2).map(i => `${i.quantity_requested}x ${escapeHtml(i.description)}`).join(', ') + (order.items.length > 2 ? ` (+${order.items.length - 2} más)` : '')
                : 'Sin artículos';

            const providerText = order.providers_summary || order.pos_summary || '<span style="color: var(--color-text-secondary); font-style: italic;">Pendiente</span>';

            return `
                <tr data-order-id="${order.id}">
                    <td>
                        <strong style="color: var(--color-primary); font-family: monospace; font-size: 13px;">${escapeHtml(order.request_number)}</strong>
                    </td>
                    <td>
                        <div style="font-weight: 600; color: var(--color-text);">${escapeHtml(order.requester_name)}</div>
                    </td>
                    <td>
                        <span style="font-size: 12px; color: var(--color-text-secondary);">${escapeHtml(order.created_date || '')}</span>
                    </td>
                    <td>
                        <div style="font-weight: 600; font-size: 13px;">${escapeHtml(order.hotel || 'General')}</div>
                        <div style="font-size: 11px; color: var(--color-text-secondary);">${escapeHtml(order.department || 'IT')}</div>
                    </td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span class="badge" style="background: rgba(37, 99, 235, 0.1); color: var(--color-primary); font-weight: 700; border-radius: 6px; padding: 2px 6px; font-size: 11px;">${itemsCount} art.</span>
                            <span style="font-size: 12px; color: var(--color-text-secondary); max-width: 260px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(itemsSnippet)}">${itemsSnippet}</span>
                        </div>
                    </td>
                    <td style="text-align: center;">
                        <span class="priority-badge ${priorityClass}">${escapeHtml(order.priority)}</span>
                    </td>
                    <td style="text-align: center;">
                        <span class="status-pill ${statusClass}">
                            <i class="fa-solid fa-circle" style="font-size: 7px;"></i>
                            ${escapeHtml(order.status)}
                        </span>
                    </td>
                    <td>
                        <div style="font-size: 12px; max-width: 180px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(order.providers_summary || '')}">
                            ${providerText}
                        </div>
                    </td>
                    <td style="text-align: right;">
                        <div style="display: inline-flex; gap: 6px;">
                            <button type="button" class="order-action-btn view" onclick="window.viewOrderDetail(${order.id})" title="Ver Detalle y Gestionar">
                                <i class="fa-solid fa-eye"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // --- GESTIÓN DE NUEVA SOLICITUD (MODAL 1) ---
    function openNewOrderModal() {
        if (!orderCreateModal) return;
        newOrderItems = [];
        if (formCreateOrder) formCreateOrder.reset();
        setupCurrentUser();
        closeQuickBuilder();
        renderNewOrderItems();
        orderCreateModal.classList.add('active');
    }

    function closeNewOrderModal() {
        if (!orderCreateModal) return;
        orderCreateModal.classList.remove('active');
        closeQuickBuilder();
    }

    function openQuickBuilder(editIndex = -1) {
        if (!quickItemBuilder) return;
        quickItemBuilder.style.display = 'block';

        if (editIndex >= 0 && newOrderItems[editIndex]) {
            const item = newOrderItems[editIndex];
            builderTitle.textContent = 'Editar Artículo';
            builderIndex.value = editIndex;
            builderQty.value = item.quantity_requested || 1;
            builderDesc.value = item.description || '';
            builderRef.value = item.reference || '';
            builderProvider.value = item.recommended_provider || '';
            builderNotes.value = item.notes || '';
        } else {
            builderTitle.textContent = 'Nuevo Artículo';
            builderIndex.value = -1;
            builderQty.value = 1;
            builderDesc.value = '';
            builderRef.value = '';
            builderProvider.value = '';
            builderNotes.value = '';
        }
        builderDesc.focus();
    }

    function closeQuickBuilder() {
        if (quickItemBuilder) quickItemBuilder.style.display = 'none';
        builderIndex.value = -1;
    }

    function saveQuickBuilderItem() {
        const desc = builderDesc.value.trim();
        const qty = parseInt(builderQty.value) || 1;
        const ref = builderRef.value.trim();
        const prov = builderProvider.value.trim();
        const notes = builderNotes.value.trim();
        const idx = parseInt(builderIndex.value);

        if (!desc) {
            alert('Por favor ingresa la descripción del artículo');
            builderDesc.focus();
            return;
        }

        const itemObj = {
            description: desc,
            quantity_requested: Math.max(1, qty),
            reference: ref,
            recommended_provider: prov,
            notes: notes,
            unit: 'Unidades'
        };

        if (idx >= 0 && idx < newOrderItems.length) {
            newOrderItems[idx] = itemObj;
        } else {
            newOrderItems.push(itemObj);
        }

        closeQuickBuilder();
        renderNewOrderItems();
    }

    function renderNewOrderItems() {
        if (!orderItemsContainer) return;

        if (newOrderItems.length === 0) {
            orderItemsContainer.innerHTML = `
                <div style="text-align: center; padding: 24px; border: 1px dashed var(--color-border); border-radius: 10px; color: var(--color-text-secondary);">
                    <i class="fa-solid fa-cart-arrow-down" style="font-size: 20px; margin-bottom: 6px; display: block; opacity: 0.6;"></i>
                    <span>No has agregado ningún artículo aún. Haz clic en <strong>+ Agregar Artículo</strong> para comenzar.</span>
                </div>
            `;
            if (orderItemsSummaryText) {
                orderItemsSummaryText.textContent = '0 artículos serán registrados en esta solicitud.';
            }
            return;
        }

        orderItemsContainer.innerHTML = newOrderItems.map((item, idx) => `
            <div class="item-card-row">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px;">
                    <div style="display: flex; gap: 12px; align-items: flex-start; flex-grow: 1;">
                        <span style="background: rgba(37, 99, 235, 0.12); color: var(--color-primary); font-weight: 800; font-size: 13px; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                            ${idx + 1}
                        </span>
                        <div>
                            <div style="font-weight: 700; font-size: 14px; color: var(--color-text);">
                                <span style="color: #f97316; margin-right: 4px;">[${item.quantity_requested}x]</span>
                                ${escapeHtml(item.description)}
                            </div>
                            <div style="font-size: 12px; color: var(--color-text-secondary); margin-top: 3px; display: flex; gap: 14px; flex-wrap: wrap;">
                                ${item.reference ? `<span><strong>Ref:</strong> ${escapeHtml(item.reference)}</span>` : ''}
                                ${item.recommended_provider ? `<span><strong>Prov. sugerido:</strong> ${escapeHtml(item.recommended_provider)}</span>` : ''}
                                ${item.notes ? `<span><strong>Obs:</strong> ${escapeHtml(item.notes)}</span>` : ''}
                            </div>
                        </div>
                    </div>
                    <div style="display: flex; gap: 6px; flex-shrink: 0;">
                        <button type="button" class="btn btn-secondary btn-sm" onclick="window.editNewOrderItem(${idx})" title="Editar">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button type="button" class="btn btn-secondary btn-sm" onclick="window.duplicateNewOrderItem(${idx})" title="Duplicar">
                            <i class="fa-solid fa-copy"></i>
                        </button>
                        <button type="button" class="btn btn-secondary btn-sm" style="color: #ef4444;" onclick="window.deleteNewOrderItem(${idx})" title="Eliminar">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');

        if (orderItemsSummaryText) {
            const totQty = newOrderItems.reduce((acc, i) => acc + (i.quantity_requested || 1), 0);
            orderItemsSummaryText.textContent = `${newOrderItems.length} artículo(s) con un total de ${totQty} unidades serán registrados en esta solicitud.`;
        }
    }

    // Handlers globales para items en creación
    window.editNewOrderItem = function(idx) {
        openQuickBuilder(idx);
    };

    window.duplicateNewOrderItem = function(idx) {
        if (newOrderItems[idx]) {
            const clone = JSON.parse(JSON.stringify(newOrderItems[idx]));
            newOrderItems.splice(idx + 1, 0, clone);
            renderNewOrderItems();
        }
    };

    window.deleteNewOrderItem = function(idx) {
        newOrderItems.splice(idx, 1);
        renderNewOrderItems();
    };

    async function handleCreateOrderSubmit(e) {
        e.preventDefault();

        if (newOrderItems.length === 0) {
            alert('Debes agregar al menos un artículo a la solicitud');
            openQuickBuilder();
            return;
        }

        const hotel = orderHotelSelect.value;
        const dept = orderDeptSelect.value;
        const priority = orderPrioritySelect.value;
        const notes = orderNotesInput.value.trim();
        const requester = orderRequesterInput.value.trim();

        if (!hotel) {
            alert('Por favor selecciona la propiedad / hotel');
            orderHotelSelect.focus();
            return;
        }

        const payload = {
            requester_name: requester,
            hotel: hotel,
            department: dept,
            priority: priority,
            general_notes: notes,
            items: newOrderItems
        };

        try {
            const res = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Error al guardar solicitud');
            }

            const created = await res.json();
            closeNewOrderModal();
            await fetchOrders();

            // Abrir automáticamente el modal de detalle
            window.viewOrderDetail(created.id);
        } catch (e) {
            alert('Error al crear solicitud: ' + e.message);
        }
    }

    // --- DETALLE INTEGRAL Y TABS (MODAL 2) ---
    window.viewOrderDetail = async function(orderId) {
        try {
            const res = await fetch(`/api/orders/${orderId}`);
            if (!res.ok) throw new Error('No se pudo obtener el detalle de la solicitud');

            currentOrder = await res.json();
            populateOrderDetailModal(currentOrder);
            if (orderDetailModal) orderDetailModal.classList.add('active');
        } catch (e) {
            alert('Error: ' + e.message);
        }
    };

    function populateOrderDetailModal(order) {
        document.getElementById('detail-order-number').textContent = order.request_number;
        document.getElementById('detail-order-requester').textContent = order.requester_name;
        document.getElementById('detail-order-date').textContent = order.created_date || order.created_at;
        document.getElementById('detail-order-hotel').textContent = order.hotel || 'General';
        document.getElementById('detail-order-dept').textContent = order.department || 'IT';

        // Badges
        const stBadge = document.getElementById('detail-order-status-badge');
        stBadge.className = `status-pill ${getStatusClass(order.status)}`;
        stBadge.innerHTML = `<i class="fa-solid fa-circle" style="font-size: 7px;"></i> ${escapeHtml(order.status)}`;

        const prBadge = document.getElementById('detail-order-priority-badge');
        prBadge.className = `priority-badge ${getPriorityClass(order.priority)}`;
        prBadge.textContent = order.priority;

        // Renderizar Tab 1: Artículos
        renderDetailItemsTab(order.items || []);

        // Renderizar Tab 2: Aprobación
        renderApprovalTab(order.items || []);

        // Renderizar Tab 3: Cotización
        renderQuoteTab(order.items || []);

        // Renderizar Tab 4: Órdenes de Compra
        renderPoTab(order);

        // Renderizar Tab 5: Recepción
        renderReceptionTab(order);

        // Renderizar Tab 6: Historial
        renderAuditHistoryTab(order.audit_logs || []);

        // Aplicar permisos visuales en pestañas y botones de acción
        applyOrderUIPermissions();

        // Reset tab activa a Tab 1
        switchTab('items');
    }

    function switchTab(tabId) {
        document.querySelectorAll('.modal-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });
        document.querySelectorAll('.tab-pane').forEach(pane => {
            pane.style.display = (pane.id === `tab-content-${tabId}`) ? 'block' : 'none';
        });
    }

    // --- RENDER TAB 1: ARTÍCULOS ---
    function renderDetailItemsTab(items) {
        const tbody = document.getElementById('detail-items-table-body');
        if (!tbody) return;

        if (items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 20px;">Sin artículos registrados.</td></tr>';
            return;
        }

        tbody.innerHTML = items.map((it, idx) => {
            const targetQty = it.quantity_approved > 0 ? it.quantity_approved : it.quantity_requested;
            const pendingQty = Math.max(0, targetQty - it.quantity_received);
            const pct = Math.min(100, Math.round((it.quantity_received / targetQty) * 100)) || 0;

            return `
                <tr>
                    <td style="font-weight: 700; color: var(--color-text-secondary); width: 30px;">${idx + 1}</td>
                    <td>
                        <div style="font-weight: 700; color: var(--color-text);">${escapeHtml(it.description)}</div>
                        <div style="font-size: 11px; color: var(--color-text-secondary); margin-top: 2px;">
                            ${it.recommended_provider ? `Prov. Sugerido: ${escapeHtml(it.recommended_provider)} | ` : ''}
                            ${it.notes ? `Obs: ${escapeHtml(it.notes)}` : ''}
                        </div>
                    </td>
                    <td><span style="font-family: monospace; font-size: 12px;">${escapeHtml(it.reference || '-')}</span></td>
                    <td style="text-align: center; font-weight: 600;">${it.quantity_requested}</td>
                    <td style="text-align: center; font-weight: 700; color: #10b981;">${it.quantity_approved}</td>
                    <td style="text-align: center; font-weight: 700; color: #2563eb;">${it.quantity_received}</td>
                    <td style="text-align: center; font-weight: 700; color: ${pendingQty > 0 ? '#ea580c' : '#10b981'};">${pendingQty}</td>
                    <td style="text-align: center;">
                        <span class="status-pill ${getStatusClass(it.status)}" style="font-size: 11px; padding: 2px 8px;">${escapeHtml(it.status)}</span>
                        <div style="background: rgba(0,0,0,0.06); border-radius: 4px; height: 5px; width: 100%; margin-top: 6px; overflow: hidden;">
                            <div style="background: ${pct >= 100 ? '#10b981' : '#2563eb'}; width: ${pct}%; height: 100%;"></div>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // --- RENDER TAB 2: APROBACIÓN ---
    function renderApprovalTab(items) {
        const tbody = document.getElementById('approval-items-table-body');
        if (!tbody) return;

        tbody.innerHTML = items.map(it => `
            <tr data-item-id="${it.id}">
                <td>
                    <div style="font-weight: 700;">${escapeHtml(it.description)}</div>
                    <div style="font-size: 11px; color: var(--color-text-secondary);">${escapeHtml(it.reference || '')}</div>
                </td>
                <td style="text-align: center; font-weight: 600;">${it.quantity_requested}</td>
                <td style="text-align: center;">
                    <input type="number" min="0" max="${it.quantity_requested * 2}" class="form-control approval-qty-input" value="${it.quantity_approved > 0 ? it.quantity_approved : it.quantity_requested}" style="width: 80px; text-align: center; font-weight: 700; margin: 0 auto;">
                </td>
                <td style="text-align: center;">
                    <select class="form-control approval-status-select" style="font-weight: 600; font-size: 12px;">
                        <option value="Aprobado" ${it.status === 'Aprobado' || it.status === 'Solicitado' || it.status === 'En Espera de Aprobación' ? 'selected' : ''}>Aprobar</option>
                        <option value="Rechazado" ${it.status === 'Rechazado' ? 'selected' : ''}>Rechazar</option>
                    </select>
                </td>
                <td>
                    <input type="text" class="form-control approval-notes-input" placeholder="Motivo o justificación..." value="${escapeHtml(it.approval_notes || '')}" style="font-size: 12px;">
                </td>
            </tr>
        `).join('');
    }

    async function handleSaveApproval() {
        if (!currentOrder) return;
        const rows = document.querySelectorAll('#approval-items-table-body tr');
        const itemsPayload = [];

        rows.forEach(row => {
            const itemId = parseInt(row.dataset.itemId);
            const qtyInput = row.querySelector('.approval-qty-input');
            const statusSelect = row.querySelector('.approval-status-select');
            const notesInput = row.querySelector('.approval-notes-input');

            if (itemId && qtyInput && statusSelect) {
                itemsPayload.push({
                    item_id: itemId,
                    status: statusSelect.value,
                    approved_quantity: parseInt(qtyInput.value) || 0,
                    notes: notesInput ? notesInput.value.trim() : ''
                });
            }
        });

        try {
            const res = await fetch(`/api/orders/${currentOrder.id}/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'individual', items: itemsPayload })
            });

            if (!res.ok) throw new Error('Error al guardar la aprobación');
            const updated = await res.json();
            currentOrder = updated;
            populateOrderDetailModal(updated);
            await fetchOrders();
            alert('Evaluación de aprobación guardada exitosamente.');
        } catch (e) {
            alert('Error: ' + e.message);
        }
    }

    // --- RENDER TAB 3: COTIZACIÓN ---
    function renderQuoteTab(items) {
        const checklist = document.getElementById('quote-items-checklist');
        const historyContainer = document.getElementById('quotes-history-container');
        const quoteDateInput = document.getElementById('quote-date');

        if (quoteDateInput) quoteDateInput.value = new Date().toISOString().split('T')[0];

        if (checklist) {
            checklist.innerHTML = items.map(it => `
                <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; cursor: pointer;">
                    <input type="checkbox" name="quote-item-check" value="${it.id}" checked>
                    <span><strong>[${it.quantity_approved || it.quantity_requested}x]</strong> ${escapeHtml(it.description)}</span>
                </label>
            `).join('');
        }

        if (historyContainer) {
            // Extraer todas las cotizaciones de los items
            const allQuotes = [];
            items.forEach(it => {
                if (it.quotes && it.quotes.length > 0) {
                    it.quotes.forEach(q => {
                        allQuotes.push({ ...q, item_description: it.description });
                    });
                }
            });

            if (allQuotes.length === 0) {
                historyContainer.innerHTML = '<div style="font-size: 13px; color: var(--color-text-secondary); padding: 14px; border: 1px dashed var(--color-border); border-radius: 8px; text-align: center;">No hay cotizaciones registradas.</div>';
            } else {
                historyContainer.innerHTML = allQuotes.map(q => `
                    <div style="background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 10px; padding: 12px;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <strong style="font-size: 13px; color: var(--color-primary);">${escapeHtml(q.provider_name)}</strong>
                            <span style="font-weight: 800; color: #10b981; font-size: 13px;">${escapeHtml(q.currency)} $${(q.total_price || 0).toFixed(2)}</span>
                        </div>
                        <div style="font-size: 12px; color: var(--color-text); margin-top: 3px;">
                            Artículo: <strong>${escapeHtml(q.item_description)}</strong>
                        </div>
                        <div style="font-size: 11px; color: var(--color-text-secondary); margin-top: 4px; display: flex; gap: 12px;">
                            <span>No: ${escapeHtml(q.quote_number || 'S/N')}</span>
                            <span>Fecha: ${escapeHtml(q.quote_date || '')}</span>
                            <span>Por: ${escapeHtml(q.created_by || '')}</span>
                        </div>
                    </div>
                `).join('');
            }
        }
    }

    async function handleSaveQuote() {
        if (!currentOrder) return;
        const checkedItems = Array.from(document.querySelectorAll('input[name="quote-item-check"]:checked')).map(c => parseInt(c.value));
        const provider = document.getElementById('quote-provider').value.trim();
        const quoteNum = document.getElementById('quote-number').value.trim();
        const price = parseFloat(document.getElementById('quote-unit-price').value) || 0;
        const currency = document.getElementById('quote-currency').value;
        const qDate = document.getElementById('quote-date').value;
        const notes = document.getElementById('quote-notes').value.trim();

        if (checkedItems.length === 0) {
            alert('Selecciona al menos un artículo para cotizar');
            return;
        }
        if (!provider) {
            alert('Ingresa el nombre del proveedor cotizado');
            return;
        }

        try {
            const res = await fetch(`/api/orders/${currentOrder.id}/quote`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    item_ids: checkedItems,
                    provider_name: provider,
                    quote_number: quoteNum,
                    unit_price: price,
                    currency: currency,
                    quote_date: qDate,
                    notes: notes
                })
            });

            if (!res.ok) throw new Error('Error al registrar cotización');
            const updated = await res.json();
            currentOrder = updated;
            populateOrderDetailModal(updated);
            await fetchOrders();
            alert('Cotización registrada exitosamente.');
        } catch (e) {
            alert('Error: ' + e.message);
        }
    }

    // --- RENDER TAB 4: ÓRDENES DE COMPRA (OC) ---
    function renderPoTab(order) {
        const checklist = document.getElementById('po-items-checklist');
        const historyContainer = document.getElementById('po-history-container');
        const poDateInput = document.getElementById('po-date-input');

        if (poDateInput) poDateInput.value = new Date().toISOString().split('T')[0];

        if (checklist) {
            checklist.innerHTML = (order.items || []).map(it => `
                <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; cursor: pointer;">
                    <input type="checkbox" name="po-item-check" value="${it.id}" checked>
                    <span><strong>[${it.quantity_approved || it.quantity_requested}x]</strong> ${escapeHtml(it.description)}</span>
                </label>
            `).join('');
        }

        if (historyContainer) {
            const allPos = [];
            (order.items || []).forEach(it => {
                if (it.orders && it.orders.length > 0) {
                    it.orders.forEach(o => {
                        if (!allPos.some(p => p.po_number === o.po_number)) {
                            allPos.push(o);
                        }
                    });
                }
            });

            if (allPos.length === 0) {
                historyContainer.innerHTML = '<div style="font-size: 13px; color: var(--color-text-secondary); padding: 14px; border: 1px dashed var(--color-border); border-radius: 8px; text-align: center;">No hay Órdenes de Compra vinculadas.</div>';
            } else {
                historyContainer.innerHTML = allPos.map(po => `
                    <div style="background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 10px; padding: 12px;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <strong style="font-size: 14px; font-family: monospace; color: var(--color-primary);">${escapeHtml(po.po_number)}</strong>
                            <span class="status-pill status-pedido" style="font-size: 11px;">${escapeHtml(po.status || 'Emitida')}</span>
                        </div>
                        <div style="font-size: 13px; font-weight: 600; color: var(--color-text); margin-top: 3px;">
                            Proveedor: ${escapeHtml(po.provider_name)}
                        </div>
                        <div style="font-size: 11px; color: var(--color-text-secondary); margin-top: 4px; display: flex; gap: 14px;">
                            <span>Fecha: ${escapeHtml(po.order_date || '')}</span>
                            <span>Entrega Est: ${escapeHtml(po.estimated_delivery_date || 'N/A')}</span>
                        </div>
                    </div>
                `).join('');
            }
        }
    }

    async function handleSavePo() {
        if (!currentOrder) return;
        const checkedItems = Array.from(document.querySelectorAll('input[name="po-item-check"]:checked')).map(c => parseInt(c.value));
        const poNum = document.getElementById('po-number-input').value.trim();
        const provider = document.getElementById('po-provider-input').value.trim();
        const orderDate = document.getElementById('po-date-input').value;
        const estDelivery = document.getElementById('po-delivery-date-input').value;
        const buyer = document.getElementById('po-buyer-input').value.trim();
        const notes = document.getElementById('po-notes-input').value.trim();

        if (checkedItems.length === 0) {
            alert('Selecciona al menos un artículo para la Orden de Compra');
            return;
        }
        if (!poNum || !provider) {
            alert('Ingresa el número de Orden de Compra y el proveedor');
            return;
        }

        const itemsPayload = checkedItems.map(i_id => {
            const itObj = currentOrder.items.find(x => x.id === i_id);
            return {
                item_id: i_id,
                quantity_ordered: itObj ? (itObj.quantity_approved || itObj.quantity_requested) : 1,
                unit_price: itObj ? itObj.quoted_unit_price : 0
            };
        });

        try {
            const res = await fetch(`/api/orders/${currentOrder.id}/purchase-order`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    po_number: poNum,
                    provider_name: provider,
                    order_date: orderDate,
                    estimated_delivery_date: estDelivery,
                    buyer_name: buyer,
                    notes: notes,
                    items: itemsPayload
                })
            });

            if (!res.ok) throw new Error('Error al guardar Orden de Compra');
            const updated = await res.json();
            currentOrder = updated;
            populateOrderDetailModal(updated);
            await fetchOrders();
            alert('Orden de Compra vinculada exitosamente.');
        } catch (e) {
            alert('Error: ' + e.message);
        }
    }

    // --- RENDER TAB 5: RECEPCIÓN ---
    function renderReceptionTab(order) {
        const itemSelect = document.getElementById('reception-item-select');
        const historyContainer = document.getElementById('receptions-history-container');
        const dateInput = document.getElementById('reception-date-input');
        const receiverInput = document.getElementById('reception-receiver-input');

        if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
        if (receiverInput) receiverInput.value = orderRequesterInput ? orderRequesterInput.value : '';

        if (itemSelect) {
            itemSelect.innerHTML = '<option value="">Selecciona el artículo...</option>' + 
                (order.items || []).map(it => {
                    const target = it.quantity_approved > 0 ? it.quantity_approved : it.quantity_requested;
                    const pending = Math.max(0, target - it.quantity_received);
                    return `<option value="${it.id}">[Pend: ${pending}] ${escapeHtml(it.description)}</option>`;
                }).join('');
        }

        if (historyContainer) {
            const allReceptions = [];
            (order.items || []).forEach(it => {
                if (it.receptions && it.receptions.length > 0) {
                    it.receptions.forEach(r => {
                        allReceptions.push({ ...r, item_description: it.description });
                    });
                }
            });

            if (allReceptions.length === 0) {
                historyContainer.innerHTML = '<div style="font-size: 13px; color: var(--color-text-secondary); padding: 14px; border: 1px dashed var(--color-border); border-radius: 8px; text-align: center;">Aún no se han recibido artículos.</div>';
            } else {
                historyContainer.innerHTML = allReceptions.map(r => `
                    <div style="background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 10px; padding: 12px;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <strong style="font-size: 13px; color: #10b981;">+${r.quantity_received} unidades recibidas</strong>
                            <span style="font-size: 11px; color: var(--color-text-secondary);">${escapeHtml(r.reception_date || '')}</span>
                        </div>
                        <div style="font-size: 12px; font-weight: 600; color: var(--color-text); margin-top: 3px;">
                            ${escapeHtml(r.item_description)}
                        </div>
                        <div style="font-size: 11px; color: var(--color-text-secondary); margin-top: 4px; display: flex; gap: 12px; flex-wrap: wrap;">
                            <span>Recibido por: <strong>${escapeHtml(r.received_by)}</strong></span>
                            ${r.invoice_number ? `<span>Factura: <strong>${escapeHtml(r.invoice_number)}</strong></span>` : ''}
                            ${r.provider_name ? `<span>Proveedor: ${escapeHtml(r.provider_name)}</span>` : ''}
                        </div>
                    </div>
                `).join('');
            }
        }
    }

    async function handleSaveReception() {
        if (!currentOrder) return;
        const itemId = parseInt(document.getElementById('reception-item-select').value);
        const qty = parseInt(document.getElementById('reception-qty-input').value) || 0;
        const date = document.getElementById('reception-date-input').value;
        const receiver = document.getElementById('reception-receiver-input').value.trim();
        const prov = document.getElementById('reception-provider-input').value.trim();
        const invoice = document.getElementById('reception-invoice-input').value.trim();
        const notes = document.getElementById('reception-notes-input').value.trim();

        if (!itemId) {
            alert('Selecciona el artículo a recibir');
            return;
        }
        if (qty <= 0) {
            alert('Ingresa una cantidad recibida válida');
            return;
        }
        if (!receiver) {
            alert('Ingresa el nombre de la persona que recibe');
            return;
        }

        try {
            const res = await fetch(`/api/orders/${currentOrder.id}/reception`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    item_id: itemId,
                    quantity_received: qty,
                    reception_date: date,
                    received_by: receiver,
                    provider_name: prov,
                    invoice_number: invoice,
                    notes: notes
                })
            });

            if (!res.ok) throw new Error('Error al registrar recepción');
            const updated = await res.json();
            currentOrder = updated;
            populateOrderDetailModal(updated);
            await fetchOrders();
            alert('Recepción de artículo registrada con éxito.');
        } catch (e) {
            alert('Error: ' + e.message);
        }
    }

    // --- RENDER TAB 6: HISTORIAL & AUDITORÍA ---
    function renderAuditHistoryTab(logs) {
        const container = document.getElementById('order-audit-timeline');
        if (!container) return;

        if (logs.length === 0) {
            container.innerHTML = '<div style="font-size: 13px; color: var(--color-text-secondary); text-align: center; padding: 20px;">Sin registros de auditoría.</div>';
            return;
        }

        container.innerHTML = logs.map(l => `
            <div style="display: flex; gap: 14px; align-items: flex-start; background: var(--color-surface-2, rgba(0,0,0,0.02)); border: 1px solid var(--color-border); border-radius: 10px; padding: 12px 14px;">
                <div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(37, 99, 235, 0.1); color: var(--color-primary); display: flex; align-items: center; justify-content: center; font-size: 14px; flex-shrink: 0;">
                    <i class="fa-solid fa-clock-rotate-left"></i>
                </div>
                <div style="flex-grow: 1;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <strong style="font-size: 13px; color: var(--color-text);">${escapeHtml(l.action)}</strong>
                        <span style="font-size: 11px; color: var(--color-text-secondary);">${escapeHtml(l.timestamp)}</span>
                    </div>
                    <div style="font-size: 12px; color: var(--color-text); margin-top: 3px;">
                        ${escapeHtml(l.details || '')}
                    </div>
                    <div style="font-size: 11px; color: var(--color-text-secondary); margin-top: 4px;">
                        Usuario: <strong>${escapeHtml(l.username)}</strong>
                    </div>
                </div>
            </div>
        `).join('');
    }

    // --- EXPORTAR CSV ---
    function exportOrdersCsv() {
        if (!ordersList || ordersList.length === 0) {
            alert('No hay solicitudes para exportar');
            return;
        }

        const headers = ['Solicitud #', 'Solicitante', 'Fecha', 'Propiedad', 'Departamento', 'Prioridad', 'Estado General', 'Total Articulos', 'Proveedores', 'OCs'];
        const rows = ordersList.map(o => [
            `"${o.request_number || ''}"`,
            `"${o.requester_name || ''}"`,
            `"${o.created_date || ''}"`,
            `"${o.hotel || ''}"`,
            `"${o.department || ''}"`,
            `"${o.priority || ''}"`,
            `"${o.status || ''}"`,
            `"${o.total_items || 0}"`,
            `"${o.providers_summary || ''}"`,
            `"${o.pos_summary || ''}"`
        ]);

        const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Reporte_Pedidos_Compras_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    // --- EVENT LISTENERS ---
    function setupEventListeners() {
        // KPIs Clicables
        document.querySelectorAll('.order-kpi-card').forEach(card => {
            card.addEventListener('click', () => {
                document.querySelectorAll('.order-kpi-card').forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                activeKpiFilter = card.dataset.filter || 'all';
                fetchOrders();
            });
        });

        // Filtros
        if (statusFilter) statusFilter.addEventListener('change', fetchOrders);
        if (priorityFilter) priorityFilter.addEventListener('change', fetchOrders);
        if (hotelFilter) hotelFilter.addEventListener('change', fetchOrders);
        if (deptFilter) deptFilter.addEventListener('change', fetchOrders);
        
        let searchTimeout;
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(fetchOrders, 300);
            });
        }

        if (btnResetFilters) {
            btnResetFilters.addEventListener('click', () => {
                if (searchInput) searchInput.value = '';
                if (statusFilter) statusFilter.value = 'all';
                if (priorityFilter) priorityFilter.value = 'all';
                if (hotelFilter) hotelFilter.value = 'all';
                if (deptFilter) deptFilter.value = 'all';
                activeKpiFilter = 'all';
                document.querySelectorAll('.order-kpi-card').forEach(c => c.classList.toggle('active', c.dataset.filter === 'all'));
                fetchOrders();
            });
        }

        if (btnExportCsv) btnExportCsv.addEventListener('click', exportOrdersCsv);

        // Modales
        if (btnOpenNewOrder) btnOpenNewOrder.addEventListener('click', openNewOrderModal);
        if (btnCloseCreateModal) btnCloseCreateModal.addEventListener('click', closeNewOrderModal);
        if (btnCancelCreateModal) btnCancelCreateModal.addEventListener('click', closeNewOrderModal);
        if (btnCloseDetailModal) btnCloseDetailModal.addEventListener('click', () => orderDetailModal?.classList.remove('active'));
        if (btnCloseDetailFooter) btnCloseDetailFooter.addEventListener('click', () => orderDetailModal?.classList.remove('active'));

        // Builder de Artículos
        if (btnAddItemRow) btnAddItemRow.addEventListener('click', () => openQuickBuilder(-1));
        if (btnCancelBuilder) btnCancelBuilder.addEventListener('click', closeQuickBuilder);
        if (btnSaveBuilder) btnSaveBuilder.addEventListener('click', saveQuickBuilderItem);
        if (formCreateOrder) formCreateOrder.addEventListener('submit', handleCreateOrderSubmit);

        // Tabs del Modal de Detalle
        document.querySelectorAll('.modal-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                switchTab(btn.dataset.tab);
            });
        });

        // Botones de acciones en tabs de detalle
        document.getElementById('btn-save-approval-eval')?.addEventListener('click', handleSaveApproval);
        document.getElementById('btn-quick-approve-all')?.addEventListener('click', () => {
            document.querySelectorAll('.approval-status-select').forEach(sel => sel.value = 'Aprobado');
        });
        document.getElementById('btn-quick-reject-all')?.addEventListener('click', () => {
            document.querySelectorAll('.approval-status-select').forEach(sel => sel.value = 'Rechazado');
            document.querySelectorAll('.approval-qty-input').forEach(inp => inp.value = '0');
        });

        document.getElementById('btn-save-quote')?.addEventListener('click', handleSaveQuote);
        document.getElementById('btn-save-po')?.addEventListener('click', handleSavePo);
        document.getElementById('btn-save-reception')?.addEventListener('click', handleSaveReception);
    }

    // --- HELPERS DE ESTILOS ---
    function getStatusClass(status) {
        switch ((status || '').toLowerCase()) {
            case 'solicitado': return 'status-solicitado';
            case 'en espera de aprobación': return 'status-espera-aprobacion';
            case 'aprobado': return 'status-aprobado';
            case 'aprobado parcial': return 'status-aprobado-parcial';
            case 'en cotización': return 'status-cotizacion';
            case 'cotizado': return 'status-cotizado';
            case 'en compra': return 'status-compra';
            case 'pedido': return 'status-pedido';
            case 'parcialmente recibido': return 'status-parcial-recibido';
            case 'recibido': return 'status-recibido';
            case 'rechazado': return 'status-rechazado';
            case 'cancelado': return 'status-cancelado';
            default: return 'status-solicitado';
        }
    }

    function getPriorityClass(priority) {
        switch ((priority || '').toLowerCase()) {
            case 'urgente': return 'priority-urgente';
            case 'alta': return 'priority-alta';
            case 'baja': return 'priority-baja';
            default: return 'priority-normal';
        }
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
