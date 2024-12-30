const mongoose = require('mongoose');
const Application = require('../models/Application');
const BaseImage = require('../models/BaseImage');

async function insertApplication(req, res) {
    try {
        const { baseImageId, userId, publisherId } = req.body;

        // Get the base image details
        const baseImage = await BaseImage.findById(baseImageId);
        if (!baseImage) {
            return res.status(404).json({ error: 'Base image not found' });
        }

        // Create slug from base image name
        const slug = baseImage.base_image.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');

        // Create new application
        const application = new Application({
            title: baseImage.base_image,
            slug: slug,
            category: new mongoose.Types.ObjectId('64d722a888498918798bbe4f'),
            description: `Base image for ${baseImage.base_image}`,
            price: 0,
            support_detail: 'Garapin Cloud',
            status: 'Published',
            user_id: userId,
            installed_count: 0,
            rating: 0,
            software_included: [],
            base_image: [new mongoose.Types.ObjectId(baseImageId)],
            publisher: new mongoose.Types.ObjectId(publisherId),
            main_base_image: new mongoose.Types.ObjectId(baseImageId),
            screenshoots: [],
            publishedDate: new Date(),
            created_at: new Date(),
            updated_at: new Date()
        });

        const result = await application.save();
        console.log('Application inserted successfully:', result);
        res.status(201).json(result);
    } catch (error) {
        console.error('Error inserting application:', error);
        res.status(500).json({ error: error.message });
    }
}

module.exports = {
    insertApplication
}; 