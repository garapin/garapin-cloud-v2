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

        console.log('Found main application:', {
            title: application.title,
            base_images: application.base_image.map(img => img.toString())
        });

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

        // Track applications to install and their base images
        const appsToInstall = new Map(); // Map<appId, Application>
        const baseImagesToProcess = new Set(); // Set<baseImageId>

        // Add main application
        appsToInstall.set(appId, application);
        console.log('Step 1: Adding main application base images');
        
        // First add main base image
        if (application.main_base_image) {
            const mainBaseImg = application.main_base_image.toString();
            baseImagesToProcess.add(mainBaseImg);
            console.log(`- Added main base image: ${mainBaseImg}`);
        }

        // Then add other base images (excluding main base image)
        application.base_image.forEach(img => {
            const imgStr = img.toString();
            if (!application.main_base_image || imgStr !== application.main_base_image.toString()) {
                baseImagesToProcess.add(imgStr);
                console.log(`- Added additional base image: ${imgStr}`);
            }
        });

        // Function to find applications that share base images
        async function findRelatedApplications(baseImages) {
            // Find applications that use any of these base images as their main base image
            const apps = await Application.find({
                'main_base_image': { $in: Array.from(baseImages) }
            });

            let foundNewBaseImages = false;
            for (const app of apps) {
                // Add app to installation list if not already added
                if (!appsToInstall.has(app._id.toString())) {
                    appsToInstall.set(app._id.toString(), app);
                    console.log(`- Added ${app.title} to installation list (uses main base image: ${app.main_base_image})`);

                    // Add non-main base images from this app
                    app.base_image.forEach(img => {
                        const imgStr = img.toString();
                        if ((!app.main_base_image || imgStr !== app.main_base_image.toString()) && 
                            !baseImagesToProcess.has(imgStr)) {
                            baseImagesToProcess.add(imgStr);
                            console.log(`- Added additional base image: ${imgStr} from ${app.title}`);
                            foundNewBaseImages = true;
                        }
                    });
                }
            }

            // If we found new base images, search for more applications
            if (foundNewBaseImages) {
                await findRelatedApplications(baseImagesToProcess);
            }
        }

        // Find all related applications recursively
        console.log('\nStep 2: Finding all related applications');
        await findRelatedApplications(baseImagesToProcess);

        // Create installation records array
        const installationRecords = [];

        // Create installation records for all applications and update installed_count
        console.log('\nCreating installation records and updating installed counts:');
        for (const [id, app] of appsToInstall) {
            console.log(`Creating record for ${app.title}`);
            
            // Create installation record
            const installation = new InstalledApp({
                user_id: user.provider_uid,
                application_id: id,
                status: 'pending',
                installed_at: new Date(),
                deployment_details: []
            });
            installationRecords.push(installation);

            // Increment installed_count
            await Application.findByIdAndUpdate(
                id,
                { $inc: { installed_count: 1 } },
                { new: true }
            );
            console.log(`Incremented installed_count for ${app.title}`);
        }

        // Save all installation records
        await Promise.all(installationRecords.map(record => record.save()));
        console.log('Created installation records:', installationRecords.map(record => ({
            id: record._id.toString(),
            app: record.application_id
        })));

        // Process each base image for deployment
        const baseImageArray = Array.from(baseImagesToProcess);
        console.log('\nProcessing base images:', baseImageArray);

        for (const baseImageId of baseImageArray) {
            console.log(`\nDeploying base image: ${baseImageId}`);
            
            const requestBody = {
                client_namespace: user.namespace,
                client_id: user.provider_uid,
                base_image: baseImageId,
                index: index || 0
            };

            console.log('API Request:', {
                url: apiUrl,
                headers: {
                    [apiUser]: apiKey,
                    'Content-Type': 'application/json'
                },
                body: requestBody
            });

            try {
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        [apiUser]: apiKey,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(requestBody)
                });

                const responseText = await response.text();
                console.log(`API Response for ${baseImageId}:`, responseText);

                if (!response.ok) {
                    throw new Error(`Deployment API error: ${response.status} - ${responseText}`);
                }

                // Update deployment details for installations that use this base image
                for (const installation of installationRecords) {
                    const app = await Application.findById(installation.application_id);
                    if (app && app.base_image.map(img => img.toString()).includes(baseImageId)) {
                        installation.deployment_details.push({
                            base_image: baseImageId,
                            api_details: {
                                url: apiUrl,
                                request: requestBody,
                                response: responseText
                            },
                            status: 'pending'
                        });
                        await installation.save();
                    }
                }

            } catch (error) {
                console.error(`Error deploying base image ${baseImageId}:`, error);
                
                // Mark affected installations as failed
                for (const installation of installationRecords) {
                    const app = await Application.findById(installation.application_id);
                    if (app && app.base_image.map(img => img.toString()).includes(baseImageId)) {
                        installation.deployment_details.push({
                            base_image: baseImageId,
                            error: error.message,
                            status: 'failed'
                        });
                        installation.status = 'failed';
                        await installation.save();
                    }
                }
                
                return res.status(500).json({ 
                    error: 'Failed to process installation',
                    details: error.message
                });
            }
        }

        console.log('All deployments completed successfully');
        
        res.json({ 
            success: true,
            message: 'Installation initiated successfully',
            redirect: '/my-apps/installed',
            installations: installationRecords.map(record => ({
                id: record._id,
                application_id: record.application_id
            }))
        });

    } catch (error) {
        console.error('Installation error:', error);
        res.status(500).json({ 
            error: 'Failed to process installation',
            details: error.message
        });
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