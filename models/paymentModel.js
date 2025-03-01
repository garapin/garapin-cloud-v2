const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        index: true
    },
    amount: {
        type: Number,
        required: true,
        min: 1
    },
    paymentMethod: {
        type: String,
        required: true,
        enum: ['qris', 'va']
    },
    bank: {
        type: String,
        required: function() {
            return this.paymentMethod === 'va';
        },
        enum: ['bca', 'bni', 'bri', 'mandiri', 'permata']
    },
    status: {
        type: String,
        required: true,
        enum: ['PENDING', 'COMPLETED', 'FAILED', 'EXPIRED'],
        default: 'PENDING'
    },
    externalId: {
        type: String,
        required: true,
        unique: true
    },
    xenditId: {
        type: String,
        required: true
    },
    qrString: {
        type: String,
        required: function() {
            return this.paymentMethod === 'qris';
        }
    },
    accountNumber: {
        type: String,
        required: function() {
            return this.paymentMethod === 'va';
        }
    },
    processedAt: {
        type: Date
    }
}, { timestamps: true });

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = Payment; 