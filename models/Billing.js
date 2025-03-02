const mongoose = require('mongoose');

const billingSchema = new mongoose.Schema({
    amount: {
        type: Number,
        required: true,
        min: 1
    },
    invoice_id: {
        type: String,
        required: true,
        unique: true
    },
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    currency: {
        type: String,
        required: true,
        default: 'IDR'
    },
    xendit_hit: {
        type: Object,
        required: true
    },
    status: {
        type: String,
        required: true,
        enum: ['waiting_payment', 'paid', 'cancelled'],
        default: 'waiting_payment'
    },
    xendit_id: {
        type: String
    },
    qr_string: {
        type: String
    },
    payment_method: {
        type: String,
        enum: ['qris', 'va'],
        required: true
    },
    bank: {
        type: String,
        required: function() {
            return this.payment_method === 'va';
        },
        enum: ['bca', 'bni', 'bri', 'mandiri', 'permata']
    },
    xendit_callback: {
        type: Object, // Stores the complete Xendit callback data
        default: null
    },
    payment_time: {
        type: Date, // Records when the payment was completed
        default: null
    },
    created_at: {
        type: Date,
        default: Date.now
    },
    updated_at: {
        type: Date,
        default: Date.now
    }
});

// Update the updated_at field before saving
billingSchema.pre('save', function(next) {
    this.updated_at = Date.now();
    next();
});

const Billing = mongoose.model('Billing', billingSchema);

module.exports = Billing; 