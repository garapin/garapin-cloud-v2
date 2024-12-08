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
    installed_date: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true,
    collection: 'installed_apps'
});

// Create a compound index to allow multiple installations of the same app
installedAppSchema.index({ application_id: 1, user_id: 1 });

const InstalledApp = mongoose.model('InstalledApp', installedAppSchema, 'installed_apps');

module.exports = InstalledApp; 