document.addEventListener('DOMContentLoaded', async function() {
    // Initialize Firebase if needed
    try {
        const firebaseConfig = JSON.parse(document.querySelector('[data-firebase-config]').dataset.firebaseConfig);
        if (!firebase.apps?.length) {
            firebase.initializeApp(firebaseConfig);
        }
    } catch (error) {
        console.error('Firebase initialization error:', error);
        return;
    }

    // Function to fetch installed apps
    async function fetchInstalledApps() {
        const user = firebase.auth().currentUser;
        if (!user) {
            console.log('No user logged in');
            return;
        }

        try {
            const token = await user.getIdToken(true); // Force token refresh
            console.log('Fetching installed apps with token...');
            
            const response = await fetch('/my-apps/installed', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Cache-Control': 'no-cache'
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch installed apps');
            }

            const html = await response.text();
            console.log('Received response, updating content...');
            
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const newContent = doc.querySelector('.row.row-cols-1.row-cols-md-2.row-cols-lg-3.row-cols-xl-4.g-4');
            
            if (newContent) {
                const currentContent = document.querySelector('.row.row-cols-1.row-cols-md-2.row-cols-lg-3.row-cols-xl-4.g-4');
                if (currentContent) {
                    console.log('Updating content with new data...');
                    currentContent.innerHTML = newContent.innerHTML;
                } else {
                    console.error('Current content container not found');
                }
            } else {
                console.error('New content not found in response');
            }
        } catch (error) {
            console.error('Error fetching installed apps:', error);
        }
    }

    // Wait for Firebase Auth to initialize and fetch apps
    firebase.auth().onAuthStateChanged(async (user) => {
        if (user) {
            console.log('User is authenticated, fetching apps...');
            await fetchInstalledApps();
        } else {
            console.log('No user authenticated, redirecting...');
            window.location.href = '/';
        }
    });

    // Search functionality
    const searchInput = document.getElementById('searchInstalledApps');
    const appsGrid = document.querySelector('.row.row-cols-1');
    const noResultsMessage = document.querySelector('.no-results');

    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            const searchTerm = e.target.value.toLowerCase();
            let hasVisibleCards = false;

            const appCards = appsGrid.querySelectorAll('.col');
            appCards.forEach(card => {
                const title = card.querySelector('.card-title')?.textContent.toLowerCase() || '';
                const description = card.querySelector('.card-text')?.textContent.toLowerCase() || '';

                if (title.includes(searchTerm) || description.includes(searchTerm)) {
                    card.style.display = '';
                    hasVisibleCards = true;
                } else {
                    card.style.display = 'none';
                }
            });

            // Show/hide no results message
            if (noResultsMessage) {
                noResultsMessage.style.display = hasVisibleCards ? 'none' : 'block';
            }
        });
    }
}); 