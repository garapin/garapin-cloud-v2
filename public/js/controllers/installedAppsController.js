// Store refresh intervals globally
const refreshIntervals = new Map();

// Function to update app status UI
function updateAppStatusUI(appCard, status, ingressUrl) {
    const statusBadge = appCard.querySelector('.app-status');
    const buttonsContainer = appCard.querySelector('.d-flex.gap-2.mt-2');
    
    if (statusBadge) {
        let statusClass = '';
        let displayStatus = '';
        
        status = status.toUpperCase();
        console.log('Updating UI for status:', status);
        
        if (status === 'PENDING' || status === 'INIT') {
            statusClass = 'badge bg-warning text-dark';
            displayStatus = 'In Progress..';
            // Show only disabled Open App button if ingress exists
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
            // Show both Open App (if ingress exists) and Remove App buttons
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
        } else if (status === 'REMOVE' || status === 'REMOVING...') {
            statusClass = 'badge bg-secondary text-white';
            displayStatus = status === 'REMOVING...' ? 'Removing...' : 'remove';
            // Hide all buttons
            if (buttonsContainer) {
                buttonsContainer.innerHTML = '';
            }
        } else {
            statusClass = 'badge bg-secondary text-white';
            displayStatus = status.toLowerCase();
            // Hide all buttons for non-standard statuses
            if (buttonsContainer) {
                buttonsContainer.innerHTML = '';
            }
        }

        statusBadge.className = `${statusClass} app-status`;
        statusBadge.style.borderRadius = '4px';
        statusBadge.style.padding = '4px 8px';
        statusBadge.textContent = displayStatus;
        
        console.log('UI updated:', { status, displayStatus, hasButtons: !!buttonsContainer?.innerHTML });
    }
}

// Function to check app status
async function checkAppStatus(installedId, appElement) {
    try {
        // Get Firebase token
        const user = firebase.auth().currentUser;
        if (!user) {
            return;
        }

        const token = await user.getIdToken();
        
        // Make API call to check status
        const response = await fetch(`/store/installation-status/${installedId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch status');
        }

        const data = await response.json();
        console.log('Status check response:', {
            installedId,
            status: data.status,
            details: data
        });
        
        // Extract ingress URL from deployment details
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

        const currentStatus = (data.status || '').toUpperCase();
        console.log('Current status:', currentStatus);

        // Update UI based on status
        updateAppStatusUI(appElement, currentStatus, ingressUrl);

        // Always clear existing interval if any
        const existingInterval = refreshIntervals.get(installedId);
        if (existingInterval) {
            clearInterval(existingInterval);
            refreshIntervals.delete(installedId);
        }

        // Keep monitoring if not in a final state
        const finalStates = ['COMPLETED', 'DONE', 'REMOVE', 'FAILED'];
        if (!finalStates.includes(currentStatus)) {
            console.log('Status not final, setting up new monitoring interval for:', installedId);
            const intervalId = setInterval(() => checkAppStatus(installedId, appElement), 2000);
            refreshIntervals.set(installedId, intervalId);
        } else {
            console.log('Final status reached for:', installedId, 'with status:', currentStatus);
        }

    } catch (error) {
        console.error('Error checking status:', error);
    }
}

// Function to remove an installed app
async function removeApp(installedId) {
    // Show confirmation dialog
    if (!confirm('WARNING: This Application will be DELETED, and All Data will be Destroyed.\n\nAre you sure you want to proceed?')) {
        return;
    }

    try {
        // Get Firebase token
        const user = firebase.auth().currentUser;
        if (!user) {
            console.error('No user logged in');
            return;
        }

        const token = await user.getIdToken();
        
        // First, get the installation details
        const response = await fetch(`/store/installation-status/${installedId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch installation details');
        }

        const data = await response.json();
        console.log('Installation details:', JSON.stringify(data, null, 2));

        // Extract deployment details
        const deploymentDetails = Array.isArray(data.deployment_details) ? 
            data.deployment_details : [data.deployment_details];

        // Find resources by type
        const deployment = deploymentDetails.find(detail => detail.resource_type === 'Deployment');
        const service = deploymentDetails.find(detail => detail.resource_type === 'Service');
        const ingress = deploymentDetails.find(detail => detail.resource_type === 'Ingress');
        const pvc = deploymentDetails.find(detail => detail.resource_type === 'PersistentVolumeClaim');

        // Log each resource details for debugging
        console.log('Found resources:');
        console.log('Deployment:', deployment ? deployment.resource.name : 'Not found');
        console.log('Service:', service ? service.resource.name : 'Not found');
        console.log('Ingress:', ingress ? ingress.resource.name : 'Not found');
        console.log('PVC:', pvc ? pvc.resource.name : 'Not found');

        // Prepare removal request body
        const removalBody = {
            client_namespace: data.namespace,
            appDeployment: deployment?.resource?.name || '',
            appService: service?.resource?.name || '',
            appIngress: ingress?.resource?.name || '',
            appPersistentVolumeClaim: pvc?.resource?.name || ''
        };

        console.log('Sending removal request with body:', JSON.stringify(removalBody, null, 2));

        // Update UI to show removal is in progress
        const appCard = document.querySelector(`[data-installed-id="${installedId}"]`);
        if (appCard) {
            const statusBadge = appCard.querySelector('.app-status');
            if (statusBadge) {
                statusBadge.className = 'badge bg-warning text-dark app-status';
                statusBadge.textContent = 'Removing...';
            }
            
            // Disable the remove button
            const removeButton = appCard.querySelector('.remove-app-btn');
            if (removeButton) {
                removeButton.disabled = true;
            }
        }

        // Call the proxy endpoint for delete deployment
        const deleteResponse = await fetch('/store/proxy-delete-deployment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(removalBody)
        });

        let errorMessage = '';
        try {
            const responseData = await deleteResponse.json();
            errorMessage = responseData.error || responseData.message || 'Unknown error';
        } catch (e) {
            const responseText = await deleteResponse.text();
            errorMessage = responseText;
        }

        if (!deleteResponse.ok) {
            throw new Error(`Failed to remove deployment: ${errorMessage}`);
        }

        // Update installation status to REMOVE
        const updateResponse = await fetch(`/store/installation/${installedId}/remove`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!updateResponse.ok) {
            throw new Error('Failed to update installation status');
        }

        // Update UI to show removal is complete using the new function
        if (appCard) {
            updateAppStatusUI(appCard, 'remove', null);
        }

        console.log('Application removal completed successfully');

    } catch (error) {
        console.error('Error removing app:', error);
        
        // Update UI to show error using the new function
        if (appCard) {
            updateAppStatusUI(appCard, 'Remove Failed', null);
            
            // Re-enable the remove button
            const buttonsContainer = appCard.querySelector('.d-flex.gap-2.mt-2');
            if (buttonsContainer) {
                const removeButton = buttonsContainer.querySelector('.btn-danger');
                if (removeButton) {
                    removeButton.disabled = false;
                }
            }
        }

        alert('Failed to remove application: ' + error.message);
    }
}

