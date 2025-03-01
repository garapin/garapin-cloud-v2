const express = require('express');
const router = express.Router();
const multer = require('multer');
const FormData = require('form-data');
const mongoose = require('mongoose');
require('dotenv').config();

// Configure multer for handling file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024 // Increased to 50MB limit
    }
});

// Define PublicApiKey model with the correct schema
const PublicApiKey = mongoose.model('public_api_keys', new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, required: true },
    provider_uid: { type: String, required: true },
    name: { type: String, required: true },
    key: { type: String, required: true, unique: true },
    status: { type: String, required: true, default: 'active' },
    created_at: { type: Date, default: Date.now },
    last_used: { type: Date, default: null },
    updatedAt: { type: Date, default: Date.now }
}));

// Middleware to verify API key
const verifyApiKey = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Invalid Authorization header format' });
        }

        const apiKey = authHeader.split('Bearer ')[1];
        console.log('Verifying API key:', apiKey);

        // Check if API key exists and is active
        const keyExists = await PublicApiKey.findOne({ 
            key: apiKey,
            status: 'active'
        });

        if (!keyExists) {
            console.log('Invalid API key or key is not active');
            return res.status(401).json({ error: 'Invalid API key' });
        }

        // Update last_used timestamp
        await PublicApiKey.findByIdAndUpdate(keyExists._id, {
            last_used: new Date(),
            updatedAt: new Date()
        });

        console.log('Valid API key found for user:', keyExists.provider_uid);
        req.apiKey = keyExists; // Store API key info for later use if needed
        next();
    } catch (error) {
        console.error('API key verification error:', error);
        res.status(500).json({ error: 'Failed to verify API key' });
    }
};

// Endpoint to handle receipt sending
router.post('/send-receipt', verifyApiKey, express.json({ limit: '50mb' }), async (req, res) => {
    try {
        console.log('Received receipt request:', {
            headers: req.headers,
            body: {
                ...req.body,
                invoicePDFfile: req.body.invoicePDFfile ? 'base64_content_hidden' : null
            }
        });

        // Check if RECEIPT_API_URL is configured
        if (!process.env.RECEIPT_API_URL) {
            throw new Error('RECEIPT_API_URL is not configured');
        }

        // Validate all required fields
        const requiredFields = ['merchantName', 'alamat', 'invoiceNumber', 'total', 'invoicePDFfile'];
        const missingFields = requiredFields.filter(field => !req.body[field]);
        
        if (missingFields.length > 0) {
            return res.status(400).json({
                error: 'Missing required fields',
                missingFields: missingFields
            });
        }

        // Validate destination number
        if (!req.headers.destination_number) {
            return res.status(400).json({ error: 'Destination number is required' });
        }

        // Validate total is a valid number
        const total = parseFloat(req.body.total);
        if (isNaN(total) || total <= 0) {
            return res.status(400).json({ error: 'Total must be a valid positive number' });
        }

        // Validate base64 PDF format and size
        if (!req.body.invoicePDFfile.match(/^[A-Za-z0-9+/=]+$/)) {
            return res.status(400).json({ error: 'Invalid base64 PDF content' });
        }

        // Calculate base64 size (1 base64 character represents 6 bits, so 4 base64 chars = 3 bytes)
        const base64Size = Math.ceil(req.body.invoicePDFfile.length * 0.75);
        const maxSize = 6 * 1024 * 1024; // 6MB in bytes

        if (base64Size > maxSize) {
            return res.status(400).json({ 
                error: 'PDF file too large',
                details: 'Maximum file size is 6MB'
            });
        }

        // Forward the request to configured API URL
        console.log('Forwarding request to:', process.env.RECEIPT_API_URL);
        const fetch = await import('node-fetch').then(mod => mod.default);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000); // 60 seconds timeout

        try {
            const response = await fetch(process.env.RECEIPT_API_URL, {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': req.headers.authorization,
                    'destination_number': req.headers.destination_number
                },
                body: JSON.stringify({
                    merchantName: req.body.merchantName,
                    alamat: req.body.alamat,
                    invoiceNumber: req.body.invoiceNumber,
                    total: total,
                    invoicePDFfile: req.body.invoicePDFfile,
                    user_id: req.apiKey.user_id
                }),
                signal: controller.signal
            });

            // Check response status and headers
            if (response.ok) {
                // First check header-based success
                const headerStatus = response.headers.get('status');
                if (headerStatus === 'submit completed') {
                    console.log('Receipt submission successful (header-based)');
                    return res.status(200).json({
                        success: true,
                        message: 'Receipt submitted successfully',
                        status: headerStatus
                    });
                }

                // If no header status, try to parse response body
                try {
                    const responseBody = await response.json();
                    console.log('API Response body:', responseBody);

                    // If response has status field, use it
                    if (responseBody.status === 'submit completed') {
                        return res.status(200).json({
                            success: true,
                            message: 'Receipt submitted successfully',
                            status: responseBody.status
                        });
                    }

                    // If we got a 200 response, consider it successful even without specific status
                    return res.status(200).json({
                        success: true,
                        message: 'Receipt submitted successfully',
                        ...responseBody
                    });
                } catch (e) {
                    // If can't parse JSON but response was OK, consider it successful
                    if (response.status === 200) {
                        return res.status(200).json({
                            success: true,
                            message: 'Receipt submitted successfully'
                        });
                    }
                }
            }

            // If response is not ok, handle error
            console.error('API Error Response:', {
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers.entries())
            });

            // Get response content type
            const contentType = response.headers.get('content-type');
            let errorDetails;

            try {
                if (contentType && contentType.includes('application/json')) {
                    errorDetails = await response.json();
                } else {
                    // For HTML or other response types, get text but limit it
                    const text = await response.text();
                    errorDetails = text.substring(0, 200) + (text.length > 200 ? '...' : '');
                }
            } catch (e) {
                errorDetails = response.statusText || 'Unknown error occurred';
            }

            // Log the error details for debugging
            console.error('Error details:', errorDetails);

            res.status(response.status || 500).json({
                error: 'Receipt submission failed',
                details: typeof errorDetails === 'string' ? errorDetails : JSON.stringify(errorDetails)
            });

        } finally {
            clearTimeout(timeout);
        }

    } catch (error) {
        console.error('Error processing receipt request:', error);
        res.status(500).json({
            error: 'Failed to process receipt request',
            details: error.message
        });
    }
});

module.exports = router; 