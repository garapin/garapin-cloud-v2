const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    provider: { type: String, required: true },
    provider_uid: { type: String, required: true, unique: true },
    photoURL: { type: String },
    namespace: { type: String },
    profile: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Profile'
    },
    user_type: { type: String, enum: ['Individu', 'Badan Hukum'], default: 'Individu' },
    badan_hukum_name: { type: String },
    address: {
        alamat_lengkap: { type: String },
        provinsi: { type: String },
        kota: { type: String },
        kode_pos: { type: String }
    },
    pic: { type: String },
    phone_number: { type: String },
    web_address: { type: String },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, {
    collection: 'users',
    timestamps: {
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    }
});

userSchema.pre('save', function(next) {
    this.updated_at = new Date();
    next();
});

// Ensure model hasn't been compiled before
const User = mongoose.models.User || mongoose.model('User', userSchema);

module.exports = User; 