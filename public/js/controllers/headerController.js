class HeaderController {
    constructor() {
        this.initializeFirebase();
        this.setupEventListeners();
    }

    initializeFirebase() {
        try {
            const firebaseConfig = JSON.parse(document.querySelector('[data-firebase-config]').dataset.firebaseConfig);
            if (!firebase.apps?.length) {
                firebase.initializeApp(firebaseConfig);
            }
            
            firebase.auth().onAuthStateChanged(async (user) => {
                if (user) {
                    const token = await user.getIdToken();
                    const response = await fetch('/auth/user', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            name: user.displayName,
                            email: user.email,
                            provider_uid: user.uid,
                            photoURL: user.photoURL
                        })
                    });

                    if (response.ok) {
                        const userData = await response.json();
                        this.updateUI(user);
                        localStorage.setItem('authToken', token);
                    }
                } else {
                    // Handle logged out state
                    document.getElementById('userName').textContent = 'Guest';
                    document.getElementById('userPhotoContainer').innerHTML = '<i class="bi bi-person-circle" style="font-size: 1.2rem;"></i>';
                    localStorage.removeItem('authToken');
                    this.updateUI(null);
                }
            });
        } catch (error) {
            console.error('Firebase initialization error:', error);
        }
    }

    updateUI(user) {
        const userPhotoContainer = document.getElementById('userPhotoContainer');
        const userName = document.getElementById('userName');
        const publishButton = document.querySelector('.publish-button');

        if (user) {
            if (user.photoURL) {
                userPhotoContainer.innerHTML = `<img src="${user.photoURL}" alt="Profile" class="rounded-circle" style="width: 24px; height: 24px;">`;
            }
            if (user.displayName) {
                userName.textContent = user.displayName;
            }
            // Show publish button if user is logged in
            if (publishButton) {
                publishButton.style.display = 'flex';
            }
        } else {
            // Hide publish button if user is not logged in
            if (publishButton) {
                publishButton.style.display = 'none';
            }
        }
    }

    setupEventListeners() {
        const logoutButton = document.getElementById('logoutButton');
        if (logoutButton) {
            logoutButton.addEventListener('click', async () => {
                try {
                    await firebase.auth().signOut();
                    localStorage.removeItem('authToken');
                    window.location.href = '/';
                } catch (error) {
                    console.error('Logout error:', error);
                    alert('Failed to logout. Please try again.');
                }
            });
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new HeaderController();
}); 