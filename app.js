const express = require('express');
const session = require('express-session');
const { initializeApp } = require('firebase/app');
const admin = require('firebase-admin');
const mongoose = require('mongoose');
const moment = require('moment-timezone');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config();
const multer = require('multer');
const { verifyToken } = require('./middleware/auth');
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

const User = require('./models/User');
const Application = require('./models/Application');
const Profile = require('./models/Profile');
const Billing = require('./models/Billing');
const categoryController = require('./controllers/categoryController');
const Category = require('./models/Category');
const InstalledApp = require('./models/InstalledApp');
const BaseImage = require('./models/BaseImage');
const applicationController = require('./controllers/backend/applications-backend');
const baseImageController = require('./controllers/backend/base-images-backend');
const receiptRoutes = require('./controllers/receiptAI');
const paymentRoutes = require('./routes/payments');
const PublicApiKey = require('./models/PublicApiKey');
const GlobalPrice = require('./models/GlobalPrice');

const app = express();

// Add security headers middleware
app.use((req, res, next) => {
    // Remove COOP and COEP headers that might interfere with popups
    res.removeHeader('Cross-Origin-Opener-Policy');
    res.removeHeader('Cross-Origin-Embedder-Policy');

    // Set CSP headers
    res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' " +
        "https://www.gstatic.com https://apis.google.com " +
        "https://*.firebaseio.com https://*.firebaseapp.com " +
        "https://www.googleapis.com https://cdn.jsdelivr.net " +
        "https://cdn.tiny.cloud; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com " +
        "https://cdn.jsdelivr.net https://cdn.tiny.cloud https://fonts.cdnfonts.com; " +
        "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net https://cdn.tiny.cloud https://fonts.cdnfonts.com; " +
        "img-src 'self' data: https: blob: https://lh3.googleusercontent.com " +
        "https://*.googleusercontent.com https://cdn.tiny.cloud; " +
        "connect-src 'self' https://*.firebaseio.com https://www.googleapis.com " +
        "https://securetoken.googleapis.com https://identitytoolkit.googleapis.com " +
        "wss://*.firebaseio.com https://cdn.jsdelivr.net https://n8n-service.garapin.cloud " +
        "https://registry.hub.docker.com https://cdn.tiny.cloud; " +
        "frame-src 'self' https://console.garapin.cloud https://*.firebaseio.com " +
        "https://*.firebaseapp.com https://*.firebase.com https://accounts.google.com " +
        "https://*.xendit.co https://checkout.xendit.co https://checkout-staging.xendit.co; " +
        "object-src 'none';"
    );

    // Set cache control for images
    if (req.url.match(/\.(jpg|jpeg|png|gif|ico)$/)) {
        res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 hours
    }

    // Set permissive CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    // Set Cross-Origin-Opener-Policy to unsafe-none
    res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
    
    next();
});

// Handle OPTIONS requests for CORS
app.options('*', (req, res) => {
    res.status(200).end();
});

// Initialize Firebase Admin SDK
admin.initializeApp({
    credential: admin.credential.cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    }),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
});

// Add this function after the Firebase Admin initialization
async function uploadProfilePictureToStorage(photoURL, uid) {
    if (!photoURL || !photoURL.startsWith('https')) return null;
    
    try {
        // Fetch the image from Google
        const response = await fetch(photoURL);
        if (!response.ok) throw new Error('Failed to fetch profile picture');
        
        const buffer = await response.buffer();
        
        // Upload to Firebase Storage
        const bucket = admin.storage().bucket();
        const filename = `profile-pictures/${uid}.jpg`;
        const file = bucket.file(filename);
        
        await file.save(buffer, {
            metadata: {
                contentType: 'image/jpeg'
            }
        });
        
        // Get a long-lived URL
        const [url] = await file.getSignedUrl({
            action: 'read',
            expires: '03-01-2500' // Long-lived URL
        });
        
        return url;
    } catch (error) {
        console.error('Error uploading profile picture:', error);
        return photoURL; // Fallback to original URL if upload fails
    }
}

// MongoDB Connection
const connectDB = async () => {
    try {
        console.log('Connecting to MongoDB:', `mongodb://${process.env.MONGODB_USER ? '****:****@' : ''}${process.env.MONGODB_HOST}:${process.env.MONGODB_PORT}/${process.env.MONGODB_DATABASE}?authSource=admin&directConnection=true`);
        const options = {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        };

        await mongoose.connect(process.env.MONGODB_URI, options);
        console.log('MongoDB connected successfully');
        console.log('Connected to database:', mongoose.connection.name);

        // Set up event listeners for the MongoDB connection
        mongoose.connection.on('error', (err) => {
            console.error('MongoDB connection error:', err);
        });

        mongoose.connection.on('disconnected', () => {
            console.log('MongoDB disconnected. Attempting to reconnect...');
        });

        mongoose.connection.on('reconnected', () => {
            console.log('MongoDB reconnected successfully.');
        });

        // Connect to Raku database if URI is provided
        if (process.env.MONGODB_RAKU_URI) {
          // We'll use a separate connection for the Raku database
          const rakuMongoose = new mongoose.Mongoose();
          
          console.log('Connecting to Raku MongoDB:', process.env.MONGODB_RAKU_URI.replace(/mongodb:\/\/([^:]+):[^@]+@/, 'mongodb://****:****@'));
          
          await rakuMongoose.connect(process.env.MONGODB_RAKU_URI, options);
          console.log('Raku MongoDB connected successfully');
          console.log('Connected to Raku database:', rakuMongoose.connection.name);
          
          // More flexible schema for the receipts collection to handle variations in the data structure
          const receiptSchema = new rakuMongoose.Schema({
            status: { type: String, required: false },
            // Define more fields if needed, but make them optional
            _id: { type: mongoose.Schema.Types.ObjectId, required: false },
            receipt_id: { type: String, required: false },
            user_id: { type: String, required: false }, // Explicitly define user_id
            sentDate: { type: Date, required: false },  // Explicitly define sentDate
            created_at: { type: Date, required: false },
            updated_at: { type: Date, required: false }
          }, { 
            collection: 'receipt',
            // Allow for fields not defined in the schema
            strict: false 
          });
          
          // Create model
          global.RakuReceipt = rakuMongoose.model('Receipt', receiptSchema);
          
          // Create price_rece model
          const priceReceSchema = new rakuMongoose.Schema({
            receipt_id: { type: rakuMongoose.Schema.Types.ObjectId, required: true },
            cost: { type: Number, required: true },
            created_at: { type: Date, default: Date.now }
          }, { 
            collection: 'price_rece',
            strict: false 
          });
          
          global.RakuPriceRece = rakuMongoose.model('PriceRece', priceReceSchema);
          
          // Test query to check if we can access the data
          try {
            const collections = await rakuMongoose.connection.db.listCollections().toArray();
            console.log('Available collections in Raku database:', collections.map(c => c.name));
            
            // First, try to get all receipts to see what we have
            const allReceipts = await global.RakuReceipt.find({}).limit(5).lean();
            console.log('Sample receipts from database:', 
              allReceipts.length ? JSON.stringify(allReceipts.slice(0, 2)) : 'No receipts found');
              
            if (allReceipts.length > 0) {
              // Check what fields are available on receipt documents
              console.log('Receipt document fields:', Object.keys(allReceipts[0]));
              
              // Check if the status field exists and how many documents have it
              const statusCount = await global.RakuReceipt.countDocuments({ status: { $exists: true } });
              console.log(`Receipts with 'status' field: ${statusCount}`);
              
              // Check for different status values
              const sentCount = await global.RakuReceipt.countDocuments({ status: 'sent' });
              console.log(`Receipts with status 'sent': ${sentCount}`);
              
              const sentUpperCount = await global.RakuReceipt.countDocuments({ status: 'SENT' });
              console.log(`Receipts with status 'SENT': ${sentUpperCount}`);
              
              // Case-insensitive search
              const sentCaseInsensitive = await global.RakuReceipt.countDocuments({ 
                status: { $regex: new RegExp('^sent$', 'i') } 
              });
              console.log(`Receipts with status 'sent' (case-insensitive): ${sentCaseInsensitive}`);
              
              // Try looking for a different status field name
              const stateCount = await global.RakuReceipt.countDocuments({ state: { $exists: true } });
              console.log(`Receipts with 'state' field: ${stateCount}`);
              
              if (stateCount > 0) {
                const stateSentCount = await global.RakuReceipt.countDocuments({ state: 'sent' });
                console.log(`Receipts with state 'sent': ${stateSentCount}`);
              }
            }
          } catch (err) {
            console.error('Error testing Raku receipt access:', err);
          }
          
          // Set up event listeners for Raku MongoDB connection
          rakuMongoose.connection.on('error', (err) => {
            console.error('Raku MongoDB connection error:', err);
          });

          rakuMongoose.connection.on('disconnected', () => {
            console.log('Raku MongoDB disconnected');
          });
        } else {
          console.log('No Raku MongoDB URI provided, skipping connection');
        }
    } catch (err) {
        console.error('Failed to connect to MongoDB:', err);
        process.exit(1);
    }
};

