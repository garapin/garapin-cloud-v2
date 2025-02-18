const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const User = require('../models/User');
const Profile = require('../models/Profile');

// Get Firebase config from environment variables
const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
};

// GET request to render the profile page
router.get('/', async (req, res) => {
    try {
        res.render('profile', { 
            pageTitle: 'Profile',
            firebaseConfig,
            user: req.user,
            currentPage: 'profile'
        });
    } catch (error) {
        console.error('Error in profile route:', error);
        res.status(500).send('Error loading profile page');
    }
});

// GET request to fetch user profile data
router.get('/data', async (req, res) => {
    try {
        console.log('Starting profile data fetch...');
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No valid auth token provided' });
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(token);
        console.log('User authenticated:', decodedToken.uid);
        
        // Find user and their profile
        const user = await User.findOne({ provider_uid: decodedToken.uid });
        if (!user) {
            console.log('User not found for provider_uid:', decodedToken.uid);
            return res.status(404).json({ error: 'User not found' });
        }
        console.log('Found user:', user._id);

        const profile = await Profile.findOne({ provider_uid: decodedToken.uid });
        console.log('Found profile:', profile);

        if (!profile) {
            console.log('No profile found, returning default data');
            return res.json({
                user_type: 'Individu',
                badan_hukum_name: '',
                address: {
                    alamat_lengkap: '',
                    provinsi: '',
                    kota: '',
                    kode_pos: ''
                },
                pic: '',
                phone_number: '',
                web_address: ''
            });
        }

        console.log('Returning profile data:', profile);
        res.json({
            user_type: profile.user_type,
            badan_hukum_name: profile.badan_hukum_name,
            address: profile.address,
            pic: profile.pic,
            phone_number: profile.phone_number,
            web_address: profile.web_address
        });
    } catch (error) {
        console.error('Error fetching user data:', error);
        res.status(500).json({ error: 'Failed to fetch user data' });
    }
});

// POST request to save profile data
router.post('/save', async (req, res) => {
    try {
        console.log('Starting profile save process...');
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No valid auth token provided' });
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(token);
        console.log('User authenticated:', decodedToken.uid);
        
        // Find user first
        const user = await User.findOne({ provider_uid: decodedToken.uid });
        if (!user) {
            console.log('User not found for provider_uid:', decodedToken.uid);
            return res.status(404).json({ error: 'User not found' });
        }
        console.log('Found user:', user._id);

        const {
            userType,
            namaBadanHukum,
            alamatBadanHukum,
            provinsi,
            kota,
            kodePos,
            pic,
            phoneNumber,
            webAddress
        } = req.body;

        console.log('Received form data:', req.body);

        // Validate required fields
        if (!alamatBadanHukum || !provinsi || !kota || !kodePos || !pic || !phoneNumber) {
            console.log('Missing required fields');
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Additional validation for Badan Hukum
        if (userType === 'Badan Hukum' && !namaBadanHukum) {
            console.log('Missing Badan Hukum name for Badan Hukum type');
            return res.status(400).json({ error: 'Nama Badan Hukum is required for Badan Hukum type' });
        }

        try {
            // Find existing profile
            let profile = await Profile.findOne({ provider_uid: decodedToken.uid });
            console.log('Existing profile:', profile);

            const profileData = {
                user_id: user._id,
                provider_uid: decodedToken.uid,
                user_type: userType,
                badan_hukum_name: namaBadanHukum || '',
                address: {
                    alamat_lengkap: alamatBadanHukum,
                    provinsi: provinsi,
                    kota: kota,
                    kode_pos: kodePos
                },
                pic: pic,
                phone_number: phoneNumber,
                web_address: webAddress || ''
            };

            if (profile) {
                console.log('Updating existing profile...');
                profile = await Profile.findOneAndUpdate(
                    { provider_uid: decodedToken.uid },
                    profileData,
                    { 
                        new: true,
                        runValidators: true
                    }
                );
            } else {
                console.log('Creating new profile with data:', profileData);
                profile = new Profile(profileData);
                await profile.save();
                
                // Update user with profile reference
                await User.findByIdAndUpdate(
                    user._id,
                    { profile: profile._id }
                );
            }

            console.log('Saved profile:', profile);

            // Fetch the fresh profile data to ensure we have the latest
            const savedProfile = await Profile.findById(profile._id);
            console.log('Fresh profile data:', savedProfile);

            res.json({
                success: true,
                message: 'Profile saved successfully',
                profile: {
                    user_type: savedProfile.user_type,
                    badan_hukum_name: savedProfile.badan_hukum_name,
                    address: savedProfile.address,
                    pic: savedProfile.pic,
                    phone_number: savedProfile.phone_number,
                    web_address: savedProfile.web_address
                }
            });

        } catch (error) {
            console.error('Profile save error:', error);
            if (error.name === 'ValidationError') {
                return res.status(400).json({
                    error: 'Validation Error',
                    details: Object.values(error.errors).map(err => err.message)
                });
            }
            throw error;
        }

    } catch (error) {
        console.error('Error in profile save:', error);
        res.status(500).json({ 
            error: 'Error saving profile data',
            details: error.message
        });
    }
});

module.exports = router; 