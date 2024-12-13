// Ensure headerController is only initialized once
if (!window.headerControllerInitialized) {
    // Global auth state flag
    window.isAuthenticating = false;
    window.currentUser = null;

    // Global function to update UI with user data
    function updateUserUI(user) {
        const userPhotoContainer = document.getElementById('userPhotoContainer');
        const userName = document.getElementById('userName');
        
        if (user) {
            console.log('UpdateUserUI received user data:', {
                rawUser: user,
                delegate: user._delegate,
                displayName: user.displayName || user._delegate?.displayName
            });

            // Get the most reliable name source
            const displayName = user.displayName || 
                              user._delegate?.displayName || 
                              localStorage.getItem('userName') || 
                              user.email?.split('@')[0] || 
                              'User';
            
            console.log('Updating UI with name:', displayName, 'from user data:', {
                displayName: user.displayName,
                delegateDisplayName: user._delegate?.displayName,
                storedName: localStorage.getItem('userName'),
                email: user.email
            });
            
            if (userName) {
                userName.textContent = displayName;
                // Update localStorage with the current display name
                localStorage.setItem('userName', displayName);
            }

            // Get the most reliable photo source
            const photoUrl = user.photoURL || 
                           user._delegate?.photoURL || 
                           localStorage.getItem('userPhotoURL') || 
                           `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=7B7FF6&color=fff`;
            
            if (userPhotoContainer) {
                userPhotoContainer.innerHTML = `<img src="${photoUrl}" alt="Profile" class="rounded-circle" style="width: 24px; height: 24px; object-fit: cover;">`;
                // Update localStorage with the current photo URL
                if (photoUrl && !photoUrl.includes('ui-avatars.com')) {
                    localStorage.setItem('userPhotoURL', photoUrl);
                }
            }
        } else {
            if (userPhotoContainer) {
                userPhotoContainer.innerHTML = '<i class="bi bi-person-circle" style="font-size: 1.2rem;"></i>';
            }
            if (userName) {
                userName.textContent = 'Guest';
            }
            // Clear localStorage
            localStorage.removeItem('userName');
            localStorage.removeItem('userPhotoURL');
        }
    }
    // Make updateUserUI available globally
    window.updateUserUI = updateUserUI;

    // Global auth handler that other controllers can use
    window.handleAuthStateChange = async (user) => {
        if (window.isAuthenticating) return;
        
        try {
            window.isAuthenticating = true;
            
            if (user) {
                const token = await user.getIdToken(true);
                console.log('Sending auth request for user:', user.displayName || user._delegate?.displayName);

                const response = await fetch('/auth/user', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: user.displayName || user._delegate?.displayName,
                        email: user.email,
                        provider_uid: user.uid,
                        photoURL: user.photoURL || user._delegate?.photoURL
                    })
                });

                if (response.ok) {
                    const userData = await response.json();
                    console.log('Received user data from server:', userData);
                    
                    if (userData.user) {
                        // Store the token and user data
                        localStorage.setItem('authToken', token);
                        localStorage.setItem('userName', userData.user.name || user.displayName || user._delegate?.displayName);
                        localStorage.setItem('userEmail', userData.user.email);
                        localStorage.setItem('userPhotoURL', userData.user.photoURL || user.photoURL || user._delegate?.photoURL);
                        
                        // Update global user object with merged data
                        window.currentUser = {
                            ...user,
                            displayName: userData.user.name || user.displayName || user._delegate?.displayName,
                            email: userData.user.email,
                            photoURL: userData.user.photoURL || user.photoURL || user._delegate?.photoURL,
                            namespace: userData.user.namespace
                        };
                        
                        // Update UI immediately with merged data
                        updateUserUI(window.currentUser);
                    } else {
                        console.error('Server response missing user data:', userData);
                        updateUserUI(user);
                    }
                    
                    if (window.location.pathname === '/') {
                        window.location.href = '/dashboard';
                    }
                    return userData;
                } else {
                    console.error('Failed to update user on server:', await response.text());
                    updateUserUI(user);
                }
            } else {
                window.currentUser = null;
                localStorage.removeItem('authToken');
                localStorage.removeItem('userName');
                localStorage.removeItem('userEmail');
                localStorage.removeItem('userPhotoURL');
                
                updateUserUI(null);
                
                if (window.location.pathname !== '/') {
                    window.location.href = '/';
                }
            }
        } catch (error) {
            console.error('Auth handler error:', error);
            updateUserUI(user); // Fallback to Firebase user data
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

            // Set up logout button handler
            const logoutButton = document.getElementById('logoutButton');
            if (logoutButton) {
                logoutButton.addEventListener('click', async (event) => {
                    event.preventDefault();
                    console.log('Logout clicked');
                    try {
                        await firebase.auth().signOut();
                        console.log('Firebase sign out successful');
                        // Clear all stored data
                        localStorage.removeItem('authToken');
                        localStorage.removeItem('userName');
                        localStorage.removeItem('userEmail');
                        localStorage.removeItem('userPhotoURL');
                        sessionStorage.clear();
                        // Redirect to login page
                        window.location.href = '/';
                    } catch (error) {
                        console.error('Logout error:', error);
                        alert('Failed to logout. Please try again.');
                    }
                });
            } else {
                console.warn('Logout button not found in the DOM');
            }
        } catch (error) {
            console.error('Firebase initialization error:', error);
            return;
        }

        // Initialize Firebase Auth listener
        firebase.auth().onAuthStateChanged(async (user) => {
            if (user) {
                try {
                    console.log('Auth state changed - user logged in:', user.displayName || user._delegate?.displayName);
                    const userData = await window.handleAuthStateChange(user);
                    if (userData?.user) {
                        // Use merged data
                        updateUserUI({
                            ...user,
                            displayName: userData.user.name || user.displayName || user._delegate?.displayName,
                            email: userData.user.email,
                            photoURL: userData.user.photoURL || user.photoURL || user._delegate?.photoURL,
                            namespace: userData.user.namespace
                        });
                    } else {
                        updateUserUI(user);
                    }
                } catch (error) {
                    console.error('Error handling auth state change:', error);
                    updateUserUI(user);
                }
            } else {
                console.log('Auth state changed - user logged out');
                updateUserUI(null);
            }
        });

        // Initial UI update from localStorage
        const storedName = localStorage.getItem('userName');
        const storedPhotoURL = localStorage.getItem('userPhotoURL');
        if (storedName || storedPhotoURL) {
            console.log('Restoring UI from localStorage - name:', storedName);
            updateUserUI({
                displayName: storedName,
                photoURL: storedPhotoURL
            });
        }
    });
    window.headerControllerInitialized = true;
} 