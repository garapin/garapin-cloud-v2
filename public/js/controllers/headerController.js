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
        async function updateUserUI(user) {
            const userPhotoContainer = document.getElementById('userPhotoContainer');
            const userName = document.getElementById('userName');
            
            if (user) {
                // Update name - prioritize name from user data
                const displayName = user.name || user.displayName || user.email?.split('@')[0] || 'User';
                if (userName) {
                    userName.textContent = displayName;
                }

                // Update photo
                if (userPhotoContainer && user.photoURL) {
                    userPhotoContainer.innerHTML = `<img src="${user.photoURL}" alt="Profile" class="rounded-circle" style="width: 24px; height: 24px; object-fit: cover;">`;
                } else if (userPhotoContainer) {
                    // Fallback to initials avatar if no photo URL
                    const fallbackURL = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=7B7FF6&color=fff`;
                    userPhotoContainer.innerHTML = `<img src="${fallbackURL}" alt="Profile" class="rounded-circle" style="width: 24px; height: 24px;">`;
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
                    const token = await user.getIdToken(true); // Force token refresh
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
                        // Update UI with the latest user data, including the name from the server
                        updateUserUI({
                            ...user,
                            name: userData.name || user.displayName,
                            photoURL: userData.photoURL || user.photoURL
                        });
                    }
                } catch (error) {
                    console.error('Error updating user data:', error);
                }
            } else {
                updateUserUI(null);
                localStorage.removeItem('authToken');
                if (window.location.pathname !== '/') {
                    window.location.href = '/';
                }
            }
        });
    });
    window.headerControllerInitialized = true;
} 