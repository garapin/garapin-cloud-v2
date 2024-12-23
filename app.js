const express = require('express');
const session = require('express-session');
const { initializeApp } = require('firebase/app');
const admin = require('firebase-admin');
const mongoose = require('mongoose');
const moment = require('moment-timezone');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config();
const multer = require('multer');
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

const User = require('./models/User');
const Application = require('./models/Application');
const categoryController = require('./controllers/categoryController');
const Category = require('./models/Category');
const InstalledApp = require('./models/InstalledApp');
const BaseImage = require('./models/BaseImage');

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
        "https://cdn.jsdelivr.net https://cdn.tiny.cloud; " +
        "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net https://cdn.tiny.cloud; " +
        "img-src 'self' data: https: blob: https://lh3.googleusercontent.com " +
        "https://*.googleusercontent.com https://cdn.tiny.cloud; " +
        "connect-src 'self' https://*.firebaseio.com https://www.googleapis.com " +
        "https://securetoken.googleapis.com https://identitytoolkit.googleapis.com " +
        "wss://*.firebaseio.com https://cdn.jsdelivr.net https://n8n-service.garapin.cloud " +
        "https://registry.hub.docker.com https://cdn.tiny.cloud; " +
        "frame-src 'self' https://console.garapin.cloud https://*.firebaseio.com " +
        "https://*.firebaseapp.com https://*.firebase.com https://accounts.google.com; " +
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

// MongoDB Connection Setup
const connectDB = async () => {
    try {
        // Clear any existing connections
        await mongoose.disconnect();

        // Configure mongoose
        mongoose.set('strictQuery', false);

        // Connection options
        const options = {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 45000,
            family: 4,
            maxPoolSize: 10,
            minPoolSize: 2,
            connectTimeoutMS: 30000,
            heartbeatFrequencyMS: 2000,
            retryWrites: true,
            retryReads: true
        };

        // Verify MongoDB URI
        console.log('Connecting to MongoDB:', process.env.MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//****:****@'));
        
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI, options);
        console.log('MongoDB connected successfully');
        console.log('Connected to database:', mongoose.connection.name);

        // Handle connection events
        mongoose.connection.on('error', (err) => {
            console.error('MongoDB connection error:', err);
            setTimeout(connectDB, 5000);
        });

        mongoose.connection.on('disconnected', () => {
            console.warn('MongoDB disconnected. Attempting to reconnect...');
            setTimeout(connectDB, 5000);
        });

        mongoose.connection.on('reconnected', () => {
            console.log('MongoDB reconnected successfully');
        });

    } catch (error) {
        console.error('MongoDB connection failed:', error);
        setTimeout(connectDB, 5000);
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
app.use(express.json());
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

// Verify Firebase token middleware
const verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.log('No token in header:', authHeader);
            return res.status(401).json({ error: 'No token provided' });
        }

        const token = authHeader.split('Bearer ')[1];
        try {
            const decodedToken = await admin.auth().verifyIdToken(token);
            const userData = await User.findOne({ provider_uid: decodedToken.uid });
            req.user = userData;
            next();
        } catch (error) {
            console.error('Token verification error:', error);
            res.status(401).json({ error: 'Invalid token' });
        }
    } catch (error) {
        console.error('Auth middleware error:', error);
        res.status(500).json({ error: 'Authentication failed' });
    }
};

// Add this new middleware after the verifyToken middleware
const checkAuth = async (req, res, next) => {
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

// Apply middleware
app.use(checkAuth);

// Routes
const storeRouter = require('./routes/store');
app.use('/store', storeRouter);

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
        console.log('Fetching base images...');
        const baseImages = await BaseImage.find()
            .sort({ base_image: 1 }); // 1 for ascending order

        console.log('Found base images:', baseImages);

        res.render('base-images', {
            firebaseConfig,
            baseImages,
            user: req.user,
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
app.get('/api/docker-hub/validate/:image/:tag', async (req, res) => {
    try {
        const { image, tag } = req.params;
        
        // List of common organizations to check
        const organizations = [
            'library',  // Official images
            '',         // Default namespace
            'bitnami'   // Bitnami images
        ];

        // Try each organization
        for (const org of organizations) {
            const prefix = org ? `${org}/` : '';
            const url = `https://hub.docker.com/v2/repositories/${prefix}${image}/tags/${tag}`;
            
            try {
                console.log('Trying URL:', url);
                const response = await fetch(url, {
                    method: 'GET',
                    headers: {
                        'Accept': 'application/json'
                    },
                    timeout: 5000
                });

                if (response.ok) {
                    const data = await response.json();
                    // If we found the image in any organization, consider it valid
                    return res.json({
                        name: tag,
                        full_name: `${prefix}${image}`,
                        images: [{
                            architecture: 'arm64',
                            variant: 'v8'
                        }]
                    });
                }
            } catch (fetchError) {
                console.error(`Fetch error for ${url}:`, fetchError);
                // Continue to next organization if there's an error
                continue;
            }
        }

        // If we get here, try searching in Docker Hub
        const searchUrl = `https://hub.docker.com/v2/repositories/${image}`;
        try {
            const searchResponse = await fetch(searchUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                },
                timeout: 5000
            });

            if (searchResponse.ok) {
                // Image exists in its own namespace
                return res.json({
                    name: tag,
                    full_name: image,
                    images: [{
                        architecture: 'arm64',
                        variant: 'v8'
                    }]
                });
            }
        } catch (searchError) {
            console.error('Search error:', searchError);
        }

        // If we get here, the image was not found anywhere
        return res.status(404).json({ error: 'Image not found' });

    } catch (error) {
        console.error('Docker Hub validation error:', error);
        res.status(500).json({ error: 'Failed to validate Docker image' });
    }
});

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
        const application = await Application.findOne({
            _id: sanitizedId,
            user_id: req.user.provider_uid
        });

        if (!application) {
            return res.status(404).json({ error: 'Application not found' });
        }

        // Update fields
        const updateFields = ['description', 'support_detail', 'price', 'status', 'category'];
        updateFields.forEach(field => {
            if (req.body[field]) {
                application[field] = req.body[field];
            }
        });

        // Handle file uploads
        if (req.files) {
            const bucket = admin.storage().bucket();

            // Handle logo upload
            if (req.files.icon) {
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
            }

            // Handle screenshots upload
            if (req.files.screenshots) {
                const screenshotPromises = req.files.screenshots.map(async (file) => {
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
                        bucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
                        size: file.size,
                        full_path: screenshotPath,
                        isCover: false
                    };
                });

                const newScreenshots = await Promise.all(screenshotPromises);
                const existingCount = parseInt(req.body.existingScreenshotsCount) || 0;
                if (existingCount === 0) {
                    application.screenshoots = newScreenshots;
                    if (newScreenshots.length > 0) {
                        application.screenshoots[0].isCover = true;
                    }
                } else {
                    application.screenshoots = [
                        ...application.screenshoots.slice(0, existingCount),
                        ...newScreenshots
                    ];
                }
            }
        }

        await application.save();
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

        // Update application's installed count
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

const PORT = 8000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 