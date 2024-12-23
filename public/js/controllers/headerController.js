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
    if (!user) {
        const loginButton = document.getElementById('loginButton');
        if (loginButton) loginButton.style.display = 'block';
        
        const userMenuButton = document.querySelector('.dropdown');
        if (userMenuButton) userMenuButton.style.display = 'none';
        return;
    }

    // Handle user name display
    const userNameDisplay = document.getElementById('userName');
    if (userNameDisplay) {
        const displayName = user.displayName || user.name || user.email?.split('@')[0] || 'User';
        userNameDisplay.textContent = displayName;
    }

    // Handle profile image
    const userPhotoContainer = document.getElementById('userPhotoContainer');
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

        const photoURL = user.photoURL || user.photo_url;
        if (!photoURL) {
            showInitialsFallback();
            return;
        }

        const img = new Image();
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

        img.src = photoURL;
    }

    // Update visibility
    const loginButton = document.getElementById('loginButton');
    const userMenuButton = document.querySelector('.dropdown');
    if (loginButton) loginButton.style.display = 'none';
    if (userMenuButton) userMenuButton.style.display = 'block';
};

// Global auth handler that other controllers can use
window.handleAuthStateChange = async (user) => {
    if (window.isAuthenticating) return;
    
    try {
        window.isAuthenticating = true;
        
        if (user) {
            const token = await user.getIdToken(true);
            localStorage.setItem('authToken', token);

            // First update UI with Firebase data
            updateUserUI({
                displayName: user.displayName,
                email: user.email,
                photoURL: user.photoURL
            });

            const userData = {
                name: user.displayName,
                email: user.email,
                provider_uid: user.uid,
                photoURL: user.photoURL
            };

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
                if (serverResponse.user) {
                    window.currentUser = serverResponse.user;
                    updateUserUI(serverResponse.user);
                }
            }
        } else {
            window.currentUser = null;
            localStorage.removeItem('authToken');
            updateUserUI(null);
        }
    } catch (error) {
        console.error('Auth handler error:', error);
    } finally {
        window.isAuthenticating = false;
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    if (window.authInitialized) return;
    window.authInitialized = true;

    try {
        const firebaseConfig = JSON.parse(document.querySelector('[data-firebase-config]').dataset.firebaseConfig);
        if (!firebase.apps?.length) {
            firebase.initializeApp(firebaseConfig);
            await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
        }

        // Set up auth state listener
        firebase.auth().onAuthStateChanged(async (user) => {
            if (user) {
                console.log('Auth state changed - user logged in:', user.email);
                await window.handleAuthStateChange(user);
            } else {
                console.log('Auth state changed - user logged out');
                updateUserUI(null);
            }
        });

        // Set up logout button
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