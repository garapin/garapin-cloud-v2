document.addEventListener('DOMContentLoaded', function() {
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

    // Clear error message when user types in base image name
    const baseImageInput = document.getElementById('baseImageName');
    const versionInput = document.getElementById('version');
    if (baseImageInput && versionInput) {
        baseImageInput.addEventListener('input', function() {
            document.getElementById('baseImageError').style.display = 'none';
            // Set version with base image name and :latest
            const baseImageName = this.value.trim().toLowerCase();
            if (baseImageName) {
                versionInput.value = `${baseImageName}:latest`;
            } else {
                versionInput.value = '';
            }
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

// Handle building a base image
async function buildImage() {
    const baseImageName = document.getElementById('baseImageName').value.trim().toLowerCase();
    const storageSize = document.getElementById('storageSize').value;
    const versionValue = document.getElementById('version').value.trim();

    // Enhanced input validation
    if (!baseImageName) {
        showToast('Please enter a base image name', 'error');
        return;
    }

    // Hide any previous error message
    document.getElementById('baseImageError').style.display = 'none';

    // Show loading state
    const buildButton = document.querySelector('#aiBuilderModal .btn-primary');
    const originalButtonText = buildButton.innerHTML;
    buildButton.disabled = true;
    buildButton.innerHTML = '<i class="bi bi-arrow-repeat spin me-1"></i>Validating...';

    try {
        // Extract version number for validation
        const versionForValidation = versionValue.includes(':') ? 
            versionValue.split(':')[1] : 
            versionValue || 'latest';

        // Check if image exists in Docker Hub via our proxy
        const proxyUrl = `/api/docker-hub/validate/${baseImageName}/${versionForValidation}`;
        const dockerResponse = await fetch(proxyUrl);

        if (dockerResponse.status === 404) {
            // Show error message below input field
            document.getElementById('baseImageError').style.display = 'block';
            buildButton.disabled = false;
            buildButton.innerHTML = originalButtonText;
            return;
        }

        if (!dockerResponse.ok) {
            // Handle timeout errors specifically
            if (dockerResponse.status === 504) {
                showToast('Connection timed out while checking Docker Hub. Please try again.', 'error');
            } else {
                showToast('Error checking Docker Hub. Please try again.', 'error');
            }
            buildButton.disabled = false;
            buildButton.innerHTML = originalButtonText;
            return;
        }

        const dockerData = await dockerResponse.json();

        // Check if ARM architecture is supported
        const hasArmSupport = dockerData.images?.some(img => 
            (img.architecture === 'arm64' && img.variant === 'v8') || 
            (img.architecture === 'arm' && img.variant === 'v7') ||
            (img.architecture === 'arm' && img.variant === 'v5')
        );

        if (!hasArmSupport) {
            showToast(`Image '${baseImageName}:${versionValue}' does not support ARM architecture`, 'error');
            buildButton.disabled = false;
            buildButton.innerHTML = originalButtonText;
            return;
        }

        // Image exists and supports ARM, proceed with building
        buildButton.innerHTML = '<i class="bi bi-arrow-repeat spin me-1"></i>Building...';

        // Get the URL from the modal's data attribute
        const createUrl = document.getElementById('aiBuilderModal').dataset.createUrl;

        // Prepare request body
        const requestBody = {
            appName: baseImageName.substring(0, 4),
            base_image_name: baseImageName,
            version: versionValue,
            StorageSize: parseInt(storageSize),
            user_id: firebase.auth().currentUser.uid
        };

        const response = await fetch(createUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'garapin-cloud-frontend': '881b5b63f7ad48def15bee384e3af18eec73f46b96aea65bd79a7c975c92c928'
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();
        
        if (response.ok) {
            // Success case
            showToast(`Successfully initiated build for ${baseImageName}:${versionValue}`, 'success');
            
            // Close modal with slight delay to show success state
            setTimeout(() => {
                const modal = bootstrap.Modal.getInstance(document.getElementById('aiBuilderModal'));
                modal.hide();
                
                // Reset form
                document.getElementById('aiBuilderForm').reset();
                document.getElementById('storageSizeValue').textContent = '1';
                
                // Refresh page after modal is closed
                setTimeout(() => window.location.reload(), 500);
            }, 1000);
        } else {
            // Detailed error message
            const errorMessage = data.message || 'Failed to build base image';
            showToast(`Error: ${errorMessage}. Please try again.`, 'error');
            buildButton.disabled = false;
            buildButton.innerHTML = originalButtonText;
        }
    } catch (error) {
        console.error('Error building base image:', error);
        // More specific error message based on error type
        let errorMessage = 'An error occurred while building the base image';
        if (error.name === 'TypeError' && !window.navigator.onLine) {
            errorMessage = 'Network error. Please check your internet connection.';
        } else if (error.name === 'AbortError') {
            errorMessage = 'Request timed out. Please try again.';
        }
        showToast(errorMessage, 'error');
        buildButton.disabled = false;
        buildButton.innerHTML = originalButtonText;
    }
}

// Show toast notification
function showToast(message, type = 'info') {
    const toast = document.getElementById('baseImageToast');
    const toastBody = toast.querySelector('.toast-body');
    
    // Set message and style based on type
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
    
    // Show the toast with longer duration for errors
    const bsToast = new bootstrap.Toast(toast, {
        delay: type === 'error' ? 5000 : 3000
    });
    bsToast.show();
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

async function redeployImage(baseImageName) {
    try {
        // Create modal element properly
        const modalElement = document.createElement('div');
        modalElement.className = 'modal fade';
        modalElement.innerHTML = `
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-body text-center p-4">
                        <div class="spinner-border text-primary mb-3" role="status">
                            <span class="visually-hidden">Loading...</span>
                        </div>
                        <h5>Rebuilding Base Image</h5>
                        <p class="mb-0">Please wait while we rebuild your base image. This may take a few minutes.</p>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modalElement);
        
        // Create and show modal
        const modal = new bootstrap.Modal(modalElement);
        modalElement.addEventListener('hide.bs.modal', event => {
            event.preventDefault(); // Prevent modal from being closed
        });
        modal.show();

        // Get the base image data
        const baseImage = await fetch(`/api/base-images/${baseImageName}`).then(r => r.json());
        if (!baseImage) throw new Error('Base image not found');

        // Extract storage size from storageImages configuration
        const storageImages = JSON.parse(baseImage.storageImages);
        const storageSize = storageImages.spec.resources.requests.storage;

        // Delete the existing base image
        const deleteResponse = await fetch(`/api/base-images/${baseImage._id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${await firebase.auth().currentUser.getIdToken()}`
            }
        });
        if (!deleteResponse.ok) throw new Error('Failed to delete base image');

        // Get the create URL from the modal's data attribute
        const createUrl = document.getElementById('aiBuilderModal').dataset.createUrl;

        // Extract image source from version
        let imageSource = baseImage.version;
        if (imageSource.includes(':')) {
            imageSource = imageSource.split(':')[0];
            // Add 'library/' prefix for official images
            if (!imageSource.includes('/')) {
                imageSource = 'library/' + imageSource;
            }
        }

        // Prepare request body for recreation
        const requestBody = {
            appName: baseImage.base_image.substring(0, 4),
            base_image_name: baseImage.base_image,
            imageSource: imageSource,
            version: baseImage.version,
            StorageSize: storageSize,
            user_id: firebase.auth().currentUser.uid
        };

        // Create new base image
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
            throw new Error(errorData.error || 'Failed to create new base image');
        }

        // Show success message
        showToast('Base image redeployment initiated successfully', 'success');

        // Refresh the page after a short delay
        setTimeout(() => {
            window.location.reload();
        }, 1500);

    } catch (error) {
        console.error('Error redeploying base image:', error);
        showToast('Failed to redeploy base image: ' + error.message, 'error');
    }
}
 