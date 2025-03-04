const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const User = require('../models/User');
const Profile = require('../models/Profile');
const PublicApiKey = require('../models/PublicApiKey');
const { verifyToken } = require('../middleware/auth');

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

// API Routes
// GET API keys
router.get('/api-keys', verifyToken, async (req, res) => {
    console.log('GET /api-keys endpoint hit');
    try {
        console.log('Fetching API keys for user:', req.user.provider_uid);
        
        const apiKeys = await PublicApiKey.find({ provider_uid: req.user.provider_uid })
            .sort({ created_at: -1 });

        console.log('Found API keys:', apiKeys.length);

        res.json({
            success: true,
            apiKeys: apiKeys.map(key => ({
                id: key._id,
                name: key.name,
                key: key.key,
                status: key.status,
                created_at: key.created_at,
                last_used: key.last_used
            }))
        });
    } catch (error) {
        console.error('Error fetching API keys:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch API keys',
            details: error.message 
        });
    }
});

// Create new API key
router.post('/api-keys', verifyToken, async (req, res) => {
    console.log('POST /api-keys endpoint hit');
    try {
        const { name } = req.body;
        console.log('Creating new API key with name:', name);

        if (!name) {
            return res.status(400).json({ 
                success: false,
                error: 'Name is required for the API key' 
            });
        }

        // Check if name already exists for this user
        const existingKey = await PublicApiKey.findOne({ 
            provider_uid: req.user.provider_uid,
            name: name 
        });

        if (existingKey) {
            return res.status(400).json({ 
                success: false,
                error: 'An API key with this name already exists' 
            });
        }

        // Generate a unique GC key
        const GC_KEY = process.env.GC_KEY || 'garapin-cloud-default-key';
        
        // Generate the API key
        const apiKey = PublicApiKey.generateKey(req.user.name, GC_KEY);

        // Create new API key record
        const newApiKey = new PublicApiKey({
            user_id: req.user._id,
            provider_uid: req.user.provider_uid,
            name: name,
            key: apiKey,
            status: 'active',
            created_at: new Date()
        });

        await newApiKey.save();
        console.log('New API key created successfully');

        res.json({
            success: true,
            apiKey: {
                name: newApiKey.name,
                key: newApiKey.key,
                status: newApiKey.status,
                created_at: newApiKey.created_at
            }
        });
    } catch (error) {
        console.error('Error in API key creation:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to create API key',
            details: error.message 
        });
    }
});

// Add new endpoint to disable API key
router.put('/api-keys/:id/disable', verifyToken, async (req, res) => {
    try {
        console.log('Disabling API key:', req.params.id);
        
        const apiKey = await PublicApiKey.findOneAndUpdate(
            { 
                _id: req.params.id,
                provider_uid: req.user.provider_uid
            },
            { 
                status: 'disabled',
                updated_at: new Date()
            },
            { new: true }
        );

        if (!apiKey) {
            return res.status(404).json({
                success: false,
                error: 'API key not found'
            });
        }

        res.json({
            success: true,
            message: 'API key disabled successfully',
            apiKey: {
                id: apiKey._id,
                name: apiKey.name,
                status: apiKey.status
            }
        });
    } catch (error) {
        console.error('Error disabling API key:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to disable API key',
            details: error.message
        });
    }
});

// GET user data with amount
router.get('/user-data', verifyToken, async (req, res) => {
    try {
        console.log('Fetching user data for user ID:', req.user._id);
        
        // Find user by _id and select only necessary fields
        const user = await User.findById(req.user._id).select('_id name email amount');
        
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                error: 'User not found' 
            });
        }
        
        console.log('User data retrieved:', user);
        
        res.status(200).json({
            _id: user._id,
            name: user.name,
            email: user.email,
            amount: user.amount || 0
        });
    } catch (error) {
        console.error('Error fetching user data:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Failed to fetch user data' 
        });
    }
});

