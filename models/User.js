const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    provider: {
        type: String,
        required: true,
        default: 'google'
    },
    provider_uid: {
        type: String,
        required: true,
        unique: true
    },
    photoURL: {
        type: String,
        required: false
    },
    last_login_at: {
        type: Date,
        required: true
    }
}, {
    timestamps: {
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    }
});

module.exports = mongoose.model('User', userSchema); 