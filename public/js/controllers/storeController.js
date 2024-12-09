document.addEventListener('DOMContentLoaded', function() {
    // Initialize variables
    let selectedAppId = null;
    let selectedAppTitle = null;
    
    // Get modal elements
    const installModal = new bootstrap.Modal(document.getElementById('installConfirmModal'));
    const appNameElement = document.getElementById('appNameToInstall');
    
    // Toast initialization
    const toastElement = document.getElementById('appToast');
    const toast = new bootstrap.Toast(toastElement, { delay: 3000 });

    // Function to show toast messages
    function showToast(message, type = 'success') {
        const toastBody = toastElement.querySelector('.toast-body');
        toastBody.textContent = message;
        
        // Remove previous classes
        toastElement.classList.remove('bg-success', 'bg-danger', 'text-white');
        
        // Add appropriate styling based on type
        if (type === 'success') {
            toastElement.classList.add('bg-success', 'text-white');
        } else if (type === 'error') {
            toastElement.classList.add('bg-danger', 'text-white');
        }
        
        toast.show();
    }
    
    // Handle install button clicks
    document.querySelectorAll('.install-btn').forEach(button => {
        button.addEventListener('click', function() {
            selectedAppId = this.dataset.appId;
            selectedAppTitle = this.closest('.card').querySelector('.card-title').textContent.trim();
            appNameElement.textContent = selectedAppTitle;
            installModal.show();
        });
    });
    
    // Handle confirm installation
    document.getElementById('confirmInstall').addEventListener('click', async function() {
        try {
            // Show loading spinner and disable buttons
            const spinner = document.getElementById('installSpinner');
            const confirmButton = document.getElementById('confirmInstall');
            const cancelButton = confirmButton.previousElementSibling;
            const closeButton = document.querySelector('#installConfirmModal .btn-close');
            
            spinner.style.display = 'block';
            confirmButton.disabled = true;
            cancelButton.disabled = true;
            closeButton.style.display = 'none';

            // Get the current user's ID token
            const user = firebase.auth().currentUser;
            if (!user) {
                throw new Error('Please login to install applications');
            }
            
            const idToken = await user.getIdToken();
            
            // Get current timestamp in the required format YYMMDDHHMMSS
            const now = new Date();
            const index = now.getFullYear().toString().slice(-2) +
                         String(now.getMonth() + 1).padStart(2, '0') +
                         String(now.getDate()).padStart(2, '0') +
                         String(now.getHours()).padStart(2, '0') +
                         String(now.getMinutes()).padStart(2, '0') +
                         String(now.getSeconds()).padStart(2, '0');

            // Make API call to get deployment details
            const response = await fetch(`/store/install/${selectedAppId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({ index })
            });
            
            const data = await response.json();
            
            if (response.ok && data.success) {
                // Log the API details that would be called
                console.log('API that will be called:', {
                    url: data.apiDetails.url,
                    headers: data.apiDetails.headers,
                    body: data.apiDetails.body
                });

                showToast('Installation initiated successfully!', 'success');
                
                // Hide spinner and close modal
                spinner.style.display = 'none';
                bootstrap.Modal.getInstance(document.getElementById('installConfirmModal')).hide();
                
                // Redirect to installed apps page
                setTimeout(() => {
                    window.location.href = '/my-apps/installed';
                }, 1000);
            } else {
                throw new Error(data.error || 'Failed to initiate installation');
            }
        } catch (error) {
            console.error('Installation error:', error);
            showToast(error.message || 'Failed to install application', 'error');
            
            // Reset modal state
            const spinner = document.getElementById('installSpinner');
            const confirmButton = document.getElementById('confirmInstall');
            const cancelButton = confirmButton.previousElementSibling;
            const closeButton = document.querySelector('#installConfirmModal .btn-close');
            
            spinner.style.display = 'none';
            confirmButton.disabled = false;
            cancelButton.disabled = false;
            closeButton.style.display = 'block';
        }
    });

    // Search functionality
    const searchInput = document.getElementById('searchApps');
    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            const searchTerm = e.target.value.toLowerCase();
            const appCards = document.querySelectorAll('.app-card');
            
            appCards.forEach(card => {
                const title = card.querySelector('.card-title').textContent.toLowerCase();
                const description = card.querySelector('.card-text').textContent.toLowerCase();
                
                if (title.includes(searchTerm) || description.includes(searchTerm)) {
                    card.style.display = '';
                } else {
                    card.style.display = 'none';
                }
            });
        });
    }
}); 

function install(appId) {
    // Get the current timestamp in the required format DDMMYYHHMMSS
    const now = new Date();
    const index = now.getDate().toString().padStart(2, '0') +
                 (now.getMonth() + 1).toString().padStart(2, '0') +
                 now.getFullYear().toString().slice(-2) +
                 now.getHours().toString().padStart(2, '0') +
                 now.getMinutes().toString().padStart(2, '0') +
                 now.getSeconds().toString().padStart(2, '0');

    // Show loading state
    const installButton = document.querySelector(`button[data-app-id="${appId}"]`);
    const originalText = installButton.textContent;
    installButton.disabled = true;
    installButton.textContent = 'Installing...';

    // Get the auth token
    firebase.auth().currentUser.getIdToken(true)
        .then(token => {
            return fetch(`/store/install/${appId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ index })
            });
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Log the API details that would be called
                console.log('Installation API Details:', data.apiDetails);
                
                // Show success message
                showToast('Installation record created. API details logged to console.', 'success');
                
                // Optionally update UI or redirect
                setTimeout(() => {
                    window.location.href = '/installed-apps';
                }, 2000);
            } else {
                throw new Error(data.error || 'Installation failed');
            }
        })
        .catch(error => {
            console.error('Installation error:', error);
            showToast(error.message || 'Failed to install application', 'error');
        })
        .finally(() => {
            // Reset button state
            installButton.disabled = false;
            installButton.textContent = originalText;
        });
} 