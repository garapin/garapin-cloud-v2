class DashboardController {
    constructor() {
        this.initializeFirebase();
        this.bindEvents();
    }

    initializeFirebase() {
        const firebaseConfig = JSON.parse(document.querySelector('[data-firebase-config]').dataset.firebaseConfig);
        firebase.initializeApp(firebaseConfig);
        this.checkCurrentUser();
    }

    bindEvents() {
        const logoutButton = document.getElementById('logoutButton');
        if (logoutButton) {
            logoutButton.addEventListener('click', (e) => {
                e.preventDefault();
                this.handleLogout();
            });
        }
    }

    async checkCurrentUser() {
        try {
            firebase.auth().onAuthStateChanged(async (user) => {
                if (user) {
                    console.log('User authenticated:', user);
                    await this.handleUserAuth(user);
                } else {
                    console.log('No user found, redirecting to login');
                    this.redirectToLogin();
                }
            });
        } catch (error) {
            console.error('Auth check error:', error);
            this.redirectToLogin();
        }
    }

    async handleUserAuth(user) {
        try {
            const token = await firebase.auth().currentUser.getIdToken(true);
            
            const response = await fetch('/auth/user', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name: user.displayName || '',
                    email: user.email,
                    provider_uid: user.uid,
                    photoURL: user.photoURL
                })
            });

            if (!response.ok) {
                throw new Error('Failed to update user data');
            }

            const data = await response.json();
            console.log('Server response:', data);

            // Update UI
            this.updateUserInfo(user);
        } catch (error) {
            console.error('Auth error:', error);
            console.error('Failed to update user data:', error);
        }
    }

    updateUserInfo(user) {
        try {
            // Get user's display name or extract it from email
            const displayName = user.displayName || user.email.split('@')[0];
            const formattedName = displayName
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ');
            
            // Update user name
            const userNameElement = document.getElementById('userName');
            if (userNameElement) {
                userNameElement.textContent = formattedName;
            }

            // Update profile photo
            const photoContainer = document.getElementById('userPhotoContainer');
            if (photoContainer) {
                const photoURL = user.photoURL;
                console.log('Setting profile photo:', photoURL);

                if (photoURL) {
                    // Create and load the image first
                    const img = new Image();
                    img.onload = () => {
                        photoContainer.innerHTML = `
                            <div class="profile-photo-container" style="width: 24px; height: 24px; border-radius: 50%; overflow: hidden;">
                                <img src="${photoURL}" 
                                     alt="${formattedName}" 
                                     style="width: 100%; height: 100%; object-fit: cover;"
                                     class="profile-photo">
                            </div>`;
                    };
                    img.onerror = () => {
                        // Fallback to default avatar on error
                        this.setDefaultAvatar(photoContainer, formattedName);
                    };
                    img.src = photoURL;
                } else {
                    this.setDefaultAvatar(photoContainer, formattedName);
                }
            }
        } catch (error) {
            console.error('Error updating UI:', error);
            this.setDefaultAvatar(photoContainer, formattedName);
        }
    }

    setDefaultAvatar(container, name) {
        if (container) {
            container.innerHTML = `
                <div class="profile-photo-container" style="width: 24px; height: 24px; border-radius: 50%; overflow: hidden;">
                    <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=7B7FF6&color=fff" 
                         alt="${name}" 
                         style="width: 100%; height: 100%; object-fit: cover;"
                         class="profile-photo">
                </div>`;
        }
    }

    async handleLogout() {
        try {
            const logoutButton = document.getElementById('logoutButton');
            const originalText = logoutButton.textContent;
            logoutButton.textContent = 'Logging out...';
            logoutButton.disabled = true;

            sessionStorage.clear();
            localStorage.clear();
            await firebase.auth().signOut();
            window.location.href = '/';
        } catch (error) {
            console.error('Logout error:', error);
            alert('Failed to logout. Please try again.');
            
            const logoutButton = document.getElementById('logoutButton');
            logoutButton.textContent = originalText;
            logoutButton.disabled = false;
        }
    }

    redirectToLogin() {
        if (window.location.pathname !== '/') {
            sessionStorage.clear();
            localStorage.clear();
            window.location.href = '/';
        }
    }
}

// Initialize the controller when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new DashboardController();
}); 