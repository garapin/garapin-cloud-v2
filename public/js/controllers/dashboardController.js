class DashboardController {
    constructor() {
        this.initializeFirebase();
        this.checkCurrentUser();
    }

    initializeFirebase() {
        const firebaseConfig = JSON.parse(document.querySelector('[data-firebase-config]').dataset.firebaseConfig);
        if (!firebase.apps?.length) {
            firebase.initializeApp(firebaseConfig);
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
        } catch (error) {
            console.error('Auth error:', error);
            console.error('Failed to update user data:', error);
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