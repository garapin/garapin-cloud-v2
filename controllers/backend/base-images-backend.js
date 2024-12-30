const mongoose = require('mongoose');
const BaseImage = require('../../models/BaseImage');
const User = require('../../models/User');
const admin = require('firebase-admin');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function deleteBaseImage(req, res) {
    try {
        // Get token from header
        const token = req.headers.authorization?.split('Bearer ')[1];
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        // Verify token and get user
        const decodedToken = await admin.auth().verifyIdToken(token);
        const user = await User.findOne({ provider_uid: decodedToken.uid });
        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }

        // Find and verify base image ownership
        const baseImage = await BaseImage.findById(req.params.id);
        if (!baseImage) {
            return res.status(404).json({ error: 'Base image not found' });
        }

        if (baseImage.user_id !== user.provider_uid) {
            return res.status(403).json({ error: 'Not authorized to delete this base image' });
        }

        // Delete the base image
        await BaseImage.findByIdAndDelete(req.params.id);
        res.json({ message: 'Base image deleted successfully' });
    } catch (error) {
        console.error('Error deleting base image:', error);
        res.status(500).json({ error: 'Failed to delete base image' });
    }
}

async function validateDockerImage(req, res) {
    try {
        const { image, tag } = req.params;
        const response = await fetch(`https://registry.hub.docker.com/v2/repositories/${image}/tags/${tag}`);
        
        if (response.ok) {
            return res.json({ valid: true });
        }

        // If we get here, the image was not found
        return res.status(404).json({ error: 'Image not found' });
    } catch (error) {
        console.error('Docker Hub validation error:', error);
        res.status(500).json({ error: 'Failed to validate Docker image' });
    }
}

async function searchDockerHub(req, res) {
    try {
        const query = req.query.query;
        if (!query) {
            return res.status(400).json({ error: 'Query parameter is required' });
        }

        const response = await fetch(`https://registry.hub.docker.com/v2/search/repositories/?query=${query}`);
        if (!response.ok) {
            throw new Error('Failed to fetch from Docker Hub');
        }

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error('Docker Hub proxy error:', error);
        res.status(500).json({ error: 'Failed to fetch from Docker Hub' });
    }
}

module.exports = {
    deleteBaseImage,
    validateDockerImage,
    searchDockerHub
}; 