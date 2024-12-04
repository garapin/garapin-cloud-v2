document.addEventListener('DOMContentLoaded', function() {
    // Check authentication
    firebase.auth().onAuthStateChanged(async function(user) {
        if (!user) {
            window.location.href = '/';
            return;
        }

        try {
            // Fetch applications with the token
            const idToken = await user.getIdToken();
            const response = await fetch('/my-apps', {
                headers: {
                    'Authorization': `Bearer ${idToken}`
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch applications');
            }

            const html = await response.text();
            document.documentElement.innerHTML = html;

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