const mongoose = require('mongoose');

const installedAppSchema = new mongoose.Schema({
    application_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Application',
        required: true
    },
    user_id: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['init', 'pending', 'completed', 'failed', 'remove'],
        default: 'init'
    },
    installed_at: {
        type: Date,
        default: Date.now
    },
    deployment_details: {
        type: Object
    },
    deployment_response: {
        type: Object
    }
}, {
    timestamps: true,
    collection: 'installed_apps'
});

// Create a compound index to allow multiple installations of the same app
installedAppSchema.index({ application_id: 1, user_id: 1 });

const InstalledApp = mongoose.model('InstalledApp', installedAppSchema);

module.exports = InstalledApp; 