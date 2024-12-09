const express = require('express');
const router = express.Router();
const { ObjectId } = require('mongodb');
const Application = require('../models/application');
const BaseImage = require('../models/BaseImage');
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
            .populate('base_image')
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

        console.log('Starting installation for appId:', appId);

        // Get the application details
        const application = await Application.findById(appId);
        if (!application) {
            console.log('Application not found:', appId);
            return res.status(404).json({ error: 'Application not found' });
        }

        console.log('Found application:', application.title);
        console.log('Base images:', JSON.stringify(application.base_image, null, 2));

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

        if (!user.namespace) {
            return res.status(400).json({ error: 'User namespace not configured' });
        }

        console.log('User namespace:', user.namespace);

        // Prepare the API details
        const apiUrl = process.env.DEPLOYMENT_API_URL;
        const apiUser = process.env.DEPLOYMENT_API_USER;
        const apiKey = process.env.DEPLOYMENT_API_KEY;

        // Validate base_image array
        if (!application.base_image || application.base_image.length === 0) {
            console.error('No base images found for application:', appId);
            return res.status(400).json({ error: 'No base images configured for this application' });
        }

        // Create a record in installed_apps collection
        const installedApp = new InstalledApp({
            user_id: user.provider_uid,
            application_id: appId,
            status: 'pending',
            installed_at: new Date(),
            deployment_details: []
        });

        await installedApp.save();
        console.log('Created new installation:', installedApp._id.toString());

        // Process each base image
        for (const baseImageId of application.base_image) {
            const requestBody = {
                client_namespace: user.namespace,
                client_id: user.provider_uid,
                base_image: baseImageId.toString(),
                index: index
            };

            console.log('Request body:', JSON.stringify(requestBody, null, 2));

            const apiDetails = {
                url: apiUrl,
                headers: {
                    [apiUser]: apiKey,
                    'Content-Type': 'application/json'
                },
                body: requestBody
            };

            try {
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: apiDetails.headers,
                    body: JSON.stringify(apiDetails.body)
                });

                const responseText = await response.text();
                console.log('API Response:', responseText);

                if (!response.ok) {
                    throw new Error(`Deployment API error: ${response.status} - ${responseText}`);
                }

                installedApp.deployment_details.push({
                    base_image: baseImageId,
                    api_details: apiDetails,
                    status: 'pending'
                });

            } catch (error) {
                console.error('Error calling deployment API:', error);
                installedApp.deployment_details.push({
                    base_image: baseImageId,
                    error: error.message,
                    status: 'failed'
                });
                installedApp.status = 'failed';
                await installedApp.save();
                return res.status(500).json({ error: 'Failed to process installation' });
            }
        }

        // Save the final state and return success
        await installedApp.save();
        res.json({ 
            success: true,
            message: 'Installation initiated successfully',
            redirect: '/my-apps/installed'
        });

    } catch (error) {
        console.error('Installation error:', error);
        res.status(500).json({ error: 'Failed to process installation' });
    }
});

// Installation status endpoint
router.get('/installation-status/:installationId', async (req, res) => {
    try {
        const { installationId } = req.params;

        // Get user from auth token
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No auth token provided' });
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(token);

        // Get installation status
        const installation = await InstalledApp.findById(installationId);
        
        if (!installation) {
            return res.status(404).json({ error: 'Installation not found' });
        }

        // Check if the installation belongs to the user
        if (installation.user_id !== decodedToken.uid) {
            return res.status(403).json({ error: 'Not authorized to view this installation' });
        }

        // Return installation status
        res.json({
            status: installation.status,
            current_image: installation.current_image,
            total_images: installation.total_images,
            deployment_details: installation.deployment_details
        });

    } catch (error) {
        console.error('Error checking installation status:', error);
        res.status(500).json({ error: 'Failed to check installation status' });
    }
});

module.exports = router; 