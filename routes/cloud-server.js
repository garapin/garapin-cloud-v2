const express = require('express');
const router = express.Router();

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) {
        return next();
    }
    res.redirect('/login');
};

// Cloud Server Deploy page
router.get('/deploy', isAuthenticated, async (req, res) => {
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

        // Render the cloud server deploy page with all necessary variables
        res.render('cloud-server-deploy', {
            firebaseConfig: firebaseConfig,
            user: req.user || req.session.user, // Use either req.user or session user
            pageTitle: 'Cloud Server Deploy',
            currentPage: 'cloud-server-deploy'
        });
    } catch (error) {
        console.error('Error loading cloud server deploy page:', error);
        res.status(500).send('Error loading cloud server deploy page');
    }
});

// API endpoint for deployment
router.post('/api/deploy', isAuthenticated, async (req, res) => {
    try {
        const deploymentData = req.body;
        
        // TODO: Implement deployment logic here
        // This would include:
        // 1. Validating the deployment data
        // 2. Creating necessary cloud resources
        // 3. Setting up the deployment pipeline
        // 4. Returning deployment status

        // For now, we'll just return a success message
        res.json({
            success: true,
            message: 'Deployment initiated successfully',
            deploymentId: 'dep_' + Date.now()
        });
    } catch (error) {
        console.error('Deployment error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Deployment failed'
        });
    }
});

module.exports = router; 