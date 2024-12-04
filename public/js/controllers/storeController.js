document.addEventListener('DOMContentLoaded', function() {
    // Initialize Firebase
    const firebaseConfig = JSON.parse(document.querySelector('[data-firebase-config]').dataset.firebaseConfig);
    firebase.initializeApp(firebaseConfig);

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

    // Search functionality
    const searchInput = document.getElementById('searchApps');
    const appCards = document.querySelectorAll('.card');

    searchInput.addEventListener('input', function(e) {
        const searchTerm = e.target.value.toLowerCase();
        
        appCards.forEach(card => {
            const title = card.querySelector('.card-title').textContent.toLowerCase();
            const description = card.querySelector('.card-text').textContent.toLowerCase();
            
            if (title.includes(searchTerm) || description.includes(searchTerm)) {
                card.closest('.col').style.display = '';
            } else {
                card.closest('.col').style.display = 'none';
            }
        });
    });

    // Install button functionality
    const installButtons = document.querySelectorAll('.install-btn');
    
    installButtons.forEach(button => {
        button.addEventListener('click', async function() {
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
    });
}); 