// Initial connection
connectDB();

// Handle application shutdown
process.on('SIGINT', async () => {
    try {
        await mongoose.connection.close();
        console.log('MongoDB connection closed through app termination');
        process.exit(0);
    } catch (err) {
        console.error('Error closing MongoDB connection:', err);
        process.exit(1);
    }
});

// Firebase configuration
const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase client for frontend
const firebaseApp = initializeApp(firebaseConfig);

// Middleware
app.use(express.static('public'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.set('view engine', 'ejs');
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false
}));

// Add this after your session and passport middleware
app.use((req, res, next) => {
    res.locals.user = req.user || null;
    next();
});

// Modified checkAuth middleware to use session if available
const checkAuth = async (req, res, next) => {
    if (req.session && req.session.user) {
        req.user = req.session.user;
        res.locals.user = req.session.user;
        return next();
    }
    const token = req.headers.authorization?.split('Bearer ')[1] || req.query.token;
    if (!token) {
        res.locals.user = null;
        return next();
    }
    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        const userData = await User.findOne({ provider_uid: decodedToken.uid });
        if (userData) {
            req.user = userData;
            res.locals.user = userData; // Make user available to all views
        }
        next();
    } catch (error) {
        console.error('Auth check error:', error);
        res.locals.user = null;
        next();
    }
};

// Middleware to check Raku AI approval status and make it available to views
const checkRakuAIStatus = async (req, res, next) => {
    try {
        if (req.user) {
            // Find the profile using the user_id from verifyToken middleware
            const profile = await Profile.findOne({ user_id: req.user._id }).lean();
            
            // Check if Raku AI is approved
            const raku_ai_approved = 
                profile && 
                profile.raku_ai && 
                profile.raku_ai.status === 'Approved';
            
            // Make this available to all views
            res.locals.raku_ai_approved = raku_ai_approved;
        } else {
            res.locals.raku_ai_approved = false;
        }
        next();
    } catch (error) {
        console.error('Error checking Raku AI status:', error);
        res.locals.raku_ai_approved = false;
        next();
    }
};

// Middleware to check if Raku AI is approved for protected routes
const requireRakuAIApproval = async (req, res, next) => {
    try {
        const profile = await Profile.findOne({ user_id: req.user._id }).lean();
        const isApproved = profile && profile.raku_ai && profile.raku_ai.status === 'Approved';
        
        if (isApproved) {
            return next();
        } else {
            // Redirect to Raku AI page with error message as query parameter
            return res.redirect('/raku-ai?error=approval_required');
        }
    } catch (error) {
        console.error('Error checking Raku AI approval:', error);
        // Redirect with a generic error message
        return res.redirect('/raku-ai?error=server_error');
    }
};

// Apply middleware
app.use(checkAuth);
app.use(checkRakuAIStatus);

// Mount routes
const profileRoutes = require('./routes/profile');
const storeRouter = require('./routes/store');

// Mount receipt routes
app.use('/receipt', receiptRoutes);
app.use('/payments', paymentRoutes);

