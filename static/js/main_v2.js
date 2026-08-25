document.addEventListener('DOMContentLoaded', () => {
    const DEVICE_TYPES = ["Switch", "Cámara", "Sensor", "Antena Wi-Fi", "Controladora", "Cableado", "Otro"];
    let stockLimits = {};
    let currentWarehouseFilter = null;
    // --- Auth & Roles ---
    let currentUser = null;
    
    // Check URL parameters for warehouse filter
    const urlParams = new URLSearchParams(window.location.search);
    const urlWh = urlParams.get('warehouse');
    if (urlWh && urlWh !== 'all') {
        currentWarehouseFilter = urlWh;
    }

    async function checkAuth() {
        try {
            const res = await fetch('/api/me');
            if (res.ok) {
                const data = await res.json();
                currentUser = data.user;
                document.getElementById('login-overlay').style.display = 'none';
                document.getElementById('main-app').style.display = 'flex';
                document.getElementById('logged-username').innerText = currentUser.username + ' (' + currentUser.role + ')';
                applyRolePermissions();
                await fetchSettings();
                await fetchStockLimits();
                await fetchCatalog();
                await fetchInactivitySettings();
                await populateSidebarWarehouses();
                await fetchDevices();
                await fetchDecommissions();
                try { loadOperationalTasks(); } catch(e){}
                resetInactivityTimer();
            } else {
                document.getElementById('login-overlay').style.display = 'flex';
                document.getElementById('main-app').style.display = 'none';
            }
        } catch (e) {
            console.error(e);
        }
    }

    document.getElementById('login-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        const errEl = document.getElementById('login-error');
        if (errEl) errEl.style.display = 'none';

        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (res.ok) {
                currentUser = data.user;
                document.getElementById('login-overlay').style.display = 'none';
                document.getElementById('main-app').style.display = 'flex';
                document.getElementById('logged-username').innerText = currentUser.username + ' (' + currentUser.role + ')';
                applyRolePermissions();
                await fetchStockLimits();
                await fetchInactivitySettings();
                await populateSidebarWarehouses();
                await fetchDevices();
                await fetchDecommissions();
                try { loadOperationalTasks(); } catch(e){}
                resetInactivityTimer();
                if (window.showToast) showToast('Bienvenido, ' + currentUser.username, 'success');
            } else {
                if (errEl) {
                    errEl.innerText = data.error || 'Credenciales inválidas';
                    errEl.style.display = 'block';
                }
            }
        } catch (err) {
            if (errEl) {
                errEl.innerText = 'Error de conexión con el servidor';
                errEl.style.display = 'block';
            }
        }
    });

    document.getElementById('btn-logout')?.addEventListener('click', async () => {
        try {
            await fetch('/api/logout', { method: 'POST' });
        } catch(e) {}
        currentUser = null;
        document.getElementById('login-overlay').style.display = 'flex';
        document.getElementById('main-app').style.display = 'none';
    });
    
    function applyRolePermissions() {
        const role = currentUser.role;
        // Hide/Show elements based on role
        const btnNewDevice = document.getElementById('btn-new-device');
        const tabSettings = document.querySelector('[data-tab="settings"]');
        const tabDispatch = document.querySelector('[data-tab="dispatch"]');
        
        if (role === 'Viewer') {
            if(btnNewDevice) btnNewDevice.style.display = 'none';
            if(tabSettings) tabSettings.style.display = 'none';
            if(tabDispatch) tabDispatch.style.display = 'none';
            // Disable action buttons in tables
            document.querySelectorAll('.action-btn').forEach(btn => {
                if (btn.id !== 'btn-logout') btn.style.display = 'none';
            });
        } else if (role === 'Tecnico') {
            if(btnNewDevice) btnNewDevice.style.display = 'block';
            if(tabSettings) tabSettings.style.display = 'none';
            if(tabDispatch) tabDispatch.style.display = 'block';
        } else {
            // Admin
            if(btnNewDevice) btnNewDevice.style.display = 'block';
            if(tabSettings) tabSettings.style.display = 'flex';
            if(tabDispatch) tabDispatch.style.display = 'block';
        }
    }

    document.getElementById('login-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const u = document.getElementById('login-username').value;
        const p = document.getElementById('login-password').value;
        const err = document.getElementById('login-error');
        err.style.display = 'none';
        
        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: u, password: p })
            });
            if (res.ok) {
                document.getElementById('login-form').reset();
                checkAuth();
            } else {
                const d = await res.json();
                err.innerText = d.error || 'Error al iniciar sesión';
                err.style.display = 'block';
            }
        } catch (e) {
            err.innerText = 'Error de conexión';
            err.style.display = 'block';
        }
    });

    document.getElementById('btn-logout')?.addEventListener('click', async () => {
        clearTimeout(inactivityTimer);
        clearInterval(countdownTimer);
        await fetch('/api/logout', { method: 'POST' });
        location.reload();
    });

    // --- Change Password ---
    const passwordModal = document.getElementById('password-modal');
    document.getElementById('btn-change-password')?.addEventListener('click', () => {
        passwordModal.classList.add('active');
    });
    document.getElementById('btn-close-password-modal')?.addEventListener('click', () => {
        passwordModal.classList.remove('active');
        document.getElementById('password-form').reset();
    });
    document.getElementById('btn-cancel-password')?.addEventListener('click', () => {
        passwordModal.classList.remove('active');
        document.getElementById('password-form').reset();
    });
    document.getElementById('password-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const currentPass = document.getElementById('current-password').value;
        const newPass = document.getElementById('new-password').value;
        const confirmPass = document.getElementById('confirm-password').value;
        
        if (newPass !== confirmPass) {
            showToast('Las contraseñas nuevas no coinciden', 'error');
            return;
        }
        if (newPass.length < 6) {
            showToast('La contraseña debe tener al menos 6 caracteres', 'error');
            return;
        }
        
        try {
            const res = await fetch('/api/me/password', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ current_password: currentPass, new_password: newPass })
            });
            const data = await res.json();
            if (res.ok) {
                showToast(data.message, 'success');
                passwordModal.classList.remove('active');
                document.getElementById('password-form').reset();
            } else {
                showToast(data.error, 'error');
            }
        } catch (err) {
            showToast('Error de conexión', 'error');
        }
    });

    // Check auth initially
    checkAuth();

    function getCombinedDeviceTypes() {
        const typesSet = new Set();
        (equipmentCatalog || []).forEach(c => {
            if (c.type && c.type.trim()) {
                typesSet.add(c.type.trim().toUpperCase());
            }
        });
        return Array.from(typesSet).sort();
    }

    function getCombinedCatalogModels() {
        const modelsSet = new Set();
        // 1. Models from predefined catalog
        equipmentCatalog.forEach(c => {
            if (c.brand && c.model) {
                modelsSet.add(`${c.brand} ${c.model}`);
            }
        });
        // 2. Models from database devices
        allDevices.forEach(d => {
            if (d.brand && d.model) {
                modelsSet.add(`${d.brand} ${d.model}`);
            }
        });
        return Array.from(modelsSet).sort();
    }

    function populateCatalogTypeSuggestions() {
        const dl = document.getElementById('catalog-type-suggestions');
        if (!dl) return;
        dl.innerHTML = '';
        const allTypes = getCombinedDeviceTypes();
        allTypes.forEach(type => {
            const opt = document.createElement('option');
            opt.value = type;
            dl.appendChild(opt);
        });
    }

    function populateDeviceTypeDropdown() {
        const typeList = document.getElementById('type-options');
        if (!typeList) return;
        typeList.innerHTML = '';
        const allTypes = getCombinedDeviceTypes();
        allTypes.forEach(type => {
            const opt = document.createElement('option');
            opt.value = type;
            typeList.appendChild(opt);
        });
    }

    async function fetchStockLimits() {
        try {
            const res = await fetch('/api/settings/stock-limits');
            stockLimits = await res.json();
            
            // If empty, initialize stockLimits with default DEVICE_TYPES
            if (Object.keys(stockLimits).length === 0) {
                DEVICE_TYPES.forEach(t => {
                    stockLimits[t] = 0;
                });
            }
            
            renderStockLimitsConfig();
            populateDeviceTypeDropdown();
            populateCatalogTypeSuggestions();
        } catch(e) {
            console.error('Error fetching stock limits:', e);
        }
    }

    function renderStockLimitsConfig() {
        const container = document.getElementById('stock-limits-inputs');
        if (!container) return;
        container.innerHTML = '';
        
        const allModels = getCombinedCatalogModels();
        const warehousesList = allWarehouses.map(w => w.name);
        warehousesList.push('Sin Almacén / Por Defecto');
        
        warehousesList.forEach(warehouseName => {
            const section = document.createElement('div');
            section.className = 'warehouse-limits-group';
            section.style.marginBottom = '28px';
            section.style.borderBottom = '1px solid var(--glass-border)';
            section.style.paddingBottom = '20px';
            
            const h4 = document.createElement('h4');
            h4.style.color = 'var(--primary)';
            h4.style.marginBottom = '16px';
            h4.style.fontSize = '16px';
            h4.style.display = 'flex';
            h4.style.alignItems = 'center';
            h4.style.gap = '8px';
            h4.innerHTML = `<i class="fa-solid fa-warehouse"></i> <span>${warehouseName}</span>`;
            section.appendChild(h4);
            
            const grid = document.createElement('div');
            grid.style.display = 'grid';
            grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(280px, 1fr))';
            grid.style.gap = '16px';
            
            allModels.forEach(modelKey => {
                const limitKey = `${warehouseName} | ${modelKey}`;
                const val = stockLimits[limitKey] || 0;
                
                const itemDiv = document.createElement('div');
                itemDiv.style.display = 'flex';
                itemDiv.style.alignItems = 'center';
                itemDiv.style.justifyContent = 'space-between';
                itemDiv.style.background = 'rgba(255, 255, 255, 0.02)';
                itemDiv.style.padding = '10px 14px';
                itemDiv.style.borderRadius = '8px';
                itemDiv.style.border = '1px solid var(--glass-border)';
                
                itemDiv.innerHTML = `
                    <span style="font-weight: 500; font-size: 13px; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px;" title="${modelKey}">${modelKey}</span>
                    <input type="number" min="0" data-type="${limitKey}" value="${val}" style="width: 70px; padding: 6px 8px; border-radius: 6px; border: 1px solid var(--glass-border); background: var(--bg-dark); color: var(--text-main); text-align: center;">
                `;
                grid.appendChild(itemDiv);
            });
            
            section.appendChild(grid);
            container.appendChild(section);
        });
    }

    async function initApp() {
        try { await fetchSettings(); } catch(e){}
        try { await fetchCatalog(); } catch(e){}
        try { await fetchStockLimits(); } catch(e){}
        try { await fetchDevices(); } catch(e){}
        try { await fetchDecommissions(); } catch(e){}
        try { await loadOperationalTasks(); } catch(e){}
        try { fetchEmailSettings(); } catch(e){}
        try { checkInactivityTasksPopUp(); } catch(e){}
    }

    // --- Navigation & Tabs ---

    function populateWarehouseSubmenu() {
        const submenu = document.getElementById('warehouse-submenu');
        if (!submenu) return;
        submenu.innerHTML = '';
        
        // Option 1: Todos
        const liAll = document.createElement('li');
        liAll.style.padding = '6px 12px';
        liAll.style.fontSize = '13px';
        liAll.style.color = 'var(--text-muted)';
        liAll.style.borderRadius = '8px';
        liAll.style.cursor = 'pointer';
        liAll.style.transition = 'all 0.2s';
        liAll.style.display = 'flex';
        liAll.style.alignItems = 'center';
        liAll.style.gap = '8px';
        liAll.innerHTML = `<i class="fa-solid fa-boxes-stacked" style="font-size: 11px;"></i> <span>Todos</span>`;
        liAll.onclick = (e) => {
            e.stopPropagation();
            window.selectWarehouseFilter(null);
        };
        submenu.appendChild(liAll);
        
        // Option 2: Individual Warehouses
        allWarehouses.forEach(w => {
            const li = document.createElement('li');
            li.style.padding = '6px 12px';
            li.style.fontSize = '13px';
            li.style.color = 'var(--text-muted)';
            li.style.borderRadius = '8px';
            li.style.cursor = 'pointer';
            li.style.transition = 'all 0.2s';
            li.style.display = 'flex';
            li.style.alignItems = 'center';
            li.style.gap = '8px';
            li.innerHTML = `<i class="fa-solid fa-warehouse" style="font-size: 11px;"></i> <span>${w.name}</span>`;
            li.onclick = (e) => {
                e.stopPropagation();
                window.selectWarehouseFilter(w.name);
            };
            submenu.appendChild(li);
        });
    }

    window.selectWarehouseFilter = function(warehouseName) {
        currentWarehouseFilter = warehouseName;
        
        // Update active class on submenu items
        const submenuItems = document.querySelectorAll('#warehouse-submenu li');
        submenuItems.forEach(item => {
            const spanText = item.querySelector('span').textContent;
            if ((warehouseName === null && spanText === 'Todos') || spanText === warehouseName) {
                item.style.background = 'rgba(200, 155, 135, 0.15)';
                item.style.color = 'var(--primary)';
                item.style.border = '1px solid rgba(200, 155, 135, 0.2)';
            } else {
                item.style.background = 'transparent';
                item.style.color = 'var(--text-muted)';
                item.style.border = '1px solid transparent';
            }
        });
        
        // Switch view to general inventory
        document.querySelectorAll('.nav-links > li').forEach(li => li.classList.remove('active'));
        const invTab = document.getElementById('nav-inventory-li');
        if (invTab) invTab.classList.add('active');
        
        document.querySelectorAll('.view-section').forEach(tab => tab.classList.remove('active'));
        document.getElementById('view-inventory').classList.add('active');
        
        // Update Title
        const titleEl = document.getElementById('page-title');
        if (titleEl) {
            titleEl.innerText = warehouseName ? `Inventario: ${warehouseName}` : 'Inventario General';
        }
        
        // Reset search bar
        const searchInput = document.getElementById('search-inventory');
        if (searchInput) searchInput.value = '';
        
        renderInventory();
    };

    const navLinks = document.querySelectorAll('.nav-links li');
    const views = document.querySelectorAll('.view-section');
    const pageTitle = document.getElementById('page-title');

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const tab = link.getAttribute('data-tab');
            if (!tab) return; // Skip submenu items
            
            // Remove active from all top-level tab links
            document.querySelectorAll('.nav-links > li').forEach(n => n.classList.remove('active'));
            views.forEach(v => v.classList.remove('active'));
            
            // Add active to clicked
            link.classList.add('active');
            document.getElementById(`view-${tab}`).classList.add('active');
            
            // Update Title
            if(tab === 'dashboard') pageTitle.innerText = 'Dashboard';
            if(tab === 'inventory') {
                currentWarehouseFilter = null;
                pageTitle.innerText = 'Inventario General';
                document.getElementById('search-inventory').value = '';
                
                // Clear active style on all submenu items
                const submenuItems = document.querySelectorAll('#warehouse-submenu li');
                submenuItems.forEach(item => {
                    item.style.background = 'transparent';
                    item.style.color = 'var(--text-muted)';
                    item.style.border = '1px solid transparent';
                });
                
                renderInventory();
            }
            if(tab === 'decommission') pageTitle.innerText = 'Hoja de Decomiso';
            if(tab === 'warranties') pageTitle.innerText = 'Garantías y Reparaciones';
            if(tab === 'dispatch') {
                pageTitle.innerText = 'Despachar Equipo';
                initDispatchModule();
            }
            if(tab === 'operational-tasks') {
                pageTitle.innerText = 'Pendientes y Seguimiento Operativo';
                loadOperationalTasks();
            }
            if(tab === 'settings') pageTitle.innerText = 'Configuración';
        });
    });

    document.getElementById('nav-inventory-trigger')?.addEventListener('click', (e) => {
        const submenu = document.getElementById('warehouse-submenu');
        const submenuArrow = document.getElementById('submenu-arrow');
        if (submenu) {
            const isVisible = submenu.style.display === 'flex';
            submenu.style.display = isVisible ? 'none' : 'flex';
            if (submenuArrow) {
                submenuArrow.style.transform = isVisible ? 'rotate(0deg)' : 'rotate(180deg)';
            }
        }
    });

    // --- Settings Sub-Tabs ---
    const settingsTabs = document.querySelectorAll('.settings-tabs .tab-btn');
    const settingsCards = document.querySelectorAll('.settings-content-area .settings-card');
    settingsTabs.forEach(btn => {
        btn.addEventListener('click', () => {
            // Reset styles
            settingsTabs.forEach(b => b.classList.remove('active'));
            // Set active style
            btn.classList.add('active');
            
            // Hide all cards
            settingsCards.forEach(c => c.style.display = 'none');
            
            // Show target
            const target = btn.getAttribute('data-target');
            document.getElementById(`settings-tab-${target}`).style.display = 'block';
        });
    });


    // --- Modal Handling ---
    const modal = document.getElementById('device-modal');
    const btnNewDevice = document.getElementById('btn-new-device');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const btnCancel = document.getElementById('btn-cancel');
    const deviceForm = document.getElementById('device-form');

    async function saveCatalogEntryQuick(entry) {
        try {
            await fetch('/api/settings/catalog', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(entry)
            });
            const res = await fetch('/api/settings/catalog');
            if (res.ok) {
                equipmentCatalog = await res.json();
                if (typeof renderCatalogConfig === 'function') renderCatalogConfig(equipmentCatalog);
                if (typeof renderCatalogList === 'function') renderCatalogList();
            }
        } catch (e) {
            console.error("Error saving catalog entry:", e);
        }
    }

    function populateDeviceTypeDropdown(selectedType = null) {
        const typeSelect = document.getElementById('device-type');
        if (!typeSelect) return;
        
        const currentVal = selectedType || typeSelect.value;
        typeSelect.innerHTML = '<option value="" disabled selected>Selecciona una categoría del catálogo...</option>';
        
        const allTypes = getCombinedDeviceTypes();
        allTypes.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            if (t === currentVal) opt.selected = true;
            typeSelect.appendChild(opt);
        });
        
        const newOpt = document.createElement('option');
        newOpt.value = '__new__';
        newOpt.textContent = '+ Agregar nuevo tipo...';
        newOpt.style.fontWeight = 'bold';
        newOpt.style.color = '#2563eb';
        typeSelect.appendChild(newOpt);
        
        if (currentVal && allTypes.includes(currentVal)) {
            typeSelect.value = currentVal;
        }
    }

    function updateBrandModelSuggestions(selectedBrand = null, selectedModel = null) {
        const typeSelect = document.getElementById('device-type');
        const brandList = document.getElementById('list-brands-devices');
        const modelList = document.getElementById('list-models-devices');
        const brandInp = document.getElementById('device-brand');
        const modelInp = document.getElementById('device-model');
        
        if (!typeSelect) return;
        const type = (typeSelect.value || '').trim();
        const typeUpper = type.toUpperCase();

        // 1. Datalist Brands
        if (brandList) {
            brandList.innerHTML = '';
            const matchingBrands = [...new Set(
                equipmentCatalog
                    .filter(c => !typeUpper || (c.type && c.type.trim().toUpperCase() === typeUpper))
                    .map(c => (c.brand || '').trim())
                    .filter(Boolean)
            )].sort();

            matchingBrands.forEach(b => {
                const opt = document.createElement('option');
                opt.value = b;
                brandList.appendChild(opt);
            });
        }

        // 2. Datalist Models
        if (modelList) {
            modelList.innerHTML = '';
            const currentBrand = ((selectedBrand !== null ? selectedBrand : (brandInp ? brandInp.value : '')) || '').trim().toUpperCase();
            const matchingModels = [...new Set(
                equipmentCatalog
                    .filter(c => (!typeUpper || (c.type && c.type.trim().toUpperCase() === typeUpper)) &&
                                 (!currentBrand || (c.brand && c.brand.trim().toUpperCase() === currentBrand)))
                    .map(c => (c.model || '').trim())
                    .filter(Boolean)
            )].sort();

            matchingModels.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m;
                modelList.appendChild(opt);
            });
        }

        if (selectedBrand !== null && brandInp) brandInp.value = selectedBrand;
        if (selectedModel !== null && modelInp) modelInp.value = selectedModel;
    }

    async function populateProvidersDropdownForDevice(selectedProv = '') {
        const provSelect = document.getElementById('device-provider');
        if (!provSelect) return;
        try {
            const res = await fetch('/api/settings/providers');
            if (res.ok) {
                const providers = await res.json();
                provSelect.innerHTML = '<option value="">-- Sin Proveedor Asignado / Opcional --</option>';
                providers.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p.name;
                    opt.textContent = p.name + (p.rnc ? ` [RNC: ${p.rnc}]` : '');
                    if (selectedProv && (p.name.trim().toLowerCase() === selectedProv.trim().toLowerCase())) {
                        opt.selected = true;
                    }
                    provSelect.appendChild(opt);
                });
                if (selectedProv) {
                    provSelect.value = selectedProv;
                }
            }
        } catch(e) {
            console.error("Error loading providers for device modal:", e);
        }
    }

    // Button + Proveedor in device modal
    document.getElementById('btn-device-open-new-provider')?.addEventListener('click', () => {
        if (typeof window.openProviderModal === 'function') {
            window.openProviderModal('add', null, '', (newProv) => {
                if (newProv && newProv.name) {
                    populateProvidersDropdownForDevice(newProv.name);
                }
            });
        }
    });

    function syncDeviceCostAndTotal() {
        const costInp = document.getElementById('device-cost-price');
        const qtyInp = document.getElementById('device-quantity');
        const totalValInp = document.getElementById('device-value');
        const unitPriceInp = document.getElementById('device-unit-price');

        const cost = parseFloat(costInp?.value) || 0.0;
        const qty = parseInt(qtyInp?.value) || 1;
        const total = cost * qty;

        if (totalValInp) totalValInp.value = total.toFixed(2);
        if (unitPriceInp) unitPriceInp.value = cost.toFixed(2);
    }

    // Attach real-time input listeners for pricing
    document.getElementById('device-cost-price')?.addEventListener('input', syncDeviceCostAndTotal);
    document.getElementById('device-quantity')?.addEventListener('input', syncDeviceCostAndTotal);

    document.getElementById('device-brand')?.addEventListener('input', () => updateBrandModelSuggestions());
    document.getElementById('device-type')?.addEventListener('change', (e) => {
        if (e.target.value === '__new__') {
            quickAddType();
        } else {
            updateBrandModelSuggestions();
        }
    });

    async function quickAddType() {
        const newType = prompt("Ingrese el nombre del nuevo Tipo de Equipo (ej: FIREWALL, ACCESS POINT, SWITCH):");
        if (!newType || !newType.trim()) {
            populateDeviceTypeDropdown();
            return;
        }
        const cleanType = newType.trim().toUpperCase();
        await saveCatalogEntryQuick({ type: cleanType, brand: '', model: '' });
        populateDeviceTypeDropdown(cleanType);
        updateBrandModelSuggestions();
    }

    function populateWarehouseDropdown(selectedVal = null) {
        const sel = document.getElementById('device-warehouse');
        if (!sel || sel.tagName !== 'SELECT') return;
        sel.innerHTML = '<option value="" disabled selected>Selecciona un almacén...</option>';
        (allWarehouses || []).forEach(w => {
            const opt = document.createElement('option');
            opt.value = w.name;
            opt.innerText = w.name;
            if (selectedVal && (w.name.trim().toUpperCase() === selectedVal.trim().toUpperCase())) {
                opt.selected = true;
            }
            sel.appendChild(opt);
        });
        if (selectedVal) {
            sel.value = selectedVal;
        }
    }

    async function openModal(mode = 'add', device = null) {
        try {
            const res = await fetch('/api/settings/catalog');
            if (res.ok) equipmentCatalog = await res.json();
        } catch(e){}
        
        modal.classList.add('active');
        populateDeviceTypeDropdown(device ? device.type : null);
        
        const statusSelect = document.getElementById('device-status');
        const dispatchedOption = statusSelect ? statusSelect.querySelector('option[value="Despachado / Instalado"]') : null;
        
        if (mode === 'add') {
            document.getElementById('modal-title').innerHTML = '<i class="fa-solid fa-box" style="color: var(--color-primary);"></i><span>Registrar Artículo</span>';
            deviceForm.reset();
            populateWarehouseDropdown();
            document.getElementById('device-id').value = '';
            document.getElementById('device-sku').value = '';
            document.getElementById('device-quantity').value = 1;
            document.getElementById('device-min-stock').value = 3;
            document.getElementById('device-cost-price').value = '';
            document.getElementById('device-value').value = '0.00';
            
            populateProvidersDropdownForDevice('');
            updateBrandModelSuggestions();
            syncDeviceCostAndTotal();
            
            if (dispatchedOption) {
                dispatchedOption.style.display = 'none';
                dispatchedOption.disabled = true;
            }
        } else if (mode === 'edit' && device) {
            if (dispatchedOption) {
                dispatchedOption.style.display = 'block';
                dispatchedOption.disabled = false;
            }
            document.getElementById('modal-title').innerHTML = `<i class="fa-solid fa-pen-to-square" style="color: var(--color-primary);"></i><span>Editar Artículo: ${escapeHtml(device.name)}</span>`;
            document.getElementById('device-id').value = device.id;
            document.getElementById('device-sku').value = device.sku || `EQ-${device.id}`;
            document.getElementById('device-name').value = device.name || '';
            document.getElementById('device-type').value = device.type || '';
            document.getElementById('device-brand').value = device.brand || '';
            document.getElementById('device-model').value = device.model || '';
            document.getElementById('device-serial').value = device.serial_number || '';
            document.getElementById('device-mac').value = device.mac_address || '';
            document.getElementById('device-description').value = device.description || '';
            document.getElementById('device-status').value = device.status || 'En Stock';
            
            const qty = parseInt(device.quantity) || 1;
            const costVal = parseFloat(device.cost_price) || (device.value ? (device.value / qty) : 0.0);
            const totalVal = parseFloat(device.value) || (costVal * qty);
            
            document.getElementById('device-quantity').value = qty;
            document.getElementById('device-min-stock').value = device.min_stock || 0;
            document.getElementById('device-cost-price').value = costVal > 0 ? costVal.toFixed(2) : '';
            document.getElementById('device-value').value = totalVal.toFixed(2);
            
            populateWarehouseDropdown(device.warehouse || '');
            populateProvidersDropdownForDevice(device.provider || device.warranty_provider || '');
            updateBrandModelSuggestions(device.brand, device.model);
            
            document.getElementById('device-location').value = device.location || '';
            document.getElementById('device-dispatched-by').value = device.dispatched_by || '';
            
            syncDeviceCostAndTotal();
        }
        toggleDynamicFields();
    }

    function toggleDynamicFields() {
        const status = document.getElementById('device-status').value;
        const groupWarehouse = document.getElementById('group-warehouse');
        const groupLocation = document.getElementById('group-location');
        const whInput = document.getElementById('device-warehouse');
        const locInput = document.getElementById('device-location');
        const dispInput = document.getElementById('device-dispatched-by');
        
        const isStock = status === 'En Stock' || status === 'Reparado';
        const isDeployed = status === 'Despachado / Instalado';
        
        if (groupWarehouse) {
            groupWarehouse.style.display = isStock ? 'block' : 'none';
        }
        if (whInput) whInput.required = isStock;

        if (groupLocation) {
            groupLocation.style.display = isDeployed ? 'block' : 'none';
        }
        if (locInput) locInput.required = isDeployed;
        
        if (document.getElementById('group-dispatched-by')) {
            document.getElementById('group-dispatched-by').style.display = isDeployed ? 'block' : 'none';
        }
        if (dispInput) dispInput.required = isDeployed;
    }

    document.getElementById('device-status')?.addEventListener('change', toggleDynamicFields);

    function closeModal() {
        modal.classList.remove('active');
        deviceForm.reset();
    }

    btnNewDevice.addEventListener('click', () => openModal('add'));
    btnCloseModal.addEventListener('click', closeModal);
    btnCancel.addEventListener('click', closeModal);

    let allDevices = [];
    let allDecommissions = [];
    let allWarehouses = [];
    let allHotels = [];
    let allTechnicians = [];
    let equipmentCatalog = [];

    async function populateSidebarWarehouses() {
        const container = document.getElementById('sidebar-sub-items');
        if (!container) return;
        try {
            const res = await fetch('/api/settings/warehouses');
            if (!res.ok) return;
            allWarehouses = await res.json();
            
            const urlParams = new URLSearchParams(window.location.search);
            const activeWh = urlParams.get('warehouse') || 'all';

            let html = `
                <a href="/inventario?warehouse=all" class="nav-sub-item ${activeWh === 'all' ? 'active' : ''}" style="color: var(--color-text-secondary); text-decoration: none; font-size: 14px; display: flex; align-items: center; gap: 8px;">
                    <span style="width: 6px; height: 6px; background: ${activeWh === 'all' ? 'var(--color-primary)' : 'currentColor'}; border-radius: 50%;"></span> Todos
                </a>
            `;

            allWarehouses.forEach(w => {
                const isSelected = activeWh === w.name;
                html += `
                    <a href="/inventario?warehouse=${encodeURIComponent(w.name)}" class="nav-sub-item ${isSelected ? 'active' : ''}" style="color: var(--color-text-secondary); text-decoration: none; font-size: 14px; display: flex; align-items: center; gap: 8px;">
                        <span style="width: 6px; height: 6px; background: ${isSelected ? 'var(--color-primary)' : 'currentColor'}; border-radius: 50%;"></span> ${escapeHtml(w.name)}
                    </a>
                `;
            });
            container.innerHTML = html;
        } catch (e) {
            console.error('Error populating sidebar warehouses:', e);
        }
    }

    async function fetchCatalog() {
        try {
            const res = await fetch('/api/settings/catalog');
            equipmentCatalog = await res.json();
            renderCatalogList();
            populateCatalogTypeSuggestions();
            renderStockLimitsConfig();
            populateDeviceTypeDropdown();
        } catch(e) {
            console.error('Error fetching catalog:', e);
        }
    }

    function renderCatalogList() {
        const tbody = document.getElementById('settings-catalog-list');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (equipmentCatalog.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted);">No hay modelos registrados en el catálogo.</td></tr>';
            return;
        }
        const sortedCatalog = [...equipmentCatalog].sort((a, b) => {
            if (a.type !== b.type) return a.type.localeCompare(b.type);
            if (a.brand !== b.brand) return a.brand.localeCompare(b.brand);
            return a.model.localeCompare(b.model);
        });
        sortedCatalog.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${item.type}</strong></td>
                <td>${item.brand}</td>
                <td>${item.model}</td>
                <td style="text-align: right;">
                    <button class="action-btn delete" title="Eliminar del Catálogo" onclick="window.deleteCatalogEntry('${item.type}', '${item.brand}', '${item.model}')">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    window.deleteCatalogEntry = async function(type, brand, model) {
        if (!confirm(`¿Seguro que deseas eliminar "${brand} ${model}" (${type}) del catálogo?`)) return;
        try {
            const res = await fetch('/api/settings/catalog/delete', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ type, brand, model })
            });
            if (res.ok) {
                showToast('Modelo eliminado del catálogo', 'success');
                await fetchCatalog();
                updateBrandModelSuggestions();
            } else {
                const data = await res.json();
                showToast(data.error || 'Error al eliminar', 'error');
            }
        } catch(err) {
            showToast('Error de conexión', 'error');
        }
    };

    document.getElementById('form-add-catalog')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const typeSelect = document.getElementById('input-catalog-type');
        const brandInput = document.getElementById('input-catalog-brand');
        const modelInput = document.getElementById('input-catalog-model');
        const type = typeSelect.value;
        const brand = brandInput.value.trim();
        const model = modelInput.value.trim();
        if (!type || !brand || !model) {
            showToast('Por favor completa todos los campos', 'warning');
            return;
        }
        try {
            const res = await fetch('/api/settings/catalog', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ type, brand, model })
            });
            if (res.ok) {
                showToast('Modelo agregado al catálogo', 'success');
                brandInput.value = '';
                modelInput.value = '';
                await fetchCatalog();
                updateBrandModelSuggestions();
            } else {
                const data = await res.json();
                showToast(data.error || 'Error al guardar', 'error');
            }
        } catch(err) {
            showToast('Error de red', 'error');
        }
    });

    async function fetchDevices() {
        try {
            const response = await fetch('/api/devices');
            allDevices = await response.json();
            try { renderDashboard(); } catch(e) { console.warn(e); }
            try { renderInventory(); } catch(e) { console.warn(e); }
            try { renderWarranties(); } catch(e) { console.warn(e); }
            try { updateBrandModelSuggestions(); } catch(e) {}
            try { populateDeviceTypeDropdown(); } catch(e) {}
            try { populateCatalogTypeSuggestions(); } catch(e) {}
        } catch (error) {
            showToast('Error cargando equipos', 'error');
        }
    }

    async function fetchDecommissions() {
        try {
            const response = await fetch('/api/decommissions');
            allDecommissions = await response.json();
            try { renderDecommission(); } catch(e) {}
        } catch (error) {
            showToast('Error cargando decomisos', 'error');
        }
    }

    function formatCurrency(val) {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
    }

    function renderDashboard() {
        const stock = allDevices.filter(d => d.status === 'En Stock' || d.status === 'Reparado').reduce((sum, d) => sum + (d.quantity || 1), 0);
        const deployed = allDevices.filter(d => d.status === 'Despachado / Instalado').reduce((sum, d) => sum + (d.quantity || 1), 0);
        const damaged = allDevices.filter(d => d.status === 'Averiado').reduce((sum, d) => sum + (d.quantity || 1), 0);
        const repaired = allDevices.filter(d => d.status === 'Reparado').reduce((sum, d) => sum + (d.quantity || 1), 0);
        const inRepair = allDevices.filter(d => d.status === 'En Reparación / Garantía' || d.status === 'Reparación / Garantía').reduce((sum, d) => sum + (d.quantity || 1), 0);

        document.getElementById('stat-stock').innerText = stock;
        document.getElementById('stat-deployed').innerText = deployed;
        document.getElementById('stat-damaged').innerText = damaged;
        if(document.getElementById('stat-repaired')) document.getElementById('stat-repaired').innerText = repaired;
        if(document.getElementById('stat-repair')) document.getElementById('stat-repair').innerText = inRepair;

        // Populate Stock Summary by Brand and Model
        const stockDevices = allDevices.filter(d => d.status === 'En Stock' || d.status === 'Reparado');

        // Calculate total stock counts by warehouse name + brand + model key
        const warehouseModelStockCounts = {};
        stockDevices.forEach(d => {
            if (d.brand && d.model) {
                const w = d.warehouse && d.warehouse.trim() !== '' ? d.warehouse : 'Sin Almacén / Por Defecto';
                const key = `${w} | ${d.brand} ${d.model}`;
                if (!warehouseModelStockCounts[key]) warehouseModelStockCounts[key] = 0;
                warehouseModelStockCounts[key] += (d.quantity || 1);
            }
        });

        // Check stock limits and prepare warnings (configured per warehouse + model key)
        const lowStockAlerts = [];
        for (const [limitKey, limit] of Object.entries(stockLimits)) {
            const minLimit = parseInt(limit) || 0;
            if (minLimit > 0) {
                const currentCount = warehouseModelStockCounts[limitKey] || 0;
                if (currentCount <= minLimit) {
                    const parts = limitKey.split(' | ');
                    let warehouse = 'Sin Almacén / Por Defecto';
                    let model = limitKey;
                    if (parts.length > 1) {
                        warehouse = parts[0];
                        model = parts.slice(1).join(' | ');
                    }
                    lowStockAlerts.push({
                        warehouse: warehouse,
                        model: model,
                        actual: currentCount,
                        limit: minLimit
                    });
                }
            }
        }

        // Update Stock Crítico KPI card count
        const statCriticalCount = document.getElementById('stat-critical-count');
        if (statCriticalCount) {
            statCriticalCount.innerText = lowStockAlerts.length;
            const card = statCriticalCount.closest('.stat-card');
            if (card) {
                if (lowStockAlerts.length > 0) {
                    card.style.boxShadow = '0 0 15px rgba(239, 68, 68, 0.2)';
                    card.style.borderColor = 'rgba(239, 68, 68, 0.4)';
                } else {
                    card.style.boxShadow = 'none';
                    card.style.borderColor = 'rgba(239, 68, 68, 0.15)';
                }
            }
        }

        window.activeLowStockAlerts = lowStockAlerts;
        
        
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
                            cutout: "75%",
            responsive: true,
            maintainAspectRatio: false,
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


        const stockSummary = {};
        stockDevices.forEach(d => {
            const b = d.brand && d.brand.trim() !== '' ? d.brand : 'Sin Marca';
            const m = d.model && d.model.trim() !== '' ? d.model : 'Sin Modelo';
            const w = d.warehouse && d.warehouse.trim() !== '' ? d.warehouse : 'Sin Almacén';
            const key = `${d.type}|${b}|${m}|${w}`;
            if (!stockSummary[key]) {
                stockSummary[key] = { type: d.type, brand: b, model: m, warehouse: w, count: 0 };
            }
            stockSummary[key].count += (d.quantity || 1);
        });

        const summaryArray = Object.values(stockSummary).sort((a, b) => {
            if (a.type !== b.type) return a.type.localeCompare(b.type);
            if (a.brand !== b.brand) return a.brand.localeCompare(b.brand);
            if (a.model !== b.model) return a.model.localeCompare(b.model);
            return a.warehouse.localeCompare(b.warehouse);
        });

        const summaryTbody = document.getElementById('stock-summary-table');
        if (summaryTbody) {
            summaryTbody.innerHTML = '';
            summaryArray.forEach(s => {
                const limitKey = `${s.warehouse} | ${s.brand} ${s.model}`;
                const minLimit = parseInt(stockLimits[limitKey]) || 0;
                const isLow = minLimit > 0 && s.count <= minLimit;

                const warningTag = isLow 
                    ? `<span style="display:inline-block; margin-left: 8px; color: #ef4444;" title="Stock bajo el mínimo configurado (${minLimit})"><i class="fa-solid fa-triangle-exclamation"></i></span>` 
                    : '';

                const tr = document.createElement('tr');
                if (isLow) {
                    tr.style.background = 'rgba(239, 68, 68, 0.04)';
                }
                tr.innerHTML = `
                    <td>${s.type}${warningTag}</td>
                    <td>${s.brand} / ${s.model}</td>
                    <td>${s.warehouse}</td>
                    <td style="font-size: 16px; ${isLow ? 'color: #ef4444; font-weight: bold;' : ''}"><strong>${s.count}</strong></td>
                `;
                summaryTbody.appendChild(tr);
            });
        }

        const tbody = document.getElementById('recent-devices-table');
        if (tbody) {
            tbody.innerHTML = '';
            
            // Show last 5
            const recent = [...allDevices].reverse().slice(0, 5);
            recent.forEach(d => {
                const isRepaired = (d.repair_count && d.repair_count > 0) || d.status === 'Reparado';
                const repairTag = isRepaired 
                    ? `<span style="font-size: 11px; margin-left: 6px; background: rgba(139, 92, 246, 0.15); color: #8b5cf6; padding: 2px 6px; border-radius: 12px;"><i class="fa-solid fa-wrench"></i> x${Math.max(d.repair_count || 1, 1)}</span>` 
                    : '';
                    
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${d.name}</strong> ${repairTag}</td>
                    <td>${d.type}</td>
                    <td>${d.brand || '-'} / ${d.model || '-'}</td>
                    <td><span class="status-badge ${getStatusClass(d.status)}">${d.status}</span></td>
                    <td>${d.date_added.split(' ')[0]}</td>
                `;
                tbody.appendChild(tr);
            });
        }
    }

    function getIconForType(type) {
        const t = type.toLowerCase();
        if (t.includes('switch')) return 'fa-solid fa-network-wired';
        if (t.includes('cámara') || t.includes('camara')) return 'fa-solid fa-video';
        if (t.includes('sensor')) return 'fa-solid fa-gauge-high';
        if (t.includes('antena') || t.includes('wi-fi') || t.includes('wifi')) return 'fa-solid fa-wifi';
        if (t.includes('controladora')) return 'fa-solid fa-gamepad';
        if (t.includes('cable') || t.includes('bobina')) return 'fa-solid fa-circle-nodes';
        if (t.includes('router') || t.includes('firewall')) return 'fa-solid fa-server';
        return 'fa-solid fa-box';
    }

    window.filterInventoryByType = function(type) {
        const searchInput = document.getElementById('search-inventory');
        if (searchInput) {
            if (searchInput.value.toLowerCase().trim() === type.toLowerCase().trim()) {
                searchInput.value = '';
            } else {
                searchInput.value = type;
            }
            searchInput.dispatchEvent(new Event('input'));
        }
    };

    function renderInventoryTypeStats(devices) {
        const container = document.getElementById('inventory-type-stats');
        if (!container) return;
        const typeCounts = {};
        devices.forEach(d => {
            const t = d.type || 'Otro';
            if (!typeCounts[t]) typeCounts[t] = 0;
            typeCounts[t] += (d.quantity || 1);
        });
        const sortedTypes = Object.keys(typeCounts).filter(t => t !== 'Otro').sort();
        if (typeCounts['Otro']) {
            sortedTypes.push('Otro');
        }
        container.innerHTML = '';
        sortedTypes.forEach(type => {
            const count = typeCounts[type];
            const card = document.createElement('div');
            card.className = 'stat-card glass-panel';
            card.style.padding = '12px 16px';
            card.style.minWidth = '140px';
            card.style.flex = '1';
            card.style.display = 'flex';
            card.style.alignItems = 'center';
            card.style.gap = '12px';
            card.style.cursor = 'pointer';
            card.style.transition = 'transform 0.2s, box-shadow 0.2s, background 0.2s';
            const searchInput = document.getElementById('search-inventory');
            const isActive = searchInput && searchInput.value.toLowerCase().trim() === type.toLowerCase().trim();
            if (isActive) {
                card.style.border = '1px solid var(--primary)';
                card.style.background = 'rgba(139, 92, 246, 0.08)';
            }
            card.title = `Filtrar por ${type}`;
            card.onclick = () => window.filterInventoryByType(type);
            const iconClass = getIconForType(type);
            card.innerHTML = `
                <div class="stat-icon" style="background: rgba(139, 92, 246, 0.15); color: #8b5cf6; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border-radius: 8px; font-size: 16px;">
                    <i class="${iconClass}"></i>
                </div>
                <div class="stat-info" style="display: flex; flex-direction: column;">
                    <span style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; font-weight: 600; white-space: nowrap;">${type}</span>
                    <span style="font-size: 18px; font-weight: 700; color: var(--text-color); line-height: 1.2;">${count}</span>
                </div>
            `;
            container.appendChild(card);
        });
    }

    function renderInventory(searchTerm = '') {
        const urlParams = new URLSearchParams(window.location.search);
        const urlStatus = urlParams.get('status');
        const urlCritical = urlParams.get('critical') === 'true';
        const urlWarehouse = urlParams.get('warehouse');

        if (!searchTerm && urlStatus) {
            searchTerm = urlStatus;
            const searchInp = document.getElementById('search-inventory');
            if (searchInp && !searchInp.value) searchInp.value = urlStatus;
        }

        let activeWarehouse = (urlWarehouse !== null ? urlWarehouse : (typeof currentWarehouseFilter !== 'undefined' ? currentWarehouseFilter : null));
        if (activeWarehouse === 'all' || activeWarehouse === '' || activeWarehouse === 'null') {
            activeWarehouse = null;
        }

        let devicesToRender = allDevices;
        if (activeWarehouse) {
            devicesToRender = allDevices.filter(d => 
                (d.status === 'En Stock' || d.status === 'Reparado') && 
                (d.warehouse || '').trim().toUpperCase() === activeWarehouse.trim().toUpperCase()
            );
        }

        if (urlCritical) {
            // Filtrar tipos de equipos cuyo stock actual esté <= límite configurado
            const typeCounts = {};
            allDevices.filter(d => d.status === 'En Stock' || d.status === 'Reparado').forEach(d => {
                const t = (d.type || '').trim();
                typeCounts[t] = (typeCounts[t] || 0) + (d.quantity || 1);
            });
            const criticalTypes = Object.keys(stockLimits).filter(type => {
                const limit = stockLimits[type] || 0;
                const count = typeCounts[type] || 0;
                return count <= limit;
            });
            devicesToRender = devicesToRender.filter(d => criticalTypes.includes((d.type || '').trim()));
        }
        
        renderInventoryTypeStats(devicesToRender);
        const tbody = document.getElementById('inventory-table');
        if (!tbody) return;
        tbody.innerHTML = '';
        const st = searchTerm.toLowerCase().trim();
        const filtered = devicesToRender.filter(d => {
            let matchStatus = d.status.toLowerCase().includes(st);
            if (st === 'en stock' && d.status === 'Reparado') matchStatus = true;
            
            return (d.name.toLowerCase().includes(st) || 
             d.type.toLowerCase().includes(st) ||
             (d.brand && d.brand.toLowerCase().includes(st)) ||
             (d.serial_number && d.serial_number.toLowerCase().includes(st)) ||
             matchStatus);
        });

        filtered.forEach(d => {
            const isRepaired = (d.repair_count && d.repair_count > 0) || d.status === 'Reparado';
            const repairTag = isRepaired 
                ? `<span style="font-size: 11px; margin-left: 6px; background: rgba(139, 92, 246, 0.15); color: #8b5cf6; padding: 2px 6px; border-radius: 12px;"><i class="fa-solid fa-wrench"></i> x${Math.max(d.repair_count || 1, 1)}</span>` 
                : '';
                
            let locationOrWarehouse = '-';
            if (d.status === 'Despachado / Instalado' && d.location) {
                locationOrWarehouse = `<i class="fa-solid fa-location-dot"></i> ${d.location}`;
                if (d.dispatched_by) {
                    locationOrWarehouse += `<br><small style="color:var(--text-muted)">Por: ${d.dispatched_by}</small>`;
                }
            } else if ((d.status === 'En Stock' || d.status === 'Reparado') && d.warehouse) {
                locationOrWarehouse = `<i class="fa-solid fa-boxes-stacked"></i> ${d.warehouse}`;
            }

            // Check Low Stock Alert
            const isStockState = (d.status === 'En Stock' || d.status === 'Reparado');
            let isLowStock = false;
            let minLimit = 0;
            let totalModelQty = 0;

            if (isStockState) {
                const wh = (d.warehouse || '').trim();
                const brand = (d.brand || '').trim();
                const model = (d.model || '').trim();
                minLimit = getMinStockLimit(wh, brand, model);

                allDevices.forEach(other => {
                    if ((other.status === 'En Stock' || other.status === 'Reparado') &&
                        (other.brand || '').trim().toUpperCase() === brand.toUpperCase() &&
                        (other.model || '').trim().toUpperCase() === model.toUpperCase() &&
                        (!wh || (other.warehouse || '').trim().toUpperCase() === wh.toUpperCase())) {
                        totalModelQty += (other.quantity || 1);
                    }
                });

                if (minLimit > 0 && totalModelQty <= minLimit) {
                    isLowStock = true;
                }
            }

            const qtyDisplay = isLowStock
                ? `<span style="display: inline-flex; align-items: center; justify-content: center; gap: 4px; color: #ef4444; font-weight: 700; background: rgba(239, 68, 68, 0.12); padding: 3px 8px; border-radius: 6px; border: 1px solid rgba(239, 68, 68, 0.35);" title="¡ALERTA STOCK BAJO! Stock actual: ${totalModelQty} (Mínimo: ${minLimit})"><i class="fa-solid fa-triangle-exclamation"></i> ${d.quantity || 1}</span>`
                : `${d.quantity || 1}`;

            const lowStockBadge = isLowStock
                ? `<div style="margin-top: 4px;"><span style="display: inline-flex; align-items: center; gap: 4px; background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.4); padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700;" title="Stock bajo el límite (${totalModelQty}/${minLimit})"><i class="fa-solid fa-triangle-exclamation"></i> Stock Bajo</span></div>`
                : '';

            const tr = document.createElement('tr');
            if (isLowStock) {
                tr.style.backgroundColor = 'rgba(239, 68, 68, 0.03)';
            }
            const totalVal = parseFloat(d.value) || 0;
            const qty = parseInt(d.quantity) || 1;
            const unitVal = qty > 0 ? (totalVal / qty) : totalVal;
            const valueDisplay = qty > 1 
                ? `<strong>${formatCurrency(totalVal)}</strong><br><small style="color:var(--color-text-secondary); font-size:11px;">(${formatCurrency(unitVal)} c/u)</small>`
                : `<strong>${formatCurrency(totalVal)}</strong>`;

            tr.innerHTML = `
                <td>#${d.id}</td>
                <td><strong>${d.name}</strong> ${repairTag}</td>
                <td style="text-align: center; font-weight: 600;">${qtyDisplay}</td>
                <td>${d.type}</td>
                <td>${d.brand || '-'} / ${d.model || '-'}</td>
                <td><small>MAC: ${d.mac_address || '-'}<br>S/N: ${d.serial_number || '-'}</small></td>
                <td>${locationOrWarehouse}</td>
                <td>${valueDisplay}</td>
                <td><span class="status-badge ${getStatusClass(d.status)}">${d.status}</span>${lowStockBadge}</td>
                <td>
                    <button class="action-btn edit" title="Editar" onclick="window.editDevice(${d.id})"><i class="fa-solid fa-pen"></i></button>
                    ${d.status === 'Averiado' ? `<button class="action-btn" style="color: #f59e0b" title="Enviar a Reparación / Garantía" onclick="window.moveToRepair(${d.id})"><i class="fa-solid fa-screwdriver-wrench"></i></button>` : ''}
                    ${d.status === 'Averiado' || d.status === 'Reparación / Garantía' ? `<button class="action-btn" style="color: var(--danger)" title="Mover a Decomiso" onclick="window.moveToDecommission(${d.id})"><i class="fa-solid fa-dumpster-fire"></i></button>` : ''}
                    ${d.status === 'Despachado / Instalado' ? `<button class="action-btn" style="color: #10b981" title="Retornar a Almacén (Devolución)" onclick="window.returnToWarehouse(${d.id})"><i class="fa-solid fa-reply"></i></button>` : ''}
                    <button class="action-btn delete" title="Eliminar" onclick="window.deleteDevice(${d.id})"><i class="fa-solid fa-trash"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    let currentDecommissionHotelFilter = 'all';

    function renderDecommission() {
        const tbody = document.getElementById('decommission-table');

        let filtered = allDecommissions;
        if (currentDecommissionHotelFilter !== 'all') {
            filtered = allDecommissions.filter(d => d.hotel === currentDecommissionHotelFilter);
        }

        const lostValue = filtered.reduce((sum, d) => sum + d.value, 0);
        document.getElementById('stat-decommission-value').innerText = formatCurrency(lostValue);

        tbody.innerHTML = '';
        
        filtered.forEach(d => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>#${d.id}</td>
                <td><strong>${d.name}</strong></td>
                <td style="text-align: center; font-weight: 600;">${d.quantity || 1}</td>
                <td>${d.type}</td>
                <td>${d.hotel || '-'}</td>
                <td>${d.reason}</td>
                <td style="color: var(--danger); font-weight:600;">${formatCurrency(d.value)}</td>
                <td>${d.date_added.split(' ')[0]}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    const hotelFilterElem = document.getElementById('decommission-hotel-filter');
    if (hotelFilterElem) {
        hotelFilterElem.addEventListener('change', (e) => {
            currentDecommissionHotelFilter = e.target.value;
            renderDecommission();
        });
    }

    function getStatusClass(status) {
        if (status === 'En Stock') return 'status-stock';
        if (status === 'Despachado / Instalado') return 'status-deployed';
        if (status === 'Reparado') return 'status-repaired';
        if (status === 'Averiado') return 'status-damaged';
        if (status === 'En Reparación / Garantía') return 'status-repair';
        return '';
    }

    // Search Inventory
    document.getElementById('search-inventory')?.addEventListener('input', (e) => {
        renderInventory(e.target.value);
    });

    window.filterByStatus = function(statusText) {
        currentWarehouseFilter = null;
        
        // Clear active style on all warehouse submenu items
        const submenuItems = document.querySelectorAll('#warehouse-submenu li');
        submenuItems.forEach(item => {
            item.style.background = 'transparent';
            item.style.color = 'var(--text-muted)';
            item.style.border = '1px solid transparent';
        });

        // Change Active Tab Visuals
        document.querySelectorAll('.sidebar li').forEach(li => li.classList.remove('active'));
        const invTab = document.querySelector('.sidebar li[data-tab="inventory"]');
        if (invTab) invTab.classList.add('active');
        
        document.querySelectorAll('.view-section').forEach(tab => tab.classList.remove('active'));
        document.getElementById('view-inventory').classList.add('active');

        // Set search bar and render
        const searchInput = document.getElementById('search-inventory');
        if (searchInput) {
            searchInput.value = statusText;
        }
        renderInventory(statusText);
    };

    // --- CRUD Operations ---
    deviceForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const id = document.getElementById('device-id').value;
        const finalQty = parseInt(document.getElementById('device-quantity').value) || 1;
        const costPrice = parseFloat(document.getElementById('device-cost-price')?.value) || 0.0;
        const totalValField = parseFloat(document.getElementById('device-value')?.value) || (costPrice * finalQty);

        const data = {
            sku: document.getElementById('device-sku')?.value.trim() || '',
            name: document.getElementById('device-name').value.trim(),
            type: document.getElementById('device-type').value,
            brand: document.getElementById('device-brand').value.trim(),
            model: document.getElementById('device-model').value.trim(),
            serial_number: document.getElementById('device-serial').value.trim(),
            mac_address: document.getElementById('device-mac').value.trim(),
            status: document.getElementById('device-status').value,
            cost_price: costPrice,
            min_stock: parseInt(document.getElementById('device-min-stock')?.value) || 0,
            provider: document.getElementById('device-provider')?.value || '',
            value: totalValField,
            quantity: finalQty,
            description: document.getElementById('device-description').value.trim(),
            warehouse: document.getElementById('device-warehouse').value,
            location: document.getElementById('device-location').value,
            dispatched_by: document.getElementById('device-dispatched-by').value
        };

        // Validate required fields by status
        if ((data.status === 'En Stock' || data.status === 'Reparado') && !data.warehouse.trim()) {
            showToast('El Almacén de Resguardo es obligatorio para equipos en Stock', 'error');
            document.getElementById('device-warehouse').focus();
            return;
        }

        if (data.status === 'Despachado / Instalado') {
            if (!data.location.trim()) {
                showToast('La Ubicación (Hotel) es obligatoria para equipos despachados', 'error');
                document.getElementById('device-location').focus();
                return;
            }
            if (!data.dispatched_by.trim()) {
                showToast('El Técnico responsable es obligatorio para equipos despachados', 'error');
                document.getElementById('device-dispatched-by').focus();
                return;
            }
        }

        // Clean up status-dependent fields before sending
        if (data.status === 'En Stock' || data.status === 'Reparado') {
            data.location = '';
            data.dispatched_by = '';
        } else if (data.status === 'Despachado / Instalado') {
            data.warehouse = '';
        } else {
            data.location = '';
            data.dispatched_by = '';
            data.warehouse = '';
        }

        try {
            if (id) {
                // Update
                await fetch(`/api/devices/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                showToast('Equipo actualizado', 'success');
            } else {
                // Add
                await fetch(`/api/devices`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                showToast('Equipo registrado', 'success');
            }

            // Save Stock Mínimo to stock_limits configuration
            const minStockInput = document.getElementById('device-min-stock');
            if (minStockInput && data.brand && data.model && data.brand !== '__new__' && data.model !== '__new__') {
                const minStockVal = parseInt(minStockInput.value) || 0;
                const wh = data.warehouse || 'Sin Almacén / Por Defecto';
                const specificKey = `${wh} | ${data.brand} ${data.model}`;
                const defaultKey = `Sin Almacén / Por Defecto | ${data.brand} ${data.model}`;
                
                stockLimits[specificKey] = minStockVal;
                if (stockLimits[defaultKey] === undefined) {
                    stockLimits[defaultKey] = minStockVal;
                }
                
                try {
                    await fetch('/api/settings/stock-limits', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(stockLimits)
                    });
                    if (typeof renderStockLimitsConfig === 'function') {
                        renderStockLimitsConfig();
                    }
                } catch(e) {
                    console.error("Error updating stock limits:", e);
                }
            }

            closeModal();
            fetchDevices();
        } catch (err) {
            showToast('Error al guardar', 'error');
        }
    });

    window.editDevice = function(id) {
        const device = allDevices.find(d => d.id === id);
        if (device) openModal('edit', device);
    };

    window.deleteDevice = async function(id) {
        if (confirm('¿Seguro que deseas eliminar este registro por completo?')) {
            try {
                await fetch(`/api/devices/${id}`, { method: 'DELETE' });
                showToast('Registro eliminado', 'success');
                fetchDevices();
            } catch (err) {
                showToast('Error al eliminar', 'error');
            }
        }
    };

    window.moveToDecommission = async function(id) {
        const device = allDevices.find(d => d.id === id);
        if (!device) return;

        const decModal = document.getElementById('decommission-modal');
        if (!decModal) return;

        // Limpiar formulario y rellenar con los datos del equipo
        document.getElementById('decommission-form')?.reset();
        
        const devIdInput = document.getElementById('dec-device-id');
        if (devIdInput) devIdInput.value = id;

        const nameInput = document.getElementById('dec-name');
        if (nameInput) nameInput.value = device.name || '';

        const typeInput = document.getElementById('dec-type');
        if (typeInput) typeInput.value = device.type || '';

        const brandInput = document.getElementById('dec-brand');
        if (brandInput) brandInput.value = device.brand || '';

        const modelInput = document.getElementById('dec-model');
        if (modelInput) modelInput.value = device.model || '';

        const serialInput = document.getElementById('dec-serial');
        if (serialInput) serialInput.value = device.serial_number || '';

        const valInput = document.getElementById('dec-value');
        if (valInput) valInput.value = device.value || 0;

        const qtyInput = document.getElementById('dec-quantity');
        if (qtyInput) {
            qtyInput.value = device.quantity || 1;
            qtyInput.max = device.quantity || 1;
        }

        const reasonInput = document.getElementById('dec-reason');
        if (reasonInput) {
            reasonInput.value = '';
            reasonInput.placeholder = 'Ingresa la razón de la falla o motivo del decomiso...';
        }

        // Cargar lista de hoteles
        if (typeof loadHotelsIntoDecomSelect === 'function') {
            await loadHotelsIntoDecomSelect();
        }

        // Si el equipo ya tiene una ubicación/hotel, preseleccionarlo si existe en la lista
        const hotelSelect = document.getElementById('dec-hotel');
        if (hotelSelect) {
            const loc = (device.location || device.hotel || '').trim();
            if (loc) {
                const foundOpt = Array.from(hotelSelect.options).find(o => o.value.toLowerCase() === loc.toLowerCase());
                if (foundOpt) {
                    hotelSelect.value = foundOpt.value;
                }
            }
        }

        if (typeof previewDecommissionNumber === 'function') {
            await previewDecommissionNumber();
        }
        decModal.classList.add('active');
        
        // Enfocar el selector de hotel o el motivo
        setTimeout(() => {
            if (hotelSelect && !hotelSelect.value) {
                hotelSelect.focus();
            } else if (reasonInput) {
                reasonInput.focus();
            }
        }, 150);
    };

    window.moveToRepair = async function(id) {
        document.getElementById('ws-device-id').value = id;
        document.getElementById('ws-date').value = new Date().toISOString().split('T')[0];
        document.getElementById('ws-by').value = '';
        if(document.getElementById('ws-provider')) document.getElementById('ws-provider').value = '';
        
        // Populate provider list in the modal
        const providerSelect = document.getElementById('ws-provider');
        if (providerSelect) {
            providerSelect.innerHTML = '<option value="">Seleccione proveedor...</option>';
            if(window.allProviders) {
                window.allProviders.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p.name;
                    opt.textContent = p.name;
                    providerSelect.appendChild(opt);
                });
            }
        }
        
        document.getElementById('warranty-send-modal').classList.add('active');
    };

    window.returnToWarehouse = async function(id) {
        const device = allDevices.find(d => d.id === id);
        if (!device) return;

        const maxQty = device.quantity || 1;
        const qtyInput = prompt(`El equipo "${device.name}" tiene ${maxQty} unidades despachadas.\n¿Cuántas unidades deseas retornar al Almacén?`, maxQty);
        if (qtyInput === null) return;

        const qtyToReturn = parseInt(qtyInput);
        if (isNaN(qtyToReturn) || qtyToReturn <= 0 || qtyToReturn > maxQty) {
            showToast('Cantidad inválida', 'error');
            return;
        }

        if (allWarehouses.length === 0) {
            showToast('No hay almacenes registrados. Por favor, crea uno primero.', 'error');
            return;
        }

        let warehousePromptMsg = "Selecciona el almacén de destino ingresando el número correspondiente:\n\n";
        allWarehouses.forEach((w, idx) => {
            warehousePromptMsg += `${idx + 1}. ${w.name}\n`;
        });
        
        const whInput = prompt(warehousePromptMsg, "1");
        if (whInput === null) return;
        
        const whIdx = parseInt(whInput) - 1;
        if (isNaN(whIdx) || whIdx < 0 || whIdx >= allWarehouses.length) {
            showToast('Selección de almacén inválida', 'error');
            return;
        }
        
        const targetWarehouse = allWarehouses[whIdx].name;
        
        // Compute proportional value to return
        const total_qty = device.quantity || 1;
        const total_val = device.value || 0.0;
        const returned_value = (qtyToReturn / total_qty) * total_val;

        const returnPayload = {
            status: 'En Stock',
            warehouse: targetWarehouse,
            location: '',
            dispatched_by: '',
            quantity: qtyToReturn,
            value: returned_value
        };

        try {
            const res = await fetch(`/api/devices/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(returnPayload)
            });

            if (res.ok) {
                showToast('Devolución al almacén registrada con éxito', 'success');
                await fetchDevices();
            } else {
                const errData = await res.json();
                showToast(errData.error || 'Error al procesar devolución', 'error');
            }
        } catch (err) {
            showToast('Error de red al procesar devolución', 'error');
        }
    };

    // --- Decommission CRUD ---
    const decommissionModal = document.getElementById('decommission-modal');
    document.getElementById('btn-new-decommission')?.addEventListener('click', () => {
        decommissionModal.classList.add('active');
        document.getElementById('decommission-form').reset();
    });
    
    document.getElementById('btn-close-decommission')?.addEventListener('click', () => {
        decommissionModal.classList.remove('active');
    });
    document.getElementById('btn-cancel-decommission')?.addEventListener('click', () => {
        decommissionModal.classList.remove('active');
    });

    document.getElementById('decommission-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const hotel = document.getElementById('dec-hotel').value;
        if (!hotel) {
            showToast('Por favor selecciona la propiedad / hotel para el decomiso', 'error');
            document.getElementById('dec-hotel')?.focus();
            return;
        }

        const deviceId = document.getElementById('dec-device-id')?.value;
        const qty = parseInt(document.getElementById('dec-quantity').value) || 1;
        const val = parseFloat(document.getElementById('dec-value').value) || 0.0;

        const data = {
            name: document.getElementById('dec-name').value,
            type: document.getElementById('dec-type').value,
            brand: document.getElementById('dec-brand').value,
            model: document.getElementById('dec-model').value,
            serial_number: document.getElementById('dec-serial').value,
            reason: document.getElementById('dec-reason').value,
            value: val,
            hotel: hotel,
            quantity: qty
        };
        try {
            const response = await fetch('/api/decommissions', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(data)
            });
            const result = await response.json();
            if (response.ok) {
                if (deviceId) {
                    const devIdInt = parseInt(deviceId);
                    const dev = allDevices.find(d => d.id === devIdInt);
                    const originalQty = dev ? (dev.quantity || 1) : qty;
                    const originalVal = dev ? (dev.value || 0.0) : val;

                    if (qty >= originalQty) {
                        await fetch(`/api/devices/${deviceId}`, { method: 'DELETE' });
                    } else {
                        const remainingQty = originalQty - qty;
                        const remainingVal = (originalVal / originalQty) * remainingQty;
                        await fetch(`/api/devices/${deviceId}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ 
                                quantity: remainingQty,
                                value: remainingVal
                            })
                        });
                    }
                }

                const num = result.decommission_number || '';
                showToast(num ? `Decomiso ${num} registrado para ${hotel}` : 'Decomiso registrado exitosamente', 'success');
                decommissionModal.classList.remove('active');
                const devIdInput = document.getElementById('dec-device-id');
                if (devIdInput) devIdInput.value = '';

                fetchDevices();
                fetchDecommissions();
            } else {
                showToast(result.error || 'Error al registrar decomiso', 'error');
            }
        } catch (err) {
            showToast('Error al registrar decomiso', 'error');
        }
    });

    // --- Decommission Export & Archive ---
    const pdfModal = document.getElementById('decommission-pdf-modal');
    const btnExportPdf = document.getElementById('btn-export-decommission-pdf');
    const btnClosePdfModal = document.getElementById('btn-close-pdf-modal');
    const btnCancelPdfModal = document.getElementById('btn-cancel-pdf-modal');
    const pdfForm = document.getElementById('decommission-pdf-form');

    btnExportPdf?.addEventListener('click', () => {
        let toExport = allDecommissions;
        if (currentDecommissionHotelFilter !== 'all') {
            toExport = allDecommissions.filter(d => d.hotel === currentDecommissionHotelFilter);
        }
        if (toExport.length === 0) {
            showToast('No hay registros para exportar a PDF con este filtro', 'error');
            return;
        }
        if (pdfModal) {
            pdfModal.classList.add('active');
        }
    });

    const closePdfModal = () => {
        if (pdfModal) {
            pdfModal.classList.remove('active');
        }
    };

    btnClosePdfModal?.addEventListener('click', closePdfModal);
    btnCancelPdfModal?.addEventListener('click', closePdfModal);

    pdfForm?.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const hotelId = document.getElementById('pdf-hotel-select')?.value;
        const selectedHotel = (typeof allHotels !== 'undefined' ? allHotels : []).find(h => h.id === parseInt(hotelId));

        const payload = {
            hotel: selectedHotel?.name || currentDecommissionHotelFilter,
            hotel_id: hotelId || null,
            no_control: document.getElementById('pdf-no-control')?.value || '',
            department: document.getElementById('pdf-department')?.value || 'SISTEMAS',
            decommission_type: document.getElementById('pdf-type')?.value || 'BAJA DE EQUIPO',
            applicant: document.getElementById('pdf-applicant')?.value || '',
            reason: document.getElementById('pdf-reason')?.value || 'Artículos de baja por término de vida útil o avería',
            other_notes: document.getElementById('pdf-other-notes')?.value || ''
        };

        try {
            showToast('Generando Hoja de Decomiso en PDF...', 'info');
            const response = await fetch('/api/decommission/export/pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error('Error al generar el archivo PDF');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            
            let filterName = currentDecommissionHotelFilter === 'all' ? 'todos' : currentDecommissionHotelFilter.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            a.download = `Hoja_Decomiso_${filterName}_${new Date().toISOString().split('T')[0]}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);

            showToast('PDF descargado correctamente', 'success');
            closePdfModal();
        } catch (err) {
            console.error(err);
            showToast('Error al descargar el PDF de decomiso', 'error');
        }
    });

    document.getElementById('btn-export-decommission')?.addEventListener('click', () => {
        let toExport = allDecommissions;
        if (currentDecommissionHotelFilter !== 'all') {
            toExport = allDecommissions.filter(d => d.hotel === currentDecommissionHotelFilter);
        }
        if (toExport.length === 0) {
            showToast('No hay registros para exportar con este filtro', 'error');
            return;
        }
        let filterName = currentDecommissionHotelFilter === 'all' ? 'todos' : currentDecommissionHotelFilter.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        downloadCSV(toExport, `decomiso_${filterName}_${new Date().toISOString().split('T')[0]}`);
    });

    document.getElementById('btn-clear-decommission')?.addEventListener('click', async () => {
        let toArchive = allDecommissions;
        if (currentDecommissionHotelFilter !== 'all') {
            toArchive = allDecommissions.filter(d => d.hotel === currentDecommissionHotelFilter);
        }
        
        if (toArchive.length === 0) {
            showToast('No hay registros para archivar con este filtro', 'error');
            return;
        }
        
        const dateObj = new Date();
        const periodText = dateObj.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
        const period = periodText.charAt(0).toUpperCase() + periodText.slice(1);
        
        let msg = currentDecommissionHotelFilter === 'all' 
            ? `¿Archivar y vaciar TODOS los hoteles bajo el periodo automático "${period}"?` 
            : `¿Archivar y vaciar SOLO los registros de "${currentDecommissionHotelFilter}" bajo el periodo automático "${period}"?`;
            
        if (confirm(msg)) {
            try {
                await fetch('/api/decommissions/archive', { 
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({period: period, hotel: currentDecommissionHotelFilter})
                });
                showToast('Hoja archivada y vaciada', 'success');
                fetchDecommissions();
            } catch(err) {
                showToast('Error al archivar', 'error');
            }
        }
    });

    // --- History Modal ---
    const historyModal = document.getElementById('history-modal');
    document.getElementById('btn-view-history')?.addEventListener('click', async () => {
        try {
            const res = await fetch('/api/decommissions/archive');
            const archives = await res.json();
            renderHistory(archives);
            historyModal.classList.add('active');
        } catch(err) {
            showToast('Error al cargar historial', 'error');
        }
    });
    document.getElementById('btn-close-history')?.addEventListener('click', () => historyModal.classList.remove('active'));

    function renderHistory(archives) {
        const tbody = document.getElementById('history-table');
        tbody.innerHTML = '';
        window.archiveDataMap = {};
        
        if (!archives || archives.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align: center; color: var(--color-text-secondary); padding: 24px;">
                        <i class="fa-solid fa-box-archive" style="font-size: 24px; margin-bottom: 8px; display: block; opacity: 0.5;"></i>
                        No hay periodos archivados en el historial aún.
                    </td>
                </tr>
            `;
            return;
        }

        archives.forEach(a => {
            window.archiveDataMap[a.id] = a;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${a.period}</strong></td>
                <td>${a.date_archived ? a.date_archived.split(' ')[0] : '-'}</td>
                <td style="color: var(--color-danger); font-weight: 600;">${formatCurrency(a.total_value)}</td>
                <td style="white-space: nowrap;">
                    <button class="btn btn-primary" style="padding: 5px 10px; font-size:12px; margin-right: 6px;" title="Descargar Hoja Oficial en PDF" onclick="window.downloadArchivePDF(${a.id})">
                        <i class="fa-solid fa-file-pdf"></i> PDF
                    </button>
                    <button class="btn btn-outline" style="padding: 5px 10px; font-size:12px;" title="Descargar Datos en CSV" onclick="window.downloadArchiveCSV(${a.id})">
                        <i class="fa-solid fa-file-csv"></i> CSV
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    window.downloadArchivePDF = async function(id) {
        const archive = window.archiveDataMap ? window.archiveDataMap[id] : null;
        const periodName = archive ? archive.period : `#${id}`;
        try {
            showToast(`Generando PDF del historial "${periodName}"...`, 'info');
            const res = await fetch(`/api/decommissions/archive/${id}/pdf`);
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Error al generar el PDF');
            }
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const cleanName = (archive ? archive.period : `decomiso_${id}`).replace(/[^a-z0-9]/gi, '_').toLowerCase();
            a.download = `Historial_Decomiso_${cleanName}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            showToast('PDF de historial descargado exitosamente', 'success');
        } catch(err) {
            console.error('Error al descargar PDF del historial:', err);
            showToast(err.message || 'Error al descargar PDF', 'error');
        }
    };

    window.downloadArchiveCSV = function(id) {
        const archive = window.archiveDataMap[id];
        if (archive) {
            downloadCSV(archive.data_dump, `decomiso_${archive.period.replace(/ /g, '_')}`);
        }
    };

    function downloadCSV(dataArray, filename) {
        if (!dataArray || dataArray.length === 0) {
            showToast('No hay datos para exportar', 'error');
            return;
        }
        let csvContent = "ID,Nombre,Cantidad,Tipo,Marca,Modelo,Serial,Hotel,Razón,Valor,Fecha\n";
        dataArray.forEach(d => {
            const row = [
                d.id,
                `"${d.name || ''}"`,
                d.quantity || 1,
                `"${d.type || d.device_type || ''}"`,
                `"${d.brand || ''}"`,
                `"${d.model || ''}"`,
                `"${d.serial_number || ''}"`,
                `"${d.hotel || ''}"`,
                `"${d.reason || ''}"`,
                d.value || 0,
                `"${d.date_added || ''}"`
            ];
            csvContent += row.join(",") + "\n";
        });
        const blob = new Blob(["\uFEFF"+csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `${filename}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // --- Toasts ---
    function showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerText = message;
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease-in forwards';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // --- Settings / Configurations ---
    async function fetchSettings() {
        try {
            const resW = await fetch('/api/settings/warehouses');
            allWarehouses = await resW.json();
            
            const resH = await fetch('/api/settings/hotels');
            allHotels = await resH.json();
            const resT = await fetch('/api/settings/technicians');
            allTechnicians = await resT.json();
            const resP = await fetch('/api/settings/providers');
            window.allProviders = await resP.json();
            
            // Fetch users only if Admin
            if (currentUser && currentUser.role === 'Admin') {
                try {
                    const resU = await fetch('/api/settings/users');
                    window.allUsers = await resU.json();
                    const userTbody = document.getElementById('settings-user-list');
                    if (userTbody) {
                        userTbody.innerHTML = '';
                        window.allUsers.forEach(u => {
                            const isCurrentUser = (u.username === currentUser.username || u.username === 'admin');
                            const deleteBtn = isCurrentUser ? '' : `<button class="action-btn delete" title="Eliminar" onclick="window.deleteUser(${u.id})"><i class="fa-solid fa-trash"></i></button>`;
                            const resetBtn = `<button class="action-btn" title="Cambiar Contraseña" style="color:var(--primary); margin-right:8px;" onclick="window.openAdminResetModal(${u.id}, '${u.username}')"><i class="fa-solid fa-key"></i></button>`;
                            
                            const tr = document.createElement('tr');
                            tr.innerHTML = `
                                <td>${u.username}</td>
                                <td>${u.role}</td>
                                <td style="text-align: right; width: 120px;">
                                    ${resetBtn}
                                    ${deleteBtn}
                                </td>
                            `;
                            userTbody.appendChild(tr);
                        });
                    }
                } catch(e) {}
                
                // Fetch Logs
                const logsBtn = document.getElementById('tab-btn-logs');
                if (logsBtn) logsBtn.style.display = 'inline-block';
                try {
                    const resL = await fetch('/api/logs');
                    const logs = await resL.json();
                    const logsTbody = document.getElementById('settings-logs-list');
                    if (logsTbody && !logs.error) {
                        logsTbody.innerHTML = '';
                        logs.forEach(l => {
                            // Parse as UTC and format locally
                            const dateObj = new Date(l.timestamp.replace(' ', 'T') + 'Z');
                            const localDateStr = dateObj.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
                            const tr = document.createElement('tr');
                            tr.innerHTML = `
                                <td>${localDateStr}</td>
                                <td><strong>${l.username}</strong></td>
                                <td><span class="status-badge" style="background: rgba(200,155,135,0.15); color: var(--primary);">${l.action}</span></td>
                                <td style="color: var(--text-muted);">${l.details || '-'}</td>
                            `;
                            logsTbody.appendChild(tr);
                        });
                    }
                } catch(e) { console.log(e); }
            }

            renderSettingsList('settings-warehouse-list', allWarehouses, deleteWarehouse);
            renderSettingsList('settings-hotel-list', allHotels, deleteHotel);
            renderSettingsList('settings-technician-list', allTechnicians, deleteTechnician);
            renderSettingsList('settings-provider-list', window.allProviders, deleteProvider);
            
            // Populate the warranty provider dropdowns
            const deviceProviderSelect = document.getElementById('device-warranty-provider');
            const wsProviderSelect = document.getElementById('ws-provider');
            if (deviceProviderSelect) {
                deviceProviderSelect.innerHTML = '<option value="">Seleccione o deje en blanco...</option>';
            }
            if (wsProviderSelect) {
                wsProviderSelect.innerHTML = '<option value="" disabled selected>A qué proveedor se envió...</option>';
            }
            
            window.allProviders.forEach(p => {
                if (deviceProviderSelect) {
                    const opt = document.createElement('option');
                    opt.value = p.name;
                    opt.textContent = p.name;
                    deviceProviderSelect.appendChild(opt);
                }
                if (wsProviderSelect) {
                    const opt2 = document.createElement('option');
                    opt2.value = p.name;
                    opt2.textContent = p.name;
                    wsProviderSelect.appendChild(opt2);
                }
            });

            // Update Datalists
            const updateDL = (id, arr) => {
                const dl = document.getElementById(id);
                if (!dl) return;
                dl.innerHTML = '';
                arr.forEach(item => {
                    const opt = document.createElement('option');
                    opt.value = item.name;
                    dl.appendChild(opt);
                });
            };
            updateDL('warehouse-options', allWarehouses);
            updateDL('hotel-options', allHotels);
            updateDL('technician-options', allTechnicians);

            const warehouseHotelSelect = document.getElementById('input-new-warehouse-hotel');
            if (warehouseHotelSelect) {
                warehouseHotelSelect.innerHTML = '<option value="">Sin Hotel (Opcional)</option>';
                allHotels.forEach(h => {
                    const opt = document.createElement('option');
                    opt.value = h.name;
                    opt.textContent = h.name;
                    warehouseHotelSelect.appendChild(opt);
                });
            }
            
            // Update Hotel Filter Dropdown (Only distinct hotels from decommissions)
            const filterSelect = document.getElementById('decommission-hotel-filter');
            if (filterSelect) {
                const uniqueHotels = [...new Set(allDecommissions.map(d => d.hotel).filter(h => h))];
                filterSelect.innerHTML = '<option value="all">Todos los Lugares</option>';
                
                uniqueHotels.forEach(hotelName => {
                    const opt = document.createElement('option');
                    opt.value = hotelName;
                    opt.textContent = hotelName;
                    filterSelect.appendChild(opt);
                });

                if (Array.from(filterSelect.options).some(o => o.value === currentDecommissionHotelFilter)) {
                    filterSelect.value = currentDecommissionHotelFilter;
                } else {
                    currentDecommissionHotelFilter = 'all';
                    filterSelect.value = 'all';
                }
            }
            
            // Populate dynamic sidebar submenu
            renderStockLimitsConfig();
            populateWarehouseSubmenu();
        } catch(err) {
            console.error('Error fetching settings:', err);
        }
    }

    function renderSettingsList(tbodyId, items, deleteFunc) {
        const tbody = document.getElementById(tbodyId);
        if(!tbody) return;
        tbody.innerHTML = '';
        items.forEach(item => {
            let subtitle = '';
            if (item.hotel) {
                subtitle = `<br><small style="color: var(--text-muted); font-size: 11px;">Hotel: ${item.hotel}</small>`;
            }
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.name} ${subtitle}</td>
                <td style="text-align: right; width: 60px;">
                    <button class="action-btn delete" onclick="(${deleteFunc})(${item.id})">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    

    document.getElementById('form-stock-limits')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const inputs = document.querySelectorAll('#stock-limits-inputs input');
        const data = {};
        inputs.forEach(input => {
            const type = input.getAttribute('data-type');
            const val = parseInt(input.value) || 0;
            data[type] = val;
        });
        try {
            const res = await fetch('/api/settings/stock-limits', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(data)
            });
            if (res.ok) {
                showToast('Configuración de stock guardada', 'success');
                stockLimits = data;
                fetchDevices();
            } else {
                const errData = await res.json();
                showToast(errData.error || 'Error al guardar configuración', 'error');
            }
        } catch(err) {
            showToast('Error de red', 'error');
        }
    });

    document.getElementById('form-add-warehouse')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('input-new-warehouse');
        const hotelInput = document.getElementById('input-new-warehouse-hotel');
        try {
            const res = await fetch('/api/settings/warehouses', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    name: input.value,
                    hotel: hotelInput ? hotelInput.value : ''
                })
            });
            if (res.ok) {
                input.value = '';
                if(hotelInput) hotelInput.value = '';
                showToast('Almacén agregado', 'success');
                fetchSettings();
            } else {
                const data = await res.json();
                showToast(data.error || 'Error al agregar', 'error');
            }
        } catch(err) { showToast('Error de red', 'error'); }
    });

    document.getElementById('form-add-hotel')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('input-new-hotel');
        try {
            const res = await fetch('/api/settings/hotels', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({name: input.value})
            });
            if (res.ok) {
                input.value = '';
                showToast('Hotel agregado', 'success');
                fetchSettings();
            } else {
                const data = await res.json();
                showToast(data.error || 'Error al agregar', 'error');
            }
        } catch(err) { showToast('Error de red', 'error'); }
    });

    document.getElementById('form-add-technician')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('input-new-technician');
        try {
            const res = await fetch('/api/settings/technicians', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({name: input.value})
            });
            if (res.ok) {
                input.value = '';
                showToast('Técnico agregado', 'success');
                fetchSettings();
            } else {
                const data = await res.json();
                showToast(data.error || 'Error al agregar', 'error');
            }
        } catch(err) { showToast('Error de red', 'error'); }
    });

    document.getElementById('form-add-provider')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('input-new-provider');
        try {
            const res = await fetch('/api/settings/providers', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({name: input.value})
            });
            if (res.ok) {
                input.value = '';
                showToast('Proveedor agregado', 'success');
                fetchSettings();
            } else {
                const data = await res.json();
                showToast(data.error || 'Error al agregar', 'error');
            }
        } catch(err) { showToast('Error de red', 'error'); }
    });

    document.getElementById('form-add-user')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const u = document.getElementById('input-new-user-username').value;
        const p = document.getElementById('input-new-user-password').value;
        const r = document.getElementById('input-new-user-role').value;
        try {
            const res = await fetch('/api/settings/users', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({username: u, password: p, role: r})
            });
            if (res.ok) {
                document.getElementById('form-add-user').reset();
                showToast('Usuario creado', 'success');
                fetchSettings();
            } else {
                const data = await res.json();
                showToast(data.error || 'Error al crear', 'error');
            }
        } catch(err) { showToast('Error de red', 'error'); }
    });

    window.deleteWarehouse = async function(id) {
        if(confirm('¿Eliminar este almacén de la lista fija?')) {
            await fetch('/api/settings/warehouses/' + id, { method: 'DELETE' });
            fetchSettings();
        }
    };
    
    window.deleteHotel = async function(id) {
        if(confirm('¿Eliminar este hotel de la lista fija?')) {
            await fetch('/api/settings/hotels/' + id, { method: 'DELETE' });
            fetchSettings();
        }
    };

    window.deleteTechnician = async function(id) {
        if(confirm('¿Eliminar este técnico de la lista fija?')) {
            await fetch('/api/settings/technicians/' + id, { method: 'DELETE' });
            fetchSettings();
        }
    };

    window.deleteProvider = async function(id) {
        if(confirm('¿Eliminar este proveedor de la lista fija?')) {
            await fetch('/api/settings/providers/' + id, { method: 'DELETE' });
            fetchSettings();
        }
    };
    
    window.deleteUser = async function(id) {
        if(!confirm('¿Estás seguro de eliminar este usuario?')) return;
        try {
            const res = await fetch(`/api/settings/users/${id}`, { method: 'DELETE' });
            if (res.ok) {
                showToast('Usuario eliminado', 'success');
                fetchSettings();
            } else {
                const data = await res.json();
                showToast(data.error || 'Error al eliminar', 'error');
            }
        } catch(e) {
            showToast('Error de conexión', 'error');
        }
    };

    // Admin Reset Password Logic
    const adminResetModal = document.getElementById('admin-reset-password-modal');
    window.openAdminResetModal = function(id, username) {
        document.getElementById('reset-user-id').value = id;
        document.getElementById('reset-username-display').innerText = username;
        document.getElementById('admin-new-password').value = '';
        adminResetModal.classList.add('active');
    };
    
    document.getElementById('btn-close-admin-reset-modal')?.addEventListener('click', () => {
        adminResetModal.classList.remove('active');
    });
    document.getElementById('btn-cancel-admin-reset')?.addEventListener('click', () => {
        adminResetModal.classList.remove('active');
    });
    
    document.getElementById('admin-reset-password-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('reset-user-id').value;
        const newPass = document.getElementById('admin-new-password').value;
        
        if (newPass.length < 6) {
            showToast('La contraseña debe tener al menos 6 caracteres', 'error');
            return;
        }
        
        try {
            const res = await fetch(`/api/settings/users/${id}/password`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ new_password: newPass })
            });
            const data = await res.json();
            if (res.ok) {
                showToast(data.message, 'success');
                adminResetModal.classList.remove('active');
            } else {
                showToast(data.error, 'error');
            }
        } catch (err) {
            showToast('Error de conexión', 'error');
        }
    });

    // --- Warranty Modals Logic ---
    const warrantySendModal = document.getElementById('warranty-send-modal');
    const warrantyReceiveModal = document.getElementById('warranty-receive-modal');

    document.getElementById('btn-close-warranty-send')?.addEventListener('click', () => warrantySendModal.classList.remove('active'));
    document.getElementById('btn-cancel-warranty-send')?.addEventListener('click', () => warrantySendModal.classList.remove('active'));
    
    document.getElementById('btn-close-warranty-receive')?.addEventListener('click', () => warrantyReceiveModal.classList.remove('active'));
    document.getElementById('btn-cancel-warranty-receive')?.addEventListener('click', () => warrantyReceiveModal.classList.remove('active'));

    document.getElementById('warranty-send-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('ws-device-id').value;
        const date = document.getElementById('ws-date').value;
        const by = document.getElementById('ws-by').value;
        const provider = document.getElementById('ws-provider').value;
        try {
            await fetch(`/api/devices/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    status: 'En Reparación / Garantía', 
                    warranty_sent_date: date, 
                    warranty_sent_by: by,
                    warranty_provider: provider 
                })
            });
            showToast('Enviado a garantía', 'success');
            warrantySendModal.classList.remove('active');
            fetchDevices();
        } catch(err) {
            showToast('Error al enviar a garantía', 'error');
        }
    });

    window.receiveFromWarranty = function(id) {
        document.getElementById('wr-device-id').value = id;
        document.getElementById('wr-date').value = new Date().toISOString().split('T')[0];
        document.getElementById('wr-warehouse').value = '';
        document.getElementById('wr-status').value = 'Reparado';
        warrantyReceiveModal.classList.add('active');
    };

    document.getElementById('warranty-receive-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('wr-device-id').value;
        const date = document.getElementById('wr-date').value;
        const status = document.getElementById('wr-status').value;
        const warehouse = document.getElementById('wr-warehouse').value;
        
        try {
            await fetch(`/api/devices/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    status: status, 
                    warranty_received_date: date,
                    warehouse: warehouse,
                    location: '' // clear location if returning to stock
                })
            });
            showToast('Recepción registrada', 'success');
            warrantyReceiveModal.classList.remove('active');
            fetchDevices();
        } catch(err) {
            showToast('Error al registrar recepción', 'error');
        }
    });

    function renderWarranties() {
        const tbody = document.getElementById('warranties-table');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        // Show all devices that have been sent to warranty (even if received)
        const warranties = allDevices.filter(d => !!d.warranty_sent_date);
        
        warranties.forEach(d => {
            const tr = document.createElement('tr');
            const receivedText = d.warranty_received_date || '<span style="color:var(--text-muted)">Pendiente</span>';
            const statusBadge = `<span class="status-badge ${getStatusClass(d.status)}">${d.status}</span>`;
            
            const btnReceive = (!d.warranty_received_date && (d.status === 'En Reparación / Garantía' || d.status === 'Reparación / Garantía')) 
                ? `<button class="action-btn" style="color:var(--primary)" title="Marcar como Recibido" onclick="window.receiveFromWarranty(${d.id})"><i class="fa-solid fa-box-open"></i></button>`
                : '';
                
            tr.innerHTML = `
                <td>#${d.id}</td>
                <td><strong>${d.name}</strong></td>
                <td>${d.brand || '-'} / ${d.model || '-'}</td>
                <td>${d.warranty_sent_date}</td>
                <td>${d.warranty_sent_by || '-'}</td>
                <td style="font-size: 13px;">${d.warranty_provider || '-'}</td>
                <td>${receivedText}</td>
                <td>${statusBadge}</td>
                <td>${btnReceive}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    // --- Critical Stock Modal ---
    const criticalStockModal = document.getElementById('critical-stock-modal');
    window.openCriticalStockModal = function() {
        const tbody = document.getElementById('critical-stock-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        const alerts = window.activeLowStockAlerts || [];
        if (alerts.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding: 24px;">No hay ningún equipo en stock crítico. ¡Todo al corriente!</td></tr>';
        } else {
            alerts.forEach(item => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><span style="color: var(--primary); font-weight: 600;"><i class="fa-solid fa-warehouse" style="margin-right: 6px; font-size: 11px;"></i>${item.warehouse}</span></td>
                    <td><strong>${item.model}</strong></td>
                    <td style="text-align: center; color: var(--danger); font-weight: 600;">${item.actual}</td>
                    <td style="text-align: center; color: var(--text-muted);">${item.limit}</td>
                `;
                tbody.appendChild(tr);
            });
        }
        criticalStockModal.classList.add('active');
    };

    document.getElementById('btn-close-critical-stock')?.addEventListener('click', () => {
        criticalStockModal.classList.remove('active');
    });

    function initDispatchModule() {
        const searchInput = document.getElementById('dispatch-search-input');
        const searchResults = document.getElementById('dispatch-search-results');
        const selectedDeviceCard = document.getElementById('dispatch-selected-device-card');
        const cardTitle = document.getElementById('dispatch-card-title');
        const cardDetails = document.getElementById('dispatch-card-details');
        const btnChangeDevice = document.getElementById('dispatch-btn-change-device');
        const hiddenIdInput = document.getElementById('dispatch-selected-id');
        const detailsFields = document.getElementById('dispatch-details-fields');
        const availableQtyLabel = document.getElementById('dispatch-available-qty-label');
        const qtyInput = document.getElementById('dispatch-input-quantity');
        const hotelInput = document.getElementById('dispatch-input-hotel');
        const techInput = document.getElementById('dispatch-input-tech');
        const notesInput = document.getElementById('dispatch-input-notes');
        const form = document.getElementById('dispatch-module-form');

        if (!searchInput || !searchResults || !form) return;

        // Reset elements
        searchInput.value = '';
        if (searchInput.parentElement && searchInput.parentElement.parentElement) {
            searchInput.parentElement.parentElement.style.display = 'block';
        }
        searchResults.style.display = 'none';
        searchResults.innerHTML = '';
        selectedDeviceCard.style.display = 'none';
        hiddenIdInput.value = '';
        detailsFields.style.display = 'none';
        availableQtyLabel.innerText = '';
        form.reset();

        const stockDevices = allDevices.filter(d => d.status === 'En Stock' || d.status === 'Reparado');

        // Search inputs change/keyup handler
        searchInput.oninput = () => {
            const query = searchInput.value.trim().toLowerCase();
            if (query.length === 0) {
                searchResults.style.display = 'none';
                searchResults.innerHTML = '';
                return;
            }

            const matches = stockDevices.filter(d => {
                const name = (d.name || '').toLowerCase();
                const brand = (d.brand || '').toLowerCase();
                const model = (d.model || '').toLowerCase();
                const sn = (d.serial_number || '').toLowerCase();
                const mac = (d.mac_address || '').toLowerCase();
                const wh = (d.warehouse || '').toLowerCase();
                return name.includes(query) || brand.includes(query) || model.includes(query) || sn.includes(query) || mac.includes(query) || wh.includes(query);
            });

            if (matches.length === 0) {
                searchResults.innerHTML = '<div style="padding: 10px; color: var(--text-muted); text-align: center;">No se encontraron equipos en stock</div>';
            } else {
                searchResults.innerHTML = '';
                matches.forEach(item => {
                    const div = document.createElement('div');
                    div.style.padding = '10px 12px';
                    div.style.cursor = 'pointer';
                    div.style.borderBottom = '1px solid var(--glass-border)';
                    div.style.borderRadius = '4px';
                    div.style.transition = 'background 0.2s';
                    div.className = 'search-result-item';
                    
                    const serialText = item.serial_number ? `S/N: ${item.serial_number}` : 'S/N: -';
                    const macText = item.mac_address ? `MAC: ${item.mac_address}` : 'MAC: -';
                    const warehouseText = item.warehouse || 'Sin Almacén';
                    
                    div.innerHTML = `
                        <div style="font-weight: 600; color: var(--text-main);">${item.name} (${item.brand} / ${item.model})</div>
                        <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">
                            Almacén: <span style="color: var(--primary);">${warehouseText}</span> | 
                            Cant: <strong>${item.quantity || 1}</strong> | 
                            ${serialText} | ${macText}
                        </div>
                    `;

                    div.onmouseenter = () => {
                        div.style.background = 'rgba(139, 92, 246, 0.1)';
                    };
                    div.onmouseleave = () => {
                        div.style.background = 'transparent';
                    };

                    div.onclick = () => {
                        selectDevice(item);
                    };

                    searchResults.appendChild(div);
                });
            }
            searchResults.style.display = 'block';
        };

        // Close search results when clicking outside
        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
                searchResults.style.display = 'none';
            }
        });

        function selectDevice(device) {
            hiddenIdInput.value = device.id;
            
            // Populate selected card
            cardTitle.innerText = `${device.name} (${device.brand} / ${device.model})`;
            const serialText = device.serial_number ? `S/N: ${device.serial_number}` : 'S/N: -';
            const macText = device.mac_address ? `MAC: ${device.mac_address}` : 'MAC: -';
            cardDetails.innerText = `Almacén: ${device.warehouse || 'Sin Almacén'} | ${serialText} | ${macText}`;
            
            // Hide search input and list
            if (searchInput.parentElement && searchInput.parentElement.parentElement) {
                searchInput.parentElement.parentElement.style.display = 'none';
            }
            searchResults.style.display = 'none';
            selectedDeviceCard.style.display = 'block';
            
            // Show details fields
            detailsFields.style.display = 'block';
            const availableQty = device.quantity || 1;
            availableQtyLabel.innerText = `Cantidad disponible en stock: ${availableQty} unidad(es)`;

            qtyInput.max = availableQty;
            qtyInput.min = 1;
            qtyInput.value = availableQty;
        }

        if (btnChangeDevice) {
            btnChangeDevice.onclick = () => {
                // Reset selection and show search input again
                hiddenIdInput.value = '';
                selectedDeviceCard.style.display = 'none';
                detailsFields.style.display = 'none';
                if (searchInput.parentElement && searchInput.parentElement.parentElement) {
                    searchInput.parentElement.parentElement.style.display = 'block';
                }
                searchInput.value = '';
                searchInput.focus();
            };
        }

        form.onsubmit = async (e) => {
            e.preventDefault();
            const selectedItemId = parseInt(hiddenIdInput.value);
            const selectedItemDevice = stockDevices.find(d => d.id === selectedItemId);
            if (!selectedItemDevice) return;

            const qtyToDispatch = parseInt(qtyInput.value);
            const destination = hotelInput.value.trim();
            const technician = techInput.value.trim();
            const notes = notesInput.value.trim();

            if (qtyToDispatch <= 0 || qtyToDispatch > (selectedItemDevice.quantity || 1)) {
                showToast('Cantidad a despachar inválida', 'error');
                return;
            }

            const dispatchPayload = {
                status: 'Despachado / Instalado',
                location: destination,
                dispatched_by: technician,
                quantity: qtyToDispatch,
                description: notes ? `${notes} (Despachado del stock)` : 'Despachado del stock'
            };

            try {
                // Call standard update device endpoint - split logic in backend handles it automatically!
                const res = await fetch(`/api/devices/${selectedItemId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(dispatchPayload)
                });

                if (res.ok) {
                    showToast('Despacho confirmado exitosamente', 'success');
                    initDispatchModule();
                    await fetchDevices();
                    window.filterByStatus('Despachado / Instalado');
                } else {
                    const errData = await res.json();
                    showToast(errData.error || 'Error al despachar', 'error');
                }
            } catch (err) {
                showToast('Error de red al despachar', 'error');
            }
        };
    }

    // --- Inactivity Timeout Configuration ---
    let inactivityMinutes = 5;
    const COUNTDOWN_LIMIT = 60; // 60 seconds
    
    let inactivityTimer = null;
    let countdownTimer = null;
    let countdownValue = COUNTDOWN_LIMIT;
    
    async function fetchInactivitySettings() {
        try {
            const res = await fetch('/api/settings/inactivity-timeout');
            if (res.ok) {
                const data = await res.json();
                inactivityMinutes = parseInt(data.timeout_minutes);
                if (isNaN(inactivityMinutes)) inactivityMinutes = 5;
                const selectEl = document.getElementById('inactivity-minutes-select');
                if (selectEl) selectEl.value = inactivityMinutes.toString();
            }
        } catch(e) {
            console.error('Error fetching inactivity settings:', e);
        }
    }

    document.getElementById('form-inactivity-settings')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const selectEl = document.getElementById('inactivity-minutes-select');
        if (!selectEl) return;
        const mins = parseInt(selectEl.value);
        try {
            const res = await fetch('/api/settings/inactivity-timeout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ timeout_minutes: mins })
            });
            if (res.ok) {
                inactivityMinutes = mins;
                resetInactivityTimer();
                showToast(`Tiempo de inactividad actualizado a ${mins === 0 ? 'Desactivado' : mins + ' minutos'}`, 'success');
            } else {
                showToast('Error al guardar configuración de inactividad', 'error');
            }
        } catch(err) {
            showToast('Error de red al guardar inactividad', 'error');
        }
    });

    function resetInactivityTimer() {
        if (!currentUser || inactivityMinutes <= 0) {
            clearTimeout(inactivityTimer);
            return; // Desactivado o no autenticado
        }
        
        // If warning modal is active, don't reset timer automatically by background movement
        const inactivityModal = document.getElementById('inactivity-modal');
        if (inactivityModal && inactivityModal.classList.contains('active')) {
            return;
        }
        
        const limitMs = inactivityMinutes * 60 * 1000;
        clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(showInactivityWarning, limitMs);
    }
    
    function showInactivityWarning() {
        const inactivityModal = document.getElementById('inactivity-modal');
        if (!inactivityModal) return;
        
        inactivityModal.classList.add('active');
        countdownValue = COUNTDOWN_LIMIT;
        
        const countdownEl = document.getElementById('inactivity-countdown');
        if (countdownEl) countdownEl.innerText = countdownValue;
        
        clearInterval(countdownTimer);
        countdownTimer = setInterval(() => {
            countdownValue--;
            if (countdownEl) countdownEl.innerText = countdownValue;
            
            if (countdownValue <= 0) {
                clearInterval(countdownTimer);
                autoLogout();
            }
        }, 1000);
    }
    
    async function autoLogout() {
        clearInterval(countdownTimer);
        clearTimeout(inactivityTimer);
        
        const inactivityModal = document.getElementById('inactivity-modal');
        if (inactivityModal) inactivityModal.classList.remove('active');
        
        try {
            await fetch('/api/logout', { method: 'POST' });
        } catch (e) {
            console.error('Error logging out:', e);
        }
        
        currentUser = null;
        document.getElementById('login-overlay').style.display = 'flex';
        document.getElementById('main-app').style.display = 'none';
        
        const err = document.getElementById('login-error');
        if (err) {
            err.innerText = 'Tu sesión ha expirado por inactividad. Por seguridad, por favor inicia sesión nuevamente.';
            err.style.display = 'block';
        }
    }
    
    // Wire up inactivity keep and logout buttons
    document.getElementById('btn-inactivity-keep')?.addEventListener('click', () => {
        const inactivityModal = document.getElementById('inactivity-modal');
        if (inactivityModal) inactivityModal.classList.remove('active');
        clearInterval(countdownTimer);
        resetInactivityTimer();
    });
    
    document.getElementById('btn-inactivity-logout')?.addEventListener('click', () => {
        autoLogout();
    });
    
    // Monitor user interaction events to reset timer
    const activityEvents = ['mousemove', 'keypress', 'click', 'scroll', 'touchstart'];
    activityEvents.forEach(evt => {
        window.addEventListener(evt, resetInactivityTimer, { passive: true });
    });

    // ==========================================
    // MODULE: PENDIENTES Y SEGUIMIENTO OPERATIVO
    // ==========================================
    let allOperationalTasks = [];
    const WORKFLOW_TEMPLATES = {
        'reparacion_cableado': [
            "Enviar solicitud de cambio de cableado",
            "Coordinación con el proveedor",
            "Ejecutar la tarea de recableado y pruebas finalizadas"
        ],
        'cableado_nuevo': [
            "Pedir OK al director para enviar a cotizar",
            "Enviar OK y hoja de solicitud a compras",
            "Envío a proveedores para cotización (Compras)",
            "Recepción y selección de propuesta del proveedor",
            "Generar orden de compra y enviar al proveedor",
            "Ejecución de cableado nuevo e instalación"
        ],
        'reemplazo_equipo': [
            "Diagnóstico técnico en sitio",
            "Solicitud de equipo de reemplazo al almacén",
            "Configuración y pruebas pre-instalación",
            "Instalación física y entrega al usuario final"
        ],
        'mantenimiento_preventivo': [
            "Programar fecha y notificación a coordinadores",
            "Limpieza física y verificación de conexiones",
            "Pruebas de latencia y velocidad de puerto",
            "Entrega de reporte de mantenimiento"
        ]
    };

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    async function loadOperationalTasks() {
        try {
            const res = await fetch('/api/operational-tasks');
            if (res.ok) {
                allOperationalTasks = await res.json();
                try { populateTaskFilterOptions(); } catch(e){}
                try { renderOperationalTasks(); } catch(e){}
                try { updateOperationalTaskStats(); } catch(e){}
            } else {
                showToast('Error al cargar pendientes', 'error');
            }
        } catch (e) {
            console.error('Error in loadOperationalTasks:', e);
        }
    }

    function updateOperationalTaskStats() {
        const total = allOperationalTasks.length;
        const pending = allOperationalTasks.filter(t => t.status === 'Pendiente').length;
        const progress = allOperationalTasks.filter(t => t.status === 'En Proceso').length;
        const completed = allOperationalTasks.filter(t => t.status === 'Completado').length;

        const totalEl = document.getElementById('task-stat-total');
        const pendingEl = document.getElementById('task-stat-pending');
        const progressEl = document.getElementById('task-stat-progress');
        const completedEl = document.getElementById('task-stat-completed');

        if (totalEl) totalEl.innerText = total;
        if (pendingEl) pendingEl.innerText = pending;
        if (progressEl) progressEl.innerText = progress;
        if (completedEl) completedEl.innerText = completed;
    }

    function populateTaskFilterOptions() {
        const techSelect = document.getElementById('task-filter-tech');
        if (techSelect && typeof allTechnicians !== 'undefined') {
            const currentTech = techSelect.value;
            techSelect.innerHTML = '<option value="">Todos los Técnicos</option>';
            allTechnicians.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.name;
                opt.textContent = t.name;
                if (t.name === currentTech) opt.selected = true;
                techSelect.appendChild(opt);
            });
        }

        const hotelSelect = document.getElementById('task-filter-hotel');
        if (hotelSelect && typeof allHotels !== 'undefined') {
            const currentHotel = hotelSelect.value;
            hotelSelect.innerHTML = '<option value="">Todos los Hoteles</option>';
            allHotels.forEach(h => {
                const opt = document.createElement('option');
                opt.value = h.name;
                opt.textContent = h.name;
                if (h.name === currentHotel) opt.selected = true;
                hotelSelect.appendChild(opt);
            });
        }
    }

    function renderOperationalTasks() {
        const container = document.getElementById('tasks-cards-container');
        if (!container) return;

        const searchText = (document.getElementById('task-search-input')?.value || '').toLowerCase().trim();
        const categoryFilter = document.getElementById('task-filter-category')?.value || '';
        const statusFilter = document.getElementById('task-filter-status')?.value || '';
        const techFilter = document.getElementById('task-filter-tech')?.value || '';
        const hotelFilter = document.getElementById('task-filter-hotel')?.value || '';
        const priorityFilter = document.getElementById('task-filter-priority')?.value || '';

        const filtered = allOperationalTasks.filter(task => {
            if (categoryFilter && task.category !== categoryFilter) return false;
            if (statusFilter && task.status !== statusFilter) return false;
            if (techFilter && task.technician_name !== techFilter) return false;
            if (hotelFilter && task.hotel !== hotelFilter) return false;
            if (priorityFilter && task.priority !== priorityFilter) return false;

            // Ocultar completados por defecto en las pestañas "Pendientes" y "Proyectos" si no hay un filtro de estado explícito
            const activeTabId = document.querySelector('#view-operational-tasks .settings-tabs .tab-btn.active')?.id;
            if (!statusFilter && task.status === 'Completado' && (activeTabId === 'btn-cat-filter-pending' || activeTabId === 'btn-cat-filter-project')) {
                return false;
            }

            if (searchText) {
                const matchTitle = (task.title || '').toLowerCase().includes(searchText);
                const matchHotel = (task.hotel || '').toLowerCase().includes(searchText);
                const matchTech = (task.technician_name || '').toLowerCase().includes(searchText);
                const matchDesc = (task.description || '').toLowerCase().includes(searchText);
                if (!matchTitle && !matchHotel && !matchTech && !matchDesc) return false;
            }
            return true;
        });

        if (filtered.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-muted); background: rgba(0,0,0,0.1); border-radius: 12px; border: 1px dashed var(--glass-border);">
                    <i class="fa-solid fa-clipboard-check" style="font-size: 36px; margin-bottom: 12px; color: var(--text-muted);"></i>
                    <p style="font-size: 16px;">No se encontraron registros de pendientes o proyectos.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = '';
        filtered.forEach(task => {
            const card = document.createElement('div');
            card.className = 'task-card glass-panel';
            if (task.is_stale) card.classList.add('is-stale');

            const priorityClass = `priority-${(task.priority || 'media').toLowerCase()}`;
            const isCompleted = task.status === 'Completado';
            const isProject = task.category === 'Proyecto';

            const categoryTag = isProject 
                ? `<span style="background: rgba(139, 92, 246, 0.2); color: #8b5cf6; border: 1px solid rgba(139, 92, 246, 0.4); font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; margin-right: 6px;"><i class="fa-solid fa-diagram-project"></i> PROYECTO</span>` 
                : `<span style="background: rgba(59, 130, 246, 0.2); color: #3b82f6; border: 1px solid rgba(59, 130, 246, 0.4); font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; margin-right: 6px;"><i class="fa-solid fa-list-check"></i> PENDIENTE</span>`;

            let staleBadgeHTML = '';
            if (task.is_stale) {
                staleBadgeHTML = `<span class="badge-stale-warning" title="SLA de inactividad excedido"><i class="fa-solid fa-triangle-exclamation"></i> Inactivo ${task.hours_inactive}h (Máx ${task.inactivity_threshold_hours}h)</span>`;
            }

            let stepsHTML = '';
            if (task.steps && task.steps.length > 0) {
                stepsHTML = task.steps.map(step => {
                    const stepDone = step.status === 'Completado';
                    const completedInfo = step.completed_by ? ` (por ${escapeHtml(step.completed_by)})` : '';
                    return `
                        <div class="task-step-item ${stepDone ? 'completed' : ''}" data-step-id="${step.id}">
                            <div class="task-step-row">
                                <input type="checkbox" class="task-step-checkbox" ${stepDone ? 'checked' : ''} onchange="window.toggleOperationalStepStatus(${step.id}, this.checked)">
                                <span class="task-step-title">${step.step_order}. ${escapeHtml(step.title)}${completedInfo}</span>
                                <select class="task-step-status-select" onchange="window.changeOperationalStepStatus(${step.id}, this.value)">
                                    <option value="Pendiente" ${step.status === 'Pendiente' ? 'selected' : ''}>Pendiente</option>
                                    <option value="En Proceso" ${step.status === 'En Proceso' ? 'selected' : ''}>En Proceso</option>
                                    <option value="Completado" ${step.status === 'Completado' ? 'selected' : ''}>Completado</option>
                                </select>
                                <button class="action-btn" title="Eliminar paso" style="padding: 2px 6px; font-size: 11px;" onclick="window.deleteOperationalStep(${step.id})">
                                    <i class="fa-solid fa-trash" style="color: var(--danger);"></i>
                                </button>
                            </div>
                            ${step.notes ? `<div class="task-step-notes"><i class="fa-regular fa-comment-dots" style="margin-right: 4px;"></i>${escapeHtml(step.notes)}</div>` : ''}
                            <input type="text" class="task-step-notes-input" placeholder="+ Agregar avance o nota de compañero (Enter)..." value="" onkeydown="if(event.key==='Enter'){ window.saveOperationalStepNote(${step.id}, this.value); }">
                        </div>
                    `;
                }).join('');
            } else {
                stepsHTML = `<p style="font-size: 13px; color: var(--text-muted); padding: 8px 0;">Sin pasos definidos.</p>`;
            }

            card.innerHTML = `
                <div class="task-card-header">
                    <div>
                        <div style="display: flex; align-items: center; margin-bottom: 6px; gap: 6px;">
                            ${categoryTag}
                            <span style="font-size: 11px; color: var(--color-primary); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">${escapeHtml(task.task_type || 'General')}</span>
                        </div>
                        <h3 class="task-card-title">${escapeHtml(task.title)}</h3>
                    </div>
                    <div style="display: flex; gap: 6px; flex-direction: column; align-items: flex-end;">
                        <span class="task-badge-priority ${priorityClass}"><i class="fa-solid fa-flag"></i> ${task.priority}</span>
                        ${staleBadgeHTML}
                    </div>
                </div>

                <div class="task-meta-bar">
                    ${task.hotel ? `<div class="task-meta-item"><i class="fa-solid fa-hotel" style="color: var(--color-primary);"></i> <span>${escapeHtml(task.hotel)}</span></div>` : ''}
                    <div class="task-meta-item"><i class="fa-solid fa-user-gear" style="color: var(--color-primary);"></i> <span>Técnico: <strong>${task.technician_name ? escapeHtml(task.technician_name) : 'Sin Asignar'}</strong></span></div>
                    ${task.start_date ? `<div class="task-meta-item"><i class="fa-regular fa-calendar-plus" style="color: #10b981;"></i> <span>Inicio: ${task.start_date}</span></div>` : ''}
                    ${task.end_date ? `<div class="task-meta-item"><i class="fa-regular fa-calendar-check" style="color: #ef4444;"></i> <span>Término: ${task.end_date}</span></div>` : ''}
                    ${task.last_updated_by ? `<div class="task-meta-item" style="width: 100%;"><i class="fa-solid fa-user-pen" style="color: var(--color-primary);"></i> <span>Último avance: <strong>${escapeHtml(task.last_updated_by)}</strong> (${task.hours_inactive}h transcurridas)</span></div>` : ''}
                </div>

                ${task.description ? `<p style="font-size: 13px; color: var(--color-text-secondary); margin: 4px 0 8px 0; line-height: 1.45; background: var(--color-surface-2); padding: 8px 12px; border-radius: 6px; border-left: 3px solid var(--color-primary);">${escapeHtml(task.description)}</p>` : ''}

                <!-- Barra Visual de Progreso Acompañando el Pendiente -->
                <div class="task-progress-box">
                    <div class="task-progress-header">
                        <span style="display: flex; align-items: center; gap: 6px;"><i class="fa-solid fa-bars-progress" style="color: var(--color-primary);"></i> Progreso (${task.completed_steps}/${task.total_steps} Pasos)</span>
                        <span style="font-weight: 700; color: ${task.progress_percentage === 100 ? '#10b981' : 'var(--color-primary)'}; font-size: 0.9rem;">${task.progress_percentage}%</span>
                    </div>
                    <div class="task-progress-track">
                        <div class="task-progress-bar ${isCompleted ? 'completed' : ''}" style="width: ${task.progress_percentage}%;"></div>
                    </div>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; margin: 8px 0 6px 0;">
                    <span style="font-size: 12px; font-weight: 700; color: var(--color-text); text-transform: uppercase; letter-spacing: 0.5px;"><i class="fa-solid fa-list-ol" style="color: var(--color-primary); margin-right: 4px;"></i> Flujo de Pasos / Avances:</span>
                    <div style="display: flex; gap: 6px;">
                        <button class="action-btn edit" title="Editar Pendiente" onclick="window.editOperationalTask(${task.id})"><i class="fa-solid fa-pen"></i></button>
                        <button class="action-btn delete" title="Eliminar Pendiente" onclick="window.deleteOperationalTask(${task.id})"><i class="fa-solid fa-trash"></i></button>
                    </div>
                </div>

                <div class="task-steps-list">
                    ${stepsHTML}
                </div>

                <div style="margin-top: 12px; display: flex; gap: 8px; align-items: center;">
                    <input type="text" id="new-step-title-${task.id}" class="form-control" placeholder="+ Añadir nuevo paso a este pendiente..." style="flex: 1; font-size: 12px; padding: 6px 12px;" onkeydown="if(event.key==='Enter'){ window.addQuickStepToTask(${task.id}); }">
                    <button class="btn btn-primary" style="padding: 6px 14px; font-size: 12px; white-space: nowrap;" onclick="window.addQuickStepToTask(${task.id})"><i class="fa-solid fa-plus"></i> Añadir</button>
                </div>
            `;
            container.appendChild(card);
        });
    }

    window.toggleOperationalStepStatus = async function(stepId, isChecked) {
        const newStatus = isChecked ? 'Completado' : 'Pendiente';
        await window.changeOperationalStepStatus(stepId, newStatus);
    };

    window.changeOperationalStepStatus = async function(stepId, newStatus) {
        try {
            const res = await fetch(`/api/operational-tasks/steps/${stepId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });
            if (res.ok) {
                loadOperationalTasks();
            } else {
                showToast('Error al actualizar paso', 'error');
            }
        } catch (e) {
            console.error(e);
        }
    };

    window.saveOperationalStepNote = async function(stepId, noteText) {
        if (!noteText || !noteText.trim()) return;
        try {
            const res = await fetch(`/api/operational-tasks/steps/${stepId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notes: noteText.trim() })
            });
            if (res.ok) {
                showToast('Nota registrada', 'success');
                loadOperationalTasks();
            } else {
                showToast('Error al guardar nota', 'error');
            }
        } catch (e) {
            console.error(e);
        }
    };

    window.deleteOperationalStep = async function(stepId) {
        if (!confirm('¿Seguro que deseas eliminar este paso?')) return;
        try {
            const res = await fetch(`/api/operational-tasks/steps/${stepId}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                showToast('Paso eliminado', 'success');
                loadOperationalTasks();
            }
        } catch (e) {
            console.error(e);
        }
    };

    window.addQuickStepToTask = async function(taskId) {
        const input = document.getElementById(`new-step-title-${taskId}`);
        if (!input || !input.value.trim()) return;
        try {
            const res = await fetch(`/api/operational-tasks/${taskId}/steps`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: input.value.trim() })
            });
            if (res.ok) {
                showToast('Paso agregado', 'success');
                loadOperationalTasks();
            }
        } catch (e) {
            console.error(e);
        }
    };

    window.deleteOperationalTask = async function(taskId) {
        if (!confirm('¿Seguro que deseas eliminar este pendiente y todos sus pasos?')) return;
        try {
            const res = await fetch(`/api/operational-tasks/${taskId}`, {
                method: 'DELETE'
            });
            if (res.ok) {
                showToast('Pendiente eliminado', 'success');
                loadOperationalTasks();
            }
        } catch (e) {
            console.error(e);
        }
    };

    window.editOperationalTask = function(taskId) {
        const task = allOperationalTasks.find(t => t.id === taskId);
        if (!task) return;
        openTaskModal(task);
    };

    const taskModal = document.getElementById('task-modal');
    
    function openTaskModal(taskToEdit = null) {
        if (!taskModal) return;
        
        const hotelSelect = document.getElementById('task-hotel-select');
        if (hotelSelect && typeof allHotels !== 'undefined') {
            hotelSelect.innerHTML = '<option value="">Seleccionar Hotel...</option>';
            allHotels.forEach(h => {
                const opt = document.createElement('option');
                opt.value = h.name;
                opt.textContent = h.name;
                hotelSelect.appendChild(opt);
            });
            const newHotelOpt = document.createElement('option');
            newHotelOpt.value = '__new__';
            newHotelOpt.textContent = '+ Agregar nuevo hotel...';
            newHotelOpt.style.fontWeight = 'bold';
            newHotelOpt.style.color = '#2563eb';
            hotelSelect.appendChild(newHotelOpt);
        }

        const techSelect = document.getElementById('task-tech-select');
        if (techSelect && typeof allTechnicians !== 'undefined') {
            techSelect.innerHTML = '<option value="">Sin Asignar</option>';
            allTechnicians.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.name;
                opt.textContent = t.name;
                techSelect.appendChild(opt);
            });
            const newTechOpt = document.createElement('option');
            newTechOpt.value = '__new__';
            newTechOpt.textContent = '+ Agregar nuevo técnico...';
            newTechOpt.style.fontWeight = 'bold';
            newTechOpt.style.color = '#2563eb';
            techSelect.appendChild(newTechOpt);
        }

        const form = document.getElementById('task-form');
        if (form) form.reset();
        const stepsContainer = document.getElementById('task-steps-builder');
        if (stepsContainer) stepsContainer.innerHTML = '';

        if (taskToEdit) {
            document.getElementById('task-modal-title').innerText = 'Editar Registro';
            document.getElementById('task-id-input').value = taskToEdit.id;
            document.getElementById('task-category-select').value = taskToEdit.category || 'Pendiente';
            document.getElementById('task-title-input').value = taskToEdit.title;
            document.getElementById('task-type-input').value = taskToEdit.task_type || '';
            document.getElementById('task-hotel-select').value = taskToEdit.hotel || '';
            document.getElementById('task-tech-select').value = taskToEdit.technician_name || '';
            document.getElementById('task-priority-select').value = taskToEdit.priority || 'Media';
            document.getElementById('task-start-date-input').value = taskToEdit.start_date || '';
            document.getElementById('task-end-date-input').value = taskToEdit.end_date || taskToEdit.due_date || '';
            document.getElementById('task-sla-input').value = taskToEdit.inactivity_threshold_hours || '';
            document.getElementById('task-desc-input').value = taskToEdit.description || '';
            document.getElementById('task-template-select').value = '';

            if (taskToEdit.steps && taskToEdit.steps.length > 0) {
                taskToEdit.steps.forEach(step => {
                    addStepRowToModal(step.title, step.status);
                });
            } else {
                addStepRowToModal();
            }
        } else {
            document.getElementById('task-modal-title').innerText = 'Nuevo Pendiente u Operación';
            document.getElementById('task-id-input').value = '';
            document.getElementById('task-category-select').value = 'Pendiente';
            document.getElementById('task-priority-select').value = 'Media';
            document.getElementById('task-sla-input').value = '72';
            addStepRowToModal();
        }

        taskModal.classList.add('active');
    }

    document.getElementById('task-hotel-select')?.addEventListener('change', async (e) => {
        if (e.target.value === '__new__') {
            const name = prompt('Ingrese el nombre del nuevo Hotel / Ubicación:');
            if (name && name.trim()) {
                const sigla = prompt('Ingrese la sigla del hotel (ej: HPA):') || name.trim().substring(0, 3).toUpperCase();
                try {
                    await fetch('/api/settings/hotels', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: name.trim(), sigla: sigla.trim().toUpperCase() })
                    });
                    await fetchSettings();
                    const hotelSelect = document.getElementById('task-hotel-select');
                    if (hotelSelect) {
                        hotelSelect.innerHTML = '<option value="">Seleccionar Hotel...</option>';
                        allHotels.forEach(h => {
                            const opt = document.createElement('option');
                            opt.value = h.name;
                            opt.textContent = h.name;
                            hotelSelect.appendChild(opt);
                        });
                        const newHotelOpt = document.createElement('option');
                        newHotelOpt.value = '__new__';
                        newHotelOpt.textContent = '+ Agregar nuevo hotel...';
                        newHotelOpt.style.fontWeight = 'bold';
                        newHotelOpt.style.color = '#2563eb';
                        hotelSelect.appendChild(newHotelOpt);
                        hotelSelect.value = name.trim();
                    }
                } catch (err) {
                    console.error('Error adding hotel:', err);
                }
            } else {
                e.target.value = '';
            }
        }
    });

    document.getElementById('task-tech-select')?.addEventListener('change', async (e) => {
        if (e.target.value === '__new__') {
            const name = prompt('Ingrese el nombre del nuevo Técnico:');
            if (name && name.trim()) {
                try {
                    await fetch('/api/settings/technicians', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: name.trim() })
                    });
                    await fetchSettings();
                    const techSelect = document.getElementById('task-tech-select');
                    if (techSelect) {
                        techSelect.innerHTML = '<option value="">Sin Asignar</option>';
                        allTechnicians.forEach(t => {
                            const opt = document.createElement('option');
                            opt.value = t.name;
                            opt.textContent = t.name;
                            techSelect.appendChild(opt);
                        });
                        const newTechOpt = document.createElement('option');
                        newTechOpt.value = '__new__';
                        newTechOpt.textContent = '+ Agregar nuevo técnico...';
                        newTechOpt.style.fontWeight = 'bold';
                        newTechOpt.style.color = '#2563eb';
                        techSelect.appendChild(newTechOpt);
                        techSelect.value = name.trim();
                    }
                } catch (err) {
                    console.error('Error adding technician:', err);
                }
            } else {
                e.target.value = '';
            }
        }
    });

    document.getElementById('task-priority-select')?.addEventListener('change', (e) => {
        const priorityDefaults = { 'Urgente': 24, 'Alta': 48, 'Media': 72, 'Baja': 168 };
        const val = e.target.value;
        const slaInput = document.getElementById('task-sla-input');
        if (slaInput && priorityDefaults[val]) {
            slaInput.value = priorityDefaults[val];
        }
    });

    function addStepRowToModal(stepTitle = '', status = 'Pendiente') {
        const container = document.getElementById('task-steps-builder');
        if (!container) return;

        const row = document.createElement('div');
        row.className = 'step-builder-row';
        row.innerHTML = `
            <i class="fa-solid fa-bars" style="color: var(--text-muted); cursor: grab;"></i>
            <input type="text" class="step-builder-input form-input" placeholder="Nombre o descripción del paso..." value="${escapeHtml(stepTitle)}">
            <button type="button" class="action-btn" title="Quitar paso" onclick="this.parentElement.remove()">
                <i class="fa-solid fa-trash" style="color: var(--danger);"></i>
            </button>
        `;
        container.appendChild(row);
    }

    document.getElementById('task-template-select')?.addEventListener('change', (e) => {
        const val = e.target.value;
        if (!val || !WORKFLOW_TEMPLATES[val]) return;

        const container = document.getElementById('task-steps-builder');
        if (container) container.innerHTML = '';
        WORKFLOW_TEMPLATES[val].forEach(title => {
            addStepRowToModal(title);
        });

        const typeInput = document.getElementById('task-type-input');
        if (typeInput) {
            if (val === 'reparacion_cableado') typeInput.value = 'Reparación Cableado';
            if (val === 'cableado_nuevo') typeInput.value = 'Cableado Nuevo';
            if (val === 'reemplazo_equipo') typeInput.value = 'Reemplazo / Despacho';
            if (val === 'mantenimiento_preventivo') typeInput.value = 'Mantenimiento';
        }
    });

    document.getElementById('btn-add-step-row')?.addEventListener('click', () => {
        addStepRowToModal();
    });

    document.getElementById('btn-new-task')?.addEventListener('click', () => {
        openTaskModal();
    });

    document.getElementById('btn-close-task-modal')?.addEventListener('click', () => {
        if (taskModal) taskModal.classList.remove('active');
    });

    document.getElementById('btn-cancel-task')?.addEventListener('click', () => {
        if (taskModal) taskModal.classList.remove('active');
    });

    document.getElementById('task-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const taskId = document.getElementById('task-id-input').value;
        const category = document.getElementById('task-category-select').value;
        const title = document.getElementById('task-title-input').value.trim();
        const taskType = document.getElementById('task-type-input').value.trim();
        const hotel = document.getElementById('task-hotel-select').value;
        const tech = document.getElementById('task-tech-select').value;
        const priority = document.getElementById('task-priority-select').value;
        const startDate = document.getElementById('task-start-date-input').value;
        const endDate = document.getElementById('task-end-date-input').value;
        const slaHours = document.getElementById('task-sla-input').value;
        const desc = document.getElementById('task-desc-input').value.trim();

        const stepInputs = document.querySelectorAll('.step-builder-input');
        const steps = [];
        stepInputs.forEach(inp => {
            if (inp.value && inp.value.trim()) {
                steps.push({ title: inp.value.trim() });
            }
        });

        const payload = {
            category: category,
            title: title,
            task_type: taskType,
            hotel: hotel,
            technician_name: tech,
            priority: priority,
            start_date: startDate,
            end_date: endDate,
            due_date: endDate,
            inactivity_threshold_hours: slaHours,
            description: desc,
            steps: steps
        };

        try {
            let res;
            if (taskId) {
                res = await fetch(`/api/operational-tasks/${taskId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } else {
                res = await fetch('/api/operational-tasks', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }

            if (res.ok) {
                showToast(taskId ? 'Registro actualizado' : 'Registro creado', 'success');
                if (taskModal) taskModal.classList.remove('active');
                loadOperationalTasks();
            } else {
                const errData = await res.json();
                showToast(errData.error || 'Error al guardar el registro', 'error');
            }
        } catch (err) {
            showToast('Error de conexión', 'error');
        }
    });

    document.getElementById('task-search-input')?.addEventListener('input', renderOperationalTasks);
    document.getElementById('task-filter-category')?.addEventListener('change', renderOperationalTasks);
    document.getElementById('task-filter-status')?.addEventListener('change', renderOperationalTasks);
    document.getElementById('task-filter-tech')?.addEventListener('change', renderOperationalTasks);
    document.getElementById('task-filter-hotel')?.addEventListener('change', renderOperationalTasks);
    document.getElementById('task-filter-priority')?.addEventListener('change', renderOperationalTasks);

    document.getElementById('btn-cat-filter-all')?.addEventListener('click', (e) => {
        document.querySelectorAll('#view-operational-tasks .settings-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        const selCat = document.getElementById('task-filter-category');
        if (selCat) selCat.value = '';
        const selStat = document.getElementById('task-filter-status');
        if (selStat) selStat.value = '';
        renderOperationalTasks();
    });
    document.getElementById('btn-cat-filter-pending')?.addEventListener('click', (e) => {
        document.querySelectorAll('#view-operational-tasks .settings-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        const selCat = document.getElementById('task-filter-category');
        if (selCat) selCat.value = 'Pendiente';
        const selStat = document.getElementById('task-filter-status');
        if (selStat && selStat.value === 'Completado') selStat.value = '';
        renderOperationalTasks();
    });
    document.getElementById('btn-cat-filter-project')?.addEventListener('click', (e) => {
        document.querySelectorAll('#view-operational-tasks .settings-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        const selCat = document.getElementById('task-filter-category');
        if (selCat) selCat.value = 'Proyecto';
        const selStat = document.getElementById('task-filter-status');
        if (selStat && selStat.value === 'Completado') selStat.value = '';
        renderOperationalTasks();
    });
    document.getElementById('btn-cat-filter-completed')?.addEventListener('click', (e) => {
        document.querySelectorAll('#view-operational-tasks .settings-tabs .tab-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        const selCat = document.getElementById('task-filter-category');
        if (selCat) selCat.value = ''; // Mostrar tanto proyectos como pendientes que estén completados
        const selStat = document.getElementById('task-filter-status');
        if (selStat) selStat.value = 'Completado';
        renderOperationalTasks();
    });

    // --- Inactivity Pop-up & Email Settings logic ---
    async function checkInactivityTasksPopUp(manualTrigger = false) {
        try {
            const res = await fetch('/api/operational-tasks/inactivity-check?send_email=true');
            if (res.ok) {
                const data = await res.json();
                if (data.stale_tasks && data.stale_tasks.length > 0) {
                    renderStaleModalTable(data.stale_tasks);
                    const modal = document.getElementById('stale-tasks-modal');
                    if (modal) modal.classList.add('active');
                } else if (manualTrigger) {
                    showToast('No hay pendientes con SLA de inactividad excedido en este momento.', 'success');
                }
            }
        } catch (e) {
            console.error('Error in checkInactivityTasksPopUp:', e);
        }
    }

    document.getElementById('btn-check-inactivity-manual')?.addEventListener('click', () => {
        checkInactivityTasksPopUp(true);
    });

    function renderStaleModalTable(staleTasks) {
        const tbody = document.getElementById('stale-tasks-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        staleTasks.forEach(task => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>#${task.id} ${escapeHtml(task.title)}</strong></td>
                <td>${escapeHtml(task.hotel || 'N/A')}</td>
                <td>${escapeHtml(task.technician_name || 'Sin Asignar')}</td>
                <td><span style="color:#ef4444; font-weight:600;"><i class="fa-solid fa-clock"></i> ${task.hours_inactive} hrs</span> <span style="font-size:11px; color:var(--text-muted);">(Límite: ${task.inactivity_threshold_hours}h)</span></td>
            `;
            tbody.appendChild(tr);
        });
    }

    document.getElementById('btn-close-stale-modal')?.addEventListener('click', () => {
        document.getElementById('stale-tasks-modal')?.classList.remove('active');
    });
    document.getElementById('btn-dismiss-stale-modal')?.addEventListener('click', () => {
        document.getElementById('stale-tasks-modal')?.classList.remove('active');
    });
    document.getElementById('btn-go-to-tasks')?.addEventListener('click', () => {
        document.getElementById('stale-tasks-modal')?.classList.remove('active');
        const tabTasks = document.querySelector('[data-tab="operational-tasks"]');
        if (tabTasks) tabTasks.click();
    });

    async function fetchEmailSettings() {
        try {
            const res = await fetch('/api/settings/email');
            if (res.ok) {
                const data = await res.json();
                const enabledChk = document.getElementById('email-enabled-checkbox');
                if (enabledChk) enabledChk.checked = !!data.enabled;
                const serverInp = document.getElementById('smtp-server-input');
                if (serverInp) serverInp.value = data.smtp_server || '';
                const portInp = document.getElementById('smtp-port-input');
                if (portInp) portInp.value = data.smtp_port || 587;
                const userInp = document.getElementById('smtp-user-input');
                if (userInp) userInp.value = data.smtp_user || '';
                const passInp = document.getElementById('smtp-pass-input');
                if (passInp) passInp.value = data.smtp_password || '';
                const senderInp = document.getElementById('smtp-sender-input');
                if (senderInp) senderInp.value = data.sender_email || '';
                const recipInp = document.getElementById('smtp-recipients-input');
                if (recipInp) recipInp.value = data.notification_recipients || '';
            }
        } catch (e) {
            console.error('Error fetching email settings:', e);
        }
    }

    document.getElementById('form-email-settings')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        saveEmailSettings(false);
    });

    document.getElementById('btn-test-email')?.addEventListener('click', () => {
        saveEmailSettings(true);
    });

    async function saveEmailSettings(sendTest = false) {
        const payload = {
            enabled: document.getElementById('email-enabled-checkbox').checked,
            smtp_server: document.getElementById('smtp-server-input').value.trim(),
            smtp_port: parseInt(document.getElementById('smtp-port-input').value) || 587,
            smtp_user: document.getElementById('smtp-user-input').value.trim(),
            smtp_password: document.getElementById('smtp-pass-input').value,
            sender_email: document.getElementById('smtp-sender-input').value.trim(),
            notification_recipients: document.getElementById('smtp-recipients-input').value.trim(),
            send_test_email: sendTest
        };

        try {
            const res = await fetch('/api/settings/email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (res.ok) {
                if (data.email_error) {
                    showToast(`${data.message}: ${data.email_error}`, 'error');
                } else {
                    showToast(data.message, 'success');
                }
            } else {
                showToast(data.error || 'Error al guardar configuración SMTP', 'error');
            }
        } catch (e) {
            showToast('Error de conexión', 'error');
        }
    }

    // --- Theme Selector Management ---
    const savedTheme = localStorage.getItem('app-theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    const themeSelect = document.getElementById('theme-selector');
    if (themeSelect) {
        themeSelect.value = savedTheme;
        themeSelect.addEventListener('change', (e) => {
            const newTheme = e.target.value;
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('app-theme', newTheme);
        });
    }

    // --- Sidebar + Nuevo Equipo Button ---
    document.getElementById('btn-new-device')?.addEventListener('click', () => {
        const deviceModal = document.getElementById('device-modal');
        if (!deviceModal) return;
        const form = document.getElementById('device-form');
        if (form) form.reset();
        const idInput = document.getElementById('device-id');
        if (idInput) idInput.value = '';
        const title = document.getElementById('modal-title');
        if (title) title.innerText = 'Registrar Equipo';
        populateDeviceTypeDropdown();
        deviceModal.classList.add('active');
    });

    document.getElementById('btn-close-modal')?.addEventListener('click', () => {
        document.getElementById('device-modal')?.classList.remove('active');
    });
    document.getElementById('btn-cancel')?.addEventListener('click', () => {
        document.getElementById('device-modal')?.classList.remove('active');
    });

    // --- Global Dashboard Filters & Navigation ---
    window.filterByStatus = function(status) {
        window.location.href = `/inventario?status=${encodeURIComponent(status)}`;
    };

    window.openCriticalStockModal = function() {
        window.location.href = `/inventario?critical=true`;
    };

    // --- Notifications Icon Header Action ---
    document.getElementById('btn-notifications-icon')?.addEventListener('click', () => {
        const staleModal = document.getElementById('stale-tasks-modal');
        if (staleModal && staleModal.querySelector('.stale-task-item')) {
            staleModal.classList.add('active');
        } else {
            showToast('🔔 Todas las actividades y tareas se encuentran al día', 'info');
        }
    });

    // --- Settings View: Full Tab Switching & Data Loaders ---
    document.querySelectorAll('.settings-tabs .tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-target');
            document.querySelectorAll('.settings-tabs .tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            document.querySelectorAll('.settings-content-area .settings-card').forEach(card => {
                card.style.display = 'none';
            });
            
            const targetCard = document.getElementById(`settings-tab-${target}`);
            if (targetCard) targetCard.style.display = 'block';
            
            if (target === 'warehouses') fetchWarehousesConfig();
            else if (target === 'hotels') fetchHotelsConfig();
            else if (target === 'technicians') fetchTechniciansConfig();
            else if (target === 'providers') fetchProvidersConfig();
            else if (target === 'users') fetchUsers();
            else if (target === 'catalog') fetchCatalogConfig();
            else if (target === 'stock-limits') fetchStockLimitsConfig();
            else if (target === 'logs') fetchLogsConfig();
            else if (target === 'inactivity') fetchInactivityConfig();
            else if (target === 'email') fetchEmailSettings();
        });
    });

    // --- 1. Warehouses Settings Management ---
    async function fetchWarehousesConfig() {
        const listBody = document.getElementById('settings-warehouse-list');
        if (!listBody) return;
        try {
            const res = await fetch('/api/settings/warehouses');
            if (res.ok) {
                const warehouses = await res.json();
                renderWarehousesConfig(warehouses);
            }
        } catch(e) {
            console.error('Error fetching warehouses:', e);
        }
    }

    function renderWarehousesConfig(warehouses) {
        const listBody = document.getElementById('settings-warehouse-list');
        if (!listBody) return;
        listBody.innerHTML = '';
        if (warehouses.length === 0) {
            listBody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--color-text-secondary); padding: 20px;">No hay almacenes registrados</td></tr>';
            return;
        }
        warehouses.forEach(w => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong><i class="fa-solid fa-warehouse" style="color: var(--color-primary); margin-right: 8px;"></i>${escapeHtml(w.name)}</strong></td>
                <td><span class="badge badge-info">${escapeHtml(w.hotel || 'Sin Hotel')}</span></td>
                <td style="text-align: right;">
                    <button class="btn-icon btn-delete-warehouse" data-id="${w.id}" data-name="${escapeHtml(w.name)}" title="Eliminar Almacén" style="color: var(--color-danger);">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            `;
            listBody.appendChild(tr);
        });

        listBody.querySelectorAll('.btn-delete-warehouse').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                const name = btn.getAttribute('data-name');
                if (!confirm(`¿Seguro que deseas eliminar el almacén "${name}"?`)) return;
                try {
                    const res = await fetch(`/api/settings/warehouses/${id}`, { method: 'DELETE' });
                    if (res.ok) {
                        showToast(`Almacén "${name}" eliminado`, 'success');
                        fetchWarehousesConfig();
                        fetchSettings();
                    } else {
                        showToast('Error al eliminar almacén', 'error');
                    }
                } catch(e) {
                    showToast('Error de conexión', 'error');
                }
            });
        });
    }

    document.getElementById('form-add-warehouse')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const inputName = document.getElementById('input-new-warehouse');
        const selectHotel = document.getElementById('input-new-warehouse-hotel');
        const name = inputName.value.trim();
        const hotel = selectHotel ? selectHotel.value : '';
        if (!name) return;
        try {
            const res = await fetch('/api/settings/warehouses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, hotel })
            });
            const data = await res.json();
            if (res.ok) {
                showToast(`Almacén "${name}" agregado`, 'success');
                inputName.value = '';
                fetchWarehousesConfig();
                fetchSettings();
            } else {
                showToast(data.error || 'Error al agregar almacén', 'error');
            }
        } catch(err) {
            showToast('Error de conexión', 'error');
        }
    });

    // --- 2. Hotels Settings Management ---
    async function fetchHotelsConfig() {
        const listBody = document.getElementById('settings-hotel-list');
        if (!listBody) return;
        try {
            const res = await fetch('/api/settings/hotels');
            if (res.ok) {
                const hotels = await res.json();
                renderHotelsConfig(hotels);
                // Populate hotel dropdown in add warehouse form
                const whHotelSelect = document.getElementById('input-new-warehouse-hotel');
                if (whHotelSelect) {
                    const currentVal = whHotelSelect.value;
                    whHotelSelect.innerHTML = '<option value="">Sin Hotel (Opcional)</option>' + 
                        hotels.map(h => `<option value="${escapeHtml(h.name)}">${escapeHtml(h.name)}</option>`).join('');
                    whHotelSelect.value = currentVal;
                }
            }
        } catch(e) {
            console.error('Error fetching hotels:', e);
        }
    }

    function renderHotelsConfig(hotels) {
        const listBody = document.getElementById('settings-hotel-list');
        if (!listBody) return;
        listBody.innerHTML = '';
        if (hotels.length === 0) {
            listBody.innerHTML = '<tr><td colspan="2" style="text-align: center; color: var(--color-text-secondary); padding: 20px;">No hay hoteles registrados</td></tr>';
            return;
        }
        hotels.forEach(h => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong><i class="fa-solid fa-hotel" style="color: var(--color-primary); margin-right: 8px;"></i>${escapeHtml(h.name)}</strong></td>
                <td style="text-align: right;">
                    <button class="btn-icon btn-delete-hotel" data-id="${h.id}" data-name="${escapeHtml(h.name)}" title="Eliminar Hotel" style="color: var(--color-danger);">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            `;
            listBody.appendChild(tr);
        });

        listBody.querySelectorAll('.btn-delete-hotel').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                const name = btn.getAttribute('data-name');
                if (!confirm(`¿Seguro que deseas eliminar el hotel "${name}"?`)) return;
                try {
                    const res = await fetch(`/api/settings/hotels/${id}`, { method: 'DELETE' });
                    if (res.ok) {
                        showToast(`Hotel "${name}" eliminado`, 'success');
                        fetchHotelsConfig();
                        fetchSettings();
                    } else {
                        showToast('Error al eliminar hotel', 'error');
                    }
                } catch(e) {
                    showToast('Error de conexión', 'error');
                }
            });
        });
    }

    document.getElementById('form-add-hotel')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('input-new-hotel');
        const name = input.value.trim();
        if (!name) return;
        try {
            const res = await fetch('/api/settings/hotels', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            const data = await res.json();
            if (res.ok) {
                showToast(`Hotel "${name}" agregado`, 'success');
                input.value = '';
                fetchHotelsConfig();
                fetchSettings();
            } else {
                showToast(data.error || 'Error al agregar hotel', 'error');
            }
        } catch(err) {
            showToast('Error de conexión', 'error');
        }
    });

    // --- 3. Technicians Settings Management ---
    async function fetchTechniciansConfig() {
        const listBody = document.getElementById('settings-technician-list');
        if (!listBody) return;
        try {
            const res = await fetch('/api/settings/technicians');
            if (res.ok) {
                const technicians = await res.json();
                renderTechniciansConfig(technicians);
            }
        } catch(e) {
            console.error('Error fetching technicians:', e);
        }
    }

    function renderTechniciansConfig(technicians) {
        const listBody = document.getElementById('settings-technician-list');
        if (!listBody) return;
        listBody.innerHTML = '';
        if (technicians.length === 0) {
            listBody.innerHTML = '<tr><td colspan="2" style="text-align: center; color: var(--color-text-secondary); padding: 20px;">No hay técnicos registrados</td></tr>';
            return;
        }
        technicians.forEach(t => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong><i class="fa-solid fa-user-gear" style="color: var(--color-primary); margin-right: 8px;"></i>${escapeHtml(t.name)}</strong></td>
                <td style="text-align: right;">
                    <button class="btn-icon btn-delete-technician" data-id="${t.id}" data-name="${escapeHtml(t.name)}" title="Eliminar Técnico" style="color: var(--color-danger);">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            `;
            listBody.appendChild(tr);
        });

        listBody.querySelectorAll('.btn-delete-technician').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                const name = btn.getAttribute('data-name');
                if (!confirm(`¿Seguro que deseas eliminar al técnico "${name}"?`)) return;
                try {
                    const res = await fetch(`/api/settings/technicians/${id}`, { method: 'DELETE' });
                    if (res.ok) {
                        showToast(`Técnico "${name}" eliminado`, 'success');
                        fetchTechniciansConfig();
                        fetchSettings();
                    } else {
                        showToast('Error al eliminar técnico', 'error');
                    }
                } catch(e) {
                    showToast('Error de conexión', 'error');
                }
            });
        });
    }

    document.getElementById('form-add-technician')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('input-new-technician');
        const name = input.value.trim();
        if (!name) return;
        try {
            const res = await fetch('/api/settings/technicians', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
            const data = await res.json();
            if (res.ok) {
                showToast(`Técnico "${name}" agregado`, 'success');
                input.value = '';
                fetchTechniciansConfig();
                fetchSettings();
            } else {
                showToast(data.error || 'Error al agregar técnico', 'error');
            }
        } catch(err) {
            showToast('Error de conexión', 'error');
        }
    });

    // --- 4. Providers Settings & Modal Management (Matches Design Mockup) ---
    let currentProviderModalProducts = [];

    async function populateProviderLinkDropdown() {
        const linkSelect = document.getElementById('provider-modal-link-device');
        if (!linkSelect) return;
        linkSelect.innerHTML = '<option value="">Cargando artículos del inventario...</option>';
        
        let devices = (typeof allDevices !== 'undefined' && Array.isArray(allDevices) && allDevices.length > 0) 
            ? allDevices 
            : (window.allDevices && Array.isArray(window.allDevices) && window.allDevices.length > 0)
                ? window.allDevices
                : [];
                
        if (devices.length === 0) {
            try {
                const res = await fetch('/api/devices');
                if (res.ok) {
                    devices = await res.json();
                    window.allDevices = devices;
                }
            } catch(e) {
                console.error('Error loading devices for provider modal:', e);
            }
        }
        
        linkSelect.innerHTML = '<option value="">+ Vincular artículo existente del inventario...</option>';
        if (devices && devices.length > 0) {
            const seen = new Set();
            devices.forEach(d => {
                const key = `${d.name} - ${d.type} - ${d.brand || ''} ${d.model || ''}`.trim();
                if (!seen.has(key)) {
                    seen.add(key);
                    const opt = document.createElement('option');
                    const cost = d.value ? (d.value / (d.quantity || 1)).toFixed(2) : '0.00';
                    const prodData = {
                        code: `EQ-${d.id}`,
                        name: `${d.name} (${d.brand || ''} ${d.model || ''})`.trim(),
                        cost: cost
                    };
                    opt.value = JSON.stringify(prodData);
                    opt.textContent = `${d.name} [${d.brand || '-'} / ${d.model || '-'}] - Costo ref: $${cost}`;
                    linkSelect.appendChild(opt);
                }
            });
        } else {
            linkSelect.innerHTML = '<option value="">No hay artículos en inventario (puedes añadir manualmente abajo)</option>';
        }
    }

    window.openProviderModal = async function(mode = 'add', provider = null, initialName = '', onSavedCallback = null) {
        const modal = document.getElementById('provider-modal');
        const form = document.getElementById('form-provider-details');
        if (!modal || !form) return;

        form.reset();
        currentProviderModalProducts = [];

        // Asynchronously populate inventory link dropdown
        populateProviderLinkDropdown();

        if (mode === 'edit' && provider) {
            document.getElementById('provider-modal-title').textContent = `Editar Proveedor: ${provider.name}`;
            document.getElementById('provider-modal-id').value = provider.id || '';
            document.getElementById('provider-modal-name').value = provider.name || '';
            document.getElementById('provider-modal-rnc').value = provider.rnc || '';
            document.getElementById('provider-modal-contact').value = provider.contact_name || '';
            document.getElementById('provider-modal-phone').value = provider.phone || '';
            document.getElementById('provider-modal-email').value = provider.email || '';
            currentProviderModalProducts = Array.isArray(provider.products) ? [...provider.products] : [];
        } else {
            document.getElementById('provider-modal-title').textContent = 'Nuevo Proveedor';
            document.getElementById('provider-modal-id').value = '';
            document.getElementById('provider-modal-name').value = initialName || '';
            document.getElementById('provider-modal-rnc').value = '';
            document.getElementById('provider-modal-contact').value = '';
            document.getElementById('provider-modal-phone').value = '';
            document.getElementById('provider-modal-email').value = '';
            currentProviderModalProducts = [];
        }

        renderProviderModalProducts();
        modal.classList.add('active');
        window._providerModalCallback = onSavedCallback;
    };

    function renderProviderModalProducts() {
        const tbody = document.getElementById('provider-modal-products-list');
        if (!tbody) return;
        tbody.innerHTML = '';
        if (currentProviderModalProducts.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--color-text-secondary); padding: 12px;">No se han agregado artículos a la lista.</td></tr>';
            return;
        }
        currentProviderModalProducts.forEach((item, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight: 600; font-family: monospace;">${escapeHtml(item.code || '-')}</td>
                <td><strong>${escapeHtml(item.name || '')}</strong></td>
                <td style="text-align: right; color: var(--color-primary); font-weight: 600;">$${parseFloat(item.cost || 0).toFixed(2)}</td>
                <td style="text-align: center;">
                    <button type="button" class="btn-icon" data-index="${index}" title="Quitar" style="color: var(--color-danger); border: none; background: transparent; cursor: pointer;">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            `;
            tr.querySelector('button')?.addEventListener('click', () => {
                currentProviderModalProducts.splice(index, 1);
                renderProviderModalProducts();
            });
            tbody.appendChild(tr);
        });
    }

    // Modal Products Buttons
    document.getElementById('btn-provider-link-device')?.addEventListener('click', () => {
        const linkSelect = document.getElementById('provider-modal-link-device');
        if (!linkSelect || !linkSelect.value) {
            showToast('Selecciona primero un artículo del inventario', 'warning');
            return;
        }
        try {
            const item = JSON.parse(linkSelect.value);
            currentProviderModalProducts.push(item);
            renderProviderModalProducts();
            linkSelect.value = '';
        } catch(e) {}
    });

    document.getElementById('btn-provider-add-custom-prod')?.addEventListener('click', () => {
        const codeInp = document.getElementById('provider-modal-prod-code');
        const nameInp = document.getElementById('provider-modal-prod-name');
        const costInp = document.getElementById('provider-modal-prod-cost');
        
        const name = nameInp ? nameInp.value.trim() : '';
        if (!name) {
            showToast('El nombre del producto es obligatorio', 'warning');
            nameInp?.focus();
            return;
        }
        const item = {
            code: codeInp ? codeInp.value.trim() || '-' : '-',
            name: name,
            cost: costInp ? parseFloat(costInp.value) || 0.0 : 0.0
        };
        currentProviderModalProducts.push(item);
        renderProviderModalProducts();
        
        if (codeInp) codeInp.value = '';
        if (nameInp) nameInp.value = '';
        if (costInp) costInp.value = '';
    });

    // Close & Cancel Modal
    const closeProvModal = () => document.getElementById('provider-modal')?.classList.remove('active');
    document.getElementById('btn-close-provider-modal')?.addEventListener('click', closeProvModal);
    document.getElementById('btn-cancel-provider-modal')?.addEventListener('click', closeProvModal);

    // Save Provider Form
    document.getElementById('form-provider-details')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('provider-modal-id').value;
        const name = document.getElementById('provider-modal-name').value.trim();
        if (!name) return;

        const payload = {
            name: name,
            rnc: document.getElementById('provider-modal-rnc').value.trim(),
            contact_name: document.getElementById('provider-modal-contact').value.trim(),
            phone: document.getElementById('provider-modal-phone').value.trim(),
            email: document.getElementById('provider-modal-email').value.trim(),
            products: currentProviderModalProducts
        };

        const url = id ? `/api/settings/providers/${id}` : '/api/settings/providers';
        const method = id ? 'PUT' : 'POST';

        try {
            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (res.ok) {
                showToast(id ? 'Proveedor actualizado con éxito' : `Proveedor "${name}" registrado con éxito`, 'success');
                closeProvModal();
                fetchProvidersConfig();
                if (typeof fetchSettings === 'function') fetchSettings();
                if (typeof window._providerModalCallback === 'function') {
                    window._providerModalCallback(data);
                }
            } else {
                showToast(data.error || 'Error al guardar proveedor', 'error');
            }
        } catch(err) {
            showToast('Error de conexión', 'error');
        }
    });

    // Button to open from settings
    document.getElementById('btn-open-new-provider')?.addEventListener('click', () => {
        window.openProviderModal('add');
    });

    async function fetchProvidersConfig() {
        const listBody = document.getElementById('settings-provider-list');
        if (!listBody) return;
        try {
            const res = await fetch('/api/settings/providers');
            if (res.ok) {
                const providers = await res.json();
                renderProvidersConfig(providers);
            }
        } catch(e) {
            console.error('Error fetching providers:', e);
        }
    }

    function renderProvidersConfig(providers) {
        const listBody = document.getElementById('settings-provider-list');
        if (!listBody) return;
        listBody.innerHTML = '';
        if (providers.length === 0) {
            listBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--color-text-secondary); padding: 20px;">No hay proveedores registrados</td></tr>';
            return;
        }
        providers.forEach(p => {
            const tr = document.createElement('tr');
            const prodsCount = (p.products && Array.isArray(p.products)) ? p.products.length : 0;
            const prodsBadge = prodsCount > 0 
                ? `<span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; font-weight: 700; padding: 2px 8px; border-radius: 6px;"><i class="fa-solid fa-box-open"></i> ${prodsCount} producto(s)</span>`
                : '<span style="color: var(--color-text-secondary); font-size: 12px;">Ninguno</span>';

            const contactDisplay = p.contact_name ? `<strong>${escapeHtml(p.contact_name)}</strong>` : '<span style="color: var(--color-text-secondary);">-</span>';
            const phoneEmail = (p.phone || p.email) 
                ? `<div style="font-size: 12px;">${p.phone ? `<div><i class="fa-solid fa-phone" style="color:#10b981; margin-right:4px;"></i>${escapeHtml(p.phone)}</div>` : ''}${p.email ? `<div><i class="fa-solid fa-envelope" style="color:#0284c7; margin-right:4px;"></i>${escapeHtml(p.email)}</div>` : ''}</div>`
                : '<span style="color: var(--color-text-secondary);">-</span>';

            tr.innerHTML = `
                <td>
                    <div style="font-weight: 700; color: var(--color-text);"><i class="fa-solid fa-truck" style="color: var(--color-primary); margin-right: 8px;"></i>${escapeHtml(p.name)}</div>
                </td>
                <td><span style="font-family: monospace; font-weight: 600; color: var(--color-text-secondary);">${escapeHtml(p.rnc || '-')}</span></td>
                <td>${contactDisplay}</td>
                <td>${phoneEmail}</td>
                <td>${prodsBadge}</td>
                <td style="text-align: right; white-space: nowrap;">
                    <button class="action-btn edit btn-edit-provider" data-id="${p.id}" title="Editar Detalles del Proveedor" style="margin-right: 6px;">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="action-btn delete btn-delete-provider" data-id="${p.id}" data-name="${escapeHtml(p.name)}" title="Eliminar Proveedor">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            `;
            listBody.appendChild(tr);
        });

        listBody.querySelectorAll('.btn-edit-provider').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = parseInt(btn.getAttribute('data-id'));
                const p = providers.find(item => item.id === id);
                if (p) {
                    window.openProviderModal('edit', p);
                }
            });
        });

        listBody.querySelectorAll('.btn-delete-provider').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                const name = btn.getAttribute('data-name');
                if (!confirm(`¿Seguro que deseas eliminar al proveedor "${name}"?`)) return;
                try {
                    const res = await fetch(`/api/settings/providers/${id}`, { method: 'DELETE' });
                    if (res.ok) {
                        showToast(`Proveedor "${name}" eliminado`, 'success');
                        fetchProvidersConfig();
                        if (typeof fetchSettings === 'function') fetchSettings();
                    } else {
                        showToast('Error al eliminar proveedor', 'error');
                    }
                } catch(e) {
                    showToast('Error de conexión', 'error');
                }
            });
        });
    }

    // --- 5. Catalog Settings Management ---
    async function fetchCatalogConfig() {
        try {
            const res = await fetch('/api/settings/catalog');
            if (res.ok) {
                const catalog = await res.json();
                equipmentCatalog = catalog;
                renderCatalogConfig(catalog);
            }
        } catch(e) {
            console.error('Error fetching catalog:', e);
        }
    }

    function renderCatalogConfig(catalog) {
        const listBody = document.getElementById('settings-catalog-list');
        if (!listBody) return;
        listBody.innerHTML = '';
        if (catalog.length === 0) {
            listBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--color-text-secondary); padding: 20px;">No hay modelos registrados en el catálogo</td></tr>';
            return;
        }
        catalog.forEach(item => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span class="badge badge-info">${escapeHtml(item.type)}</span></td>
                <td><strong>${escapeHtml(item.brand)}</strong></td>
                <td>${escapeHtml(item.model)}</td>
                <td style="text-align: right;">
                    <button class="btn-icon btn-delete-catalog" data-type="${escapeHtml(item.type)}" data-brand="${escapeHtml(item.brand)}" data-model="${escapeHtml(item.model)}" title="Eliminar del Catálogo" style="color: var(--color-danger);">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            `;
            listBody.appendChild(tr);
        });

        listBody.querySelectorAll('.btn-delete-catalog').forEach(btn => {
            btn.addEventListener('click', async () => {
                const type = btn.getAttribute('data-type');
                const brand = btn.getAttribute('data-brand');
                const model = btn.getAttribute('data-model');
                if (!confirm(`¿Eliminar ${brand} ${model} (${type}) del catálogo?`)) return;
                try {
                    const res = await fetch('/api/settings/catalog/delete', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ type, brand, model })
                    });
                    if (res.ok) {
                        showToast('Modelo eliminado del catálogo', 'success');
                        fetchCatalogConfig();
                        fetchCatalogDropdowns();
                    } else {
                        showToast('Error al eliminar del catálogo', 'error');
                    }
                } catch(e) {
                    showToast('Error de conexión', 'error');
                }
            });
        });
    }

    document.getElementById('form-add-catalog')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const typeInput = document.getElementById('catalog-type');
        const brandInput = document.getElementById('catalog-brand');
        const modelInput = document.getElementById('catalog-model');
        const type = typeInput.value.trim();
        const brand = brandInput.value.trim();
        const model = modelInput.value.trim();
        if (!type || !brand || !model) return;
        try {
            const res = await fetch('/api/settings/catalog', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type, brand, model })
            });
            const data = await res.json();
            if (res.ok) {
                showToast('Modelo agregado al catálogo', 'success');
                typeInput.value = '';
                brandInput.value = '';
                modelInput.value = '';
                fetchCatalogConfig();
                fetchCatalogDropdowns();
            } else {
                showToast(data.error || 'Error al guardar en catálogo', 'error');
            }
        } catch(err) {
            showToast('Error de conexión', 'error');
        }
    });

    // --- 6. Stock Limits Settings Management ---
    async function fetchStockLimitsConfig() {
        const listBody = document.getElementById('settings-stock-limits-list');
        if (!listBody) return;
        try {
            const [limitsRes, catalogRes, whRes, devRes] = await Promise.all([
                fetch('/api/settings/stock-limits'),
                fetch('/api/settings/catalog'),
                fetch('/api/settings/warehouses'),
                fetch('/api/devices')
            ]);
            const limits = limitsRes.ok ? await limitsRes.json() : {};
            const catalog = catalogRes.ok ? await catalogRes.json() : [];
            const warehouses = whRes.ok ? await whRes.json() : [];
            const devices = devRes.ok ? await devRes.json() : [];
            stockLimits = limits;

            // Build unified unique items combining both real inventory and catalog
            const combinedMap = new Map();
            
            // Add from actual registered devices first
            devices.forEach(d => {
                const type = (d.type || '').trim();
                const brand = (d.brand || '').trim();
                const model = (d.model || '').trim();
                if (type && model) {
                    const k = `${type.toUpperCase()}|${brand.toUpperCase()}|${model.toUpperCase()}`;
                    combinedMap.set(k, { type, brand, model });
                }
            });

            // Also add from catalog
            catalog.forEach(c => {
                const type = (c.type || '').trim();
                const brand = (c.brand || '').trim();
                const model = (c.model || '').trim();
                if (type && model) {
                    const k = `${type.toUpperCase()}|${brand.toUpperCase()}|${model.toUpperCase()}`;
                    if (!combinedMap.has(k)) {
                        combinedMap.set(k, { type, brand, model });
                    }
                }
            });

            const uniqueList = Array.from(combinedMap.values());

            listBody.innerHTML = '';
            if (uniqueList.length === 0) {
                listBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--color-text-secondary); padding: 20px;">No hay modelos definidos en el inventario o catálogo</td></tr>';
                return;
            }

            const whList = warehouses.map(w => w.name);
            whList.unshift('Sin Almacén / Por Defecto');

            uniqueList.forEach(item => {
                const brand = item.brand || '';
                const model = item.model || '';
                const type = item.type || '';

                whList.forEach(wh => {
                    const key = `${wh} | ${brand} ${model}`;
                    const defaultKey = `Sin Almacén / Por Defecto | ${brand} ${model}`;
                    const currentVal = limits[key] !== undefined ? limits[key] : (wh === 'Sin Almacén / Por Defecto' && limits[defaultKey] !== undefined ? limits[defaultKey] : 0);

                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td><strong>${escapeHtml(type)}</strong></td>
                        <td>${escapeHtml(brand || '-')}</td>
                        <td><span style="font-weight: 600;">${escapeHtml(model)}</span></td>
                        <td><span class="badge ${wh === 'Sin Almacén / Por Defecto' ? 'badge-secondary' : 'badge-info'}"><i class="fa-solid fa-warehouse"></i> ${escapeHtml(wh)}</span></td>
                        <td style="width: 140px; text-align: center;">
                            <input type="number" class="form-control stock-limit-input" data-key="${escapeHtml(key)}" value="${currentVal}" min="0" style="text-align: center;">
                        </td>
                    `;
                    listBody.appendChild(tr);
                });
            });
        } catch(e) {
            console.error('Error loading stock limits config:', e);
        }
    }

    document.getElementById('btn-save-stock-limits')?.addEventListener('click', async () => {
        const inputs = document.querySelectorAll('.stock-limit-input');
        const payload = { ...stockLimits };
        inputs.forEach(inp => {
            const key = inp.getAttribute('data-key');
            const val = parseInt(inp.value, 10) || 0;
            if (key) {
                payload[key] = val;
            }
        });
        try {
            const res = await fetch('/api/settings/stock-limits', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                showToast('Límites de stock guardados correctamente', 'success');
                stockLimits = payload;
            } else {
                showToast('Error al guardar límites', 'error');
            }
        } catch(e) {
            showToast('Error de conexión', 'error');
        }
    });

    // --- 7. Activity Logs Management ---
    async function fetchLogsConfig() {
        const listBody = document.getElementById('settings-logs-list');
        if (!listBody) return;
        try {
            const res = await fetch('/api/logs');
            if (res.ok) {
                const logs = await res.json();
                listBody.innerHTML = '';
                if (logs.length === 0) {
                    listBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--color-text-secondary); padding: 20px;">No hay registros de actividad recientes</td></tr>';
                    return;
                }
                logs.slice(0, 100).forEach(log => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td style="white-space: nowrap; font-size: 12px;">${escapeHtml(log.timestamp || '')}</td>
                        <td><span class="badge badge-info">${escapeHtml(log.username || 'Sistema')}</span></td>
                        <td><strong>${escapeHtml(log.action || '')}</strong></td>
                        <td style="font-size: 13px;">${escapeHtml(log.details || '')}</td>
                    `;
                    listBody.appendChild(tr);
                });
            }
        } catch(e) {
            console.error('Error fetching logs:', e);
        }
    }

    // --- 8. Inactivity Timeout Settings Management ---
    async function fetchInactivityConfig() {
        const select = document.getElementById('inactivity-minutes-select');
        if (!select) return;
        try {
            const res = await fetch('/api/settings/inactivity-timeout');
            if (res.ok) {
                const data = await res.json();
                select.value = data.minutes !== undefined ? String(data.minutes) : '5';
            }
        } catch(e) {
            console.error('Error fetching inactivity config:', e);
        }
    }

    document.getElementById('form-inactivity-settings')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const select = document.getElementById('inactivity-minutes-select');
        const minutes = parseInt(select.value, 10);
        try {
            const res = await fetch('/api/settings/inactivity-timeout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ minutes })
            });
            const data = await res.json();
            if (res.ok) {
                showToast(data.message || 'Tiempo de inactividad actualizado', 'success');
            } else {
                showToast(data.error || 'Error al guardar tiempo de inactividad', 'error');
            }
        } catch(err) {
            showToast('Error de conexión', 'error');
        }
    });

    // --- 9. User Modal and Actions ---
    const userModal = document.getElementById('user-modal');
    document.getElementById('btn-new-user')?.addEventListener('click', () => {
        if (!userModal) return;
        const form = document.getElementById('user-form');
        if (form) form.reset();
        userModal.classList.add('active');
    });

    document.getElementById('btn-close-user-modal')?.addEventListener('click', () => {
        if (userModal) userModal.classList.remove('active');
    });
    document.getElementById('btn-cancel-user')?.addEventListener('click', () => {
        if (userModal) userModal.classList.remove('active');
    });

    document.getElementById('user-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('new-user-username').value.trim();
        const password = document.getElementById('new-user-password').value;
        const role = document.getElementById('new-user-role').value;

        if (!username || !password) {
            showToast('Por favor completa todos los campos requeridos', 'error');
            return;
        }

        try {
            const res = await fetch('/api/settings/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, role })
            });
            const data = await res.json();
            if (res.ok) {
                showToast(`Usuario ${username} creado exitosamente`, 'success');
                if (userModal) userModal.classList.remove('active');
                document.getElementById('user-form').reset();
                fetchUsers();
            } else {
                showToast(data.error || 'Error al crear usuario', 'error');
            }
        } catch (err) {
            showToast('Error de conexión', 'error');
        }
    });

    let allUsersList = [];
    async function fetchUsers() {
        const listBody = document.getElementById('settings-user-list');
        if (!listBody) return;
        try {
            const res = await fetch('/api/settings/users');
            if (res.ok) {
                allUsersList = await res.json();
                renderUsersTable();
            }
        } catch(e) {
            console.error('Error fetching users:', e);
        }
    }

    function renderUsersTable() {
        const listBody = document.getElementById('settings-user-list');
        if (!listBody) return;
        listBody.innerHTML = '';

        if (allUsersList.length === 0) {
            listBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--color-text-secondary); padding: 20px;">No hay usuarios registrados</td></tr>';
            return;
        }

        allUsersList.forEach(user => {
            const tr = document.createElement('tr');
            const roleBadgeClass = user.role === 'Admin' ? 'badge-danger' : (user.role === 'Tecnico' ? 'badge-info' : 'badge-success');
            
            tr.innerHTML = `
                <td><strong>#${user.id}</strong></td>
                <td><span style="font-weight: 600;">${escapeHtml(user.username)}</span></td>
                <td><span class="badge ${roleBadgeClass}">${escapeHtml(user.role)}</span></td>
                <td>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn-icon btn-reset-pass" data-id="${user.id}" data-username="${escapeHtml(user.username)}" title="Restablecer Contraseña" style="color: var(--color-primary);">
                            <i class="fa-solid fa-key"></i>
                        </button>
                        ${user.username !== 'admin' ? `
                        <button class="btn-icon btn-delete-user" data-id="${user.id}" data-username="${escapeHtml(user.username)}" title="Eliminar Usuario" style="color: var(--color-danger);">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                        ` : ''}
                    </div>
                </td>
            `;
            listBody.appendChild(tr);
        });

        listBody.querySelectorAll('.btn-delete-user').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                const uname = btn.getAttribute('data-username');
                if (!confirm(`¿Seguro que deseas eliminar al usuario "${uname}"?`)) return;

                try {
                    const res = await fetch(`/api/settings/users/${id}`, { method: 'DELETE' });
                    if (res.ok) {
                        showToast(`Usuario "${uname}" eliminado`, 'success');
                        fetchUsers();
                    } else {
                        const err = await res.json();
                        showToast(err.error || 'Error al eliminar usuario', 'error');
                    }
                } catch(e) {
                    showToast('Error de conexión', 'error');
                }
            });
        });

        const resetModal = document.getElementById('admin-reset-password-modal');
        listBody.querySelectorAll('.btn-reset-pass').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const uname = btn.getAttribute('data-username');
                document.getElementById('reset-user-id').value = id;
                document.getElementById('reset-username-display').innerText = uname;
                document.getElementById('admin-new-password').value = '';
                if (resetModal) resetModal.classList.add('active');
            });
        });
    }

    document.getElementById('btn-close-admin-reset-modal')?.addEventListener('click', () => {
        document.getElementById('admin-reset-password-modal')?.classList.remove('active');
    });
    document.getElementById('btn-cancel-admin-reset')?.addEventListener('click', () => {
        document.getElementById('admin-reset-password-modal')?.classList.remove('active');
    });
    document.getElementById('admin-reset-password-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('reset-user-id').value;
        const newPassword = document.getElementById('admin-new-password').value;

        try {
            const res = await fetch(`/api/settings/users/${id}/password`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ new_password: newPassword })
            });
            const data = await res.json();
            if (res.ok) {
                showToast(data.message || 'Contraseña actualizada', 'success');
                document.getElementById('admin-reset-password-modal')?.classList.remove('active');
            } else {
                showToast(data.error || 'Error al restablecer contraseña', 'error');
            }
        } catch(err) {
            showToast('Error de conexión', 'error');
        }
    });

    // --- Initialize Configuration Tab Data If on Configuration Page ---
    if (window.location.pathname.includes('/configuracion')) {
        fetchWarehousesConfig();
        fetchHotelsConfig();
        fetchTechniciansConfig();
        fetchProvidersConfig();
        fetchUsers();
        fetchCatalogConfig();
        fetchStockLimitsConfig();
        fetchInactivityConfig();
    }

    // Initialization is handled by checkAuth() after DOM loaded
    checkAuth();
});
