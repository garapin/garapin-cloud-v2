class DashboardController {
    constructor() {
        this.initializeFirebase();
        this.bindEvents();
        this.checkCurrentUser();
    }

    initializeFirebase() {
        const firebaseConfig = JSON.parse(document.querySelector('[data-firebase-config]').dataset.firebaseConfig);
        firebase.initializeApp(firebaseConfig);
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

    checkCurrentUser() {
        // Get the current user immediately
        const currentUser = firebase.auth().currentUser;
        if (currentUser) {
            this.updateUserInfo(currentUser);
        }

        // Also listen for auth state changes
        firebase.auth().onAuthStateChanged((user) => {
            if (user) {
                console.log('User data:', user); // Debug log
                this.updateUserInfo(user);
            } else {
                this.redirectToLogin();
            }
        });
    }

    updateUserInfo(user) {
        // Get user's display name or extract it from email
        const displayName = user.displayName || user.email.split('@')[0];
        // Capitalize first letter of each word
        const formattedName = displayName
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
        
        // Update user name
        document.getElementById('userName').textContent = formattedName;
        
        // Update profile photo if available
        if (user.photoURL) {
            const photoContainer = document.getElementById('userPhotoContainer');
            photoContainer.innerHTML = `<img src="${user.photoURL}" alt="Profile" class="rounded-circle" style="width: 24px; height: 24px; object-fit: cover;">`;
        }

        console.log('Updated user info:', {
            name: formattedName,
            photo: user.photoURL
        });
    }

    async handleLogout() {
        try {
            // Show loading state
            const logoutButton = document.getElementById('logoutButton');
            const originalText = logoutButton.textContent;
            logoutButton.textContent = 'Logging out...';
            logoutButton.disabled = true;

            // Clear any stored session data
            sessionStorage.clear();
            localStorage.removeItem('firebase:host:garapin-cloud.firebaseapp.com');
            
            // Sign out from Firebase
            await firebase.auth().signOut();
            
            // Redirect to login page
            this.redirectToLogin();
        } catch (error) {
            console.error('Logout error:', error);
            alert('Failed to logout. Please try again.');
            
            // Reset button state
            const logoutButton = document.getElementById('logoutButton');
            logoutButton.textContent = originalText;
            logoutButton.disabled = false;
        }
    }

    redirectToLogin() {
        // Clear any auth-related data
        sessionStorage.clear();
        localStorage.clear();
        
        // Redirect to login page
        window.location.href = '/';
    }
}

// Initialize the controller when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new DashboardController();
}); 