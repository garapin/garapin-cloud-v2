// Payment history page
router.get('/raku-ai/history', isAuthenticated, async (req, res) => {
    try {
        // Get Firebase configuration
        const firebaseConfig = {
            apiKey: process.env.FIREBASE_API_KEY,
            authDomain: process.env.FIREBASE_AUTH_DOMAIN,
            projectId: process.env.FIREBASE_PROJECT_ID,
            storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
            messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
            appId: process.env.FIREBASE_APP_ID
        };

        // Render the payment history page
        res.render('payment-history', {
            firebaseConfig: firebaseConfig,
            user: req.session.user
        });
    } catch (error) {
        console.error('Error loading payment history page:', error);
        res.status(500).send('Error loading payment history page');
    }
}); 