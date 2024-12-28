// Store refresh intervals and removing flags globally
const refreshIntervals = new Map();
const removingApps = new Set();

// Function to show toast notifications
function showToast(message, type = 'info') {
    const toast = document.getElementById('appToast');
    const toastBody = toast.querySelector('.toast-body');
    
    toastBody.textContent = message;
    toast.classList.remove('bg-success', 'bg-danger', 'bg-info');
    
    switch(type) {
        case 'success':
            toast.classList.add('bg-success', 'text-white');
            break;
        case 'error':
            toast.classList.add('bg-danger', 'text-white');
            break;
        default:
            toast.classList.add('bg-info', 'text-white');
    }
    
    const bsToast = new bootstrap.Toast(toast);
    bsToast.show();
}

// Function to retry with exponential backoff
async function retryWithBackoff(fn, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            const waitTime = Math.min(1000 * Math.pow(2, i), 10000);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
    }
}

// Function to fetch installed apps
async function fetchInstalledApps() {
    try {
        const user = firebase.auth().currentUser;
        if (!user) {
            console.log('No user logged in');
            window.location.href = '/login';
            return;
        }

        const token = await retryWithBackoff(async () => {
            try {
                return await user.getIdToken(true); // Force token refresh
            } catch (error) {
                console.warn('Token refresh failed, trying without force refresh');
                return await user.getIdToken(false);
            }
        });

        const response = await fetch('/my-apps/installed', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const newContent = doc.querySelector('.row.row-cols-1.row-cols-md-2.row-cols-lg-3.row-cols-xl-4.g-4');
        
        if (newContent) {
            const currentContent = document.querySelector('.row.row-cols-1.row-cols-md-2.row-cols-lg-3.row-cols-xl-4.g-4');
            if (currentContent) {
                currentContent.innerHTML = newContent.innerHTML;
                initializeStatusChecking();
            }
        }
    } catch (error) {
        console.error('Error fetching installed apps:', error);
        showToast('Failed to load installed apps. Please refresh the page.', 'error');
    }
}

// Function to update app status UI
function updateAppStatusUI(appCard, status, ingressUrl) {
    const statusBadge = appCard.querySelector('.app-status');
    const buttonsContainer = appCard.querySelector('.d-flex.gap-2.mt-2');
    
    if (!statusBadge) return;

    let statusClass = '';
    let displayStatus = '';
    
    status = status.toUpperCase();

    // Allow status change from "Removing..." to "REMOVE"
    if (statusBadge.textContent === 'Removing...' && status !== 'REMOVE') {
        return;
    }

    if (status === 'REMOVING...') {
        statusClass = 'badge bg-warning text-dark';
        displayStatus = 'Removing...';
        if (buttonsContainer) {
            buttonsContainer.innerHTML = '';
        }
        // Stop any status checking
        const installedId = appCard.dataset.installedId;
        if (installedId) {
            const intervalId = refreshIntervals.get(installedId);
            if (intervalId) {
                clearInterval(intervalId);
                refreshIntervals.delete(installedId);
            }
        }
    } else if (status === 'REMOVE') {
        statusClass = 'badge bg-secondary text-white';
        displayStatus = 'Removed';
        if (buttonsContainer) {
            buttonsContainer.innerHTML = '';
        }
        // Stop any status checking
        const installedId = appCard.dataset.installedId;
        if (installedId) {
            const intervalId = refreshIntervals.get(installedId);
            if (intervalId) {
                clearInterval(intervalId);
                refreshIntervals.delete(installedId);
            }
        }
    } else if (status === 'PENDING' || status === 'INIT') {
        statusClass = 'badge bg-warning text-dark';
        displayStatus = 'In Progress..';
        if (buttonsContainer) {
            buttonsContainer.innerHTML = ingressUrl ? `
                <button class="btn btn-primary btn-sm" disabled>
                    <i class="bi bi-box-arrow-up-right"></i> Open App
                </button>
            ` : '';
        }
    } else if (status === 'COMPLETED' || status === 'DONE') {
        statusClass = 'badge bg-success text-white';
        displayStatus = 'Running';
        if (buttonsContainer) {
            const openAppButton = ingressUrl ? `
                <a href="${ingressUrl}" target="_blank" class="btn btn-primary btn-sm">
                    <i class="bi bi-box-arrow-up-right"></i> Open App
                </a>
            ` : '';
            
            buttonsContainer.innerHTML = `
                ${openAppButton}
                <button class="btn btn-danger btn-sm" 
                        data-installed-id="${appCard.dataset.installedId}"
                        onclick="removeApp('${appCard.dataset.installedId}')">
                    <i class="bi bi-trash"></i> Remove App
                </button>
            `;
        }
    } else {
        statusClass = 'badge bg-secondary text-white';
        displayStatus = status.toLowerCase();
        if (buttonsContainer) {
            buttonsContainer.innerHTML = '';
        }
    }

    statusBadge.className = `${statusClass} app-status`;
    statusBadge.style.borderRadius = '4px';
    statusBadge.style.padding = '4px 8px';
    statusBadge.textContent = displayStatus;
}

// Function to check app status
async function checkAppStatus(installedId, appElement) {
    // Skip if app is being removed
    if (removingApps.has(installedId)) {
        return;
    }

    try {
        if (!appElement) return;

        const statusBadge = appElement.querySelector('.app-status');
        if (!statusBadge) return;

        // Skip if currently removing or removed
        const currentStatus = statusBadge.textContent;
        if (currentStatus === 'Removing...' || currentStatus === 'Removed') {
            return;
        }

        const user = firebase.auth().currentUser;
        if (!user) return;

        const token = await user.getIdToken();
        
        const response = await fetch(`/store/installation-status/${installedId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) return;

        const data = await response.json();
        
        // Double check if app is still not being removed
        if (removingApps.has(installedId)) {
            return;
        }

        // Extract ingress URL
        let ingressUrl = '';
        if (data.deployment_details) {
            const details = Array.isArray(data.deployment_details) ? data.deployment_details : [data.deployment_details];
            const ingress = details.find(detail => 
                detail?.resource?.kind === 'Ingress' && 
                detail?.raw_response?.spec?.rules?.[0]?.host
            );
            if (ingress) {
                ingressUrl = `https://${ingress.raw_response.spec.rules[0].host}`;
            }
        }

        // Only update if not being removed and not in a removal state
        if (!removingApps.has(installedId) && 
            statusBadge.textContent !== 'Removing...' && 
            statusBadge.textContent !== 'Removed') {
            updateAppStatusUI(appElement, data.status || '', ingressUrl);
        }

    } catch (error) {
        console.error('Error checking status:', error);
    }
}

