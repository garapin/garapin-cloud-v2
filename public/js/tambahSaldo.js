// Global variables for payment tracking
let currentStatusCheckInterval = null;
let currentPaymentId = null;
let processingModalInstance = null;

// Function to cancel current payment (global for direct HTML access)
function cancelCurrentPayment(modalType) {
    if (currentPaymentId && currentStatusCheckInterval) {
        console.log(`${modalType} modal closed. Cancelling payment ${currentPaymentId}`);
        
        // Clear the interval first to stop checking
        clearInterval(currentStatusCheckInterval);
        currentStatusCheckInterval = null;
        
        // Make sure the processing modal is hidden if it's open
        if (processingModalInstance) {
            processingModalInstance.hide();
        }
        
        // Call the API to cancel the payment
        fetch(`/payments/cancel/${currentPaymentId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                console.log('Payment cancelled successfully:', data.message);
            } else {
                console.error('Failed to cancel payment:', data.message);
            }
        })
        .catch(error => {
            console.error('Error cancelling payment:', error);
        })
        .finally(() => {
            // Reset the current payment ID
            currentPaymentId = null;
        });
    } else if (processingModalInstance) {
        // If there's no active payment but the processing modal is visible, hide it
        processingModalInstance.hide();
    }
}

// Function to check for payment success
function checkPaymentSuccess() {
    fetch('/payments/check-success')
        .then(response => response.json())
        .then(data => {
            if (data.success && data.hasPaymentSuccess) {
                // Clear any existing interval for payment status checking
                if (currentStatusCheckInterval) {
                    clearInterval(currentStatusCheckInterval);
                    currentStatusCheckInterval = null;
                }
                
                // Show success notification
                showToast('success', data.message);
                
                // Reset payment tracking
                currentPaymentId = null;
                
                // Redirect to the specified page after a short delay
                setTimeout(() => {
                    window.location.href = data.redirectTo;
                }, 2000);
            }
        })
        .catch(error => {
            console.error('Error checking payment success:', error);
        });
}

// Function to show toast notifications
function showToast(type, message) {
    const toastEl = document.getElementById('paymentToast');
    if (toastEl) {
        const toastBody = toastEl.querySelector('.toast-body');
        if (toastBody) {
            // Set the message
            toastBody.textContent = message;
            
            // Set the toast color based on type
            toastEl.className = 'toast';
            if (type === 'success') {
                toastEl.classList.add('bg-success', 'text-white');
            } else if (type === 'error') {
                toastEl.classList.add('bg-danger', 'text-white');
            } else if (type === 'warning') {
                toastEl.classList.add('bg-warning');
            } else {
                toastEl.classList.add('bg-info', 'text-white');
            }
            
            // Show the toast
            const toast = new bootstrap.Toast(toastEl);
            toast.show();
        }
    }
}

// Start periodic check for payment success
let paymentSuccessCheckInterval = setInterval(checkPaymentSuccess, 5000);

document.addEventListener('DOMContentLoaded', function() {
    let userId = null;
    let currentSaldo = 0;
    
    // Get the amount input element
    const amountInput = document.getElementById('amount');
    const amountError = document.getElementById('amountError');
    const minAmount = 10000; // Minimum amount Rp10,000
    
    // Get payment method elements
    const qrisOption = document.getElementById('qrisOption');
    const vaOption = document.getElementById('vaOption');
    const bankSelection = document.getElementById('bankSelection');
    
    // Payment processing elements
    const payButton = document.getElementById('payButton');
    processingModalInstance = new bootstrap.Modal(document.getElementById('processingModal'));
    const qrisModal = new bootstrap.Modal(document.getElementById('qrisModal'));
    const vaModal = new bootstrap.Modal(document.getElementById('vaModal'));
    
    // Add event listeners to detect when modals are closed
    document.getElementById('qrisModal').addEventListener('hidden.bs.modal', function() {
        cancelCurrentPayment('qris');
    });
    
    document.getElementById('vaModal').addEventListener('hidden.bs.modal', function() {
        cancelCurrentPayment('va');
    });
    
    // Initialize Firebase Auth
    firebase.auth().onAuthStateChanged(function(user) {
        if (user) {
            userId = user.uid;
            fetchUserSaldo(user);
        } else {
            window.location.href = '/login';
        }
    });
    
    // Fetch user's current saldo from the database
    async function fetchUserSaldo(user) {
        try {
            document.getElementById('currentSaldo').textContent = 'Loading...';
            
            // Get user token for authentication
            const token = await user.getIdToken();
            console.log('Fetching user saldo with token');
            
            // Fetch the user data from the backend
            const response = await fetch('/profile/user-data', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const userData = await response.json();
                console.log('User data retrieved:', userData);
                
                // Update the saldo display with the amount from the database
                if (userData && userData.amount !== undefined) {
                    currentSaldo = userData.amount;
                    document.getElementById('currentSaldo').textContent = formatRupiah(currentSaldo);
                    console.log('Saldo updated to:', currentSaldo);
                } else {
                    // Fallback if amount is not available
                    console.warn('Amount field missing in user data response:', userData);
                    currentSaldo = 0;
                    document.getElementById('currentSaldo').textContent = formatRupiah(0);
                }
            } else {
                const errorText = await response.text();
                console.error('Failed to fetch user data:', response.status, errorText);
                document.getElementById('currentSaldo').textContent = formatRupiah(0) + ' (Refresh)';
            }
        } catch (error) {
            console.error('Error fetching user saldo:', error);
            document.getElementById('currentSaldo').textContent = formatRupiah(0) + ' (Error)';
        }
    }
    
    // Format amount as Rupiah
    function formatRupiah(amount) {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
        }).format(amount);
    }
    
    // Toggle bank selection visibility
    vaOption.addEventListener('change', function() {
        bankSelection.style.display = 'block';
        updatePaymentOptionStyles('va');
    });
    
    qrisOption.addEventListener('change', function() {
        bankSelection.style.display = 'none';
        updatePaymentOptionStyles('qris');
    });
    
    // Function to update payment option styling
    function updatePaymentOptionStyles(selected) {
        const qrisContainer = qrisOption.closest('.payment-option');
        const vaContainer = vaOption.closest('.payment-option');
        
        if (selected === 'qris') {
            qrisContainer.classList.add('selected');
            vaContainer.classList.remove('selected');
        } else {
            qrisContainer.classList.remove('selected');
            vaContainer.classList.add('selected');
        }
    }
    
    // Initialize payment option styling
    updatePaymentOptionStyles('qris');
    
    // Validate amount input
    amountInput.addEventListener('input', function() {
        validateAmount();
    });
    
    function validateAmount() {
        const amount = parseInt(amountInput.value.replace(/\D/g, ''));
        
        if (isNaN(amount) || amount < minAmount) {
            amountError.textContent = `Minimum tambah saldo adalah ${formatRupiah(minAmount)}`;
            amountError.style.display = 'block';
            payButton.disabled = true;
            return false;
        } else {
            amountError.style.display = 'none';
            payButton.disabled = false;
            return true;
        }
    }
    
    // Format amount input as Rupiah
    amountInput.addEventListener('input', function(e) {
        let value = e.target.value;
        value = value.replace(/\D/g, '');
        
        if (value !== '') {
            value = parseInt(value).toLocaleString('id-ID');
        }
        
        e.target.value = value;
    });
    
    // Process payment
    payButton.addEventListener('click', function(e) {
        e.preventDefault();
        
        if (!validateAmount()) {
            return;
        }
        
        const amount = parseInt(amountInput.value.replace(/\D/g, ''));
        const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked').value;
        const selectedBank = paymentMethod === 'va' ? document.getElementById('bank').value : null;
        
        // Prepare the request data
        const requestBody = {
            userId: userId,
            amount: amount,
            paymentMethod: paymentMethod,
            bank: selectedBank
        };
        
        // Show processing while creating the payment
        processingModalInstance.show();
        
        // First create the billing record
        fetch('/payments/pre-create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Now make the actual API call immediately
                return fetch('/payments/create', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(data.paymentData)
                });
            } else {
                throw new Error(data.message || 'Failed to prepare payment');
            }
        })
        .then(response => response.json())
        .then(data => {
            processingModalInstance.hide();
            
            if (data.success) {
                if (requestBody.paymentMethod === 'qris') {
                    // Display QRIS payment details with the QR code from Xendit
                    
                    // Convert QR string to a displayable QR code using QRious library
                    if (!window.QRious) {
                        const script = document.createElement('script');
                        script.src = 'https://cdn.jsdelivr.net/npm/qrious@4.0.2/dist/qrious.min.js';
                        script.onload = function() {
                            generateQRCode(data.qrCode);
                        };
                        document.head.appendChild(script);
                    } else {
                        generateQRCode(data.qrCode);
                    }
                    
                    // Set payment details - Add null checks to prevent errors
                    const qrisAmountElement = document.getElementById('qrisAmount');
                    if (qrisAmountElement) {
                        qrisAmountElement.textContent = formatRupiah(requestBody.amount);
                    }
                    
                    const qrisPaymentIdElement = document.getElementById('qrisPaymentId');
                    if (qrisPaymentIdElement) {
                        // Use the dedicated referenceId field if available, otherwise fallback to the one in xenditResponse
                        qrisPaymentIdElement.textContent = data.referenceId || data.xenditResponse.reference_id || data.paymentId;
                    }
                    
                    // Show the QRIS modal
                    qrisModal.show();
                    
                    // Start checking payment status
                    checkPaymentStatus(data.paymentId);
                } else if (requestBody.paymentMethod === 'va') {
                    // Display VA payment details
                    document.getElementById('vaBank').textContent = requestBody.bank.toUpperCase();
                    document.getElementById('vaNumber').textContent = data.accountNumber;
                    document.getElementById('vaNumberInstructions').textContent = data.accountNumber;
                    document.getElementById('vaAmount').textContent = formatRupiah(requestBody.amount);
                    document.getElementById('vaPaymentId').textContent = data.paymentId;
                    
                    // Show the VA modal
                    vaModal.show();
                    
                    // Set up copy button
                    document.getElementById('copyVaButton').addEventListener('click', function() {
                        copyToClipboard(data.accountNumber);
                        this.textContent = 'Tersalin!';
                        setTimeout(() => {
                            this.textContent = 'Salin';
                        }, 2000);
                    });
                    
                    // Start checking payment status
                    checkPaymentStatus(data.paymentId);
                }
            } else {
                alert('Error: ' + data.message);
            }
        })
        .catch(error => {
            processingModalInstance.hide();
            console.error('Error creating payment:', error);
            alert('An error occurred while processing the payment. Please try again.');
        });
    });
    
    // Generate QR code from the QR string
    function generateQRCode(qrString) {
        if (!qrString) {
            console.error('QR string is empty or undefined');
            showQRError('QR code data is missing');
            return;
        }
        
        try {
            console.log('Generating QR code from string');
            
            // Clear previous content
            const qrElement = document.getElementById('qrisImage');
            if (qrElement) {
                // Create a new canvas element
                const context = qrElement.getContext('2d');
                context.clearRect(0, 0, qrElement.width, qrElement.height);
                
                // Generate new QR code with QRious
                new QRious({
                    element: qrElement,
                    value: qrString,
                    size: 300,
                    level: 'H' // High error correction
                });
            } else {
                console.error('QR canvas element not found');
            }
        } catch (error) {
            console.error('Error generating QR code:', error);
            showQRError('Failed to generate QR code');
        }
    }
    
    // Simulate Xendit callback
    function simulateXenditCallback(paymentId) {
        if (!paymentId) {
            console.error('No payment ID available for simulation');
            alert('No payment ID available for simulation');
            return;
        }
        
        console.log('Simulating Xendit callback for payment ID:', paymentId);
        
        // Show a loading message on the button
        const simulateBtn = document.getElementById('simulatePaymentBtn');
        if (simulateBtn) {
            simulateBtn.disabled = true;
            simulateBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Processing...';
        }
        
        // Prepare callback data
        const callbackData = {
            status: 'COMPLETED',
            qr_id: paymentId
        };
        
        // Send the callback data to the server
        fetch('/payments/callback', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(callbackData)
        })
        .then(response => response.json())
        .then(data => {
            console.log('Simulated callback response:', data);
            
            if (data.success) {
                // Show success message
                alert('Payment simulation successful! The callback has been processed.');
                
                // Reset the button
                if (simulateBtn) {
                    simulateBtn.disabled = false;
                    simulateBtn.innerHTML = 'Simulate Payment';
                }
                
                // Clear interval and reset current payment ID
                if (currentStatusCheckInterval) {
                    clearInterval(currentStatusCheckInterval);
                    currentStatusCheckInterval = null;
                }
                
                // Close the QRIS modal
                const qrisModal = bootstrap.Modal.getInstance(document.getElementById('qrisModal'));
                if (qrisModal) {
                    qrisModal.hide();
                }
                
                // Reset current payment ID
                currentPaymentId = null;
                
                // Reload the page after a short delay
                setTimeout(() => {
                    window.location.reload();
                }, 1500);
            } else {
                alert('Payment simulation failed. Please check the console for more information.');
                
                // Reset the button
                if (simulateBtn) {
                    simulateBtn.disabled = false;
                    simulateBtn.innerHTML = 'Simulate Payment';
                }
            }
        })
        .catch(error => {
            console.error('Error simulating payment callback:', error);
            alert('Error simulating payment callback. Please check the console for more information.');
            
            // Reset the button
            if (simulateBtn) {
                simulateBtn.disabled = false;
                simulateBtn.innerHTML = 'Simulate Payment';
            }
        });
    }
    
    // Function to show QR error
    function showQRError(message) {
        const qrElement = document.getElementById('qrisImage');
        if (qrElement) {
            // Display error message instead of QR code
            const parent = qrElement.parentElement;
            const errorDiv = document.createElement('div');
            errorDiv.className = 'alert alert-danger';
            errorDiv.textContent = message;
            parent.insertBefore(errorDiv, qrElement.nextSibling);
        }
    }
    
    // Poll for payment status
    function checkPaymentStatus(paymentId) {
        const checkInterval = 5000; // Check every 5 seconds
        let checkCount = 0;
        const maxChecks = 72; // Check for up to 6 minutes
        
        // Store the payment ID and method globally
        currentPaymentId = paymentId;
        const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked').value;
        
        // Clear any existing interval
        if (currentStatusCheckInterval) {
            clearInterval(currentStatusCheckInterval);
        }
        
        // Create a new interval
        currentStatusCheckInterval = setInterval(function() {
            if (checkCount >= maxChecks) {
                clearInterval(currentStatusCheckInterval);
                currentStatusCheckInterval = null;
                // Handle timeout - payment not completed
                alert('Waktu pembayaran habis. Silakan coba lagi atau hubungi admin jika Anda sudah melakukan pembayaran.');
                return;
            }
            
            checkCount++;
            
            // Check payment status
            fetch(`/payments/status/${paymentId}`)
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        if (data.status === 'PAID') {
                            clearInterval(currentStatusCheckInterval);
                            currentStatusCheckInterval = null;
                            currentPaymentId = null;
                            
                            // Close the appropriate modal based on payment method
                            if (paymentMethod === 'qris') {
                                qrisModal.hide();
                            } else if (paymentMethod === 'va') {
                                vaModal.hide();
                            }
                            
                            // Show success message and redirect
                            alert('Pembayaran berhasil! Saldo Anda telah ditambahkan.');
                            window.location.reload();
                        }
                        // If not paid, continue checking...
                    } else {
                        console.error('Error checking payment status:', data.message);
                    }
                })
                .catch(error => {
                    console.error('Error checking payment status:', error);
                });
        }, checkInterval);
    }
    
    // Copy VA number to clipboard
    function copyToClipboard(text) {
        const tempInput = document.createElement('input');
        tempInput.value = text;
        document.body.appendChild(tempInput);
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
        alert('Nomor VA berhasil disalin');
    }
}); 