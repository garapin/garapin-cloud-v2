document.addEventListener('DOMContentLoaded', function() {
    console.log('DashboardController initializing...');

    // Initialize Firebase if needed
    try {
        const firebaseConfig = JSON.parse(document.querySelector('[data-firebase-config]').dataset.firebaseConfig);
        if (!firebase.apps?.length) {
            firebase.initializeApp(firebaseConfig);
        }
    } catch (error) {
        console.error('Firebase initialization error:', error);
        return;
    }

    // Handle auth state changes
    firebase.auth().onAuthStateChanged(async (user) => {
        if (user) {
            try {
                await window.handleAuthStateChange(user);
                // Additional dashboard-specific logic here if needed
            } catch (error) {
                console.error('Dashboard auth error:', error);
            }
        }
    });
}); 