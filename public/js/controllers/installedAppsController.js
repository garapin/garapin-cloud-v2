// Initialize Firebase
const firebaseConfig = JSON.parse(document.querySelector('[data-firebase-config]').dataset.firebaseConfig);
firebase.initializeApp(firebaseConfig);

document.addEventListener('DOMContentLoaded', function() {
    console.log('Initializing installed apps controller...');

    // Initialize Firebase Auth
    firebase.auth().onAuthStateChanged(function(user) {
        console.log('Auth state changed:', user ? 'User logged in' : 'No user');
        
        if (!user) {
            window.location.href = '/';
            return;
        }

        // Get the auth token and fetch apps
        user.getIdToken(true).then(token => {
            console.log('Got auth token, fetching apps...');
            loadInstalledApps(token);
        }).catch(error => {
            console.error('Error getting token:', error);
        });
    });

    async function loadInstalledApps(token) {
        try {
            console.log('Making request to fetch installed apps...');
            const response = await fetch('/my-apps/installed', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json',
                    'Cache-Control': 'no-cache'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            console.log('Received installed apps data:', data);

            // Get the container for applications
            const appsContainer = document.querySelector('.row-cols-1');
            if (!appsContainer) {
                console.error('Apps container not found');
                return;
            }

            if (data.applications && data.applications.length > 0) {
                // Create grid container
                const gridHTML = data.applications.map(installed => {
                    const app = installed.application_id;
                    if (!app) return '';
                    
                    return `
                        <div class="col">
                            <div class="card h-100">
                                ${app.logo && app.logo.url 
                                    ? `<a href="/store/app/${app._id}" class="text-decoration-none">
                                         <img src="${app.logo.url}" class="card-img-top p-3" alt="${app.title}" style="height: 200px; object-fit: contain;">
                                       </a>`
                                    : `<a href="/store/app/${app._id}" class="text-decoration-none">
                                         <div class="card-img-top bg-light d-flex align-items-center justify-content-center" style="height: 200px;">
                                             <i class="bi bi-box fs-1"></i>
                                         </div>
                                       </a>`
                                }
                                <div class="card-body">
                                    <h5 class="card-title">
                                        <a href="/store/app/${app._id}" class="text-decoration-none text-dark">
                                            ${app.title}
                                        </a>
                                    </h5>
                                    <div class="d-flex align-items-center mb-2">
                                        <div class="text-warning me-2">
                                            ${generateRatingStars(app.rating || 0)}
                                        </div>
                                        <small class="text-muted">(${app.installed_count || 0} installs)</small>
                                    </div>
                                    <p class="card-text text-muted">
                                        ${app.description
                                            .replace(/&[a-z0-9]+;/gi, ' ')
                                            .replace(/<[^>]*>/g, '')
                                            .replace(/\s+/g, ' ')
                                            .trim()
                                            .substring(0, 100)}...
                                    </p>
                                    <div class="d-flex justify-content-between align-items-center">
                                        <div class="price">
                                            <strong>Rp. ${app.price.toLocaleString('id-ID')}</strong> / Month
                                        </div>
                                        <small class="text-muted">
                                            Installed ${new Date(installed.installed_date).toLocaleDateString()}
                                        </small>
                                    </div>
                                    <div class="mt-3">
                                        <a href="/store/app/${app._id}" class="btn btn-outline-primary btn-sm w-100">
                                            <i class="bi bi-box-arrow-up-right me-1"></i> Open Application
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');

                appsContainer.innerHTML = gridHTML;
            } else {
                // Show empty state
                appsContainer.innerHTML = `
                    <div class="col-12">
                        <div class="alert alert-info text-center w-100 py-4">
                            <i class="bi bi-info-circle me-2"></i>
                            You haven't installed any applications yet. 
                            <a href="/store" class="alert-link">Visit the store</a> to discover and install applications.
                        </div>
                    </div>
                `;
            }
        } catch (error) {
            console.error('Error loading installed apps:', error);
            const appsContainer = document.querySelector('.row-cols-1');
            if (appsContainer) {
                appsContainer.innerHTML = `
                    <div class="col-12">
                        <div class="alert alert-danger text-center w-100 py-4">
                            <i class="bi bi-exclamation-circle me-2"></i>
                            Error loading installed applications. Please try refreshing the page.
                        </div>
                    </div>
                `;
            }
        }
    }

    function generateRatingStars(rating) {
        let stars = '';
        for (let i = 1; i <= 5; i++) {
            if (rating >= i) {
                stars += '<i class="bi bi-star-fill"></i>';
            } else if (rating > i-1) {
                stars += '<i class="bi bi-star-half"></i>';
            } else {
                stars += '<i class="bi bi-star"></i>';
            }
        }
        return stars;
    }

    // Search functionality
    const searchInput = document.getElementById('searchInstalledApps');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase();
            const appCards = document.querySelectorAll('.card');
            let visibleCount = 0;

            appCards.forEach(card => {
                const title = card.querySelector('.card-title')?.textContent.toLowerCase() || '';
                const description = card.querySelector('.card-text')?.textContent.toLowerCase() || '';
                const isVisible = title.includes(searchTerm) || description.includes(searchTerm);
                
                const cardContainer = card.closest('.col');
                if (cardContainer) {
                    cardContainer.style.display = isVisible ? '' : 'none';
                    if (isVisible) visibleCount++;
                }
            });

            // Show/hide no results message
            const noResults = document.querySelector('.no-results');
            if (noResults) {
                if (searchTerm && visibleCount === 0) {
                    noResults.style.display = 'block';
                } else {
                    noResults.style.display = 'none';
                }
            }
        });
    }
}); 