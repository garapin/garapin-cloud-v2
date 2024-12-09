const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    provider: String,
    provider_uid: { type: String, unique: true },
    email: String,
    display_name: String,
    photo_url: String,
    namespace: { 
        type: String, 
        unique: true,
        sparse: true,
        validate: {
            validator: function(v) {
                // Must start with a letter, followed by lowercase letters or numbers, total 8 chars
                return /^[a-z][a-z0-9]{7}$/.test(v);
            },
            message: props => `${props.value} is not a valid namespace! Must be 8 characters, start with a letter, and contain only lowercase letters and numbers.`
        }
    },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

userSchema.pre('save', function(next) {
    this.updated_at = new Date();
    next();
});

const User = mongoose.model('User', userSchema);

module.exports = User; 