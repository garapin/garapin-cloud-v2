// Debounce function to limit API calls
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Function to get best Docker image based on pull count
async function getBestDockerImage(baseImageName) {
    try {
        const response = await fetch(`/api/docker-hub/search?query=${encodeURIComponent(baseImageName)}`);
        if (!response.ok) {
            throw new Error('Failed to fetch Docker Hub data');
        }

        const data = await response.json();
        if (!data.results || data.results.length === 0) {
            return null;
        }

        // Sort by pull count and get the most popular one
        const bestImage = data.results.sort((a, b) => b.pull_count - a.pull_count)[0];
        console.log('Found best image:', bestImage);
        return bestImage;
    } catch (error) {
        console.error('Error fetching Docker Hub data:', error);
        return null;
    }
}

// Function to validate and suggest version
async function validateBaseImage(baseImageName) {
    const baseImageInput = document.getElementById('baseImageName');
    const versionInput = document.getElementById('version');
    const errorDiv = document.getElementById('baseImageError');
    
    if (!baseImageName) {
        errorDiv.style.display = 'none';
        return;
    }

    try {
        const bestImage = await getBestDockerImage(baseImageName);
        if (bestImage) {
            if (!versionInput.value) {
                versionInput.value = `${bestImage.repo_name}:latest`;
            } else if (!versionInput.value.includes('/')) {
                versionInput.value = `${bestImage.repo_name}:${versionInput.value.replace(/^.*:/, '')}`;
            }

            errorDiv.style.display = 'block';
            errorDiv.style.color = '#198754';
            errorDiv.textContent = `Using image: ${bestImage.repo_name} (${bestImage.pull_count.toLocaleString()} pulls)`;
            return;
        }

        errorDiv.style.display = 'block';
        errorDiv.style.color = '#198754';
        errorDiv.textContent = `Checking image: ${baseImageName}`;

    } catch (error) {
        console.error('Error validating base image:', error);
        errorDiv.style.display = 'block';
        errorDiv.style.color = '#dc3545';
        errorDiv.textContent = 'Error checking Docker Hub';
    }
}

// Function to format image source
function formatImageSource(imageName) {
    // If it contains a slash, it's a non-official image (e.g., bitnami/laravel)
    if (imageName.includes('/')) {
        return imageName;
    }
    // If it's an official image, prefix with library/
    return `library/${imageName}`;
}

// Function to handle redeploy of base image
async function redeployImage(baseImageData, buttonElement) {
    const originalContent = buttonElement.innerHTML;
    let loadingModal = null;

    try {
        console.log('Starting redeploy process...', baseImageData);
        
        // Get current user first
        const currentUser = firebase.auth().currentUser;
        if (!currentUser) throw new Error('User not authenticated');

        // Initialize modal
        const loadingModalElement = document.getElementById('loadingModal');
        if (!loadingModalElement) throw new Error('Loading modal not found');
        
        loadingModal = bootstrap.Modal.getOrCreateInstance(loadingModalElement);
        
        // Disable button and show loading state
        buttonElement.disabled = true;
        buttonElement.innerHTML = '<i class="bi bi-arrow-repeat spin me-1"></i>Rebuilding...';
        
        // Show loading modal
        document.getElementById('loadingModalMessage').textContent = 'Image is rebuilding, please wait...';
        loadingModal.show();

        console.log('Base image details for redeploy:', baseImageData);

        // Get the database server information from the base image card
        const baseImageCard = buttonElement.closest('.card');
        const databaseServer = baseImageCard.querySelector('.badge.bg-info')?.textContent.trim();
        console.log('Database server requirement:', databaseServer);

        // Extract and format image source from version
        const imageSource = formatImageSource(baseImageData.version.split(':')[0]);
        const version = baseImageData.version.split(':')[1] || 'latest';
        const fullVersion = `${imageSource}:${version}`;

        // Prepare request body using passed data
        const requestBody = {
            appName: baseImageData.base_image.substring(0, 4),
            base_image_name: baseImageData.base_image,
            imageSource: imageSource, // Already formatted
            version: fullVersion,
            StorageSize: baseImageData.StorageSize || "1Gi",
            user_id: currentUser.uid,
            base_images_id: baseImageData._id,  // Reuse existing ID
            database_server: databaseServer || null
        };

        console.log('Sending redeploy request:', requestBody);

        // Get the CREATE_BASE_IMAGE_AI_URL from the modal's data attribute
        const createUrl = document.getElementById('aiBuilderModal').dataset.createUrl;
        
        // Call deployment API
        const redeployResponse = await fetch(createUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'garapin-cloud-frontend': '881b5b63f7ad48def15bee384e3af18eec73f46b96aea65bd79a7c975c92c928'
            },
            body: JSON.stringify(requestBody)
        });

        if (!redeployResponse.ok) {
            const errorData = await redeployResponse.json();
            console.error('Deployment API error:', {
                status: redeployResponse.status,
                response: errorData
            });
            throw new Error(`Deployment failed: ${errorData.message || 'Unknown error'}`);
        }

        const result = await redeployResponse.json();
        console.log('Redeploy response:', result);

        // Check if rebuild was successful
        // The API returns an array with the rebuild details
        if (Array.isArray(result) && result.length > 0) {
            // Get token for authentication
            const token = await currentUser.getIdToken(true);

            // Update loading message
            document.getElementById('loadingModalMessage').textContent = 'Updating associated applications...';

            // Update applications that use this base image
            const updateResponse = await fetch('/api/applications/update-by-base-image', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    baseImageId: baseImageData._id,
                    userId: currentUser.uid,
                    databaseServer: databaseServer || null
                })
            });

            if (!updateResponse.ok) {
                const updateError = await updateResponse.json();
                throw new Error(updateError.error || 'Failed to update applications');
            }

            const updateResult = await updateResponse.json();
            console.log('Applications update result:', updateResult);

            // Update modal message and close after delay
            document.getElementById('loadingModalMessage').textContent = 
                `Base image rebuild completed successfully! Updated ${updateResult.updatedCount} application(s).`;
            setTimeout(() => {
                loadingModal.hide();
                window.location.reload();
            }, 1500);
        } else if (result.message === 'Error in workflow') {
            throw new Error('Deployment workflow failed. Please try again or contact support if the issue persists.');
        } else {
            console.error('Invalid rebuild response:', result);
            throw new Error('Base image rebuild response was not in the expected format. Please check the logs for details.');
        }

    } catch (error) {
        console.error('Error rebuilding base image:', error);
        if (loadingModal) {
            document.getElementById('loadingModalMessage').textContent = `Error: ${error.message}`;
            setTimeout(() => loadingModal.hide(), 2000);
        }
        buttonElement.disabled = false;
        buttonElement.innerHTML = originalContent;
    }
}

