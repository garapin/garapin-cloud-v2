// Ensure headerController is only initialized once
if (!window.headerControllerInitialized) {
    // Cache for profile pictures
    const profilePictureCache = new Map();
    
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

        // Function to check if URL is a Google Photos URL
        function isGooglePhotosUrl(url) {
            return url && (
                url.includes('googleusercontent.com') || 
                url.includes('google.com/photo') ||
                url.includes('lh3.google.com')
            );
        }

        // Function to safely load and cache profile picture
        async function loadProfilePicture(photoURL, fallbackName) {
            if (!photoURL) return null;
            
            // Check cache first
            if (profilePictureCache.has(photoURL)) {
                return profilePictureCache.get(photoURL);
            }

            // If it's a Google Photos URL, immediately use UI Avatars instead
            if (isGooglePhotosUrl(photoURL)) {
                const fallbackURL = `https://ui-avatars.com/api/?name=${encodeURIComponent(fallbackName)}&background=7B7FF6&color=fff`;
                profilePictureCache.set(photoURL, fallbackURL);
                return fallbackURL;
            }

            try {
                // Only try to load the image if it's not a Google Photos URL
                const imageLoadPromise = new Promise((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => resolve(photoURL);
                    img.onerror = () => reject(new Error('Failed to load image'));
                    img.src = photoURL;
                    
                    // Timeout after 3 seconds
                    setTimeout(() => reject(new Error('Image load timeout')), 3000);
                });

                const loadedURL = await imageLoadPromise;
                profilePictureCache.set(photoURL, loadedURL);
                return loadedURL;
            } catch (error) {
                console.warn('Failed to load profile picture:', error);
                const fallbackURL = `https://ui-avatars.com/api/?name=${encodeURIComponent(fallbackName)}&background=7B7FF6&color=fff`;
                profilePictureCache.set(photoURL, fallbackURL);
                return fallbackURL;
            }
        }

        // Function to update UI with user data
        async function updateUserUI(user) {
            const userPhotoContainer = document.getElementById('userPhotoContainer');
            const userName = document.getElementById('userName');
            
            if (user) {
                // Update name first
                const displayName = user.displayName || user.email?.split('@')[0] || 'User';
                if (userName) {
                    userName.textContent = displayName;
                }

                // Update photo with loading state
                if (userPhotoContainer) {
                    // Show loading spinner
                    userPhotoContainer.innerHTML = '<div class="spinner-border spinner-border-sm" role="status"><span class="visually-hidden">Loading...</span></div>';
                    
                    try {
                        const photoURL = await loadProfilePicture(user.photoURL, displayName);
                        userPhotoContainer.innerHTML = `<img src="${photoURL}" alt="Profile" class="rounded-circle" style="width: 24px; height: 24px;">`;
                    } catch (error) {
                        console.warn('Error loading profile picture:', error);
                        const fallbackURL = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=7B7FF6&color=fff`;
                        userPhotoContainer.innerHTML = `<img src="${fallbackURL}" alt="Profile" class="rounded-circle" style="width: 24px; height: 24px;">`;
                    }
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
                        // If we have a Firebase Storage URL from the backend, use it
                        if (userData.photoURL && !isGooglePhotosUrl(userData.photoURL)) {
                            user.photoURL = userData.photoURL;
                        }
                        updateUserUI(user);
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