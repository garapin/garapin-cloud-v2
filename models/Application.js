const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    slug: {
        type: String,
        required: true,
        unique: true
    },
    logo: {
        url: String,
        name: String
    },
    category: {
        type: String,
        required: true
    },
    description: String,
    price: {
        type: Number,
        required: true,
        default: 0,
        min: 0
    },
    source: String,
    support_detail: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['Draft', 'Pending', 'Published', 'Rejected'],
        default: 'Pending',
        required: true
    },
    user_id: String,
    installed_count: {
        type: Number,
        default: 0
    },
    rating: {
        type: Number,
        default: 0,
        min: 0,
        max: 5
    },
    screenshoots: [{
        url: String,
        name: String,
        isCover: Boolean,
        bucket: String,
        size: Number,
        full_path: String
    }],
    software_included: [String],
    base_image: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'BaseImage',
        required: true
    }],
    main_base_image: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'BaseImage'
    },
    publisher: {
        type: mongoose.Types.ObjectId,
        ref: 'User',
        required: true
    },
    publishedDate: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: {
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    }
});

module.exports = mongoose.model('Application', applicationSchema); 