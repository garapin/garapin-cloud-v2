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

    // Dashboard-specific logic here
    // Note: Auth state changes are now handled by headerController.js
}); 