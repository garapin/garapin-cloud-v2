// Ensure headerController is only initialized once
if (!window.headerControllerInitialized) {
    document.addEventListener('DOMContentLoaded', async () => {
        console.log('HeaderController initializing...');
        
        try {
            const firebaseConfig = JSON.parse(document.querySelector('[data-firebase-config]').dataset.firebaseConfig);
            if (!firebase.apps?.length) {
                firebase.initializeApp(firebaseConfig);
            }
        } catch (error) {
            console.error('Firebase initialization error:', error);
            return;
        }

        // Function to update UI with user data
        function updateUserUI(user) {
            const userPhotoContainer = document.getElementById('userPhotoContainer');
            const userName = document.getElementById('userName');
            
            if (user) {
                // Update photo
                if (user.photoURL && userPhotoContainer) {
                    userPhotoContainer.innerHTML = `<img src="${user.photoURL}" alt="Profile" class="rounded-circle" style="width: 24px; height: 24px;">`;
                }
                // Update name
                if (user.displayName && userName) {
                    userName.textContent = user.displayName;
                }
            } else {
                // Reset to default state
                if (userPhotoContainer) {
                    userPhotoContainer.innerHTML = '<i class="bi bi-person-circle" style="font-size: 1.2rem;"></i>';
                }
                if (userName) {
                    userName.textContent = 'Guest';
                }
            }
        }

        // Set up logout button handler
        const logoutButton = document.getElementById('logoutButton');
        if (logoutButton) {
            logoutButton.addEventListener('click', async (event) => {
                event.preventDefault();
                try {
                    await firebase.auth().signOut();
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
                // Update UI immediately with Firebase user data
                updateUserUI(user);

                try {
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
                        localStorage.setItem('authToken', token);
                        // Update UI again with any additional data from backend
                        updateUserUI(user);
                    }
                } catch (error) {
                    console.error('Error updating user data:', error);
                }
            } else {
                updateUserUI(null);
                localStorage.removeItem('authToken');
                window.location.href = '/';
            }
        });

        // Check if we have a stored token and try to refresh user data
        const storedToken = localStorage.getItem('authToken');
        if (storedToken) {
            try {
                const currentUser = firebase.auth().currentUser;
                if (currentUser) {
                    updateUserUI(currentUser);
                }
            } catch (error) {
                console.error('Error refreshing user data:', error);
            }
        }
    });
    window.headerControllerInitialized = true;
} 