// Handler function for rebuild button clicks
window.handleRebuildClick = function() {
    console.log('handleRebuildClick called');
    try {
        const imageData = JSON.parse(this.dataset.image);
        console.log('Rebuild clicked with data:', imageData);
        redeployImage(imageData, this);
    } catch (error) {
        console.error('Error handling rebuild click:', error);
    }
}

// Function to initialize rebuild buttons
function initializeRebuildButtons() {
    console.log('Initializing rebuild buttons');
    document.querySelectorAll('.rebuild-btn').forEach(button => {
        console.log('Found rebuild button:', button.dataset.image);
        // Remove existing listener if any
        button.removeEventListener('click', handleRebuildClick);
        // Add new listener
        button.addEventListener('click', handleRebuildClick);
    });
}

// Add event listener after document is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Handle base image input
    const baseImageInput = document.getElementById('baseImageName');
    const versionInput = document.getElementById('version');
    
    if (baseImageInput) {
        // Add debounced validation
        baseImageInput.addEventListener('input', debounce((e) => {
            validateBaseImage(e.target.value.trim().toLowerCase());
        }, 500));

        // Clear error and set version
        baseImageInput.addEventListener('input', function() {
            document.getElementById('baseImageError').style.display = 'none';
            const baseImageName = this.value.trim().toLowerCase();
            if (baseImageName) {
                versionInput.value = `${baseImageName}:latest`;
            } else {
                versionInput.value = '';
            }
        });
    }

    // Initialize rebuild buttons
    initializeRebuildButtons();

    // Initialize tooltips
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });

    // Initialize search functionality
    const searchInput = document.getElementById('searchBaseImages');
    if (searchInput) {
        searchInput.addEventListener('input', handleSearch);
    }

    // Initialize storage size slider
    const storageSlider = document.getElementById('storageSize');
    if (storageSlider) {
        storageSlider.addEventListener('input', function(e) {
            document.getElementById('storageSizeValue').textContent = e.target.value;
        });
    }
});

// Handle search functionality
function handleSearch(event) {
    const searchTerm = event.target.value.toLowerCase();
    const cards = document.querySelectorAll('#baseImagesContainer .col');

    cards.forEach(card => {
        const title = card.querySelector('.card-title').textContent.toLowerCase();
        const description = card.querySelector('.card-text').textContent.toLowerCase();
        
        if (title.includes(searchTerm) || description.includes(searchTerm)) {
            card.style.display = '';
        } else {
            card.style.display = 'none';
        }
    });
}

async function insertApplication(baseImageId, userId, publisherId) {
    try {
        // Validate inputs
        if (!baseImageId) {
            throw new Error('baseImageId is required for insertApplication');
        }
        if (!userId) {
            throw new Error('userId is required for insertApplication');
        }
        if (!publisherId) {
            throw new Error('publisherId is required for insertApplication');
        }

        const token = await firebase.auth().currentUser.getIdToken(true);

        console.log('Inserting application with validated params:', {
            baseImageId: baseImageId,
            userId: userId,
            publisherId: publisherId
        });

        const response = await fetch('/api/applications/insert', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                baseImageId: baseImageId,
                userId: userId,
                publisherId: publisherId
            })
        });

        const responseData = await response.json();
        
        if (!response.ok) {
            console.error('Server error response:', responseData);
            throw new Error(responseData.error || 'Failed to insert application');
        }

        console.log('Application inserted successfully:', responseData);
        return responseData;
    } catch (error) {
        console.error('Error in insertApplication:', error);
        console.error('Error details:', {
            baseImageId: baseImageId,
            userId: userId,
            publisherId: publisherId
        });
        throw error;
    }
}

