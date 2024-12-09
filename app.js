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
const Application = require('./models/application');
const categoryController = require('./controllers/categoryController');
const Category = require('./models/Category');
const InstalledApp = require('./models/InstalledApp');

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

app.post('/auth/user', verifyToken, async (req, res) => {
    try {
        const { name, email, provider_uid, photoURL } = req.body;
        console.log('Received user data:', { name, email, provider_uid, photoURL });

        const jakartaTime = moment().tz('Asia/Jakarta').toDate();

        // First check if user exists by email
        let user = await User.findOne({ email });

        if (!user) {
            // If user doesn't exist, create new user with namespace
            const namespace = await generateUniqueNamespace();
            user = await User.create({
                name,
                email,
                provider: 'google',
                provider_uid,
                photoURL,
                namespace,
                created_at: jakartaTime,
                updated_at: jakartaTime,
                last_login_at: jakartaTime
            });
            console.log('Created new user with namespace:', namespace);
        } else {
            // If user exists but doesn't have namespace, generate one
            if (!user.namespace) {
                const namespace = await generateUniqueNamespace();
                user = await User.findOneAndUpdate(
                    { email },
                    {
                        provider_uid,
                        photoURL,
                        name,
                        namespace,
                        last_login_at: jakartaTime,
                        updated_at: jakartaTime
                    },
                    { new: true }
                );
                console.log('Added namespace to existing user:', namespace);
            } else {
                // Just update other fields if namespace exists
                user = await User.findOneAndUpdate(
                    { email },
                    {
                        provider_uid,
                        photoURL,
                        name,
                        last_login_at: jakartaTime,
                        updated_at: jakartaTime
                    },
                    { new: true }
                );
            }
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
            application = await Application.findOne({ _id: req.params.id });
            if (!application) {
                return res.status(404).send('Application not found');
            }
        }

        res.render('publish', {
            firebaseConfig,
            application, // Will be null for new publish
            isEdit,     // Flag to indicate if this is an edit
            user: req.user,
            pageTitle: isEdit ? 'Edit Application' : 'Publish Application'
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
            
            return description
                .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
                .replace(/<(?!\/?(b|strong|i|em|mark|small|del|ins|sub|sup)(?=>|\s.*>))\/?(?:.|\s)*?>/g, '')
                .substring(0, 100) + (description.length > 100 ? '....' : '');
        };

        // Get token from header
        const authHeader = req.headers.authorization;
        console.log('\n=== Fetching Installed Apps ===');
        console.log('Auth header present:', !!authHeader);

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.log('No valid auth token found');
            return res.render('installed-apps', { 
                firebaseConfig,
                applications: [],
                user: null,
                pageTitle: 'Installed Apps',
                currentPage: 'installed-apps',
                cleanAndTruncateDescription
            });
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(token);
        
        // Get MongoDB user using Firebase UID
        const user = await User.findOne({ provider_uid: decodedToken.uid });
        if (!user) {
            console.log('User not found');
            return res.render('installed-apps', { 
                firebaseConfig,
                applications: [],
                user: null,
                pageTitle: 'Installed Apps',
                currentPage: 'installed-apps',
                cleanAndTruncateDescription
            });
        }

        console.log('Found user:', user._id);
        console.log('User provider_uid:', user.provider_uid);

        // Get installed apps with populated application data
        const installedApps = await InstalledApp.find({ 
            user_id: user.provider_uid  // Use Firebase UID
        }).populate({
            path: 'application_id',
            model: 'Application',
            select: 'title description logo rating installed_count app_url base_image'
        }).sort({ installed_at: -1 });

        console.log('Found installed apps:', installedApps.length);

        res.render('installed-apps', {
            firebaseConfig,
            applications: installedApps,
            user: user,
            pageTitle: 'Installed Apps',
            currentPage: 'installed-apps',
            cleanAndTruncateDescription
        });

    } catch (error) {
        console.error('Error fetching installed apps:', error);
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

        // Create new installation record
        const installation = new InstalledApp({
            application_id: application._id,
            user_id: userId,
            installed_date: new Date()
        });

        // Debug: Show installation object before saving
        console.log('\nInstallation to save:', installation.toObject());

        // Save the installation
        const savedInstallation = await installation.save();
        console.log('\nSaved installation:', savedInstallation.toObject());

        // Verify the installation was saved
        const verifyInstall = await InstalledApp.findById(savedInstallation._id);
        console.log('\nVerified installation exists:', verifyInstall ? 'Yes' : 'No');

        // Update application's installed count
        await Application.findByIdAndUpdate(
            applicationId,
            { $inc: { installed_count: 1 } }
        );

        res.json({ 
            success: true, 
            message: 'Application installed successfully',
            installation: savedInstallation
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

const PORT = 8000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 