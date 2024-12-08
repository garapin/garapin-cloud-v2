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
            
            // Log the installation attempt
            console.log('Attempting to install application:', {
                applicationId: selectedAppId,
                userId: user.uid,
                userToken: 'Bearer ' + idToken.substring(0, 10) + '...'
            });
            
            // Make API call to install the application
            const response = await fetch('/api/applications/install', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    applicationId: selectedAppId,
                    userId: user.uid
                })
            });
            
            const data = await response.json();
            console.log('Installation response:', data);
            
            if (response.ok && data.success) {
                // Update the install count in the UI
                const appCard = document.querySelector(`[data-app-id="${selectedAppId}"]`).closest('.card');
                const installCountElement = appCard.querySelector('.text-muted');
                const currentCount = parseInt(installCountElement.textContent.match(/\d+/)[0]);
                installCountElement.textContent = `(${currentCount + 1} installs)`;
                
                alert('Application installed successfully!');
                // Optionally refresh the page or update UI
                setTimeout(() => {
                    window.location.href = '/my-apps/installed';
                }, 1000);
            } else {
                throw new Error(data.error || data.message || 'Failed to install application');
            }
        } catch (error) {
            console.error('Installation error:', error);
            alert(error.message);
        } finally {
            installModal.hide();
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