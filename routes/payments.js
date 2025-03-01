const express = require('express');
const router = express.Router();
const User = require('../models/User');

// Create payment endpoint (mock version without Xendit)
router.post('/create', async function(req, res) {
    try {
        const { userId, amount, paymentMethod, bank } = req.body;
        
        // Validate inputs
        if (!userId || !amount || !paymentMethod) {
            return res.status(400).json({ 
                success: false, 
                message: 'UserId, amount, and paymentMethod are required' 
            });
        }
        
        if (amount < 10000) {
            return res.status(400).json({ 
                success: false, 
                message: 'Minimum amount is Rp10,000' 
            });
        }
        
        if (paymentMethod === 'va' && !bank) {
            return res.status(400).json({ 
                success: false, 
                message: 'Bank is required for Virtual Account payments' 
            });
        }
        
        // Generate mock payment data
        const mockPaymentId = `mock-payment-${Date.now()}`;
        const externalId = `saldo-${userId}-${Date.now()}`;
        
        if (paymentMethod === 'qris') {
            // Return mock QRIS data
            return res.json({
                success: true,
                paymentId: mockPaymentId,
                qrCode: 'https://placehold.co/400x400/png?text=Mock+QR+Code',
                externalId: externalId,
                amount: amount
            });
        } else if (paymentMethod === 'va') {
            // Return mock VA data
            return res.json({
                success: true,
                paymentId: mockPaymentId,
                accountNumber: '8888' + Math.floor(10000000 + Math.random() * 90000000),
                bank: bank,
                externalId: externalId,
                amount: amount
            });
        }
        
    } catch (error) {
        console.error('Error creating payment:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Failed to create payment', 
            error: error.message 
        });
    }
});

// Check payment status endpoint (mock version)
router.get('/status/:paymentId', function(req, res) {
    // For the mock version, always return PENDING status
    return res.json({
        success: true,
        status: 'PENDING',
        paymentMethod: req.query.method || 'qris',
        amount: 0,
        createdAt: new Date(),
        updatedAt: new Date()
    });
});

// Payment callback endpoint (mock version)
router.post('/callback', function(req, res) {
    // Mock callback response
    return res.status(200).json({ success: true });
});

module.exports = router; 