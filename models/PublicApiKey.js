const mongoose = require('mongoose');
const crypto = require('crypto');

const publicApiKeySchema = new mongoose.Schema({
    user_id: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User',
        required: true
    },
    provider_uid: { 
        type: String, 
        required: true
    },
    name: { 
        type: String, 
        required: true
    },
    key: { 
        type: String, 
        required: true,
        unique: true
    },
    status: {
        type: String,
        enum: ['active', 'disabled'],
        default: 'active'
    },
    created_at: { 
        type: Date, 
        default: Date.now 
    },
    last_used: { 
        type: Date, 
        default: null
    }
}, {
    collection: 'public_api_keys',
    timestamps: { 
        createdAt: 'created_at'
    }
});

// Add index for better query performance
publicApiKeySchema.index({ user_id: 1 });
publicApiKeySchema.index({ provider_uid: 1 });
publicApiKeySchema.index({ key: 1 }, { unique: true });

// Static method to generate API key with timestamp for uniqueness
publicApiKeySchema.statics.generateKey = function(username, gcKey) {
    const timestamp = new Date().toISOString();
    const data = `${username}-${gcKey}-${timestamp}`;
    return 'gckey-' + crypto.createHash('sha256').update(data).digest('hex');
};

const PublicApiKey = mongoose.models.PublicApiKey || mongoose.model('PublicApiKey', publicApiKeySchema);

module.exports = PublicApiKey; 