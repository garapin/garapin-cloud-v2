const mongoose = require('mongoose');

const profileSchema = new mongoose.Schema({
    user_id: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User',
        required: true,
        unique: true
    },
    provider_uid: { 
        type: String, 
        required: true,
        unique: true
    },
    user_type: { 
        type: String, 
        enum: ['Individu', 'Badan Hukum'], 
        default: 'Individu',
        required: true
    },
    badan_hukum_name: { 
        type: String,
        required: function() {
            return this.user_type === 'Badan Hukum';
        }
    },
    address: {
        alamat_lengkap: { type: String, required: true },
        provinsi: { type: String, required: true },
        kota: { type: String, required: true },
        kode_pos: { type: String, required: true }
    },
    pic: { 
        type: String,
        required: true
    },
    phone_number: { 
        type: String,
        required: true
    },
    web_address: { 
        type: String,
        default: null,
        set: function(v) {
            if (!v) return null;
            if (!v.startsWith('http://') && !v.startsWith('https://')) {
                return v;
            }
            return v.replace(/^https?:\/\//, '');
        }
    },
    raku_ai: {
        app_name: String,
        business_type: String,
        platform: String,
        status: String,
        features: {
            receipt: {
                selected: {
                    type: Boolean,
                    default: false
                }
            }
        }
    },
    created_at: { 
        type: Date, 
        default: Date.now 
    },
    updated_at: { 
        type: Date, 
        default: Date.now 
    }
}, {
    collection: 'profiles', // Explicitly set collection name
    timestamps: { 
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    }
});

// Add index for better query performance
profileSchema.index({ user_id: 1 }, { unique: true });
profileSchema.index({ provider_uid: 1 }, { unique: true });

// Pre-save middleware
profileSchema.pre('save', function(next) {
    this.updated_at = new Date();
    next();
});

// Ensure model hasn't been compiled before
const Profile = mongoose.models.Profile || mongoose.model('Profile', profileSchema);

module.exports = Profile; 