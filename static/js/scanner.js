/**
 * Lógica del Escáner de Códigos de Barras y QR
 * Requiere: html5-qrcode.min.js
 */

document.addEventListener('DOMContentLoaded', () => {
    let html5QrCode = null;
    let currentTargetInput = null;

    const modalScanner = document.getElementById('scanner-modal');
    const btnCloseScanner = document.getElementById('btn-close-scanner');
    const btnCancelScanner = document.getElementById('btn-cancel-scanner');
    
    // Vincular todos los botones de escaneo
    const scanButtons = document.querySelectorAll('.btn-input-scan');
    
    scanButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const targetId = button.getAttribute('data-target');
            if (targetId) {
                currentTargetInput = document.getElementById(targetId);
                openScannerModal();
            }
        });
    });

    function openScannerModal() {
        if (!modalScanner) return;
        
        // Agregar clase active para mostrar el modal (asumiendo CSS existente)
        modalScanner.style.display = 'flex';
        modalScanner.classList.add('active');
        
        // Inicializar el Escáner
        if (!html5QrCode) {
            html5QrCode = new Html5Qrcode("scanner-reader");
        }

        // Configuración orientada a códigos de barras apilados (ej: Serial, MAC juntos)
        // Reducimos la altura a 50px para crear una "ranura" estrecha y evitar leer el código equivocado.
        const config = { 
            fps: 10, 
            qrbox: { width: 250, height: 50 },
            aspectRatio: 1.0
        };
        
        // Intentar usar la cámara trasera
        html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess, onScanFailure)
            .catch(err => {
                console.error("Error al iniciar la cámara:", err);
                const statusMsg = document.getElementById('scanner-status-msg');
                if (statusMsg) {
                    statusMsg.style.display = 'block';
                    statusMsg.style.color = 'var(--color-danger)';
                    statusMsg.textContent = 'Error al acceder a la cámara. Verifica los permisos.';
                } else {
                    alert("No se pudo acceder a la cámara. Por favor, verifica los permisos.");
                }
            });
    }

    function closeScannerModal() {
        if (modalScanner) {
            modalScanner.style.display = 'none';
            modalScanner.classList.remove('active');
        }
        
        if (html5QrCode && html5QrCode.isScanning) {
            html5QrCode.stop().then(() => {
                console.log("Escáner detenido.");
            }).catch(err => {
                console.error("Error al detener el escáner:", err);
            });
        }
    }

    function onScanSuccess(decodedText, decodedResult) {
        console.log(`Resultado del escaneo: ${decodedText}`);
        
        if (currentTargetInput) {
            currentTargetInput.value = decodedText;
            
            // Disparar evento 'input' para cualquier listener asociado
            const event = new Event('input', { bubbles: true });
            currentTargetInput.dispatchEvent(event);
        }
        
        closeScannerModal();
        
        // Mostrar notificación de éxito si existe la función global
        if (typeof window.showToast === 'function') {
            window.showToast('Código escaneado correctamente', 'success');
        }
    }

    function onScanFailure(error) {
        // Ignorar fallos de escaneo continuos, es normal mientras busca el código
    }

    // Eventos de cerrado del modal
    if (btnCloseScanner) {
        btnCloseScanner.addEventListener('click', closeScannerModal);
    }
    
    if (btnCancelScanner) {
        btnCancelScanner.addEventListener('click', closeScannerModal);
    }
});
