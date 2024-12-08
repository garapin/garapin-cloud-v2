// Ensure headerController is only initialized once
if (!window.headerControllerInitialized) {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('HeaderController initializing...');
        
        // Initialize Firebase if not already initialized
        try {
            const firebaseConfig = JSON.parse(document.querySelector('[data-firebase-config]').dataset.firebaseConfig);
            if (!firebase.apps?.length) {
                firebase.initializeApp(firebaseConfig);
            }
        } catch (error) {
            console.error('Firebase initialization error:', error);
        }

        // Set up logout button handler
        const logoutButton = document.getElementById('logoutButton');
        console.log('Logout button found:', logoutButton);

        if (logoutButton) {
            logoutButton.addEventListener('click', async (event) => {
                console.log('Logout button clicked');
                event.preventDefault();
                
                try {
                    console.log('Attempting to sign out...');
                    await firebase.auth().signOut();
                    console.log('Firebase sign out successful');
                    localStorage.removeItem('authToken');
                    sessionStorage.clear();
                    window.location.href = '/';
                } catch (error) {
                    console.error('Logout error:', error);
                    alert('Failed to logout. Please try again.');
                }
            });
        }

        // Handle auth state changes
        firebase.auth().onAuthStateChanged(async (user) => {
            if (user) {
                const token = await user.getIdToken();
                const response = await fetch('/auth/user', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: user.displayName,
                        email: user.email,
                        provider_uid: user.uid,
                        photoURL: user.photoURL
                    })
                });

                if (response.ok) {
                    const userData = await response.json();
                    // Update UI
                    const userPhotoContainer = document.getElementById('userPhotoContainer');
                    const userName = document.getElementById('userName');
                    
                    if (user.photoURL && userPhotoContainer) {
                        userPhotoContainer.innerHTML = `<img src="${user.photoURL}" alt="Profile" class="rounded-circle" style="width: 24px; height: 24px;">`;
                    }
                    if (user.displayName && userName) {
                        userName.textContent = user.displayName;
                    }
                    
                    localStorage.setItem('authToken', token);
                }
            } else {
                // Handle logged out state
                const userName = document.getElementById('userName');
                const userPhotoContainer = document.getElementById('userPhotoContainer');
                
                if (userName) userName.textContent = 'Guest';
                if (userPhotoContainer) {
                    userPhotoContainer.innerHTML = '<i class="bi bi-person-circle" style="font-size: 1.2rem;"></i>';
                }
                
                localStorage.removeItem('authToken');
                window.location.href = '/';
            }
        });
    });
    window.headerControllerInitialized = true;
} 