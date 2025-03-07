// Global variables for payment tracking
let currentStatusCheckInterval = null;
let currentPaymentId = null;
let processingModalInstance = null;

// Format amount as Rupiah
function formatRupiah(amount) {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
    }).format(amount);
}

// Function to cancel current payment (global for direct HTML access)
function cancelCurrentPayment() {
    if (currentPaymentId && currentStatusCheckInterval) {
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

// Function to check if iframe loading is blocked by CSP
function checkIframeLoading(iframe, fallbackUrl) {
    // Set a timeout to check if the iframe loaded properly
    setTimeout(() => {
        try {
            // Try to access iframe content - if CSP blocks it, this will fail
            const iframeContent = iframe.contentWindow || iframe.contentDocument;
            
            // If we get here without error and the iframe has loaded content, it's working
            if (iframe.readyState === 'complete' || iframe.contentWindow.document.readyState === 'complete') {
                return;
            }
            
            // If we couldn't verify the iframe loaded properly, use the fallback
            
            // Redirect to the payment page
            setTimeout(() => {
                window.location.href = fallbackUrl;
            }, 1500);
        } catch (e) {
            // If we get an error, CSP is likely blocking the iframe
            console.error('Error accessing iframe content, CSP may be blocking it:', e);
            
            // Redirect to the payment page
            setTimeout(() => {
                window.location.href = fallbackUrl;
            }, 1500);
        }
    }, 2000); // Check after 2 seconds to give iframe time to load
}

document.addEventListener('DOMContentLoaded', function() {
    let userId = null;
    let userEmail = null;
    let userName = null;
    let userPhoneNumber = null;
    let currentSaldo = 0;
    
    // Check if we arrived from a successful payment
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('payment_success')) {
        // Just clear the param from the URL without reloading the page
        const newUrl = window.location.pathname + window.location.hash;
        history.replaceState(null, '', newUrl);
    }
    
    // Get the amount input element
    const amountInput = document.getElementById('amount');
    const amountError = document.getElementById('amountError');
    const minAmount = 10000; // Minimum amount Rp10,000
    
    // Payment processing elements
    const payButton = document.getElementById('payButton');
    processingModalInstance = new bootstrap.Modal(document.getElementById('processingModal'));
    
    // Initialize Firebase Auth
    firebase.auth().onAuthStateChanged(function(user) {
        if (user) {
            userId = user.uid;
            userEmail = user.email;
            if (user.displayName) {
                userName = user.displayName;
            }
            fetchUserSaldo(user);
            fetchUserProfile(user);
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
                
                // Update the saldo display with the amount from the database
                if (userData && userData.amount !== undefined) {
                    currentSaldo = userData.amount;
                    document.getElementById('currentSaldo').textContent = formatRupiah(currentSaldo);
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
    
    // Fetch user's profile information for phone number
    async function fetchUserProfile(user) {
        try {
            // Get user token for authentication
            const token = await user.getIdToken();
            
            // Fetch the user profile data from the backend
            const response = await fetch('/profile/data', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.ok) {
                const profileData = await response.json();
                
                // Store the phone number
                if (profileData && profileData.phone_number) {
                    userPhoneNumber = profileData.phone_number;
                }
                
                // Use the name from profile if available
                if (profileData && profileData.fullname) {
                    userName = profileData.fullname;
                }
        } else {
                console.error('Failed to fetch user profile data');
            }
        } catch (error) {
            console.error('Error fetching user profile:', error);
        }
    }
    
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
    
    // Process payment with Xendit Invoice
    payButton.addEventListener('click', function(e) {
        e.preventDefault();
        
        if (!validateAmount()) {
            return;
        }
        
        const amount = parseInt(amountInput.value.replace(/\D/g, ''));
        
        // Generate a unique external ID for the invoice
        const externalId = `saldo-${userId}-${Date.now()}`;
        
        const customerData = {
            given_names: userName || "User",
            email: userEmail || "user@example.com",
            mobile_number: userPhoneNumber || "+6281234567890"
        };
        
        // Create Xendit Invoice request data
        const invoiceData = {
            external_id: externalId,
            amount: amount,
            description: `Topup saldo user: ${userName || userEmail || userId}`,
            customer: customerData,
            invoice_duration: 1800, // 30 minutes in seconds
            success_redirect_url: `${document.querySelector('[data-base-url]').dataset.baseUrl || window.location.origin}/raku-ai`,
            currency: "IDR"
        };
        
        // Show processing modal
        processingModalInstance.show();
        
        // Make the actual Xendit API call through our server
        fetch('/payments/create-invoice', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(invoiceData)
        })
        .then(response => response.json())
        .then(data => {
            processingModalInstance.hide();
            
            if (data.success) {
                const paymentUrl = data.invoice_url || data.mock_invoice_url;
                
                // Set up payment ID in localStorage for when user returns
                localStorage.setItem('pendingPaymentId', data.id);
                localStorage.setItem('paymentStartTime', Date.now());
                
                // Set up periodic checking for payment status
                if (data.id) {
                    currentPaymentId = data.id;
                    // No need to set interval here as we're redirecting
                }
                
                // Directly redirect to payment page
                window.location.href = paymentUrl;
            } else {
                console.error('Failed to create payment invoice:', data.message || 'Unknown error');
            }
        })
        .catch(error => {
            processingModalInstance.hide();
            console.error('Error creating payment invoice:', error);
        });
    });
    
    // Check for pending payment from localStorage
    const pendingPaymentId = localStorage.getItem('pendingPaymentId');
    const paymentStartTime = localStorage.getItem('paymentStartTime');
    
    if (pendingPaymentId) {
        // Only check if the payment started less than 30 minutes ago
        const thirtyMinutesInMs = 30 * 60 * 1000;
        const now = Date.now();
        const elapsed = now - (paymentStartTime || 0);
        
        if (elapsed < thirtyMinutesInMs) {
            // Set up payment status checking
            currentPaymentId = pendingPaymentId;
            
            // Check payment status immediately with isInitialCheck=true
            checkPaymentStatus(currentPaymentId, true);
            
            // Set up interval for continuous checking
            currentStatusCheckInterval = setInterval(() => {
                checkPaymentStatus(currentPaymentId, false);
            }, 5000);
        } else {
            // Clear expired payment data
            localStorage.removeItem('pendingPaymentId');
            localStorage.removeItem('paymentStartTime');
            localStorage.removeItem('lastPaymentCheck');
            localStorage.removeItem('lastPaymentStatus');
        }
    }
});

// Update the checkPaymentStatus function to update the modal
function checkPaymentStatus(paymentId, isInitialCheck = false) {
    if (!paymentId) return;
    
    fetch(`/payments/status/${paymentId}`)
        .then(response => response.json())
        .then(data => {
            
            // Add payment status to localStorage for tracking
            localStorage.setItem('lastPaymentCheck', Date.now());
            localStorage.setItem('lastPaymentStatus', data.status);
            
            if (data.success && data.status === 'PAID') {
                // Clear the interval to stop checking
                if (currentStatusCheckInterval) {
                    clearInterval(currentStatusCheckInterval);
                    currentStatusCheckInterval = null;
                }
                
                // Clear localStorage payment data
                localStorage.removeItem('pendingPaymentId');
                localStorage.removeItem('paymentStartTime');
                localStorage.removeItem('lastPaymentCheck');
                localStorage.removeItem('lastPaymentStatus');
                
                // Reset payment tracking
                currentPaymentId = null;
                
                // Only reload if this is not the initial check when the page loads
                // This prevents immediate reload when the user returns to make a new payment
                if (!isInitialCheck) {
                    // Reload the page after a short delay to show updated balance
                    setTimeout(() => {
                        window.location.reload();
                    }, 3000);
                }
            } else if (data.success && data.status === 'PENDING') {
                // Continue checking - payment is still pending
            } else if (data.status === 'EXPIRED' || data.status === 'FAILED' || data.status === 'CANCELLED') {
                // Clear localStorage for expired/failed payments
                localStorage.removeItem('pendingPaymentId');
                localStorage.removeItem('paymentStartTime');
                localStorage.removeItem('lastPaymentCheck');
                localStorage.removeItem('lastPaymentStatus');
                
                // Clear the interval to stop checking
                if (currentStatusCheckInterval) {
                    clearInterval(currentStatusCheckInterval);
                    currentStatusCheckInterval = null;
                }
                
                // Only log expired notification if this is not the initial check
                if (!isInitialCheck) {
                }
            } else {
            }
        })
        .catch(error => {
            console.error('Error checking payment status:', error);
        });
} 