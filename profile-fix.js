// Script to fix user profile links
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Profile = require('./models/Profile');

// Get provider_uid from command line
const provider_uid = process.argv[2];

if (!provider_uid) {
  console.error('Please provide the provider_uid as a command line argument');
  console.error('Example: node profile-fix.js YOUR_PROVIDER_UID');
  process.exit(1);
}

// Connect to the database
async function main() {
  try {
    const mongoURI = process.env.MONGODB_URI;
    console.log(`Connecting to MongoDB at ${mongoURI}`);
    
    await mongoose.connect(mongoURI);
    console.log('MongoDB connected');
    
    // Find the user
    const user = await User.findOne({ provider_uid });
    
    if (!user) {
      console.error(`User with provider_uid ${provider_uid} not found`);
      process.exit(1);
    }
    
    console.log(`Found user: ${user.name} (${user._id})`);
    console.log(`Current profile reference: ${user.profile || 'None'}`);
    
    // Find the profile
    const profile = await Profile.findOne({ provider_uid });
    
    if (!profile) {
      console.error(`No profile found for provider_uid ${provider_uid}`);
      process.exit(1);
    }
    
    console.log(`Found profile with ID: ${profile._id}`);
    
    // Update the user record with the profile ID
    await User.findByIdAndUpdate(user._id, { profile: profile._id });
    console.log(`Updated user record with profile reference`);
    
    // Verify the update
    const updatedUser = await User.findById(user._id);
    console.log(`Updated user profile reference: ${updatedUser.profile}`);
    
    console.log('Fix completed successfully');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

main(); 