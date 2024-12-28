document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Initialize Firebase if not already initialized
        const firebaseConfig = JSON.parse(document.querySelector('[data-firebase-config]').dataset.firebaseConfig);
        if (!firebase.apps?.length) {
            firebase.initializeApp(firebaseConfig);
        }

        // Initialize search functionality
        const searchInput = document.getElementById('searchApps');
        if (searchInput) {
            searchInput.addEventListener('input', handleSearch);
        }

        // Initialize install buttons
        const installButtons = document.querySelectorAll('.install-btn');
        installButtons.forEach(button => {
            button.addEventListener('click', handleInstall);
        });

    } catch (error) {
        console.error('Error initializing store:', error);
    }
});

// Handle search functionality
function handleSearch(event) {
    const searchTerm = event.target.value.toLowerCase();
    const cards = document.querySelectorAll('.card');
    const noResults = document.querySelector('.no-results');
    let hasResults = false;

    cards.forEach(card => {
        const title = card.querySelector('.card-title').textContent.toLowerCase();
        const description = card.querySelector('.card-text').textContent.toLowerCase();
        
        if (title.includes(searchTerm) || description.includes(searchTerm)) {
            card.closest('.col').style.display = '';
            hasResults = true;
        } else {
            card.closest('.col').style.display = 'none';
        }
    });

    if (noResults) {
        noResults.style.display = hasResults ? 'none' : 'block';
    }
}

// Handle installation
async function handleInstall(event) {
    try {
        const button = event.currentTarget;
        const appId = button.dataset.appId;
        const modal = new bootstrap.Modal(document.getElementById('installConfirmModal'));
        
        // Get app name from the card
        const card = button.closest('.card');
        const appName = card.querySelector('.card-title').textContent.trim();
        document.getElementById('appNameToInstall').textContent = appName;
        
        // Show modal
        modal.show();
        
        // Handle confirm button
        const confirmButton = document.getElementById('confirmInstall');
        confirmButton.onclick = async () => {
            try {
                // Show spinner and progress bar
                document.getElementById('installSpinner').style.display = 'block';
                document.getElementById('progressBarContainer').style.display = 'block';
                confirmButton.disabled = true;
                
                // Get current user
                const user = firebase.auth().currentUser;
                if (!user) {
                    throw new Error('User not authenticated');
                }
                
                const token = await user.getIdToken();
                
                // Start installation
                const response = await fetch('/store/install', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ appId })
                });
                
                if (!response.ok) {
                    throw new Error('Failed to install application');
                }
                
                const data = await response.json();
                
                // Update progress bar to 100%
                const progressBar = document.getElementById('installProgressBar');
                const progressText = document.getElementById('progressText');
                progressBar.style.width = '100%';
                progressText.textContent = 'Installation initiated successfully!';
                
                // Show success message
                showToast('Installation started successfully!', 'success');
                
                // Use a form to handle the redirection instead of window.location
                const form = document.createElement('form');
                form.method = 'GET';
                form.action = '/my-apps/installed';
                
                // Add a small delay before submitting the form
                setTimeout(() => {
                    document.body.appendChild(form);
                    form.submit();
                }, 2000);
                
            } catch (error) {
                console.error('Installation error:', error);
                showToast('Failed to install application: ' + error.message, 'error');
                modal.hide();
            }
        };
        
    } catch (error) {
        console.error('Error handling install:', error);
        showToast('An error occurred while installing the application', 'error');
    }
}

// Show toast notification
function showToast(message, type = 'info') {
    const toast = document.getElementById('appToast');
    const toastBody = toast.querySelector('.toast-body');
    
    toastBody.textContent = message;
    toast.classList.remove('bg-success', 'bg-danger', 'bg-info');
    
    switch(type) {
        case 'success':
            toast.classList.add('bg-success', 'text-white');
            break;
        case 'error':
            toast.classList.add('bg-danger', 'text-white');
            break;
        default:
            toast.classList.add('bg-info', 'text-white');
    }
    
    const bsToast = new bootstrap.Toast(toast, {
        delay: type === 'error' ? 5000 : 3000
    });
    bsToast.show();
} 