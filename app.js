const express = require('express');
const session = require('express-session');
const { initializeApp } = require('firebase/app');
const admin = require('firebase-admin');
const mongoose = require('mongoose');
const moment = require('moment-timezone');
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

const app = express();

// Initialize Firebase Admin SDK
admin.initializeApp({
    credential: admin.credential.cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    }),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
});

// MongoDB Connection with improved settings
mongoose.set('strictQuery', false);
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 15000, // Timeout after 15 seconds instead of 10
    socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
    family: 4, // Use IPv4, skip trying IPv6
    maxPoolSize: 10, // Maintain up to 10 socket connections
    minPoolSize: 3,  // Maintain at least 3 socket connections
    connectTimeoutMS: 15000, // Give up initial connection after 15 seconds
}).then(() => {
    console.log('MongoDB connected successfully');
}).catch((err) => {
    console.error('MongoDB connection error:', err);
});

// Handle MongoDB connection errors
mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected. Attempting to reconnect...');
});

mongoose.connection.on('reconnected', () => {
    console.log('MongoDB reconnected successfully');
});

// Graceful shutdown
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
app.get('/', (req, res) => {
    res.render('login', { firebaseConfig });
});

app.post('/auth/user', verifyToken, async (req, res) => {
    try {
        const { name, email, provider_uid, photoURL } = req.body;
        console.log('Received user data:', { name, email, provider_uid, photoURL });

        const jakartaTime = moment().tz('Asia/Jakarta').toDate();

        // First check if user exists by email
        let user = await User.findOne({ email });

        if (!user) {
            // If user doesn't exist, create new user
            user = await User.create({
                name,
                email,
                provider: 'google',
                provider_uid,
                photoURL,
                created_at: jakartaTime,
                updated_at: jakartaTime,
                last_login_at: jakartaTime
            });
        } else {
            // If user exists, update login info and other fields
            user = await User.findOneAndUpdate(
                { email },
                {
                    provider_uid, // Update provider_uid if changed
                    photoURL,     // Update photo if changed
                    name,         // Update name if changed
                    last_login_at: jakartaTime,
                    updated_at: jakartaTime
                },
                { new: true }
            );
        }

        console.log('User updated/created:', user);
        res.json({ success: true, user });
    } catch (error) {
        console.error('User update error:', error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

app.get('/dashboard', async (req, res) => {
    res.render('dashboard', { 
        firebaseConfig,
        user: req.user,
        pageTitle: 'Dashboard'
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
            pageTitle: 'Store'
        });
    } catch (error) {
        console.error('Error fetching applications:', error);
        res.status(500).send('Error loading store');
    }
});

app.get('/store/:slug', async (req, res) => {
    try {
        const application = await Application.findOne({ 
            slug: req.params.slug,
            status: 'Published'
        }).lean();

        if (!application) {
            return res.status(404).send('Application not found');
        }

        // Get user information
        const userData = await User.findOne({ provider_uid: application.user_id }).lean();
        application.userName = userData ? userData.name : 'Unknown User';
        application.userStatus = userData ? userData.status : null;

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

app.get('/publish', (req, res) => {
    res.render('publish', {
        firebaseConfig,
        layout: 'layout',
        user: req.user,
        pageTitle: 'Publish Application'
    });
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

const PORT = 8000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 