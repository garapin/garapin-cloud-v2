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