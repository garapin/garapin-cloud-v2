document.addEventListener('DOMContentLoaded', function() {
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

    // Install button functionality
    const installButton = document.querySelector('.install-btn');
    
    if (installButton) {
        installButton.addEventListener('click', async function() {
            const appId = this.dataset.appId;
            try {
                // Get the current user's token
                const user = firebase.auth().currentUser;
                if (!user) {
                    alert('Please login to install applications');
                    return;
                }

                const token = await user.getIdToken();
                
                // Make API call to install the application
                const response = await fetch(`/api/applications/${appId}/install`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                const data = await response.json();
                
                if (data.success) {
                    alert('Application installed successfully!');
                    // Optionally redirect to dashboard or refresh the page
                } else {
                    alert(data.error || 'Failed to install application');
                }
            } catch (error) {
                console.error('Installation error:', error);
                alert('Failed to install application');
            }
        });
    }
}); 