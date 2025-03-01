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
    const processingModal = new bootstrap.Modal(document.getElementById('processingModal'));
    const qrisModal = new bootstrap.Modal(document.getElementById('qrisModal'));
    const vaModal = new bootstrap.Modal(document.getElementById('vaModal'));
    
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
                } else {
                    // Fallback if amount is not available
                    currentSaldo = 0;
                    document.getElementById('currentSaldo').textContent = formatRupiah(0);
                }
            } else {
                console.error('Failed to fetch user data:', response.status);
                document.getElementById('currentSaldo').textContent = formatRupiah(0);
            }
        } catch (error) {
            console.error('Error fetching user saldo:', error);
            document.getElementById('currentSaldo').textContent = formatRupiah(0);
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
        
        processingModal.show();
        
        // Create payment request to our mock backend
        fetch('/payments/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                userId: userId,
                amount: amount,
                paymentMethod: paymentMethod,
                bank: selectedBank
            })
        })
        .then(response => response.json())
        .then(data => {
            processingModal.hide();
            
            if (data.success) {
                if (paymentMethod === 'qris') {
                    // Display QRIS payment details with mock data
                    document.getElementById('qrisImage').src = data.qrCode;
                    document.getElementById('qrisAmount').textContent = formatRupiah(amount);
                    document.getElementById('qrisPaymentId').textContent = data.paymentId;
                    qrisModal.show();
                    
                    // In the mock version, we don't actually check payment status
                    // Instead, add a simulated "Pay Now" button for demo purposes
                    simulatePaymentButton(data.paymentId);
                } else if (paymentMethod === 'va') {
                    // Display VA payment details with mock data
                    document.getElementById('vaNumber').textContent = data.accountNumber;
                    document.getElementById('vaBank').textContent = data.bank.toUpperCase();
                    document.getElementById('vaAmount').textContent = formatRupiah(amount);
                    document.getElementById('vaPaymentId').textContent = data.paymentId;
                    vaModal.show();
                    
                    // In the mock version, we don't actually check payment status
                    // Instead, add a simulated "Pay Now" button for demo purposes
                    simulatePaymentButton(data.paymentId);
                }
            } else {
                alert('Terjadi kesalahan: ' + data.message);
            }
        })
        .catch(error => {
            processingModal.hide();
            console.error('Error creating payment:', error);
            alert('Terjadi kesalahan. Silakan coba lagi.');
        });
    });
    
    // Add a simulated payment button for the mock version
    function simulatePaymentButton(paymentId) {
        // Add a "Simulate Payment" button to the modals for demo purposes
        const qrisModalFooter = document.querySelector('#qrisModal .modal-footer');
        const vaModalFooter = document.querySelector('#vaModal .modal-footer');
        
        if (!document.getElementById('simulateQrisPayment')) {
            const simulateQrisBtn = document.createElement('button');
            simulateQrisBtn.id = 'simulateQrisPayment';
            simulateQrisBtn.className = 'btn btn-success';
            simulateQrisBtn.textContent = 'Simulasi Pembayaran Berhasil';
            simulateQrisBtn.addEventListener('click', function() {
                alert('Pembayaran berhasil! Saldo Anda telah ditambahkan.');
                qrisModal.hide();
                window.location.href = '/raku-ai';
            });
            qrisModalFooter.appendChild(simulateQrisBtn);
        }
        
        if (!document.getElementById('simulateVaPayment')) {
            const simulateVaBtn = document.createElement('button');
            simulateVaBtn.id = 'simulateVaPayment';
            simulateVaBtn.className = 'btn btn-success';
            simulateVaBtn.textContent = 'Simulasi Pembayaran Berhasil';
            simulateVaBtn.addEventListener('click', function() {
                alert('Pembayaran berhasil! Saldo Anda telah ditambahkan.');
                vaModal.hide();
                window.location.href = '/raku-ai';
            });
            vaModalFooter.appendChild(simulateVaBtn);
        }
    }
    
    // Copy VA number to clipboard
    document.getElementById('copyVaButton').addEventListener('click', function() {
        const vaNumber = document.getElementById('vaNumber').textContent;
        navigator.clipboard.writeText(vaNumber)
            .then(() => {
                alert('Nomor VA berhasil disalin');
            })
            .catch(err => {
                console.error('Error copying VA number:', err);
            });
    });
}); 