// Function to generate MongoDB-style ObjectId
function generateObjectId() {
    const timestamp = Math.floor(new Date().getTime() / 1000).toString(16);
    const machineId = Math.floor(Math.random() * 16777216).toString(16).padStart(6, '0');
    const processId = Math.floor(Math.random() * 65536).toString(16).padStart(4, '0');
    const counter = Math.floor(Math.random() * 16777216).toString(16).padStart(6, '0');
    return timestamp + machineId + processId + counter;
}

// Handle building a base image
async function buildImage() {
    const baseImageName = document.getElementById('baseImageName').value.trim().toLowerCase();
    const storageSize = document.getElementById('storageSize').value;
    const versionInput = document.getElementById('version').value.trim();

    if (!baseImageName) {
        showToast('Please enter a base image name', 'error');
        return;
    }

    document.getElementById('baseImageError').style.display = 'none';

    const buildButton = document.querySelector('#aiBuilderModal .btn-primary');
    const originalButtonText = buildButton.innerHTML;
    buildButton.disabled = true;
    buildButton.innerHTML = '<i class="bi bi-arrow-repeat spin me-1"></i>Validating...';

    try {
        const bestImage = await getBestDockerImage(baseImageName);
        let imageSource = bestImage ? bestImage.repo_name : baseImageName;
        let version = versionInput.includes(':') ? versionInput.split(':')[1] : 'latest';
        
        // Format the image source correctly
        imageSource = formatImageSource(imageSource);
        const fullVersion = `${imageSource}:${version}`;

        buildButton.innerHTML = '<i class="bi bi-arrow-repeat spin me-1"></i>Building...';

        const createUrl = document.getElementById('aiBuilderModal').dataset.createUrl;
        const currentUser = firebase.auth().currentUser;
        if (!currentUser) throw new Error('User not authenticated');
        const token = await currentUser.getIdToken(true);

        const generatedId = generateObjectId();
        const requestBody = {
            appName: baseImageName.substring(0, 4),
            base_image_name: baseImageName,
            imageSource: imageSource, // Already formatted
            version: fullVersion,
            StorageSize: parseInt(storageSize) + "Gi",
            user_id: currentUser.uid,
            base_images_id: generatedId
        };

        console.log('Sending request to CREATE_BASE_IMAGE_AI_URL:', requestBody);

        const response = await fetch(createUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'garapin-cloud-frontend': '881b5b63f7ad48def15bee384e3af18eec73f46b96aea65bd79a7c975c92c928'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to create base image');
        }

        const baseImageResult = await response.json();
        console.log('Base image API response:', {
            fullResponse: baseImageResult,
            generatedId: generatedId
        });

        // Use the generated ID since we know this is the ID that will be used in the database
        const baseImageId = generatedId;
        if (!baseImageId) {
            console.error('Base image response structure:', baseImageResult);
            throw new Error('Base image ID is missing from the response');
        }

        const userResponse = await fetch('/auth/user', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                provider_uid: currentUser.uid
            })
        });
        const userData = await userResponse.json();

        console.log('User data:', userData);

        // Debug logging
        console.log('Values for insertApplication:', {
            baseImageId: baseImageId,
            baseImageResult: baseImageResult,
            userId: currentUser.uid,
            publisherId: userData.user._id,
            userData: userData
        });

        if (!userData.user._id) {
            throw new Error('Publisher ID is missing from user data');
        }

        const applicationResult = await insertApplication(
            baseImageId,
            currentUser.uid,
            userData.user._id
        );

        console.log('Application created successfully:', applicationResult);
        showToast('Application created successfully', 'success');
        showToast('Base image rebuild initiated successfully', 'success');

        setTimeout(() => {
            window.location.reload();
        }, 1500);

    } catch (error) {
        console.error('Error creating application:', error);
        showToast(`Error creating application: ${error.message}`, 'error');
        buildButton.disabled = false;
        buildButton.innerHTML = originalButtonText;
    }
}

// Show toast notification
function showToast(message, type = 'info', autoHide = true) {
    const toast = document.getElementById('baseImageToast');
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
    
    const bsToast = new bootstrap.Toast(toast, {
        delay: autoHide ? (type === 'error' ? 5000 : 3000) : Infinity,
        autohide: autoHide
    });
    bsToast.show();
    return bsToast;
}

// Add CSS for spinner
const style = document.createElement('style');
style.textContent = `
    .spin {
        animation: spin 1s linear infinite;
    }
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
`;
document.head.appendChild(style);
 