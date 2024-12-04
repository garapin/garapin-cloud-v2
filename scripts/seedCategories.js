const mongoose = require('mongoose');
const Category = require('../models/Category');
require('dotenv').config();

const categories = [
    { category_name: 'AI Chatbots' },
    { category_name: 'Image Generation' },
    { category_name: 'Text Analysis' },
    { category_name: 'Voice Recognition' },
    { category_name: 'Machine Learning' },
    { category_name: 'Data Analytics' },
    { category_name: 'Natural Language Processing' },
    { category_name: 'Computer Vision' }
];

mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(async () => {
    console.log('Connected to MongoDB');
    
    try {
        // Clear existing categories
        await Category.deleteMany({});
        console.log('Cleared existing categories');
        
        // Insert new categories
        const result = await Category.insertMany(categories);
        console.log('Added categories:', result);
        
    } catch (error) {
        console.error('Error seeding categories:', error);
    } finally {
        mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}).catch(err => {
    console.error('MongoDB connection error:', err);
}); 