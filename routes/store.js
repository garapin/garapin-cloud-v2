const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const Application = require('../models/application');
const User = require('../models/User');
const InstalledApp = require('../models/InstalledApp');
const admin = require('firebase-admin');
require('dotenv').config();

// Get Firebase config from environment variables
const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

// Store page route
router.get('/', async (req, res) => {
    try {
        const applications = await Application.find({ status: 'Published' })
            .sort({ created_at: -1 });
        res.render('store', { 
            applications,
            firebaseConfig,
            currentPage: 'store',
            pageTitle: 'Store'
        });
    } catch (error) {
        console.error('Error fetching applications:', error);
        res.status(500).send('Error loading store');
    }
});

// Installation endpoint
router.post('/install/:appId', async (req, res) => {
    try {
        const { appId } = req.params;
        const { index } = req.body;

        // Get the application details
        const application = await Application.findById(appId);
        if (!application) {
            return res.status(404).json({ error: 'Application not found' });
        }

        // Get user from auth token
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No auth token provided' });
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(token);
        const user = await User.findOne({ provider_uid: decodedToken.uid });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Prepare the API details
        const apiUrl = process.env.DEPLOYMENT_API_URL;
        const apiUser = process.env.DEPLOYMENT_API_USER;
        const apiKey = process.env.DEPLOYMENT_API_KEY;

        const requestBody = {
            client_namespace: user.provider_uid,
            client_id: user.provider_uid,
            base_image: application.base_image,
            index: index
        };

        // Create a record in installed_apps collection
        const installedApp = new InstalledApp({
            user_id: user.provider_uid,
            application_id: appId,
            status: 'init',
            installed_at: new Date(),
            deployment_details: {
                url: apiUrl,
                headers: {
                    [apiUser]: apiKey
                },
                body: requestBody
            }
        });

        await installedApp.save();
        console.log('Created new installation:', installedApp);

        // Hit the deployment API
        try {
            const headers = {
                'Content-Type': 'application/json',
                [apiUser]: apiKey
            };

            console.log('Calling deployment API:', {
                url: apiUrl,
                headers,
                body: requestBody
            });

            const deploymentResponse = await fetch(apiUrl, {
                method: 'POST',
                headers,
                body: JSON.stringify(requestBody)
            });

            const responseText = await deploymentResponse.text();
            console.log('Deployment API raw response:', responseText);

            if (!deploymentResponse.ok) {
                throw new Error(`Deployment API error: ${deploymentResponse.status} - ${responseText}`);
            }

            const deploymentResult = responseText ? JSON.parse(responseText) : {};
            console.log('Deployment API parsed response:', deploymentResult);

            // Return success response
            res.json({ 
                success: true, 
                apiDetails: {
                    url: apiUrl,
                    headers: {
                        [apiUser]: apiKey
                    },
                    body: requestBody
                },
                deploymentResult,
                message: 'Installation initiated successfully'
            });
        } catch (deployError) {
            console.error('Deployment API error:', deployError);
            // Still return success since we saved the installation
            res.json({ 
                success: true, 
                apiDetails: {
                    url: apiUrl,
                    headers: {
                        [apiUser]: apiKey
                    },
                    body: requestBody
                },
                message: 'Installation saved successfully, but deployment API call failed'
            });
        }

    } catch (error) {
        console.error('Installation error:', error);
        res.status(500).json({ error: 'Failed to process installation' });
    }
});

module.exports = router; 