// Function to remove an installed app
async function removeApp(installedId) {
    if (!confirm('WARNING: This Application will be DELETED, and All Data will be Destroyed.\n\nAre you sure you want to proceed?')) {
        return;
    }

    // Stop all periodic refreshes immediately
    clearInterval(window.fetchAppsInterval);

    const appCard = document.querySelector(`[data-installed-id="${installedId}"]`);
    if (!appCard) {
        console.error('App card not found for ID:', installedId);
        return;
    }

    // Add to removing set immediately
    removingApps.add(installedId);

    // Clear any existing interval
    const intervalId = refreshIntervals.get(installedId);
    if (intervalId) {
        clearInterval(intervalId);
        refreshIntervals.delete(installedId);
    }

    // Get references to UI elements
    const statusBadge = appCard.querySelector('.app-status');
    const buttonsContainer = appCard.querySelector('.d-flex.gap-2.mt-2');

    try {
        // Set status to Removing... immediately
        if (statusBadge) {
            statusBadge.className = 'badge bg-warning text-dark app-status';
            statusBadge.style.borderRadius = '4px';
            statusBadge.style.padding = '4px 8px';
            statusBadge.textContent = 'Removing...';
        }

        // Clear buttons immediately
        if (buttonsContainer) {
            buttonsContainer.innerHTML = '';
        }

        const user = firebase.auth().currentUser;
        if (!user) {
            throw new Error('User not authenticated');
        }

        const token = await user.getIdToken();

        // Get installation details
        const response = await fetch(`/store/installation-status/${installedId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch installation details: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const deploymentDetails = Array.isArray(data.deployment_details) ? 
            data.deployment_details : [data.deployment_details];

        // Find resources
        const deployment = deploymentDetails.find(detail => detail.resource_type === 'Deployment');
        const service = deploymentDetails.find(detail => detail.resource_type === 'Service');
        const ingress = deploymentDetails.find(detail => detail.resource_type === 'Ingress');
        const pvc = deploymentDetails.find(detail => detail.resource_type === 'PersistentVolumeClaim');

        // Prepare removal request
        const removalBody = {
            client_namespace: data.namespace,
            appDeployment: deployment?.resource?.name || '',
            appService: service?.resource?.name || '',
            appIngress: ingress?.resource?.name || '',
            appPersistentVolumeClaim: pvc?.resource?.name || ''
        };

        console.log('Sending removal request:', removalBody);

        // Call delete deployment API
        const deleteResponse = await fetch('/store/proxy-delete-deployment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(removalBody)
        });

        const deleteResponseData = await deleteResponse.json();
        console.log('Delete deployment response:', deleteResponseData);

        if (!deleteResponse.ok) {
            throw new Error(deleteResponseData.error || deleteResponseData.message || `Failed to remove deployment: ${deleteResponse.status}`);
        }

        // Update UI to Removed status
        if (statusBadge) {
            statusBadge.className = 'badge bg-secondary text-white app-status';
            statusBadge.textContent = 'Removed';
        }

        // Update installation status in backend
        const updateResponse = await fetch(`/store/installation/${installedId}/remove`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!updateResponse.ok) {
            throw new Error(`Failed to update installation status: ${updateResponse.status}`);
        }

        // Restart periodic refresh after successful removal
        window.fetchAppsInterval = setInterval(fetchInstalledApps, 30000);

    } catch (error) {
        console.error('Error removing app:', error);
        
        // Remove from removing set only on error
        removingApps.delete(installedId);
        
        // On error, update UI and re-enable button
        if (statusBadge) {
            statusBadge.className = 'badge bg-danger text-white app-status';
            statusBadge.textContent = 'Remove Failed';
        }

        if (buttonsContainer) {
            buttonsContainer.innerHTML = `
                <button class="btn btn-danger btn-sm" 
                        data-installed-id="${installedId}"
                        onclick="removeApp('${installedId}')">
                    <i class="bi bi-trash"></i> Retry Remove
                </button>
            `;
        }

        // Restart periodic refresh after error
        window.fetchAppsInterval = setInterval(fetchInstalledApps, 30000);

        alert(`Failed to remove application: ${error.message}`);
    }
}

// Function to initialize status checking for specific apps
function initializeStatusChecking(appsToMonitor = null) {
    const appCards = appsToMonitor || document.querySelectorAll('.card[data-installed-id]');
    appCards.forEach(appCard => {
        const statusBadge = appCard.querySelector('.app-status');
        const status = statusBadge?.textContent.trim();
        const installedId = appCard.dataset.installedId;
        
        // Only monitor apps that are not in final states and not being removed
        if (status !== 'Running' && 
            status !== 'Removed' && 
            status !== 'Removing...' && 
            status !== 'Remove Failed' &&
            !removingApps.has(installedId)) {
            
            // Clear any existing interval
            const existingInterval = refreshIntervals.get(installedId);
            if (existingInterval) {
                clearInterval(existingInterval);
                refreshIntervals.delete(installedId);
            }

            // Start immediate check and set up interval
            checkAppStatus(installedId, appCard);
            const intervalId = setInterval(() => checkAppStatus(installedId, appCard), 5000);
            refreshIntervals.set(installedId, intervalId);
        }
    });
}

document.addEventListener('DOMContentLoaded', async function() {
    try {
        const firebaseConfig = JSON.parse(document.querySelector('[data-firebase-config]').dataset.firebaseConfig);
        if (!firebase.apps?.length) {
            firebase.initializeApp(firebaseConfig);
        }

        // Single auth state listener
        firebase.auth().onAuthStateChanged(async (user) => {
            if (user) {
                // Initial fetch of installed apps
                await fetchInstalledApps();
                // Set up periodic refresh with longer interval
                window.fetchAppsInterval = setInterval(fetchInstalledApps, 30000);
            } else {
                window.location.href = '/';
            }
        });

    } catch (error) {
        console.error('Firebase initialization error:', error);
        return;
    }

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

            if (noResultsMessage) {
                noResultsMessage.style.display = hasVisibleCards ? 'none' : 'block';
            }
        });
    }
}); 