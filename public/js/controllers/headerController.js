// Ensure headerController is only initialized once
if (!window.headerControllerInitialized) {
    // Global auth state flag
    window.isAuthenticating = false;
    window.currentUser = null;

    // Global auth handler that other controllers can use
    window.handleAuthStateChange = async (user) => {
        if (window.isAuthenticating) return;
        
        try {
            window.isAuthenticating = true;
            
            if (user) {
                const token = await user.getIdToken(true);
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
                    window.currentUser = {
                        ...user,
                        name: userData.user.name || user.displayName,
                        photoURL: userData.user.photoURL || user.photoURL
                    };
                    
                    // If we're on the login page and auth is successful, redirect to dashboard
                    if (window.location.pathname === '/') {
                        window.location.href = '/dashboard';
                    }
                    return userData;
                }
            } else {
                window.currentUser = null;
                localStorage.removeItem('authToken');
                // Only redirect to login if we're not already there
                if (window.location.pathname !== '/') {
                    window.location.href = '/';
                }
            }
        } catch (error) {
            console.error('Auth handler error:', error);
            throw error;
        } finally {
            window.isAuthenticating = false;
        }
    };

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
                // Update name - prioritize name from backend data
                const displayName = user.name || user.displayName || user.email?.split('@')[0] || 'User';
                if (userName) {
                    userName.textContent = displayName;
                    // Store the name in localStorage for persistence
                    localStorage.setItem('userName', displayName);
                }

                // Update photo - prioritize backend photoURL
                const photoUrl = user.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=7B7FF6&color=fff`;
                if (userPhotoContainer) {
                    userPhotoContainer.innerHTML = `<img src="${photoUrl}" alt="Profile" class="rounded-circle" style="width: 24px; height: 24px; object-fit: cover;">`;
                    // Store the photo URL in localStorage for persistence
                    localStorage.setItem('userPhotoURL', photoUrl);
                }
            } else {
                // Reset to default state
                if (userPhotoContainer) {
                    userPhotoContainer.innerHTML = '<i class="bi bi-person-circle" style="font-size: 1.2rem;"></i>';
                }
                if (userName) {
                    userName.textContent = 'Guest';
                }
                // Clear stored values
                localStorage.removeItem('userName');
                localStorage.removeItem('userPhotoURL');
            }
        }

        // Add a function to restore UI from localStorage
        function restoreUserUI() {
            const storedName = localStorage.getItem('userName');
            const storedPhotoURL = localStorage.getItem('userPhotoURL');
            const userPhotoContainer = document.getElementById('userPhotoContainer');
            const userName = document.getElementById('userName');

            if (storedName && userName) {
                userName.textContent = storedName;
            }

            if (storedPhotoURL && userPhotoContainer) {
                userPhotoContainer.innerHTML = `<img src="${storedPhotoURL}" alt="Profile" class="rounded-circle" style="width: 24px; height: 24px; object-fit: cover;">`;
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

        // Initialize Firebase Auth listener
        firebase.auth().onAuthStateChanged(async (user) => {
            if (user) {
                try {
                    const userData = await window.handleAuthStateChange(user);
                    if (userData?.user) {
                        updateUserUI({
                            ...user,
                            name: userData.user.name,
                            photoURL: userData.user.photoURL
                        });
                    } else {
                        updateUserUI(user);
                    }
                } catch (error) {
                    console.error('Error handling auth state change:', error);
                    updateUserUI(user);
                }
            } else {
                updateUserUI(null);
            }
        });

        // Restore UI from localStorage on page load
        restoreUserUI();
    });
    window.headerControllerInitialized = true;
} 