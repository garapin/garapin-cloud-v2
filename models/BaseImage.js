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
    appServices: {
        type: String,
        required: true
    },
    ingressServices: {
        type: String,
        required: true
    },
    base_image: {
        type: String,
        required: true
    },
    isDatabase: {
        type: Boolean,
        default: false
    },
    thumbnailURL: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    long_description: {
        type: String,
        default: ''
    },
    version: {
        type: String,
        required: true
    },
    category_name: {
        type: String,
        default: 'Development'
    },
    database_server: {
        type: String,
        default: null
    },
    user_id: {
        type: String,
        required: true
    }
}, {
    timestamps: {
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    }
});

module.exports = mongoose.model('BaseImage', baseImageSchema, 'base_images'); 