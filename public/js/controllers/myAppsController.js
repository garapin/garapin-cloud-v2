document.addEventListener('DOMContentLoaded', function() {
    // Check authentication
    firebase.auth().onAuthStateChanged(async function(user) {
        if (!user) {
            window.location.href = '/';
            return;
        }

        try {
            // Force token refresh before fetching applications
            const idToken = await user.getIdToken(true);
            const response = await fetch('/my-apps/list', {
                headers: {
                    'Authorization': `Bearer ${idToken}`,
                    'Cache-Control': 'no-cache'
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch applications');
            }

            // Parse the response and update only the main content
            const parser = new DOMParser();
            const doc = parser.parseFromString(await response.text(), 'text/html');
            const newContent = doc.querySelector('.row.row-cols-1');
            
            if (newContent) {
                const currentContent = document.querySelector('.row.row-cols-1');
                if (currentContent) {
                    currentContent.innerHTML = newContent.innerHTML;
                }
            }

            // Search functionality
            const searchInput = document.getElementById('searchMyApps');
            const appsGrid = document.querySelector('.row.row-cols-1');

            if (searchInput) {
                searchInput.addEventListener('input', function(e) {
                    const searchTerm = e.target.value.toLowerCase();
                    const appCards = appsGrid.querySelectorAll('.col');

                    appCards.forEach(card => {
                        const title = card.querySelector('.card-title').textContent.toLowerCase();
                        const description = card.querySelector('.card-text').textContent.toLowerCase();

                        if (title.includes(searchTerm) || description.includes(searchTerm)) {
                            card.style.display = '';
                        } else {
                            card.style.display = 'none';
                        }
                    });
                });
            }
        } catch (error) {
            console.error('Error getting auth token:', error);
        }
    });
}); 