// Add a direct route for Xendit callback that's coming to /api/payment/callback
app.post('/api/payment/callback', async (req, res) => {
    console.log('Received webhook at /api/payment/callback, routing to payment handler');
    
    try {
        // Get the callback data from Xendit
        const callbackData = req.body;
        console.log('Xendit API Callback Data:', JSON.stringify(callbackData, null, 2));
        
        // Handle multiple Xendit callback formats
        let paymentId = null;
        let status = null;
        let amount = null;
        let externalId = null;
        
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
            externalId = callbackData.external_id; // Extract external_id for invoice payments
        }
        
        console.log(`API callback: Processing payment with ID: ${paymentId}, Status: ${status}, External ID: ${externalId}`);
        
        // Process the payment if we have a valid ID and successful status
        if ((status === 'COMPLETED' || status === 'SUCCEEDED' || status === 'PAID') && (paymentId || externalId)) {
            let billing = null;
            
            // Try to find by xendit_id first
            if (paymentId) {
                billing = await Billing.findOne({ xendit_id: paymentId });
            }
            
            // If not found and we have an external_id, try to find by external_id
            if (!billing && externalId) {
                billing = await Billing.findOne({ external_id: externalId });
                console.log(`Searching for billing with external_id: ${externalId}`);
            }
            
            // If still not found, try searching in xendit_hit.id
            if (!billing && paymentId) {
                billing = await Billing.findOne({ 'xendit_hit.id': paymentId });
            }
            
            // If still not found, log the issue
            if (!billing) {
                console.log(`Billing record not found for payment ${paymentId || ''} / external_id ${externalId || ''}. Checking all payment records...`);
                
                // Log recent billing records for debugging
                const recentBillings = await Billing.find().sort({ created_at: -1 }).limit(5);
                console.log('Recent billing records:', recentBillings.map(b => ({ 
                    id: b._id, 
                    xendit_id: b.xendit_id, 
                    xendit_hit_id: b.xendit_hit?.id,
                    external_id: b.external_id,
                    status: b.status
                })));
                
                return res.status(200).json({ 
                    success: false, 
                    message: 'Billing record not found' 
                });
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
                console.log(`Payment ${paymentId || externalId} already processed. Skipping.`);
            }
        } else {
            console.log(`Invalid or incomplete callback data. Status: ${status}, Payment ID: ${paymentId}, External ID: ${externalId}`);
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

// Mount profile routes - ensure this comes before the profile redirect middleware
app.use('/profile', profileRoutes);

// Updated redirect middleware: Only act on GET requests for a logged-in user missing a profile
app.use(async (req, res, next) => {
    if (req.method === 'GET' && req.user && !req.user.profile &&
        !req.path.startsWith('/profile') &&
        !req.path.startsWith('/auth') &&
        !req.path.startsWith('/api')) {
        
        console.log('Profile middleware check for user:', req.user._id, 'Provider UID:', req.user.provider_uid);
        
        try {
            // Check if the profile actually exists in the database
            const profileExists = await Profile.findOne({ provider_uid: req.user.provider_uid });
            
            if (profileExists) {
                console.log('Profile exists in database but not linked to user. Fixing and continuing...');
                // Update the user record to link to this profile
                await User.findByIdAndUpdate(req.user._id, { profile: profileExists._id });
                // Continue to the requested page
                return next();
            }
            
            // No profile found, redirect to profile page
            if (req.xhr) {
                console.log('XHR GET request: User profile missing; sending JSON error');
                return res.status(403).json({ error: 'User profile required. Please create your profile.' });
            } else {
                console.log('Full-page GET request: Redirecting to /profile');
                return res.redirect('/profile');
            }
        } catch (error) {
            console.error('Error checking profile:', error);
            // In case of error, continue to avoid blocking the user
            return next();
        }
    }
    next();
});

// Routes
app.get('/', (req, res) => {
    res.render('login', { firebaseConfig });
});

// Generate a random namespace (8 chars, starts with letter, alphanumeric)
function generateNamespace() {
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const alphanumeric = 'abcdefghijklmnopqrstuvwxyz0123456789';
    
    // First character must be a letter
    let namespace = letters.charAt(Math.floor(Math.random() * letters.length));
    
    // Generate remaining 7 characters (can be letters or numbers)
    for (let i = 0; i < 7; i++) {
        namespace += alphanumeric.charAt(Math.floor(Math.random() * alphanumeric.length));
    }
    
    return namespace;
}

// Function to generate unique namespace
async function generateUniqueNamespace() {
    let namespace;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 10;

    while (!isUnique && attempts < maxAttempts) {
        namespace = generateNamespace();
        // Check if namespace exists
        const existingUser = await User.findOne({ namespace });
        if (!existingUser) {
            isUnique = true;
        }
        attempts++;
    }

    if (!isUnique) {
        throw new Error('Could not generate unique namespace after maximum attempts');
    }

    return namespace;
}

// Function to create namespace via API
async function createNamespaceViaAPI(namespace) {
    try {
        // Check if required environment variables are set
        if (!process.env.CREATE_NAMESPACE_API_URL || !process.env.DEPLOYMENT_API_USER || !process.env.DEPLOYMENT_API_KEY) {
            console.error('Missing required environment variables for namespace creation');
            throw new Error('Namespace creation configuration missing');
        }

        const response = await fetch(process.env.CREATE_NAMESPACE_API_URL, {
            method: 'POST',
            headers: {
                [process.env.DEPLOYMENT_API_USER]: process.env.DEPLOYMENT_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                client_namespace: namespace
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Namespace creation failed:', {
                status: response.status,
                statusText: response.statusText,
                error: errorText
            });
            throw new Error(`Failed to create namespace: ${response.statusText}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error creating namespace:', error);
        throw error;
    }
}

// Add at the top of the file with other requires
const lockMap = new Map();

// Add this function before the route handlers
async function withLock(key, callback) {
    if (lockMap.get(key)) {
        console.log('Operation in progress for key:', key);
        return;
    }
    
    try {
        lockMap.set(key, true);
        await callback();
    } finally {
        lockMap.delete(key);
    }
}

app.post('/auth/user', verifyToken, async (req, res) => {
    try {
        const { name, email, provider_uid, photoURL } = req.body;
        console.log('Received auth data:', { name, email, provider_uid, photoURL });

        // Use the lock to prevent duplicate operations
        await withLock(provider_uid, async () => {
            // First check if user exists by provider_uid
            let user = await User.findOne({ provider_uid });
            let namespaceCreated = false;

            if (!user) {
                console.log('Creating new user...');
                
                // Generate namespace only if needed
                const namespace = await generateUniqueNamespace();
                
                // Check if namespace already exists
                const existingNamespace = await User.findOne({ namespace });
                if (!existingNamespace) {
                    try {
                        await createNamespaceViaAPI(namespace);
                        namespaceCreated = true;
                        console.log('Created namespace:', namespace);
                    } catch (error) {
                        console.error('Failed to create namespace:', error);
                    }
                }

                // Create new user with all fields
                user = await User.create({
                    name: name || email.split('@')[0],
                    email,
                    provider: 'google',
                    provider_uid,
                    photoURL,
                    namespace,
                    created_at: new Date(),
                    updated_at: new Date(),
                    last_login_at: new Date()
                });
                console.log('Created new user:', { id: user._id, email: user.email, name: user.name });
                
                // Fetch and copy price data from global_price collection
                try {
                    console.log('Fetching global price data for new user...');
                    const globalPrice = await GlobalPrice.findOne({ price_object: "raku" });
                    
                    if (globalPrice && globalPrice.price) {
                        console.log('Found global price data:', globalPrice.price);
                        
                        // Update user with price data
                        await User.findByIdAndUpdate(user._id, {
                            price: {
                                marp: globalPrice.price.marp,
                                ordr: globalPrice.price.ordr,
                                pros: globalPrice.price.pros,
                                rece: globalPrice.price.rece
                            }
                        });
                        
                        console.log('Copied price data to user:', user._id);
                    } else {
                        console.log('No global price data found with price_object = "raku"');
                    }
                } catch (priceError) {
                    console.error('Error copying price data to user:', priceError);
                }
            } else {
                // Update existing user with all fields
                const updates = {
                    email,
                    last_login_at: new Date(),
                    updated_at: new Date()
                };

                // Only update name and photo if provided
                if (name) updates.name = name;
                if (photoURL) updates.photoURL = photoURL;

                user = await User.findOneAndUpdate(
                    { provider_uid },
                    { $set: updates },
                    { new: true }
                );
                console.log('Updated user:', { id: user._id, email: user.email, name: user.name });
            }

            // Store the authenticated user in the session
            req.session.user = user;

            // Return complete user object
            res.json({ 
                success: true, 
                user: {
                    _id: user._id,
                    name: user.name,
                    email: user.email,
                    photoURL: user.photoURL,
                    provider: user.provider,
                    provider_uid: user.provider_uid,
                    namespace: user.namespace,
                    last_login_at: user.last_login_at,
                    created_at: user.created_at,
                    updated_at: user.updated_at
                },
                namespaceCreated
            });
        });
    } catch (error) {
        console.error('User update error:', error);
        res.status(500).json({ error: 'Failed to update user', details: error.message });
    }
});

app.get('/dashboard', async (req, res) => {
    res.render('dashboard', { 
        firebaseConfig,
        user: req.user,
        pageTitle: 'Dashboard',
        currentPage: 'dashboard'
    });
});

app.get('/raku-ai', async (req, res) => {
    res.render('raku-ai', { 
        firebaseConfig,
        user: req.user,
        pageTitle: 'Raku AI',
        currentPage: 'raku-ai',
        query: req.query
    });
});

app.get('/raku-ai/receipt', checkAuth, async (req, res) => {
    try {
        // If we get here, the user is authenticated via checkAuth middleware
        // This is more user-friendly than verifyToken middleware for browser requests
        
        // Check if user has an approved Raku AI profile
        const profile = await Profile.findOne({ user_id: req.user._id });
        
        // Check if Raku AI is approved
        const isApproved = profile && profile.raku_ai && profile.raku_ai.status === 'Approved';
        
        // Render the page with approval status
    res.render('receipt', { 
        firebaseConfig,
        user: req.user,
        pageTitle: 'Receipt',
            currentPage: 'raku-ai-receipt',
            raku_ai_approved: isApproved
        });
    } catch (error) {
        console.error('Error accessing receipt page:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Tambah Saldo page
app.get('/raku-ai/tambah-saldo', checkAuth, requireRakuAIApproval, async (req, res) => {
    try {
        res.render('tambah-saldo', { 
            firebaseConfig, 
            user: req.session.user,
            pageTitle: 'Tambah Saldo',
            currentPage: 'raku-ai',
            baseUrl: process.env.BASE_URL || 'http://localhost:3000'
        });
    } catch (error) {
        console.error('Error rendering tambah-saldo page:', error);
        res.status(500).send('Internal Server Error');
    }
});

// Payment history page
app.get('/raku-ai/history', checkAuth, requireRakuAIApproval, async (req, res) => {
    res.render('payment-history', { 
        firebaseConfig,
        user: req.user,
        pageTitle: 'Payment History',
        currentPage: 'raku-ai'
    });
});

app.get('/store', async (req, res) => {
    try {
        const applications = await Application.find({ status: 'Published' })
            .sort({ created_at: -1 });
        
        res.render('store', { 
            firebaseConfig,
            applications,
            user: req.user,
            pageTitle: 'Store',
            currentPage: 'store'
        });
    } catch (error) {
        console.error('Error fetching applications:', error);
        res.status(500).send('Error loading store');
    }
});

// Base Images Route
app.get('/base-images', async (req, res) => {
    try {
        // Get token from header
        const token = req.headers.authorization?.split('Bearer ')[1];
        let userData = null;

        if (token) {
            try {
                const decodedToken = await admin.auth().verifyIdToken(token);
                userData = await User.findOne({ provider_uid: decodedToken.uid });
                console.log('Found user data:', userData);
            } catch (error) {
                console.error('Error verifying token:', error);
            }
        }

        console.log('Fetching base images...');
        const baseImages = await BaseImage.find()
            .sort({ base_image: 1 }); // 1 for ascending order

        console.log('Current user in route:', {
            id: userData?._id,
            provider_uid: userData?.provider_uid,
            email: userData?.email
        });

        res.render('base-images', {
            firebaseConfig,
            baseImages,
            user: userData,
            pageTitle: 'Base Images',
            currentPage: 'base-images',
            createBaseImageAIURL: process.env.CREATE_BASE_IMAGE_AI_URL
        });
    } catch (error) {
        console.error('Error loading base images:', error);
        res.status(500).send('Error loading base images');
    }
});

// Docker Hub Validation Endpoint
app.get('/api/docker-hub/validate/:image/:tag', baseImageController.validateDockerImage);
app.get('/api/docker-hub/search', baseImageController.searchDockerHub);

app.get('/api/categories', categoryController.getAllCategories);
app.post('/api/categories', categoryController.createCategory);
app.put('/api/categories/:id', categoryController.updateCategory);
app.delete('/api/categories/:id', categoryController.deleteCategory);

// Application publish endpoint
app.post('/api/applications/publish', verifyToken, upload.fields([
    { name: 'icon', maxCount: 1 },
    { name: 'screenshots', maxCount: 5 },
    { name: 'appFile', maxCount: 1 }
]), async (req, res) => {
    try {
        console.log('Received publish request:', {
            body: req.body,
            files: req.files,
            user: req.user
        });

        const { title, description, support_detail, price, category } = req.body;
        const status = req.body.status || 'pending';
        
        // Create URL-friendly slug from title
        const slug = title.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');

        console.log('Creating application with data:', {
            title, description, support_detail, price, category, status, slug
        });

        // Validate category exists
        const categoryExists = await Category.findById(category);
        if (!categoryExists) {
            return res.status(400).json({ error: 'Invalid category' });
        }

        // Create new application
        const application = new Application({
            title,
            slug,
            description,
            support_detail,
            price: Number(price),
            category: category, // This is now a valid ObjectId
            status,
            publisher: req.user._id,
            user_id: req.user.provider_uid
        });

        const bucket = admin.storage().bucket();
        console.log('Got storage bucket:', bucket.name);

        // Handle icon upload
        if (req.files.icon) {
            console.log('Processing icon upload');
            const iconFile = req.files.icon[0];
            const iconPath = `applications/${application._id}/icon/${iconFile.originalname}`;
            const iconBuffer = iconFile.buffer;
            
            const iconFileUpload = bucket.file(iconPath);
            await iconFileUpload.save(iconBuffer);
            const [iconUrl] = await iconFileUpload.getSignedUrl({
                action: 'read',
                expires: '03-01-2500'
            });

            application.logo = {
                url: iconUrl,
                name: iconFile.originalname
            };
            console.log('Icon uploaded successfully:', iconUrl);
        }

        // Handle screenshots upload
        if (req.files.screenshots) {
            console.log('Processing screenshots upload');
            const screenshotPromises = req.files.screenshots.map(async (file, index) => {
                const screenshotPath = `applications/${application._id}/screenshots/${file.originalname}`;
                const screenshotBuffer = file.buffer;
                
                const screenshotFileUpload = bucket.file(screenshotPath);
                await screenshotFileUpload.save(screenshotBuffer);
                const [screenshotUrl] = await screenshotFileUpload.getSignedUrl({
                    action: 'read',
                    expires: '03-01-2500'
                });

                return {
                    url: screenshotUrl,
                    name: file.originalname,
                    isCover: index === 0,
                    bucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
                    size: file.size,
                    full_path: screenshotPath
                };
            });

            application.screenshoots = await Promise.all(screenshotPromises);
            console.log('Screenshots uploaded successfully:', application.screenshoots);
        }

        // Handle app file upload
        if (req.files.appFile) {
            console.log('Processing app file upload');
            const appFile = req.files.appFile[0];
            const appFilePath = `applications/${application._id}/app/${appFile.originalname}`;
            const appBuffer = appFile.buffer;
            
            const appFileUpload = bucket.file(appFilePath);
            await appFileUpload.save(appBuffer);
            const [appUrl] = await appFileUpload.getSignedUrl({
                action: 'read',
                expires: '03-01-2500'
            });

            application.source = appUrl;
            console.log('App file uploaded successfully:', appUrl);
        }

        console.log('Saving application to database');
        await application.save();
        console.log('Application saved successfully');
        res.status(201).json(application);
    } catch (error) {
        console.error('Error publishing application:', {
            error: error.message,
            stack: error.stack,
            name: error.name
        });
        res.status(500).json({ 
            error: error.message || 'Failed to publish application',
            details: error.stack
        });
    }
});

// Published Apps Route (must come before the :id route)
app.get('/my-apps/list', async (req, res) => {
    try {
        // Check if user is authenticated through Firebase
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.render('published-apps', { 
                firebaseConfig,
                applications: [],
                user: null,
                pageTitle: 'Published Apps',
                currentPage: 'publish-apps'
            });
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(token);

        // Find all applications by this user (both published and unpublished)
        const applications = await Application.find({ 
            user_id: decodedToken.uid
        }).sort({ created_at: -1 });

        res.render('published-apps', { 
            firebaseConfig,
            applications,
            user: req.user,
            pageTitle: 'Published Apps',
            currentPage: 'publish-apps'
        });
    } catch (error) {
        console.error('Error fetching my apps:', error);
        res.status(500).send('Error loading my applications');
    }
});

// Make sure this route comes after the /my-apps/list route
app.get(['/publish', '/publish/:id'], async (req, res) => {
    try {
        // Check if this is an edit request (has ID) or new publish
        const isEdit = req.params.id ? true : false;
        let application = null;

        if (isEdit) {
            application = await Application.findOne({ _id: req.params.id }).populate('base_image main_base_image');
            if (!application) {
                return res.status(404).send('Application not found');
            }
        }

        // Fetch all available base images
        const baseImages = await BaseImage.find().sort({ base_image: 1, version: -1 });

        res.render('publish', {
            firebaseConfig,
            application, // Will be null for new publish
            baseImages, // Pass base images to the template
            isEdit,     // Flag to indicate if this is an edit
            user: req.user,
            pageTitle: isEdit ? 'Edit Application' : 'Publish Application',
            currentPage: 'publish'
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send('Error loading page');
    }
});

// Add route for installed apps
app.get('/my-apps/installed', async (req, res) => {
    try {
        // Helper function for cleaning description
        const cleanAndTruncateDescription = (description) => {
            if (!description) return 'No description available';
            
            const cleanDesc = description
                .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
                .replace(/<(?!\/?(b|strong|i|em|mark|small|del|ins|sub|sup)(?=>|\s.*>))\/?(?:.|\s)*?>/g, '');

            if (cleanDesc.length <= 100) return cleanDesc;

            // Find the last space within the 100 character limit
            const truncated = cleanDesc.substr(0, 100);
            const lastSpace = truncated.lastIndexOf(' ');
            
            // If no space found, just cut at 100
            const breakPoint = lastSpace > 0 ? lastSpace : 100;
            
            return cleanDesc.substr(0, breakPoint) + '...';
        };

        // Get token from header
        const authHeader = req.headers.authorization;

        // Get user ID from Firebase token in cookie or header
        let userId;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split('Bearer ')[1];
            const decodedToken = await admin.auth().verifyIdToken(token);
            userId = decodedToken.uid;
        }

        if (!userId) {
            return res.render('installed-apps', { 
                firebaseConfig,
                applications: [],
                user: null,
                pageTitle: 'Installed Apps',
                currentPage: 'installed-apps',
                cleanAndTruncateDescription
            });
        }

        // Get installed apps with populated application data
        const installedApps = await InstalledApp.find({ 
            user_id: userId
        }).populate({
            path: 'application_id',
            model: 'Application'
        }).sort({ installed_at: -1 });

        // Get user data
        const user = await User.findOne({ provider_uid: userId });

        res.render('installed-apps', {
            firebaseConfig,
            applications: installedApps,
            user: user,
            pageTitle: 'Installed Apps',
            currentPage: 'installed-apps',
            cleanAndTruncateDescription
        });

    } catch (error) {
        res.status(500).send('Error loading installed apps');
    }
});

// API Routes for My Apps
app.put('/api/my-apps/:id', verifyToken, upload.fields([
    { name: 'icon', maxCount: 1 },
    { name: 'screenshots', maxCount: 5 }
]), async (req, res) => {

    try {
        const sanitizedId = req.params.id.replace(/"/g, '');
        let updateData = {};

        // Prepare basic fields
        const basicFields = ['description', 'support_detail', 'price', 'status', 'category'];
        basicFields.forEach(field => {
            if (req.body[field]) {
                updateData[field] = req.body[field];
            }
        });

        // Handle base_image and main_base_image
        if (req.body.base_image) {
            try {
                const baseImages = Array.isArray(req.body.base_image) 
                    ? req.body.base_image 
                    : JSON.parse(req.body.base_image);
                
                console.log('Parsed base_image data:', baseImages);
                updateData.base_image = baseImages.map(id => new mongoose.Types.ObjectId(id));
                console.log('Updated base_image:', updateData.base_image);
            } catch (error) {
                console.error('Error parsing base_image:', error);
                console.error('base_image value was:', req.body.base_image);
                return res.status(400).json({ error: 'Invalid base_image format' });
            }
        }

        if (req.body.main_base_image) {
            try {
                updateData.main_base_image = new mongoose.Types.ObjectId(req.body.main_base_image);
                console.log('Updated main_base_image:', updateData.main_base_image);
            } catch (error) {
                console.error('Error parsing main_base_image:', error);
                return res.status(400).json({ error: 'Invalid main_base_image format' });
            }
        }

        // Handle file uploads if any
        if (req.files) {
            const bucket = admin.storage().bucket();

            // Handle logo upload
            if (req.files.icon) {
                const iconFile = req.files.icon[0];
                const iconPath = `applications/${sanitizedId}/icon/${iconFile.originalname}`;
                const iconBuffer = iconFile.buffer;
                
                const iconFileUpload = bucket.file(iconPath);
                await iconFileUpload.save(iconBuffer);
                const [iconUrl] = await iconFileUpload.getSignedUrl({
                    action: 'read',
                    expires: '03-01-2500'
                });

                updateData.logo = {
                    url: iconUrl,
                    name: iconFile.originalname
                };
            }

            // Handle screenshots upload
            if (req.files.screenshots) {
                const screenshotPromises = req.files.screenshots.map(async (file) => {
                    const screenshotPath = `applications/${sanitizedId}/screenshots/${file.originalname}`;
                    const screenshotBuffer = file.buffer;
                    
                    const screenshotFileUpload = bucket.file(screenshotPath);
                    await screenshotFileUpload.save(screenshotBuffer);
                    const [screenshotUrl] = await screenshotFileUpload.getSignedUrl({
                        action: 'read',
                        expires: '03-01-2500'
                    });

                    return {
                        url: screenshotUrl,
                        name: file.originalname,
                        bucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
                        size: file.size,
                        full_path: screenshotPath,
                        isCover: false
                    };
                });

                const newScreenshots = await Promise.all(screenshotPromises);
                const existingCount = parseInt(req.body.existingScreenshotsCount) || 0;
                
                // Get existing application to merge screenshots
                const currentApp = await Application.findById(sanitizedId);
                if (existingCount === 0) {
                    updateData.screenshoots = newScreenshots;
                    if (newScreenshots.length > 0) {
                        updateData.screenshoots[0].isCover = true;
                    }
                } else if (currentApp && currentApp.screenshoots) {
                    updateData.screenshoots = [
                        ...currentApp.screenshoots.slice(0, existingCount),
                        ...newScreenshots
                    ];
                }
            }
        }

        // Update the application using findOneAndUpdate
        const updatedApplication = await Application.findOneAndUpdate(
            {
                _id: sanitizedId,
                user_id: req.user.provider_uid
            },
            { 
                $set: updateData,
                $currentDate: { updated_at: true }
            },
            { 
                new: true,
                runValidators: true
            }
        );

        if (!updatedApplication) {
            return res.status(404).json({ error: 'Application not found' });
        }

        console.log('Application updated successfully:', updatedApplication);
        res.json({ message: 'Application updated successfully' });
    } catch (error) {
        console.error('Error updating application:', error);
        res.status(500).json({ error: 'Error updating application' });
    }
});

app.delete('/api/my-apps/:id/screenshots/:index', verifyToken, async (req, res) => {
    try {
        const application = await Application.findOne({
            _id: req.params.id,
            user_id: req.user.provider_uid
        });

        if (!application) {
            return res.status(404).json({ error: 'Application not found' });
        }

        const index = parseInt(req.params.index);
        if (application.screenshoots && application.screenshoots[index]) {
            // Remove the screenshot from storage if needed
            // Your storage deletion logic here

            // Remove from array
            application.screenshoots.splice(index, 1);
            await application.save();
            res.json({ message: 'Screenshot deleted successfully' });
        } else {
            res.status(404).json({ error: 'Screenshot not found' });
        }
    } catch (error) {
        console.error('Error deleting screenshot:', error);
        res.status(500).json({ error: 'Error deleting screenshot' });
    }
});

app.get('/store/app/:id', async (req, res) => {
    try {
        const application = await Application.findById(req.params.id)
            .populate({
                path: 'category',
                model: 'Category',
                select: 'category_name'
            })
            .lean();

        if (!application) {
            return res.status(404).send('Application not found');
        }

        // Get user information with status
        const userData = await User.findOne({ 
            provider_uid: application.user_id 
        }).select('name status').lean();

        application.userName = userData ? userData.name : 'Unknown User';
        application.userStatus = userData ? userData.status : null;

        console.log('Populated application:', application); // For debugging

        res.render('application-detail', {
            firebaseConfig,
            application,
            user: req.user,
            pageTitle: 'Application Details'
        });
    } catch (error) {
        console.error('Error fetching application:', error);
        res.status(500).send('Error loading application details');
    }
});

app.post('/api/applications/install', verifyToken, async (req, res) => {
    try {
        const { applicationId } = req.body;
        const userId = req.user.provider_uid;
        console.log('\n=== Installing Application ===');
        console.log('Request:', { applicationId, userId });

        // Input validation
        if (!applicationId || !userId) {
            console.log('Missing required fields');
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        // Verify the application exists
        const application = await Application.findById(applicationId);
        if (!application) {
            console.log('Application not found:', applicationId);
            return res.status(404).json({ 
                success: false, 
                message: 'Application not found' 
            });
        }
        console.log('Found application:', { id: application._id, title: application.title });

        // Check if user has already installed this application
        const existingInstallation = await InstalledApp.findOne({
            application_id: application._id,
            user_id: userId,
            status: { $in: ['init', 'pending', 'completed', 'done'] }
        });

        if (existingInstallation) {
            return res.status(400).json({
                success: false,
                message: 'Application is already installed or installation is in progress'
            });
        }

        // Create new installation record with initial status
        const installation = new InstalledApp({
            application_id: application._id,
            user_id: userId,
            status: 'init',
            installed_at: new Date(),
            deployment_details: null,
            deployment_response: null
        });

        // Save the initial installation record
        const savedInstallation = await installation.save();
        console.log('\nInitial installation record saved:', savedInstallation.toObject());

        // Start the deployment process asynchronously
        try {
            // Prepare deployment data
            const deploymentData = {
                namespace: req.user.namespace,
                application_id: application._id.toString(),
                installation_id: savedInstallation._id.toString()
            };

            // Call deployment API
            const deploymentResponse = await fetch(process.env.DEPLOYMENT_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    [process.env.DEPLOYMENT_API_USER]: process.env.DEPLOYMENT_API_KEY
                },
                body: JSON.stringify(deploymentData)
            });

            if (!deploymentResponse.ok) {
                throw new Error(`Deployment API responded with status: ${deploymentResponse.status}`);
            }

            const deploymentResult = await deploymentResponse.json();

            // Update installation with deployment details
            savedInstallation.status = 'pending';
            savedInstallation.deployment_details = deploymentResult;
            await savedInstallation.save();

            console.log('\nDeployment initiated successfully:', {
                installation_id: savedInstallation._id,
                status: savedInstallation.status
            });

        } catch (deployError) {
            console.error('Deployment error:', deployError);
            
            // Update installation status to failed
            savedInstallation.status = 'failed';
            savedInstallation.deployment_response = {
                error: deployError.message,
                timestamp: new Date()
            };
            await savedInstallation.save();

            return res.status(500).json({
                success: false,
                message: 'Failed to deploy application',
                error: deployError.message
            });
        }

        // Update the installed_count for this application
        await Application.findByIdAndUpdate(
            applicationId,
            { $inc: { installed_count: 1 } }
        );

        // Return success response with installation details
        res.json({ 
            success: true, 
            message: 'Application installation initiated successfully',
            installation: {
                id: savedInstallation._id,
                status: savedInstallation.status,
                installed_at: savedInstallation.installed_at
            }
        });

    } catch (error) {
        console.error('Installation error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to install application',
            error: error.message
        });
    }
});

// Application status endpoint
app.get('/api/applications/status/:installedId', async (req, res) => {
    try {
        // Get token from header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No valid auth token provided' });
        }

        // Verify token and get user ID
        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(token);
        const userId = decodedToken.uid;

        // Find the installed app
        const installedApp = await InstalledApp.findOne({
            _id: req.params.installedId,
            user_id: userId
        });

        if (!installedApp) {
            return res.status(404).json({ error: 'Installed application not found' });
        }

        // Format the installed_at date
        const formattedDate = new Date(installedApp.installed_at).toLocaleString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).replace(/\//g, '-').replace(',', '').replace(' ', '-');

        // Return status and deployment details
        res.json({
            status: installedApp.status,
            installed_at: formattedDate,
            deployment_details: installedApp.deployment_details
        });

    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch application status' });
    }
});

// Get base image by name
app.get('/api/base-images/:name', async (req, res) => {
    try {
        const baseImage = await BaseImage.findOne({ base_image: req.params.name });
        if (!baseImage) {
            return res.status(404).json({ error: 'Base image not found' });
        }
        res.json(baseImage);
    } catch (error) {
        console.error('Error fetching base image:', error);
        res.status(500).json({ error: 'Failed to fetch base image' });
    }
});

// Delete base image by ID
app.delete('/api/base-images/:id', baseImageController.deleteBaseImage);

// Applications backend routes (all application routes are handled here)
app.use('/api/applications', verifyToken, require('./controllers/backend/applications-backend'));

// Add Raku AI application info endpoint
app.get('/api/raku-ai/application-info', verifyToken, async (req, res) => {
    try {
        console.log('Fetching Raku AI application info for user:', req.user._id);
        
        // Find the profile using the imported Profile model
        const profile = await Profile.findOne({ 
            user_id: req.user._id 
        }).lean();
        
        console.log('Found profile:', profile ? 'Yes' : 'No');
        if (profile) {
            console.log('Raku AI data:', profile.raku_ai);
        }

        if (!profile || !profile.raku_ai) {
            console.log('No Raku AI profile found for user');
            return res.status(404).json({
                error: 'Raku AI profile not found',
                applicationName: '-',
                applicationType: '-',
                platform: '-',
                status: '-',
                receiptsSent: 0,
                cost: 0,
                dateRange: '-'
            });
        }

        // Get receipt count from Raku database if available
        let receiptCount = 0;
        if (global.RakuReceipt) {
            try {
                // Use _id for receipt count query to ensure consistency
                receiptCount = await global.RakuReceipt.countDocuments({ 
                    status: 'sent',
                    user_id: req.user._id.toString()
                });
                console.log(`Found ${receiptCount} receipts with status 'sent' for user ${req.user._id}`);
            } catch (err) {
                console.error('Error counting receipts from Raku database:', err);
            }
        } else {
            console.log('RakuReceipt model not available, using default count');
        }

        // Return formatted data from profile.raku_ai
        const response = {
            applicationName: profile.raku_ai.app_name || '-',
            applicationType: profile.raku_ai.business_type || '-',
            platform: profile.raku_ai.platform || '-',
            status: profile.raku_ai.status || '-',
            receiptsSent: receiptCount, // Use actual receipt count instead of placeholder
            cost: 100, // Placeholder for now
            dateRange: '1-Feb-2025 - 28-Feb-2025' // Placeholder for now
        };

        console.log('Sending response:', response);
        res.json(response);
    } catch (error) {
        console.error('Error fetching Raku AI application info:', error);
        res.status(500).json({
            error: 'Failed to fetch application info',
            details: error.message,
            applicationName: 'Error',
            applicationType: '-',
            platform: '-',
            status: 'Error',
            receiptsSent: 0,
            cost: 0,
            dateRange: '-'
        });
    }
});

// Add endpoint to get receipt count from Raku database
app.get('/api/raku-ai/receipt-count', verifyToken, requireRakuAIApproval, async (req, res) => {
    try {
        console.log('------------------------------');
        console.log('Fetching receipt count from Raku database');
        console.log('Date range params (raw):', req.query.start, 'to', req.query.end, 'timezone:', req.query.timezone);
        console.log('User ID:', req.user._id, 'Provider UID:', req.user.provider_uid);
        
        // Check if RakuReceipt is initialized and get collection name
        if (!global.RakuReceipt) {
            console.log('RakuReceipt model not available - MONGODB_RAKU_URI might not be set or connection failed');
            return res.json({ count: 0 });
        }
        
        const collectionName = global.RakuReceipt.collection.collectionName;
        console.log(`Using collection name: ${collectionName}`);
        
        // Now handle the actual request with EXACT DATE RANGES that work
        if (req.query.start && req.query.end) {
            console.log('\n*** PROCESSING REQUEST WITH VERIFIED DATE RANGES ***');
            console.log(`Request date range: ${req.query.start} to ${req.query.end} (timezone: ${req.query.timezone || 'not specified'})`);
            
            try {
                // Normalize the timezone parameter - handle various formats like "+07:00", " 07:00", "%2B07:00"
                let timezone = req.query.timezone || '';
                timezone = timezone.trim();
                
                // Check if this is a URL-encoded "+" sign (%2B)
                if (timezone.startsWith('%2B')) {
                    timezone = '+' + timezone.substring(3);
                } 
                // Add the + sign if it's missing but has the format "07:00"
                else if (timezone.match(/^\d{2}:\d{2}$/)) {
                    timezone = '+' + timezone;
                }
                
                console.log(`Normalized timezone parameter: "${timezone}"`);
                
                // Apply timezone adjustment for UTC+7 (check all common formats)
                if (timezone === '+07:00' || timezone === '+7:00' || timezone === '07:00') {
                    console.log('\n✅ Using UTC+7 timezone adjustment');
                
                    // Parse the dates from the query parameters (YYYY-MM-DD)
                    const startParts = req.query.start.split('-');
                    const endParts = req.query.end.split('-');
                    
                    // Format the dates as strings for output
                    const startDate = `${startParts[0]}-${startParts[1]}-${startParts[2]}`;
                    const endDate = `${endParts[0]}-${endParts[1]}-${endParts[2]}`;
                    
                    console.log('\nUsing VERIFIED WORKING queries for date ranges:');
                    console.log(`Local date range (Indonesia UTC+7): ${startDate} to ${endDate}`);
                    
                    // IMPLEMENTATION LOGIC - Direct from working test queries
                    
                    // Calculate the correct UTC date ranges based on the selected dates
                    const getUtcRangeForDate = (dateStr) => {
                        const [year, month, day] = dateStr.split('-').map(part => parseInt(part, 10));
                        
                        // Start is previous day at 17:00 UTC (which is current day 00:00 in UTC+7)
                        const startUtc = new Date(Date.UTC(year, month - 1, day - 1, 17, 0, 0, 0));
                        
                        // End is current day at 16:59:59.999 UTC (which is current day 23:59:59.999 in UTC+7)
                        const endUtc = new Date(Date.UTC(year, month - 1, day, 16, 59, 59, 999));
                        
                        return {
                            start: startUtc,
                            end: endUtc
                        };
                    };
                    
                    // Get UTC ranges for start and end dates
                    const startRange = getUtcRangeForDate(startDate);
                    const endRange = getUtcRangeForDate(endDate);
                    
                    // Create the query with the verified working UTC range
                    const query = {
                        sentDate: {
                            $gte: startRange.start,
                            $lte: endRange.end
                        },
                        // Use the MongoDB _id from the users collection instead of provider_uid
                        user_id: req.user._id.toString(),
                        // Filter by status "sent"
                        status: "sent"
                    };
                    
                    console.log('\nExecuting query:');
                    console.log(`db.${collectionName}.countDocuments({`);
                    console.log(`  sentDate: {`);
                    console.log(`    $gte: ISODate("${startRange.start.toISOString()}"), // ${startDate} 00:00:00 UTC+7`);
                    console.log(`    $lte: ISODate("${endRange.end.toISOString()}")  // ${endDate} 23:59:59 UTC+7`);
                    console.log(`  },`);
                    console.log(`  user_id: "${req.user._id.toString()}", // Filter by authenticated user MongoDB _id`);
                    console.log(`  status: "sent" // Filter by status "sent"`);
                    console.log(`});`);
                    
                    // EXAMPLES - for reference
                    if (startDate === '2025-03-03' && endDate === '2025-03-03') {
                        console.log('\n✅ March 3rd example query:');
                        console.log('This query should find 14 receipts for March 3rd in Indonesia time');
                    } else if (startDate === '2025-03-04' && endDate === '2025-03-04') {
                        console.log('\n✅ March 4th example query:');
                        console.log('This query should find 1 receipt for March 4th in Indonesia time');
                    } else if (startDate === '2025-03-03' && endDate === '2025-03-04') {
                        console.log('\n✅ March 3rd-4th range query:');
                        console.log('This query should find all 15 receipts for March 3rd-4th in Indonesia time');
                    }
                    
                    // Execute the query using the native MongoDB collection
                    const nativeCollection = global.RakuReceipt.collection;
                    const count = await nativeCollection.countDocuments(query);
                    console.log(`\nFound ${count} receipt(s) with verified date range`);
                    return res.json({ count });
                    
                } else {
                    console.log('\n⚠️ Using default UTC mode (No timezone adjustment)');
                    
                    // Default behavior (UTC) - set start to beginning of day, end to end of day
                    const startDate = new Date(req.query.start);
                    startDate.setUTCHours(0, 0, 0, 0);
                    
                    const endDate = new Date(req.query.end);
                    endDate.setUTCHours(23, 59, 59, 999);
                    
                    // Query all receipts in the date range without status conditions
                    const query = {
                        sentDate: {
                            $gte: startDate,
                            $lte: endDate
                        },
                        // Use the MongoDB _id from the users collection instead of provider_uid
                        user_id: req.user._id.toString(),
                        // Filter by status "sent"
                        status: "sent"
                    };
                    
                    const count = await global.RakuReceipt.countDocuments(query);
                    console.log(`Found ${count} receipts in date range (UTC) for user MongoDB _id: ${req.user._id}`);
                    return res.json({ count });
                }
            } catch (err) {
                console.error('Error processing date range:', err);
                return res.status(500).json({ 
                    error: 'Failed to process date range', 
                    details: err.message,
                    count: 0 
                });
            }
        } else {
            // If no date range, count all receipts for this user
            // Use the MongoDB _id from the users collection instead of provider_uid
            const query = {
                user_id: req.user._id.toString(),
                status: "sent"
            };
            const count = await global.RakuReceipt.countDocuments(query);
            console.log(`No date range provided. Total receipts with status "sent" for user MongoDB _id ${req.user._id}: ${count}`);
            return res.json({ count });
        }
    } catch (error) {
        console.error('Error fetching receipt count:', error);
        res.status(500).json({ 
            error: 'Failed to fetch receipt count', 
            details: error.message,
            count: 0 
        });
    }
});

// Add endpoint to get receipt application info
app.get('/api/receipt/application-info', verifyToken, requireRakuAIApproval, async (req, res) => {
    try {
        console.log('Fetching receipt application info for user:', req.user._id);
        
        // Find the profile using the imported Profile model
        const profile = await Profile.findOne({ 
            user_id: req.user._id 
        }).lean();
        
        console.log('Found profile:', profile ? 'Yes' : 'No');
        if (profile) {
            console.log('Raku AI data:', profile.raku_ai);
        }

        if (!profile || !profile.raku_ai) {
            console.log('No Raku AI profile found for user');
            return res.status(404).json({
                error: 'Raku AI profile not found',
                appName: '-',
                appType: '-',
                platform: '-',
                status: '-'
            });
        }

        // Return the application info
        res.json({
            appName: profile.raku_ai.app_name || '-',
            appType: profile.raku_ai.application_type || '-',
            platform: profile.raku_ai.platform || '-',
            status: profile.raku_ai.status || '-'
        });
    } catch (error) {
        console.error('Error fetching receipt application info:', error);
        res.status(500).json({ 
            error: 'Failed to fetch receipt application info', 
            details: error.message
        });
    }
});

// Add endpoint to get receipt statistics
app.get('/api/receipt/stats', verifyToken, requireRakuAIApproval, async (req, res) => {
    try {
        if (!global.RakuReceipt) {
            return res.json({ receiptCount: 0, totalCost: 0 });
        }
        
        // Build a simple query with just user_id
        const query = { 
            user_id: req.user._id.toString() 
        };
        
        // Add date range filter if provided
        if (req.query.start && req.query.end) {
            // Set the start date to the beginning of the day (00:00:00) in UTC+7
            const startDate = new Date(req.query.start);
            startDate.setHours(0, 0, 0, 0);
            // Adjust for UTC+7 (subtract 7 hours to convert to UTC for storage)
            startDate.setTime(startDate.getTime() - (7 * 60 * 60 * 1000));
            
            // Set the end date to the end of the day (23:59:59.999) in UTC+7
            const endDate = new Date(req.query.end);
            endDate.setHours(23, 59, 59, 999);
            // Adjust for UTC+7
            endDate.setTime(endDate.getTime() - (7 * 60 * 60 * 1000));
            
            // Try both date fields
            query.$or = [
                { created_at: { $gte: startDate, $lte: endDate } },
                { sentDate: { $gte: startDate, $lte: endDate } }
            ];
        }
        
        // Fetch all the receipts for this user directly
        const allReceipts = await global.RakuReceipt.find(query).lean();
        
        // Process the receipt data in memory
        let receiptCount = 0;
        let totalCost = 0;
        
        // If we have receipts, process them
        if (allReceipts.length > 0) {
            // Count receipts and sum price_rece values
            receiptCount = allReceipts.length;
            
            // Sum the price_rece field, handling potential null/undefined values
            totalCost = allReceipts.reduce((sum, receipt) => {
                const price = receipt.price_rece || 0;
                return sum + price;
            }, 0);
        }
        
        // Send the results back to the client
        res.json({
            receiptCount,
            totalCost
        });
    } catch (error) {
        console.error('Error fetching receipt statistics:', error);
        res.status(500).json({ 
            error: 'Failed to fetch receipt statistics', 
            details: error.message,
            receiptCount: 0,
            totalCost: 0
        });
    }
});

const PORT = 8000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 