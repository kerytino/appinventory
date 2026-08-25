/**
 * Módulo de Despacho de Equipos
 * The Excellence Collection - AppInventory
 */

document.addEventListener('DOMContentLoaded', () => {
    let stockDevices = [];
    let allHotels = [];
    let allTechnicians = [];
    let selectedDevice = null;

    // Toast helper
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
    const searchInput = document.getElementById('dispatch-search-input');
    const searchResults = document.getElementById('dispatch-search-results');
    const searchGroup = document.getElementById('dispatch-search-group') || (searchInput ? searchInput.closest('.form-group') : null);
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
    const stepIndicators = document.querySelectorAll('.flow-steps .step');

    function setStep(stepNum) {
        if (!stepIndicators || stepIndicators.length === 0) return;
        stepIndicators.forEach((st, idx) => {
            if (idx + 1 === stepNum) {
                st.classList.add('active');
            } else {
                st.classList.remove('active');
            }
        });
    }

    async function loadData() {
        try {
            const [devRes, hotRes, techRes] = await Promise.all([
                fetch('/api/devices'),
                fetch('/api/settings/hotels'),
                fetch('/api/settings/technicians')
            ]);

            if (devRes.ok) {
                const devices = await devRes.json();
                stockDevices = devices.filter(d => (d.status === 'En Stock' || d.status === 'Reparado') && (d.quantity > 0 || d.quantity === undefined));
            }
            if (hotRes.ok) {
                allHotels = await hotRes.json();
                populateDatalists();
            }
            if (techRes.ok) {
                allTechnicians = await techRes.json();
                populateDatalists();
            }
        } catch (e) {
            console.error('Error loading dispatch data:', e);
        }
    }

    function populateDatalists() {
        let hotelList = document.getElementById('hotel-options');
        if (!hotelList) {
            hotelList = document.createElement('datalist');
            hotelList.id = 'hotel-options';
            document.body.appendChild(hotelList);
        }
        hotelList.innerHTML = '';
        allHotels.forEach(h => {
            const opt = document.createElement('option');
            opt.value = h.name + (h.sigla ? ` (${h.sigla})` : '');
            hotelList.appendChild(opt);
        });

        let techList = document.getElementById('technician-options');
        if (!techList) {
            techList = document.createElement('datalist');
            techList.id = 'technician-options';
            document.body.appendChild(techList);
        }
        techList.innerHTML = '';
        allTechnicians.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.name;
            techList.appendChild(opt);
        });
    }

    function renderSearchResults(matches) {
        if (!searchResults) return;

        if (matches.length === 0) {
            searchResults.innerHTML = `
                <div style="padding: 16px; color: var(--color-text-secondary); text-align: center;">
                    <i class="fa-solid fa-box-open" style="font-size: 20px; display: block; margin-bottom: 6px; opacity: 0.5;"></i>
                    No se encontraron equipos en stock que coincidan con la búsqueda.
                </div>
            `;
            searchResults.style.display = 'block';
            return;
        }

        searchResults.innerHTML = '';
        matches.forEach(item => {
            const div = document.createElement('div');
            div.style.padding = '12px 16px';
            div.style.cursor = 'pointer';
            div.style.borderBottom = '1px solid var(--color-border)';
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.style.alignItems = 'center';
            div.style.transition = 'all 0.15s ease';
            div.className = 'dispatch-search-item';

            const serialText = item.serial_number ? `S/N: ${escapeHtml(item.serial_number)}` : 'S/N: N/A';
            const macText = item.mac_address ? `MAC: ${escapeHtml(item.mac_address)}` : '';
            const warehouseText = item.warehouse || 'Almacén Principal';
            const availableQty = item.quantity || 1;

            div.innerHTML = `
                <div>
                    <div style="font-weight: 700; color: var(--color-text); font-size: 14px;">
                        ${escapeHtml(item.name)} 
                        <span style="font-weight: 400; color: var(--color-text-secondary); font-size: 13px;">(${escapeHtml(item.brand || '-')} / ${escapeHtml(item.model || '-')})</span>
                    </div>
                    <div style="font-size: 12px; color: var(--color-text-secondary); margin-top: 4px; display: flex; gap: 12px; flex-wrap: wrap;">
                        <span><i class="fa-solid fa-warehouse" style="color: #6366f1; margin-right: 4px;"></i>${escapeHtml(warehouseText)}</span>
                        <span style="font-family: monospace;">${serialText}</span>
                        ${macText ? `<span style="font-family: monospace;">${macText}</span>` : ''}
                    </div>
                </div>
                <div style="text-align: right;">
                    <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; font-weight: 700; font-size: 12px; padding: 4px 10px; border-radius: 6px;">
                        <i class="fa-solid fa-cubes"></i> ${availableQty} en stock
                    </span>
                </div>
            `;

            div.onmouseenter = () => {
                div.style.background = 'rgba(99, 102, 241, 0.08)';
            };
            div.onmouseleave = () => {
                div.style.background = 'transparent';
            };

            div.onclick = () => {
                selectDevice(item);
            };

            searchResults.appendChild(div);
        });

        searchResults.style.display = 'block';
    }

    function searchDevices(query) {
        if (!query || query.trim().length === 0) {
            // If empty, show first 10 items in stock
            renderSearchResults(stockDevices.slice(0, 10));
            return;
        }

        const q = query.trim().toLowerCase();
        const matches = stockDevices.filter(d => {
            const name = (d.name || '').toLowerCase();
            const brand = (d.brand || '').toLowerCase();
            const model = (d.model || '').toLowerCase();
            const type = (d.type || '').toLowerCase();
            const sn = (d.serial_number || '').toLowerCase();
            const mac = (d.mac_address || '').toLowerCase();
            const wh = (d.warehouse || '').toLowerCase();
            return name.includes(q) || brand.includes(q) || model.includes(q) || type.includes(q) || sn.includes(q) || mac.includes(q) || wh.includes(q);
        });

        renderSearchResults(matches);
    }

    function selectDevice(device) {
        selectedDevice = device;
        hiddenIdInput.value = device.id;

        // Populate card
        cardTitle.innerHTML = `<strong>${escapeHtml(device.name)}</strong> <span style="font-weight: normal; font-size: 14px;">(${escapeHtml(device.brand || '-')} / ${escapeHtml(device.model || '-')})</span>`;
        const serialText = device.serial_number ? `S/N: ${escapeHtml(device.serial_number)}` : 'S/N: -';
        const macText = device.mac_address ? `MAC: ${escapeHtml(device.mac_address)}` : '';
        const whText = device.warehouse || 'Almacén';
        cardDetails.innerHTML = `<i class="fa-solid fa-warehouse" style="color: var(--color-primary); margin-right: 4px;"></i><strong>${escapeHtml(whText)}</strong> • <span style="font-family: monospace;">${serialText}</span> ${macText ? `• <span style="font-family: monospace;">${macText}</span>` : ''}`;

        // Hide search input & show card + fields
        if (searchGroup) {
            searchGroup.style.display = 'none';
        }
        if (searchResults) {
            searchResults.style.display = 'none';
        }
        if (selectedDeviceCard) {
            selectedDeviceCard.style.display = 'block';
        }
        if (detailsFields) {
            detailsFields.style.display = 'block';
        }

        const availableQty = device.quantity || 1;
        if (availableQtyLabel) {
            availableQtyLabel.innerHTML = `<i class="fa-solid fa-circle-check" style="color: #10b981;"></i> Disponible en stock: <strong>${availableQty} unidad(es)</strong>`;
        }

        if (qtyInput) {
            qtyInput.max = availableQty;
            qtyInput.min = 1;
            qtyInput.value = 1;
        }

        setStep(2);
    }

    function resetSelection() {
        selectedDevice = null;
        if (hiddenIdInput) hiddenIdInput.value = '';
        if (selectedDeviceCard) selectedDeviceCard.style.display = 'none';
        if (detailsFields) detailsFields.style.display = 'none';
        if (searchGroup) searchGroup.style.display = 'block';
        if (searchInput) {
            searchInput.value = '';
            searchInput.focus();
        }
        if (searchResults) searchResults.style.display = 'none';
        setStep(1);
    }

    if (btnChangeDevice) {
        btnChangeDevice.addEventListener('click', resetSelection);
    }

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            searchDevices(e.target.value);
        });

        searchInput.addEventListener('focus', () => {
            if (stockDevices.length === 0) {
                loadData().then(() => searchDevices(searchInput.value));
            } else {
                searchDevices(searchInput.value);
            }
        });
    }

    document.addEventListener('click', (e) => {
        if (searchInput && searchResults && !searchInput.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.style.display = 'none';
        }
    });

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (!selectedDevice) {
                showToast('Seleccione un equipo antes de continuar', 'warning');
                return;
            }

            const qtyToDispatch = parseInt(qtyInput.value, 10);
            const destination = hotelInput.value.trim();
            const technician = techInput.value.trim();
            const notes = notesInput.value.trim();

            const availableQty = selectedDevice.quantity || 1;

            if (isNaN(qtyToDispatch) || qtyToDispatch <= 0 || qtyToDispatch > availableQty) {
                showToast(`Cantidad inválida. Máximo disponible: ${availableQty}`, 'error');
                return;
            }

            if (!destination) {
                showToast('Por favor ingrese el destino (Hotel / Locación)', 'warning');
                return;
            }

            if (!technician) {
                showToast('Por favor ingrese el técnico responsable', 'warning');
                return;
            }

            const payload = {
                status: 'Despachado / Instalado',
                location: destination,
                dispatched_by: technician,
                quantity: qtyToDispatch,
                description: notes ? `${notes} (Despachado del stock)` : 'Despachado del stock'
            };

            try {
                const res = await fetch(`/api/devices/${selectedDevice.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (res.ok) {
                    showToast(`Despacho confirmado: ${qtyToDispatch} unidad(es) de ${selectedDevice.name} entregadas a ${technician}`, 'success');
                    setStep(3);
                    setTimeout(() => {
                        resetSelection();
                        loadData();
                    }, 1200);
                } else {
                    const err = await res.json();
                    showToast(err.error || 'Error al procesar el despacho', 'error');
                }
            } catch (err) {
                console.error(err);
                showToast('Error de conexión con el servidor', 'error');
            }
        });
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

    // Global hook
    window.initDispatchModule = function() {
        resetSelection();
        loadData();
    };

    // Auto-boot
    loadData();
    setStep(1);
});
