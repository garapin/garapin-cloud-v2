const admin = require('firebase-admin');
const User = require('../models/User');

const verifyToken = async (req, res, next) => {
    try {
        // Check if this is a browser request vs an API request
        const acceptHeader = req.headers.accept || '';
        const isAPIRequest = req.path.startsWith('/api/') || !acceptHeader.includes('text/html');
        
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.log('No token in header:', authHeader);
            
            // Handle differently based on request type
            if (isAPIRequest) {
                // API calls get a 401 JSON response
                return res.status(401).json({ error: 'No token provided' });
            } else {
                // HTML requests redirect to login page
                console.log('Redirecting to login page due to missing token');
                return res.redirect('/auth/login?redirect=' + encodeURIComponent(req.originalUrl));
            }
        }
        
        const token = authHeader.split('Bearer ')[1];
        try {
            const decodedToken = await admin.auth().verifyIdToken(token);
            const userData = await User.findOne({ provider_uid: decodedToken.uid });
            req.user = userData;
            next();
        } catch (error) {
            console.error('Token verification error:', error);
            
            if (isAPIRequest) {
                return res.status(401).json({ error: 'Invalid token' });
            } else {
                console.log('Redirecting to login page due to invalid token');
                return res.redirect('/auth/login?redirect=' + encodeURIComponent(req.originalUrl));
            }
        }
    } catch (error) {
        console.error('Auth middleware error:', error);
        return res.status(500).json({ error: 'Authentication failed' });
    }
};

module.exports = { verifyToken }; 