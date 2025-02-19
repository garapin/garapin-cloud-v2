document.addEventListener('DOMContentLoaded', function() {
    console.log('RakuAiController initializing...');

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

    // Add click handler for "Tambah Saldo" button
    const tambahSaldoBtn = document.querySelector('.btn-primary');
    if (tambahSaldoBtn) {
        tambahSaldoBtn.addEventListener('click', function() {
            // TODO: Implement top-up functionality
            console.log('Tambah Saldo clicked');
        });
    }
}); 