const mongoose = require('mongoose');
const express = require('express');
const router = express.Router();
const Application = require('../../models/Application');
const BaseImage = require('../../models/BaseImage');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const admin = require('firebase-admin');
const stringSimilarity = require('string-similarity');

// Helper function to clean and normalize database server string
function cleanDatabaseString(str) {
    if (!str) return '';
    return str
        .toLowerCase()
        .replace(/\n/g, '')
        .replace(/\s+/g, '')
        .replace(/database/gi, '')
        .trim();
}

// Helper function to find similar base image
async function findSimilarBaseImage(searchName) {
    console.log('\n=== findSimilarBaseImage ===');
    console.log('Input searchName:', searchName);
    
    try {
        if (!searchName) {
            console.error('Search name is undefined or empty');
            return null;
        }

        // Get all base images
        const baseImages = await BaseImage.find();
        console.log('Available base images:', baseImages.map(img => ({
            id: img._id.toString(),
            name: img.base_image,
            isDatabase: img.isDatabase
        })));
        
        // Clean and normalize the search name
        const normalizedSearchName = cleanDatabaseString(searchName);
        console.log('Normalized search name:', normalizedSearchName);
        
        // First try exact match (case-insensitive)
        const exactMatch = baseImages.find(img => 
            cleanDatabaseString(img.base_image) === normalizedSearchName &&
            img.isDatabase === true
        );
        if (exactMatch) {
            console.log(`Found exact match for "${searchName}":`, {
                id: exactMatch._id.toString(),
                name: exactMatch.base_image,
                isDatabase: exactMatch.isDatabase
            });
            return exactMatch;
        }
        
        // If no exact match, try fuzzy matching only on database images
        const databaseImages = baseImages.filter(img => img.isDatabase === true);
        if (databaseImages.length === 0) {
            console.log('No database images found');
            return null;
        }

        const databaseImageNames = databaseImages.map(img => cleanDatabaseString(img.base_image));
        const matches = stringSimilarity.findBestMatch(
            normalizedSearchName, 
            databaseImageNames
        );
        
        const SIMILARITY_THRESHOLD = 0.7; // Increase threshold for stricter matching
        
        // If best match rating is above threshold
        if (matches.bestMatch.rating >= SIMILARITY_THRESHOLD) {
            const matchingBaseImage = databaseImages[matches.bestMatchIndex];
            console.log(`Found similar match for "${searchName}":`, {
                id: matchingBaseImage._id.toString(),
                name: matchingBaseImage.base_image,
                isDatabase: matchingBaseImage.isDatabase,
                similarity: `${(matches.bestMatch.rating * 100).toFixed(2)}%`
            });
            return matchingBaseImage;
        }
        
        console.log(`No matching database image found for "${searchName}"`);
        return null;
    } catch (error) {
        console.error('Error finding similar base image:', error);
        return null;
    }
}