// Function to initialize status checking for all pending apps
function initializeStatusChecking() {
    const appCards = document.querySelectorAll('.card[data-installed-id]');
    appCards.forEach(appCard => {
        const statusBadge = appCard.querySelector('.app-status');
        const status = statusBadge?.textContent.trim().toUpperCase();
        const installedId = appCard.dataset.installedId;
        
        // Start checking status for all apps that are not in final state
        if (status !== 'COMPLETED' && status !== 'DONE' && status !== 'REMOVE' && status !== 'FAILED') {
            // Clear any existing interval
            const existingInterval = refreshIntervals.get(installedId);
            if (existingInterval) {
                clearInterval(existingInterval);
                refreshIntervals.delete(installedId);
            }

            // Start immediate check and set up interval
            checkAppStatus(installedId, appCard);
            const intervalId = setInterval(() => checkAppStatus(installedId, appCard), 2000);
            refreshIntervals.set(installedId, intervalId);
            console.log('Started monitoring for app:', installedId, 'with status:', status);
        }
    });
}

document.addEventListener('DOMContentLoaded', async function() {
    // Initialize Firebase if needed
    try {
        const firebaseConfig = JSON.parse(document.querySelector('[data-firebase-config]').dataset.firebaseConfig);
        if (!firebase.apps?.length) {
            firebase.initializeApp(firebaseConfig);
        }

        // Wait for Firebase auth state
        firebase.auth().onAuthStateChanged((user) => {
            if (user) {
                console.log('User authenticated, initializing status checking...');
                // Start immediate monitoring
                initializeStatusChecking();
                // Also set up periodic refresh of status checking
                setInterval(initializeStatusChecking, 5000);
            } else {
                console.log('User not authenticated');
                window.location.href = '/';
            }
        });

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