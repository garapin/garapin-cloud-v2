const mongoose = require('mongoose');
const Application = require('../../models/Application');
const BaseImage = require('../../models/BaseImage');
const stringSimilarity = require('string-similarity');

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
            name: img.base_image
        })));
        
        // First try exact match
        const exactMatch = baseImages.find(img => 
            img.base_image.toLowerCase().trim() === searchName.toLowerCase().trim()
        );
        if (exactMatch) {
            console.log(`Found exact match for "${searchName}":`, {
                id: exactMatch._id.toString(),
                name: exactMatch.base_image
            });
            return exactMatch;
        }
        
        // If no exact match, try fuzzy matching
        const baseImageNames = baseImages.map(img => img.base_image);
        const matches = stringSimilarity.findBestMatch(
            searchName.toLowerCase().trim(), 
            baseImageNames.map(name => name.toLowerCase().trim())
        );
        
        const SIMILARITY_THRESHOLD = 0.7; // 70% similarity threshold
        
        // If best match rating is above threshold (70% similarity)
        if (matches.bestMatch.rating >= SIMILARITY_THRESHOLD) {
            const matchingBaseImage = baseImages[matches.bestMatchIndex];
            console.log(`Found similar match for "${searchName}":`, {
                id: matchingBaseImage._id.toString(),
                name: matchingBaseImage.base_image,
                similarity: `${(matches.bestMatch.rating * 100).toFixed(2)}%`
            });
            return matchingBaseImage;
        }
        
        console.log(`No matching base image found for "${searchName}"`);
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
            database_server: mainBaseImage.database_server
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

        // Create new application
        const application = new Application({
            title: mainBaseImage.base_image,
            slug: slug,
            category: new mongoose.Types.ObjectId('64d722a888498918798bbe4f'),
            description: mainBaseImage.description || `Base image for ${mainBaseImage.base_image}`,
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

        const result = await application.save();
        console.log('Application created successfully:', {
            id: result._id.toString(),
            title: result.title,
            baseImages: result.base_image.map(id => id.toString()),
            mainBaseImage: result.main_base_image.toString()
        });
        
        res.status(201).json(result);
    } catch (error) {
        console.error('Error creating application:', error.message);
        res.status(500).json({ error: error.message });
    }
}

module.exports = {
    insertApplication,
    findSimilarBaseImage
}; 