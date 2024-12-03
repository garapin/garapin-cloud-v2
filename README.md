# Garapin Cloud Admin Panel

A Node.js admin panel with Google OAuth authentication.

## Features

- Login with Google authentication
- Dashboard with sidebar navigation
- Responsive design
- Session management

## Prerequisites

- Node.js (v14 or higher)
- npm

## Setup

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
   - Copy `.env.example` to `.env`
   - Update the following variables in `.env`:
     - `GOOGLE_CLIENT_ID`: Your Google OAuth client ID
     - `GOOGLE_CLIENT_SECRET`: Your Google OAuth client secret
     - `SESSION_SECRET`: A random string for session encryption

4. Set up Google OAuth:
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Create a new project or select an existing one
   - Enable the Google+ API
   - Create OAuth 2.0 credentials
   - Add `http://localhost:3000/auth/google/callback` to authorized redirect URIs

## Running the Application

1. Start the server:
```bash
node app.js
```

2. Open your browser and navigate to:
```
http://localhost:3000
```

## Project Structure

```
├── app.js              # Main application file
├── public/             # Static files
│   ├── css/           # CSS files
│   └── images/        # Image files
├── views/             # EJS templates
│   ├── login.ejs     # Login page
│   └── dashboard.ejs # Dashboard page
└── .env              # Environment variables
``` 