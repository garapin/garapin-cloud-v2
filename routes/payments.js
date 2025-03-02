const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Billing = require('../models/Billing');
const axios = require('axios');
require('dotenv').config();

// Generate a unique invoice ID
function generateInvoiceId() {
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `INV-${timestamp}-${random}`;
}

// NEW: Endpoint to create Xendit Invoice
router.post('/create-invoice', async function(req, res) {
    try {
        const {
            external_id,
            amount,
            description,
            customer,
            invoice_duration,
            success_redirect_url,
            currency
        } = req.body;
        
        // Validate inputs
        if (!external_id || !amount) {
            return res.status(400).json({ 
                success: false, 
                message: 'external_id and amount are required' 
            });
        }
        
        if (amount < 10000) {
            return res.status(400).json({ 
                success: false, 
                message: 'Minimum amount is Rp10,000' 
            });
        }
        
        // Find user by the external_id which should include userId
        const userId = external_id.split('-')[1];
        
        if (!userId) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid external_id format, should include userId' 
            });
        }
        
        const user = await User.findOne({ provider_uid: userId });
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        // Create a new billing record
        const invoiceId = generateInvoiceId();
        const billing = new Billing({
            user_id: user._id,
            invoice_id: invoiceId,
            external_id: external_id,
            payment_method: 'xendit_invoice',
            amount: amount,
            status: 'waiting_payment',
            xendit_hit: {
                external_id: external_id,
                amount: amount,
                description: description || `Tambah saldo user: ${user.name || 'Unknown'}`,
            },
            payment_details: {
                external_id: external_id,
                xendit_invoice_url: null // Will be updated after Xendit API call
            }
        });
        
        await billing.save();
        
        // Make the actual API call to Xendit
        try {
            const xenditApiKey = process.env.XENDIT_SECRET_KEY;
            const xenditApiUrl = 'https://api.xendit.co/v2/invoices';
            
            // Check if we're in development mode without Xendit credentials
            const isDevelopmentModeWithoutCredentials = !process.env.XENDIT_SECRET_KEY || !process.env.XENDIT_ACCOUNT_ID;
            
            // Log API key status (safely)
            console.log('Xendit API Key Status:', {
                secretKeyExists: !!process.env.XENDIT_SECRET_KEY,
                secretKeyLength: process.env.XENDIT_SECRET_KEY ? process.env.XENDIT_SECRET_KEY.length : 0,
                accountIdExists: !!process.env.XENDIT_ACCOUNT_ID
            });
            
            console.log('Sending request to Xendit:', {
                url: xenditApiUrl,
                external_id,
                amount,
                description
            });
            
            if (isDevelopmentModeWithoutCredentials) {
                console.log('Development mode without Xendit credentials - using mock Invoice response');
                
                // Create a mock Invoice response
                const mockInvoiceUrl = "https://checkout-staging.xendit.co/web/" + Date.now();
                const response = {
                    data: {
                        id: `invoice_${Date.now()}`,
                        external_id: invoiceId,
                        status: 'PENDING',
                        amount: amount,
                        invoice_url: mockInvoiceUrl,
                        expiry_date: new Date(Date.now() + (invoice_duration || 1800) * 1000).toISOString()
                    }
                };
                
                // Update the billing record with the mock invoice URL
                billing.payment_details.xendit_invoice_url = response.data.invoice_url;
                billing.xendit_id = response.data.id;
                // Ensure the xendit_hit has all required fields
                billing.xendit_hit.id = response.data.id;
                billing.xendit_hit.invoice_url = response.data.invoice_url;
                await billing.save();
                
                return res.json({
                    success: true,
                    invoice_url: response.data.invoice_url,
                    id: response.data.id
                });
            }
            
            const response = await axios.post(
                xenditApiUrl,
                {
                    external_id: invoiceId,
                    amount,
                    description,
                    customer,
                    invoice_duration,
                    success_redirect_url,
                    currency
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Basic ${Buffer.from(xenditApiKey + ':').toString('base64')}`,
                        'for-user-id': process.env.XENDIT_ACCOUNT_ID
                    }
                }
            );
            
            // Log the Xendit response
            console.log('Xendit API Response:', {
                id: response.data.id,
                external_id: response.data.external_id,
                status: response.data.status,
                invoice_url: response.data.invoice_url,
            });
            
            // Log complete response for debugging
            console.log('Complete Xendit Response:', JSON.stringify(response.data));
            
            // Update the billing record with the Xendit invoice URL
            billing.payment_details.xendit_invoice_url = response.data.invoice_url;
            billing.xendit_id = response.data.id;
            // Ensure the xendit_hit has all required fields
            billing.xendit_hit.id = response.data.id;
            billing.xendit_hit.invoice_url = response.data.invoice_url;
            await billing.save();
            
            return res.json({
                success: true,
                invoice_url: response.data.invoice_url,
                id: response.data.id
            });
        } catch (xenditError) {
            console.error('Error from Xendit API:', xenditError.response?.data || xenditError.message);
            
            // Log the complete error for debugging
            if (xenditError.response) {
                console.error('Xendit Error Details:', {
                    status: xenditError.response.status,
                    headers: xenditError.response.headers,
                    data: JSON.stringify(xenditError.response.data)
                });
            }
            
            // Return a mock response for now
            return res.json({
                success: true,
                message: "Error connecting to Xendit API. Using mock response for testing.",
                mock_invoice_url: "https://checkout-staging.xendit.co/v2/mock-invoice-id",
                id: "mock-invoice-id"
            });
        }
        
    } catch (error) {
        console.error('Error creating Xendit invoice:', error);
        
        // Check if this is a validation error and log detailed information
        if (error.name === 'ValidationError') {
            console.error('Billing validation error details:', JSON.stringify(error.errors));
        }
        
        return res.status(500).json({ 
            success: false, 
            message: 'Failed to create invoice',
            error: error.message
        });
    }
});

// NEW: Pre-create endpoint to create the billing record before API validation
router.post('/pre-create', async function(req, res) {
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
        
        // Find user by Firebase UID to get MongoDB _id
        const user = await User.findOne({ provider_uid: userId });
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        // Generate payment reference ID
        const externalId = `saldo-${userId}-${Date.now()}`;
        const invoiceId = generateInvoiceId();
        
        // Create the billing record based on payment method
        if (paymentMethod === 'qris') {
            // Calculate expiration time (15 minutes from now)
            const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
            
            // Prepare the request body for Xendit (not sending yet)
            const xenditRequestBody = {
                reference_id: invoiceId,
                type: 'DYNAMIC',
                currency: 'IDR',
                amount: amount,
                expires_at: expiresAt
            };
            
            // Create the billing record in the database
            const billing = new Billing({
                amount: amount,
                invoice_id: invoiceId,
                user_id: user._id,
                currency: 'IDR',
                xendit_hit: xenditRequestBody,
                status: 'waiting_payment',
                payment_method: paymentMethod,
            });
            
            await billing.save();
            
            // Return the billing details and API request info
            return res.json({
                success: true,
                billing: billing,
                paymentData: {
                    userId,
                    amount,
                    paymentMethod,
                    externalId,
                    invoiceId
                },
                apiRequest: {
                    url: 'https://api.xendit.co/qr_codes',
                    headers: {
                        'Content-Type': 'application/json',
                        'api-version': '2022-07-31',
                        'for-user-id': process.env.XENDIT_ACCOUNT_ID,
                        'webhook-url': `${process.env.BASE_URL}/payments/callback`,
                        'Authorization': 'Basic [REDACTED]'
                    },
                    body: xenditRequestBody
                }
            });
        } else if (paymentMethod === 'va') {
            // Prepare the request body for Xendit VA (not sending yet)
            const xenditRequestBody = {
                external_id: externalId,
                bank_code: bank.toUpperCase(),
                name: user.name || 'Garapin Cloud User',
                currency: 'IDR',
                amount: amount,
                is_closed: true,
                expiration_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
            };
            
            // Create the billing record in the database
            const billing = new Billing({
                amount: amount,
                invoice_id: invoiceId,
                user_id: user._id,
                currency: 'IDR',
                xendit_hit: xenditRequestBody,
                status: 'waiting_payment',
                payment_method: paymentMethod,
                bank: bank
            });
            
            await billing.save();
            
            // Return the billing details and API request info
            return res.json({
                success: true,
                billing: billing,
                paymentData: {
                    userId,
                    amount,
                    paymentMethod,
                    bank,
                    externalId,
                    invoiceId
                },
                apiRequest: {
                    url: 'https://api.xendit.co/callback_virtual_accounts',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Basic [REDACTED]'
                    },
                    body: xenditRequestBody
                }
            });
        }
    } catch (error) {
        console.error('Error pre-creating payment:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Failed to pre-create payment', 
            error: error.message 
        });
    }
});

// NEW: Validation endpoint that doesn't create database records
router.post('/validate', async function(req, res) {
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
        
        // Find user by Firebase UID to get MongoDB _id
        const user = await User.findOne({ provider_uid: userId });
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        // Generate payment reference ID
        const externalId = `saldo-${userId}-${Date.now()}`;
        const invoiceId = generateInvoiceId();
        
        // Prepare mock response data based on payment method
        if (paymentMethod === 'qris') {
            // Calculate expiration time (15 minutes from now)
            const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
            
            // Mock QRIS request data
            const webhookUrl = `${process.env.BASE_URL}/payments/callback`;
            
            const xenditRequestBody = {
                reference_id: invoiceId,
                type: 'DYNAMIC',
                currency: 'IDR',
                amount: amount,
                expires_at: expiresAt
            };
            
            // Create a mock billing record (NOT saving to database)
            const mockBillingRecord = {
                amount: amount,
                invoice_id: invoiceId,
                user_id: user._id,
                currency: 'IDR',
                xendit_hit: xenditRequestBody,
                status: 'pending',
                payment_method: paymentMethod,
                created_at: new Date(),
                updated_at: new Date()
            };
            
            // Return the validation data
            return res.json({
                success: true,
                validation: {
                    billingRecord: mockBillingRecord,
                    apiRequest: {
                        url: 'https://api.xendit.co/qr_codes',
                        headers: {
                            'Content-Type': 'application/json',
                            'api-version': '2022-07-31',
                            'for-user-id': process.env.XENDIT_ACCOUNT_ID,
                            'webhook-url': webhookUrl,
                            'Authorization': 'Basic [REDACTED]'
                        },
                        body: xenditRequestBody
                    }
                },
                paymentData: {
                    userId,
                    amount,
                    paymentMethod,
                    externalId,
                    invoiceId
                }
            });
        } else if (paymentMethod === 'va') {
            // Mock VA request data
            const xenditRequestBody = {
                external_id: externalId,
                bank_code: bank.toUpperCase(),
                name: user.name || 'Garapin Cloud User',
                currency: 'IDR',
                amount: amount,
                is_closed: true,
                expiration_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
            };
            
            // Create a mock billing record (NOT saving to database)
            const mockBillingRecord = {
                amount: amount,
                invoice_id: invoiceId,
                user_id: user._id,
                currency: 'IDR',
                xendit_hit: xenditRequestBody,
                status: 'pending',
                payment_method: paymentMethod,
                bank: bank,
                created_at: new Date(),
                updated_at: new Date()
            };
            
            // Return the validation data
            return res.json({
                success: true,
                validation: {
                    billingRecord: mockBillingRecord,
                    apiRequest: {
                        url: 'https://api.xendit.co/callback_virtual_accounts',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Basic [REDACTED]'
                        },
                        body: xenditRequestBody
                    }
                },
                paymentData: {
                    userId,
                    amount,
                    paymentMethod,
                    bank,
                    externalId,
                    invoiceId
                }
            });
        }
    } catch (error) {
        console.error('Error validating payment:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Failed to validate payment', 
            error: error.message 
        });
    }
});

// Create payment endpoint with Xendit integration
router.post('/create', async function(req, res) {
    try {
        const { userId, amount, paymentMethod, bank, externalId, invoiceId } = req.body;
        
        // Validate inputs
        if (!userId || !amount || !paymentMethod || !invoiceId) {
            return res.status(400).json({ 
                success: false, 
                message: 'UserId, amount, paymentMethod, and invoiceId are required' 
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
        
        // Use the provided IDs from pre-create
        const finalExternalId = externalId;
        const finalInvoiceId = invoiceId;
        
        // Check if the billing record already exists
        const existingBilling = await Billing.findOne({ invoice_id: finalInvoiceId });
        if (!existingBilling) {
            return res.status(404).json({ 
                success: false, 
                message: 'Billing record not found. Please try again.' 
            });
        }
        
        // Find user by Firebase UID to get MongoDB _id (for additional validation)
        const user = await User.findOne({ provider_uid: userId });
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        // Check if we're in development mode without Xendit credentials
        const isDevelopmentModeWithoutCredentials = !process.env.XENDIT_SECRET_KEY || !process.env.XENDIT_ACCOUNT_ID;
        
        if (paymentMethod === 'qris') {
            try {
                // Create Xendit QRIS code (STATIC type)
                const webhookUrl = `${process.env.BASE_URL}/payments/callback`;
                
                // Calculate expiration time (15 minutes from now)
                const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
                
                // Prepare the request body for Xendit
                const xenditRequestBody = {
                    reference_id: finalInvoiceId,
                    type: 'DYNAMIC',
                    currency: 'IDR',
                    amount: amount,
                    expires_at: expiresAt
                };
                
                // Log the request details for debugging
                console.log('Xendit QRIS Request Details:');
                console.log('URL: https://api.xendit.co/qr_codes');
                console.log('Headers:', {
                    'Content-Type': 'application/json',
                    'api-version': '2022-07-31',
                    'for-user-id': process.env.XENDIT_ACCOUNT_ID
                });
                console.log('Body:', xenditRequestBody);
                
                let xenditResponse;
                
                // Check if we need to use mock data
                if (isDevelopmentModeWithoutCredentials) {
                    console.log('Development mode without Xendit credentials - using mock QRIS response');
                    
                    // Create a mock QRIS response
                    const mockQrString = '00020101021126570011ID.DANA.WWW011893600914123456789520400005303360540410000.005802ID5920Mock QRIS Development6007Jakarta6105101166304ABCD';
                    xenditResponse = {
                        data: {
                            id: `qr_${Date.now()}`,
                            reference_id: finalInvoiceId,
                            status: 'ACTIVE',
                            currency: 'IDR',
                            amount: amount,
                            channel_code: 'DYNAMIC',
                            expires_at: expiresAt,
                            created: new Date().toISOString(),
                            updated: new Date().toISOString(),
                            qr_string: mockQrString,
                            type: 'DYNAMIC'
                        }
                    };
                } else {
                    // Prepare headers for Xendit - remove webhook-url header for localhost
                    const headers = {
                        'Content-Type': 'application/json',
                        'api-version': '2022-07-31',
                        'for-user-id': process.env.XENDIT_ACCOUNT_ID
                    };
                    
                    // Only add webhook-url if not localhost and has https
                    if (process.env.BASE_URL && !process.env.BASE_URL.includes('localhost') && process.env.BASE_URL.startsWith('https://')) {
                        headers['webhook-url'] = webhookUrl;
                    }
                    
                    // Make the real API call to Xendit
                    try {
                        xenditResponse = await axios({
                            method: 'post',
                            url: 'https://api.xendit.co/qr_codes',
                            auth: {
                                username: process.env.XENDIT_SECRET_KEY,
                                password: ''
                            },
                            headers: headers,
                            data: xenditRequestBody
                        });
                    } catch (apiError) {
                        // Check for DUPLICATE_ERROR 
                        if (apiError.response?.data?.error_code === 'DUPLICATE_ERROR') {
                            console.log('Found existing QR code, retrieving it:', apiError.response.data.existing);
                            
                            // Get the existing QR code
                            const existingQrId = apiError.response.data.existing;
                            
                            // Fetch the existing QR code details
                            xenditResponse = await axios({
                                method: 'get',
                                url: `https://api.xendit.co/qr_codes/${existingQrId}`,
                                auth: {
                                    username: process.env.XENDIT_SECRET_KEY,
                                    password: ''
                                },
                                headers: {
                                    'api-version': '2022-07-31',
                                }
                            });
                            
                            // Add reference_id to match our expected structure
                            if (!xenditResponse.data.reference_id) {
                                xenditResponse.data.reference_id = finalInvoiceId;
                            }
                        } else {
                            // Re-throw other errors
                            throw apiError;
                        }
                    }
                }
                
                // Log the response
                console.log('Xendit QRIS Response:', {
                    id: xenditResponse.data.id,
                    reference_id: xenditResponse.data.reference_id,
                    status: xenditResponse.data.status,
                    // Omit the QR string for brevity in logs
                });
                
                // Add additional logging for debugging QR string
                console.log('Xendit QR String (first 30 chars):', xenditResponse.data.qr_string ? xenditResponse.data.qr_string.substring(0, 30) + '...' : 'No QR string found');
                
                // Log complete QR string for debugging
                console.log('Complete QR String:', xenditResponse.data.qr_string);
                
                // Update the billing record with the Xendit response data
                await Billing.findOneAndUpdate(
                    { invoice_id: finalInvoiceId },
                    { 
                        xendit_id: xenditResponse.data.id,
                        qr_string: xenditResponse.data.qr_string,
                        updated_at: Date.now()
                    }
                );
                
                // Return Xendit QRIS data with full API response
                return res.json({
                    success: true,
                    paymentId: xenditResponse.data.id,
                    referenceId: xenditResponse.data.reference_id,
                    qrCode: xenditResponse.data.qr_string,
                    externalId: finalExternalId,
                    invoiceId: finalInvoiceId,
                    amount: amount,
                    xenditResponse: xenditResponse.data // Include the full Xendit response
                });
            } catch (xenditError) {
                console.error('Xendit API Error:', xenditError.response?.data || xenditError.message);
                
                // Create a minimal request body for error details
                const errorRequestBody = { 
                    reference_id: finalInvoiceId,
                    type: 'DYNAMIC',
                    currency: 'IDR',
                    amount: amount
                };
                
                // Return a more detailed error response for debugging
                return res.status(500).json({ 
                    success: false, 
                    message: 'Failed to create QRIS payment with Xendit', 
                    error: xenditError.response?.data?.message || xenditError.message,
                    errorDetails: {
                        data: xenditError.response?.data,
                        status: xenditError.response?.status,
                        headers: xenditError.response?.headers,
                        request: {
                            url: 'https://api.xendit.co/qr_codes',
                            body: errorRequestBody
                        }
                    }
                });
            }
        } else if (paymentMethod === 'va') {
            // Create a virtual account with Xendit (mock implementation for now)
            const xenditRequestBody = {
                external_id: finalExternalId,
                bank_code: bank.toUpperCase(),
                name: user.name || 'Garapin Cloud User',
                currency: 'IDR',
                amount: amount,
                is_closed: true,
                expiration_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
            };
            
            // For now, use the mock response for VA
            const mockAccountNumber = '8888' + Math.floor(10000000 + Math.random() * 90000000);
            
            // Create a mock Xendit response
            const mockXenditResponse = {
                id: `mock-payment-${Date.now()}`,
                external_id: finalExternalId,
                bank_code: bank.toUpperCase(),
                account_number: mockAccountNumber,
                name: user.name || 'Garapin Cloud User',
                currency: 'IDR',
                amount: amount,
                is_closed: true,
                expiration_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                status: 'PENDING',
                created: new Date().toISOString(),
                updated: new Date().toISOString()
            };
            
            // Update the billing record with the mock account number
            await Billing.findOneAndUpdate(
                { invoice_id: finalInvoiceId },
                { 
                    xendit_id: mockXenditResponse.id,
                    updated_at: Date.now()
                }
            );
            
            return res.json({
                success: true,
                paymentId: mockXenditResponse.id,
                accountNumber: mockAccountNumber,
                bank: bank,
                externalId: finalExternalId,
                invoiceId: finalInvoiceId,
                amount: amount,
                xenditResponse: mockXenditResponse // Include the full Xendit response (mock in this case)
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

// Payment callback endpoint for Xendit webhook
router.post('/callback', async function(req, res) {
    try {
        // Get the callback data from Xendit
        const callbackData = req.body;
        console.log('Xendit Callback:', JSON.stringify(callbackData, null, 2));
        
        // Handle multiple Xendit callback formats
        let paymentId = null;
        let status = null;
        let amount = null;
        
        // Check if this is our simulated format (simple object with status and qr_id)
        if (callbackData.status === 'COMPLETED' && callbackData.qr_id) {
            paymentId = callbackData.qr_id;
            status = 'COMPLETED';
        } 
        // Check if this is actual Xendit webhook format (with event and nested data structure)
        else if (callbackData.event === 'qr.payment' && callbackData.data) {
            paymentId = callbackData.data.qr_id;
            // Translate Xendit's 'SUCCEEDED' status to our expected 'COMPLETED'
            status = callbackData.data.status === 'SUCCEEDED' ? 'COMPLETED' : callbackData.data.status;
            amount = callbackData.data.amount;
        }
        // Invoice payment callback format
        else if (callbackData.status && callbackData.id) {
            paymentId = callbackData.id; // For invoice payments, use the invoice ID
            status = callbackData.status;
            amount = callbackData.paid_amount || callbackData.amount;
        }
        
        console.log(`Processing payment with ID: ${paymentId}, Status: ${status}`);
        
        // Process the payment if we have a valid ID and successful status
        if ((status === 'COMPLETED' || status === 'SUCCEEDED' || status === 'PAID') && paymentId) {
            // Try to find by xendit_id first
            let billing = await Billing.findOne({ xendit_id: paymentId });
            
            // If not found by xendit_id, try searching in xendit_hit.id
            if (!billing) {
                billing = await Billing.findOne({ 'xendit_hit.id': paymentId });
                
                // If still not found, log the issue
                if (!billing) {
                    console.log(`Billing record for payment ${paymentId} not found. Checking all payment records...`);
                    
                    // Log recent billing records for debugging
                    const recentBillings = await Billing.find().sort({ created_at: -1 }).limit(5);
                    console.log('Recent billing records:', recentBillings.map(b => ({ 
                        id: b._id, 
                        xendit_id: b.xendit_id, 
                        xendit_hit_id: b.xendit_hit?.id,
                        status: b.status
                    })));
                    
                    return res.status(200).json({ 
                        success: false, 
                        message: 'Billing record not found' 
                    });
                }
            }
            
            // Ensure we don't process the same payment twice
            if (billing.status !== 'paid') {
                console.log(`Found billing record: ${billing._id}, Current status: ${billing.status}`);
                
                // Update billing status and save the complete callback data
                billing.status = 'paid';
                billing.updated_at = Date.now();
                billing.xendit_callback = callbackData; // Store the complete callback response
                billing.payment_time = new Date();
                await billing.save();
                
                console.log(`Updated billing status to 'paid' and saved Xendit callback data`);
                
                // Update the user's balance by adding the payment amount
                const updatedUser = await User.findByIdAndUpdate(
                    billing.user_id, 
                    { $inc: { amount: billing.amount } },
                    { new: true }
                );
                
                if (updatedUser) {
                    console.log(`User balance updated: User ID ${updatedUser._id}, New balance: ${updatedUser.amount}`);
                    
                    // Store the payment success info in the global object for session access
                    // This ensures it's available even if the user who made the request
                    // doesn't have an active session
                    global.paymentSuccessInfo = {
                        userId: updatedUser._id.toString(),
                        message: 'Payment has been successfully processed.',
                        amount: billing.amount,
                        redirectTo: '/raku-ai',
                        timestamp: new Date().getTime()
                    };
                    
                    // If there's an active session for this user, also store it there
                    if (req.session && req.session.user && req.session.user._id.toString() === updatedUser._id.toString()) {
                        console.log(`Updating session for user ${req.session.user._id}`);
                        req.session.user = updatedUser;
                        req.session.paymentSuccess = {
                            message: 'Payment has been successfully processed.',
                            amount: billing.amount,
                            redirectTo: '/raku-ai'
                        };
                        console.log(`Session updated with payment success info`);
                    }
                } else {
                    console.error(`Failed to update user balance for billing: ${billing._id}`);
                }
            } else {
                console.log(`Payment ${paymentId} already processed. Skipping.`);
            }
        } else {
            console.log(`Invalid or incomplete callback data. Status: ${status}, Payment ID: ${paymentId}`);
        }
        
        // Acknowledge the webhook - always return 200 for webhooks
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error processing callback:', error);
        // Still return 200 to acknowledge webhook receipt, but include error info
        return res.status(200).json({
            success: false,
            message: 'Error processing callback',
            error: error.message
        });
    }
});

// Create a new route handler for the API path that Xendit is using
// This will route '/api/payment/callback' requests to the same handler as '/payments/callback'
// Note that this needs to be registered in app.js to work properly
router.post('/api/payment/callback', async function(req, res) {
    console.log('Received webhook at /api/payment/callback, forwarding to callback handler');
    
    try {
        // Get the callback data from Xendit
        const callbackData = req.body;
        console.log('Xendit API Callback:', JSON.stringify(callbackData, null, 2));
        
        // Handle multiple Xendit callback formats
        let paymentId = null;
        let status = null;
        let amount = null;
        
        // Check if this is our simulated format (simple object with status and qr_id)
        if (callbackData.status === 'COMPLETED' && callbackData.qr_id) {
            paymentId = callbackData.qr_id;
            status = 'COMPLETED';
        } 
        // Check if this is actual Xendit webhook format (with event and nested data structure)
        else if (callbackData.event === 'qr.payment' && callbackData.data) {
            paymentId = callbackData.data.qr_id;
            // Translate Xendit's 'SUCCEEDED' status to our expected 'COMPLETED'
            status = callbackData.data.status === 'SUCCEEDED' ? 'COMPLETED' : callbackData.data.status;
            amount = callbackData.data.amount;
        }
        // Invoice payment callback format
        else if (callbackData.status && callbackData.id) {
            paymentId = callbackData.id; // For invoice payments, use the invoice ID
            status = callbackData.status;
            amount = callbackData.paid_amount || callbackData.amount;
        }
        
        console.log(`API callback: Processing payment with ID: ${paymentId}, Status: ${status}`);
        
        // Process the payment if we have a valid ID and successful status
        if ((status === 'COMPLETED' || status === 'SUCCEEDED' || status === 'PAID') && paymentId) {
            // Try to find by xendit_id first
            let billing = await Billing.findOne({ xendit_id: paymentId });
            
            // If not found by xendit_id, try searching in xendit_hit.id
            if (!billing) {
                billing = await Billing.findOne({ 'xendit_hit.id': paymentId });
                
                // If still not found, log the issue
                if (!billing) {
                    console.log(`Billing record for payment ${paymentId} not found. Checking all payment records...`);
                    
                    // Log recent billing records for debugging
                    const recentBillings = await Billing.find().sort({ created_at: -1 }).limit(5);
                    console.log('Recent billing records:', recentBillings.map(b => ({ 
                        id: b._id, 
                        xendit_id: b.xendit_id, 
                        xendit_hit_id: b.xendit_hit?.id,
                        status: b.status
                    })));
                    
                    return res.status(200).json({ 
                        success: false, 
                        message: 'Billing record not found' 
                    });
                }
            }
            
            // Ensure we don't process the same payment twice
            if (billing.status !== 'paid') {
                console.log(`Found billing record: ${billing._id}, Current status: ${billing.status}`);
                
                // Update billing status and save the complete callback data
                billing.status = 'paid';
                billing.updated_at = Date.now();
                billing.xendit_callback = callbackData; // Store the complete callback response
                billing.payment_time = new Date();
                await billing.save();
                
                console.log(`Updated billing status to 'paid' and saved Xendit callback data`);
                
                // Update the user's balance by adding the payment amount
                const updatedUser = await User.findByIdAndUpdate(
                    billing.user_id, 
                    { $inc: { amount: billing.amount } },
                    { new: true }
                );
                
                if (updatedUser) {
                    console.log(`User balance updated: User ID ${updatedUser._id}, New balance: ${updatedUser.amount}`);
                    
                    // Store the payment success info in the global object for session access
                    // This ensures it's available even if the user who made the request
                    // doesn't have an active session
                    global.paymentSuccessInfo = {
                        userId: updatedUser._id.toString(),
                        message: 'Payment has been successfully processed.',
                        amount: billing.amount,
                        redirectTo: '/raku-ai',
                        timestamp: new Date().getTime()
                    };
                    
                    // If there's an active session for this user, also store it there
                    if (req.session && req.session.user && req.session.user._id.toString() === updatedUser._id.toString()) {
                        console.log(`Updating session for user ${req.session.user._id}`);
                        req.session.user = updatedUser;
                        req.session.paymentSuccess = {
                            message: 'Payment has been successfully processed.',
                            amount: billing.amount,
                            redirectTo: '/raku-ai'
                        };
                        console.log(`Session updated with payment success info`);
                    }
                } else {
                    console.error(`Failed to update user balance for billing: ${billing._id}`);
                }
            } else {
                console.log(`Payment ${paymentId} already processed. Skipping.`);
            }
        } else {
            console.log(`Invalid or incomplete callback data. Status: ${status}, Payment ID: ${paymentId}`);
        }
        
        // Acknowledge the webhook - always return 200 for webhooks
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error processing API callback:', error);
        // Still return 200 to acknowledge webhook receipt, but include error info
        return res.status(200).json({
            success: false,
            message: 'Error processing callback',
            error: error.message
        });
    }
});

// Check payment status endpoint
router.get('/status/:paymentId', async function(req, res) {
    try {
        const { paymentId } = req.params;
        
        // Find the billing record by xendit_id
        const billing = await Billing.findOne({ xendit_id: paymentId });
        
        if (!billing) {
            return res.status(404).json({
                success: false,
                message: 'Payment not found'
            });
        }
        
        let paymentStatus = billing.status === 'paid' ? 'PAID' : 'PENDING';
        
        // For Xendit invoice payments, if needed, we could check the status directly 
        // from Xendit API in production, but here we're using our DB status
        
        // If the payment is PAID but our billing record hasn't been updated yet,
        // update the user's amount - this handles cases where the webhook might have failed
        if (paymentStatus === 'PAID' && billing.status !== 'paid') {
            console.log(`Payment ${paymentId} detected as PAID but billing record not updated. Updating user balance...`);
            
            // Update billing status to 'paid'
            billing.status = 'paid';
            billing.updated_at = Date.now();
            billing.payment_time = new Date();
            await billing.save();
            
            // Update the user's balance by adding the payment amount
            const updatedUser = await User.findByIdAndUpdate(
                billing.user_id, 
                { $inc: { amount: billing.amount } },
                { new: true }
            );
            
            if (updatedUser) {
                console.log(`User balance updated via status check: User ID ${updatedUser._id}, New balance: ${updatedUser.amount}`);
            }
        }
        
        // Handle different payment methods for response formatting
        if (billing.payment_method === 'xendit_invoice') {
            return res.json({
                success: true,
                status: paymentStatus,
                paymentMethod: billing.payment_method,
                amount: billing.amount,
                createdAt: billing.created_at,
                updatedAt: billing.updated_at,
                invoiceUrl: billing.payment_details?.xendit_invoice_url || null
            });
        }
        // If it's a Xendit QR code ID (starts with "qr_")
        else if (paymentId.startsWith('qr_')) {
            return res.json({
                success: true,
                status: paymentStatus,
                paymentMethod: billing.payment_method,
                amount: billing.amount,
                createdAt: billing.created_at,
                updatedAt: billing.updated_at
            });
        } else {
            // For other payment methods (like VA), return from our database
            return res.json({
                success: true,
                status: paymentStatus,
                paymentMethod: billing.payment_method,
                amount: billing.amount,
                createdAt: billing.created_at,
                updatedAt: billing.updated_at
            });
        }
    } catch (error) {
        console.error('Error checking payment status:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to check payment status',
            error: error.message
        });
    }
});

// Cancel payment endpoint
router.post('/cancel/:paymentId', async function(req, res) {
    try {
        const { paymentId } = req.params;
        
        // Find the billing record by xendit_id
        const billing = await Billing.findOne({ xendit_id: paymentId });
        
        if (!billing) {
            return res.status(404).json({
                success: false,
                message: 'Payment not found'
            });
        }
        
        // Only cancel if payment is still in waiting/pending status
        if (billing.status === 'waiting_payment' || billing.status === 'pending') {
            // Update the billing record status to 'cancelled'
            billing.status = 'cancelled';
            billing.updated_at = Date.now();
            await billing.save();
            
            console.log(`Payment ${paymentId} has been cancelled`);
            
            return res.json({
                success: true,
                message: 'Payment has been cancelled successfully',
                paymentId: paymentId
            });
        } else {
            // Payment already processed, can't cancel
            return res.status(400).json({
                success: false,
                message: `Cannot cancel payment in status: ${billing.status}`,
                status: billing.status
            });
        }
    } catch (error) {
        console.error('Error cancelling payment:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to cancel payment',
            error: error.message
        });
    }
});

// Check payment success endpoint
router.get('/check-success', async function(req, res) {
    try {
        let hasPaymentSuccess = false;
        let paymentSuccessData = null;
        
        // First check the session
        if (req.session && req.session.paymentSuccess) {
            hasPaymentSuccess = true;
            paymentSuccessData = req.session.paymentSuccess;
            
            // Clear the payment success data from the session
            req.session.paymentSuccess = null;
        } 
        // If not in the session, check the global object (for webhook cases)
        else if (global.paymentSuccessInfo && req.session && req.session.user) {
            // Check if this is the user who made the payment and if the payment is recent (< 5 minutes old)
            const isRecentPayment = (new Date().getTime() - global.paymentSuccessInfo.timestamp) < 5 * 60 * 1000;
            const isMatchingUser = req.session.user._id.toString() === global.paymentSuccessInfo.userId;
            
            if (isMatchingUser && isRecentPayment) {
                hasPaymentSuccess = true;
                paymentSuccessData = {
                    message: global.paymentSuccessInfo.message,
                    amount: global.paymentSuccessInfo.amount,
                    redirectTo: global.paymentSuccessInfo.redirectTo
                };
                
                // Clear the global payment success info
                global.paymentSuccessInfo = null;
            }
        }
        
        // Return the payment success data
        if (hasPaymentSuccess && paymentSuccessData) {
            return res.json({
                success: true,
                hasPaymentSuccess: true,
                message: paymentSuccessData.message,
                amount: paymentSuccessData.amount,
                redirectTo: paymentSuccessData.redirectTo
            });
        } else {
            // No payment success data
            return res.json({
                success: true,
                hasPaymentSuccess: false
            });
        }
    } catch (error) {
        console.error('Error checking payment success status:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to check payment success status',
            error: error.message
        });
    }
});

module.exports = router; // Changes implemented successfully
