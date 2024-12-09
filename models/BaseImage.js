const mongoose = require('mongoose');

const baseImageSchema = new mongoose.Schema({
    storageImages: {
        type: String,
        required: true
    },
    appImages: {
        type: String,
        required: true
    },
    base_image: {
        type: String,
        required: true
    },
    appServices: {
        type: String,
        required: true
    }
}, {
    timestamps: {
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    }
});

module.exports = mongoose.model('base_images', baseImageSchema); 