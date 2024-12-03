const express = require('express');
const session = require('express-session');
const { initializeApp } = require('firebase/app');
const admin = require('firebase-admin');
const mongoose = require('mongoose');
const moment = require('moment-timezone');
require('dotenv').config();

const User = require('./models/User');

const app = express();

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Connected to MongoDB');
}).catch((error) => {
    console.error('MongoDB connection error:', error);
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

// Initialize Firebase Admin
admin.initializeApp({
    credential: admin.credential.cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    })
});

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
            req.user = decodedToken;
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
    res.render('dashboard', { firebaseConfig });
});

const PORT = 8000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 