async function insertApplication(req, res) {
    console.log('\n=== insertApplication ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));

    try {
        const { baseImageId, userId, publisherId } = req.body;
        
        if (!baseImageId) {
            console.error('baseImageId is required but not provided');
            return res.status(400).json({ error: 'baseImageId is required' });
        }

        // Get the main base image with full details
        const mainBaseImage = await BaseImage.findById(baseImageId);
        if (!mainBaseImage) {
            console.error('Base image not found for ID:', baseImageId);
            return res.status(404).json({ error: 'Base image not found' });
        }

        console.log('Found main base image:', {
            id: mainBaseImage._id.toString(),
            name: mainBaseImage.base_image,
            database_server: mainBaseImage.database_server,
            category_name: mainBaseImage.category_name,
            thumbnailURL: mainBaseImage.thumbnailURL
        });

        // Initialize base_image array with the main base image
        const baseImageArray = [mainBaseImage._id];
        console.log('Initialized base image array:', baseImageArray.map(id => id.toString()));

        // Check for database server requirement from the main base image
        if (mainBaseImage.database_server) {
            const cleanDatabaseServer = mainBaseImage.database_server.replace(/\n/g, '').trim();
            console.log('\n=== Searching for Database Image ===');
            console.log('Original database_server value:', mainBaseImage.database_server);
            console.log('Cleaned database server value:', cleanDatabaseServer);

            const databaseBaseImage = await findSimilarBaseImage(cleanDatabaseServer);
            console.log('\n=== Database Image Search Result ===');
            if (databaseBaseImage) {
                console.log('Found database image:', {
                    id: databaseBaseImage._id.toString(),
                    name: databaseBaseImage.base_image,
                    type: databaseBaseImage.type || 'N/A'
                });

                // Check if this ID is already in the array
                const isDuplicate = baseImageArray.some(id => id.equals(databaseBaseImage._id));
                if (!isDuplicate) {
                    baseImageArray.push(databaseBaseImage._id);
                    console.log('Successfully added database image to base_image array');
                    console.log('Current base_image array:', baseImageArray.map(id => id.toString()));
                } else {
                    console.log('Database image already exists in base_image array - skipping');
                }
            } else {
                console.warn('❌ No matching database image found for:', cleanDatabaseServer);
                console.warn('This may cause issues as the application expects a database');
            }
        } else {
            console.log('\n=== Database Check ===');
            console.log('No database_server specified in the main base image');
        }

        if (!userId) {
            console.error('userId is required but not provided');
            return res.status(400).json({ error: 'userId is required' });
        }

        if (!publisherId) {
            console.error('publisherId is required but not provided');
            return res.status(400).json({ error: 'publisherId is required' });
        }

        console.log('Creating application with base images:', baseImageArray.map(id => id.toString()));

        // Create slug from base image name
        const slug = mainBaseImage.base_image.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');

        // First create application without logo
        const application = new Application({
            title: mainBaseImage.base_image,
            slug: slug,
            category: mainBaseImage.category_name || 'Development',
            description: mainBaseImage.long_description || mainBaseImage.description || `Base image for ${mainBaseImage.base_image}`,
            price: 0,
            support_detail: 'Garapin Cloud',
            status: 'Published',
            user_id: userId,
            installed_count: 0,
            rating: 0,
            software_included: [],
            base_image: baseImageArray,
            publisher: new mongoose.Types.ObjectId(publisherId),
            main_base_image: mainBaseImage._id,
            screenshoots: [],
            publishedDate: new Date(),
            created_at: new Date(),
            updated_at: new Date()
        });

        // Save application first to get the ID
        const savedApp = await application.save();
        console.log('Application created initially:', {
            id: savedApp._id.toString(),
            title: savedApp.title
        });

        // Now handle logo upload with the correct application ID
        let logo = null;
        if (mainBaseImage.thumbnailURL) {
            try {
                console.log('\n=== Processing Logo ===');
                console.log('Fetching logo from:', mainBaseImage.thumbnailURL);
                
                // Fetch the image
                const response = await fetch(mainBaseImage.thumbnailURL);
                if (!response.ok) throw new Error('Failed to fetch image');
                const imageBuffer = await response.buffer();

                // Generate unique filename and path using application ID
                const fileName = `${mainBaseImage.base_image}-${Date.now()}.jpg`;
                const iconPath = `applications/${savedApp._id}/icon/${fileName}`;
                console.log('Uploading logo with path:', iconPath);

                // Upload to Firebase Storage
                const bucket = admin.storage().bucket();
                const iconFileUpload = bucket.file(iconPath);
                await iconFileUpload.save(imageBuffer);

                // Get signed URL
                const [iconUrl] = await iconFileUpload.getSignedUrl({
                    action: 'read',
                    expires: '03-01-2500'
                });

                console.log('Logo uploaded successfully:', iconUrl);

                logo = {
                    url: iconUrl,
                    name: fileName
                };

                // Update the application with the logo
                const updatedApp = await Application.findByIdAndUpdate(
                    savedApp._id,
                    { logo: logo },
                    { new: true }
                );

                console.log('Application updated with logo:', {
                    id: updatedApp._id.toString(),
                    title: updatedApp.title,
                    logo: updatedApp.logo
                });

                // Use the updated application as our result
                savedApp = updatedApp;
            } catch (error) {
                console.warn('Failed to process logo:', error.message);
                // Continue with the application without logo if upload fails
            }
        }

        res.status(201).json(savedApp);
    } catch (error) {
        console.error('Error creating application:', error.message);
        res.status(500).json({ error: error.message });
    }
}

async function updateApplicationsByBaseImage(req, res) {
    console.log('\n=== updateApplicationsByBaseImage ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));

    try {
        const { baseImageId, userId, databaseServer } = req.body;

        if (!baseImageId) {
            console.error('baseImageId is required');
            return res.status(400).json({ error: 'baseImageId is required' });
        }

        // Find the base image first to ensure it exists
        const baseImage = await BaseImage.findById(baseImageId);
        if (!baseImage) {
            console.error('Base image not found:', baseImageId);
            return res.status(404).json({ error: 'Base image not found' });
        }

        console.log('Found base image:', {
            id: baseImage._id,
            name: baseImage.base_image,
            description: baseImage.description,
            database_server: databaseServer || baseImage.database_server
        });

        // Find all applications that use this base image
        const applications = await Application.find({
            $or: [
                { main_base_image: baseImageId },
                { base_image: baseImageId }
            ]
        });

        console.log(`Found ${applications.length} applications using this base image`);

        // Update each application
        const updatePromises = applications.map(async (app) => {
            // Start with a fresh array containing only the rebuilt base image
            let newBaseImages = [baseImageId];

            // If the base image requires a database, find and add the database image
            const dbServer = databaseServer || baseImage.database_server;
            if (dbServer && 
                !['None*', 'N/A', 'null', 'None Required', 'none', 'None required'].includes(dbServer?.toLowerCase())) {
                
                const cleanDatabaseServer = dbServer.replace(/\n/g, '').trim();
                console.log('\n=== Searching for Database Image ===');
                console.log('Original database_server value:', dbServer);
                console.log('Cleaned database server value:', cleanDatabaseServer);

                const databaseBaseImage = await findSimilarBaseImage(cleanDatabaseServer);
                console.log('\n=== Database Image Search Result ===');
                if (databaseBaseImage) {
                    console.log('Found database image:', {
                        id: databaseBaseImage._id.toString(),
                        name: databaseBaseImage.base_image,
                        type: databaseBaseImage.type || 'N/A'
                    });

                    // Add database image only if it's different from the main image
                    if (databaseBaseImage._id.toString() !== baseImageId.toString()) {
                        newBaseImages.push(databaseBaseImage._id);
                        console.log('Successfully added database image to base_image array');
                        console.log('Current base_image array:', newBaseImages.map(id => id.toString()));
                    } else {
                        console.log('Database image is the same as main image - skipping');
                    }
                } else {
                    console.warn('❌ No matching database image found for:', cleanDatabaseServer);
                    console.warn('This may cause issues as the application expects a database');
                }
            } else {
                console.log('\n=== Database Check ===');
                console.log('No database_server specified in the base image');
            }

            // Prepare update data
            const updateData = {
                updated_at: new Date(),
                base_image: newBaseImages, // Update base_image array
                main_base_image: baseImageId // Always update main_base_image to the rebuilt image
            };

            // Update title and description if this was previously the main base image
            if (app.main_base_image.toString() === baseImageId) {
                updateData.title = baseImage.base_image;
                updateData.description = baseImage.long_description || baseImage.description || `Base image for ${baseImage.base_image}`;
                updateData.category = baseImage.category_name || 'Development';
            }

            console.log('Updating application with data:', {
                id: app._id,
                updateData
            });

            // Update the application
            const updatedApp = await Application.findByIdAndUpdate(
                app._id,
                { $set: updateData },
                { new: true }
            );

            console.log('Updated application:', {
                id: updatedApp._id,
                title: updatedApp.title,
                description: updatedApp.description,
                status: updatedApp.status,
                base_image: updatedApp.base_image,
                main_base_image: updatedApp.main_base_image
            });

            return updatedApp;
        });

        // Wait for all updates to complete
        const updatedApps = await Promise.all(updatePromises);

        console.log('Successfully updated applications:', {
            count: updatedApps.length,
            appIds: updatedApps.map(app => app._id)
        });

        res.json({
            message: 'Applications updated successfully',
            updatedCount: updatedApps.length,
            applications: updatedApps.map(app => ({
                id: app._id,
                title: app.title,
                description: app.description,
                status: app.status,
                base_image: app.base_image,
                main_base_image: app.main_base_image
            }))
        });

    } catch (error) {
        console.error('Error updating applications:', error);
        res.status(500).json({ error: error.message });
    }
}

// Define routes
router.post('/insert', insertApplication);
router.post('/update-by-base-image', updateApplicationsByBaseImage);

module.exports = router; 