// Page Routes
// GET profile page
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

// GET profile data
router.get('/data', verifyToken, async (req, res) => {
    try {
        console.log('Fetching profile data for user:', req.user.provider_uid);
        const profile = await Profile.findOne({ provider_uid: req.user.provider_uid });
        
        if (!profile) {
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
                web_address: '',
                raku_ai: null
            });
        }

        res.json({
            user_type: profile.user_type,
            badan_hukum_name: profile.badan_hukum_name,
            address: profile.address,
            pic: profile.pic,
            phone_number: profile.phone_number,
            web_address: profile.web_address,
            raku_ai: profile.raku_ai
        });
    } catch (error) {
        console.error('Error fetching profile data:', error);
        res.status(500).json({ error: 'Failed to fetch profile data' });
    }
});

// Raku AI request
router.post('/raku-ai-request', verifyToken, async (req, res) => {
    try {
        console.log('Received Raku AI request:', {
            user_id: req.user._id,
            provider_uid: req.user.provider_uid
        });

        // Find or create profile
        let profile = await Profile.findOne({ provider_uid: req.user.provider_uid });
        console.log('Existing profile:', profile);
        
        if (!profile) {
            console.log('Creating new profile...');
            // Create minimal profile for Raku AI request
            profile = new Profile({
                provider_uid: req.user.provider_uid,
                user_id: req.user._id,
                user_type: 'Individu', // Default value
                address: {
                    alamat_lengkap: 'Pending',
                    provinsi: 'Pending',
                    kota: 'Pending',
                    kode_pos: 'Pending'
                },
                pic: req.user.name || 'Pending',
                phone_number: 'Pending'
            });
        }

        // Update the profile with Raku AI request data
        profile.raku_ai = {
            ...req.body,
            updated_at: new Date()
        };

        console.log('Saving profile with Raku AI data:', profile.raku_ai);

        try {
            await profile.save();
            console.log('Profile saved successfully');
        } catch (saveError) {
            console.error('Error saving profile:', saveError);
            throw saveError;
        }

        // Update user's profile reference if not set
        if (!req.user.profile) {
            console.log('Updating user profile reference...');
            await User.findOneAndUpdate(
                { provider_uid: req.user.provider_uid },
                { profile: profile._id }
            );
        }

        res.json({
            success: true,
            message: 'Raku AI request submitted successfully'
        });
    } catch (error) {
        console.error('Error submitting Raku AI request:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to submit Raku AI request',
            error: error.message
        });
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
                
                // Add this code to ensure user profile reference is updated even when updating
                // Check if user needs profile reference update
                if (!user.profile) {
                    console.log('Updating user profile reference for existing profile...');
                    await User.findByIdAndUpdate(
                        user._id,
                        { profile: profile._id }
                    );
                    
                    // Update session with new user data if it exists
                    if (req.session && req.session.user) {
                        const updatedUser = await User.findById(user._id);
                        req.session.user = updatedUser;
                    }
                }
            } else {
                console.log('Creating new profile with data:', profileData);
                profile = new Profile(profileData);
                await profile.save();
                
                // Update user with profile reference
                await User.findByIdAndUpdate(
                    user._id,
                    { profile: profile._id }
                );

                // Update session with new user data
                if (req.session && req.session.user) {
                    const updatedUser = await User.findById(user._id);
                    req.session.user = updatedUser;
                }
            }

            console.log('Saved profile:', profile);

            // Fetch the fresh profile data to ensure we have the latest
            const savedProfile = await Profile.findById(profile._id);
            console.log('Fresh profile data:', savedProfile);

            // Ensure user record has profile reference - add this code
            const userCheck = await User.findOne({ provider_uid: decodedToken.uid });
            if (!userCheck.profile) {
                console.log('User still missing profile reference, fixing...');
                await User.findByIdAndUpdate(
                    userCheck._id,
                    { profile: profile._id }
                );
            }

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