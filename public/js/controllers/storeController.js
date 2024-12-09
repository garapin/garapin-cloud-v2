document.addEventListener('DOMContentLoaded', function() {
    // Initialize variables
    let selectedAppId = null;
    let selectedAppTitle = null;
    
    // Get modal elements
    const installModal = new bootstrap.Modal(document.getElementById('installConfirmModal'));
    const appNameElement = document.getElementById('appNameToInstall');
    
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
            // Get the current user's ID token
            const user = firebase.auth().currentUser;
            if (!user) {
                alert('Please login to install applications');
                return;
            }
            
            const idToken = await user.getIdToken();
            
            // Get current timestamp in YYMMDDHHMMSS format
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

                alert('Installation initiated successfully!');
                installModal.hide();
                
                // Redirect to installed apps page
                window.location.href = '/my-apps/installed';
            } else {
                throw new Error(data.error || 'Failed to initiate installation');
            }
        } catch (error) {
            console.error('Installation error:', error);
            alert(error.message);
        }
    });

    // Search functionality
    const searchInput = document.getElementById('searchApps');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase();
            document.querySelectorAll('.card').forEach(card => {
                const title = card.querySelector('.card-title').textContent.toLowerCase();
                const description = card.querySelector('.card-text').textContent.toLowerCase();
                const isVisible = title.includes(searchTerm) || description.includes(searchTerm);
                card.closest('.col').style.display = isVisible ? '' : 'none';
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