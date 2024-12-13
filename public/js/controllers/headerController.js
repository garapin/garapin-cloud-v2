// Single source of truth for auth state
window.authInitialized = false;

// Global function to handle logout
window.handleLogout = async () => {
    try {
        // Clear all local storage data
        localStorage.clear();
        
        // Call server logout endpoint
        await fetch('/auth/logout', {
            method: 'POST',
            credentials: 'include'
        });
        
        // Sign out from Firebase
        await firebase.auth().signOut();
        
        // Update UI
        updateUserUI(null);
        
        // Redirect to home page
        window.location.href = '/';
    } catch (error) {
        console.error('Logout error:', error);
        // Force redirect to home page even if there's an error
        window.location.href = '/';
    }
};

// Global function to update UI with user data
window.updateUserUI = (user) => {
    console.log('Raw user data received:', user);
    
    const userMenuButton = document.getElementById('userMenuButton');
    const loginButton = document.getElementById('loginButton');
    const userDropdown = document.getElementById('userDropdown');
    const userNameDisplay = document.getElementById('userName');
    const userPhotoContainer = document.getElementById('userPhotoContainer');
    
    if (!user) {
        if (loginButton) loginButton.style.display = 'block';
        if (userMenuButton) userMenuButton.style.display = 'none';
        if (userDropdown) userDropdown.style.display = 'none';
        return;
    }

    // Handle user name display
    if (userNameDisplay) {
        const displayName = user.displayName || user.name || user.email?.split('@')[0] || 'User';
        userNameDisplay.textContent = displayName;
    }

    // Handle profile image
    if (userPhotoContainer) {
        const showInitialsFallback = () => {
            const initials = (user.displayName || user.name || user.email || 'U')
                .charAt(0)
                .toUpperCase();
            userPhotoContainer.innerHTML = `
                <div class="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center" 
                     style="width: 32px; height: 32px; font-size: 16px;">
                    ${initials}
                </div>`;
        };

        // Get photo URL and check if it's already loaded
        const photoURL = user.photoURL || user.photo_url;
        const existingImg = userPhotoContainer.querySelector('img');
        if (existingImg && existingImg.src === photoURL) {
            return; // Image already loaded correctly
        }

        if (!photoURL) {
            showInitialsFallback();
            return;
        }

        // Create and set up image
        const img = document.createElement('img');
        img.className = 'rounded-circle';
        img.alt = 'Profile';
        img.style.width = '32px';
        img.style.height = '32px';
        img.style.objectFit = 'cover';
        img.setAttribute('referrerpolicy', 'no-referrer');
        img.setAttribute('crossorigin', 'anonymous');
        
        img.onload = () => {
            userPhotoContainer.innerHTML = '';
            userPhotoContainer.appendChild(img);
        };
        
        img.onerror = () => {
            console.warn('Failed to load profile image:', photoURL);
            showInitialsFallback();
        };

        // Set the source last
        img.src = photoURL;
    }

    // Update visibility
    if (loginButton) loginButton.style.display = 'none';
    if (userMenuButton) userMenuButton.style.display = 'block';
};

// Global auth handler that other controllers can use
window.handleAuthStateChange = async (user) => {
    if (window.isAuthenticating) return;
    
    try {
        window.isAuthenticating = true;
        
        if (user) {
            let token;
            try {
                token = await user.getIdToken(false);
            } catch (tokenError) {
                console.warn('Error getting token, trying force refresh:', tokenError);
                token = await user.getIdToken(true);
            }

            // First update UI with Firebase data
            updateUserUI({
                displayName: user.displayName,
                email: user.email,
                photoURL: user.photoURL
            });

            // Send data in the exact format the server expects
            const userData = {
                name: user.displayName,
                email: user.email,
                provider_uid: user.uid,
                photoURL: user.photoURL
            };

            console.log('Sending auth data:', userData);

            const response = await fetch('/auth/user', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(userData)
            });

            if (response.ok) {
                const serverResponse = await response.json();
                console.log('Received user data from server:', serverResponse);
                
                if (serverResponse.user) {
                    // Update UI with the data we sent
                    updateUserUI({
                        displayName: userData.name,
                        email: userData.email,
                        photoURL: userData.photoURL
                    });
                    
                    // Store data
                    window.currentUser = serverResponse.user;
                    localStorage.setItem('authToken', token);
                }
            } else {
                console.error('Failed to update user on server:', await response.text());
                updateUserUI({
                    displayName: user.displayName,
                    email: user.email,
                    photoURL: user.photoURL
                });
            }
        } else {
            window.currentUser = null;
            localStorage.removeItem('authToken');
            updateUserUI(null);
        }
    } catch (error) {
        console.error('Auth handler error:', error);
        if (user) {
            updateUserUI({
                displayName: user.displayName,
                email: user.email,
                photoURL: user.photoURL
            });
        }
    } finally {
        window.isAuthenticating = false;
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    // Prevent multiple initializations
    if (window.authInitialized) {
        return;
    }
    window.authInitialized = true;

    console.log('HeaderController initializing...');
    
    try {
        const firebaseConfig = JSON.parse(document.querySelector('[data-firebase-config]').dataset.firebaseConfig);
        if (!firebase.apps?.length) {
            firebase.initializeApp(firebaseConfig);
            await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        }

        // Single auth state listener
        firebase.auth().onAuthStateChanged(async (user) => {
            if (user) {
                try {
                    console.log('Auth state changed - user logged in:', user.displayName);
                    await window.handleAuthStateChange(user);
                } catch (error) {
                    console.error('Error handling auth state change:', error);
                    updateUserUI(user);
                }
            } else {
                console.log('Auth state changed - user logged out');
                updateUserUI(null);
            }
        });

        // Add logout button click handler
        const logoutButton = document.getElementById('logoutButton');
        if (logoutButton) {
            logoutButton.addEventListener('click', (e) => {
                e.preventDefault();
                window.handleLogout();
            });
        }
    } catch (error) {
        console.error('Firebase initialization error:', error);
    }
}); 