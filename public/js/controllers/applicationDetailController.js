document.addEventListener('DOMContentLoaded', function() {
    console.log('ApplicationDetailController loaded');
    
    // Initialize Firebase
    const firebaseConfig = JSON.parse(document.querySelector('[data-firebase-config]').dataset.firebaseConfig);
    if (!firebase.apps?.length) {
        firebase.initializeApp(firebaseConfig);
    }

    // Update user info in header
    const userNameElement = document.getElementById('userName');
    const userPhotoContainer = document.getElementById('userPhotoContainer');

    firebase.auth().onAuthStateChanged(function(user) {
        if (user) {
            // Update username
            userNameElement.textContent = user.displayName || user.email;
            
            // Update user photo if available
            if (user.photoURL) {
                userPhotoContainer.innerHTML = `<img src="${user.photoURL}" alt="Profile" style="width: 24px; height: 24px; border-radius: 50%;">`;
            }
        } else {
            window.location.href = '/';
        }
    });

    // Initialize Bootstrap components
    const toastEl = document.getElementById('appToast');
    const modalEl = document.getElementById('installConfirmModal');
    
    if (!toastEl) {
        console.error('Toast element not found');
        return;
    }
    if (!modalEl) {
        console.error('Modal element not found');
        return;
    }

    const toast = new bootstrap.Toast(toastEl);
    const installModal = new bootstrap.Modal(modalEl);
    
    // Helper function to show toast messages
    function showToast(message, isError = false) {
        console.log('Showing toast:', message, isError);
        const toastElement = document.getElementById('appToast');
        const toastBody = toastElement.querySelector('.toast-body');
        toastBody.textContent = message;
        toastElement.classList.toggle('bg-danger', isError);
        toastElement.classList.toggle('text-white', isError);
        toast.show();
    }

    // Helper function to update progress
    function updateProgress(progress, message) {
        console.log('Updating progress:', progress, message);
        const progressBar = document.getElementById('installProgressBar');
        const progressText = document.getElementById('progressText');
        if (progressBar && progressText) {
            progressBar.style.width = `${progress}%`;
            progressBar.setAttribute('aria-valuenow', progress);
            progressText.textContent = message;
        }
    }

    // Install button functionality
    const installButton = document.querySelector('.install-btn');
    const confirmInstallButton = document.getElementById('confirmInstall');
    
    console.log('Install button found:', !!installButton);
    console.log('Confirm install button found:', !!confirmInstallButton);

    if (installButton) {
        installButton.addEventListener('click', function(e) {
            console.log('Install button clicked');
            e.preventDefault();
            
            const appId = this.dataset.appId;
            const appName = document.querySelector('h1.h3').textContent;
            
            console.log('App ID:', appId);
            console.log('App Name:', appName);
            
            const appNameEl = document.getElementById('appNameToInstall');
            if (appNameEl) {
                appNameEl.textContent = appName;
            } else {
                console.error('appNameToInstall element not found');
            }
            
            installModal.show();
        });
    } else {
        console.error('Install button not found');
    }

    if (confirmInstallButton) {
        confirmInstallButton.addEventListener('click', async function() {
            console.log('Confirm install button clicked');
            try {
                // Get the current user's token
                const user = firebase.auth().currentUser;
                if (!user) {
                    showToast('Please login to install applications', true);
                    return;
                }

                const appId = document.querySelector('.install-btn').dataset.appId;
                console.log('Installing app with ID:', appId);
                
                const token = await user.getIdToken();

                // Show progress elements
                document.getElementById('installSpinner').style.display = 'block';
                document.getElementById('progressBarContainer').style.display = 'block';
                confirmInstallButton.disabled = true;

                // Start progress updates
                updateProgress(20, 'Starting installation...');

                // Make API call to install the application
                const response = await fetch(`/store/install/${appId}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                updateProgress(60, 'Processing installation...');

                const data = await response.json();
                
                if (data.success) {
                    updateProgress(100, 'Installation complete!');
                    setTimeout(() => {
                        installModal.hide();
                        showToast('Application installed successfully!');
                        // Reset modal state
                        document.getElementById('installSpinner').style.display = 'none';
                        document.getElementById('progressBarContainer').style.display = 'none';
                        confirmInstallButton.disabled = false;
                        updateProgress(0, 'Initiating installation...');
                    }, 1000);
                } else {
                    throw new Error(data.error || 'Failed to install application');
                }
            } catch (error) {
                console.error('Installation error:', error);
                showToast(error.message || 'Failed to install application', true);
                // Reset modal state
                document.getElementById('installSpinner').style.display = 'none';
                document.getElementById('progressBarContainer').style.display = 'none';
                confirmInstallButton.disabled = false;
                updateProgress(0, 'Initiating installation...');
                installModal.hide();
            }
        });
    } else {
        console.error('Confirm install button not found');
    }
}); 