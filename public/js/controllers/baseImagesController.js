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
        // Query Docker Hub API using registry.hub.docker.com with no-cors mode
        const searchResponse = await fetch(`https://registry.hub.docker.com/v2/search/repositories/?query=${baseImageName}`, {
            method: 'GET',
            mode: 'no-cors',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        // Since we're using no-cors, we need to handle the response differently
        if (baseImageName === 'laravel') {
            // For Laravel, we know bitnami/laravel is the best choice
            const imageSource = 'bitnami/laravel';
            
            // Update version input with suggestion
            if (!versionInput.value) {
                versionInput.value = `${imageSource}:latest`;
            } else if (!versionInput.value.includes('/')) {
                versionInput.value = `${imageSource}:${versionInput.value.replace(/^.*:/, '')}`;
            }

            // Show success message
            errorDiv.style.display = 'block';
            errorDiv.style.color = '#198754';
            errorDiv.textContent = `Using image: ${imageSource}`;
            return;
        }

        // For other images, show a generic message
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

// Add event listener after document is loaded
document.addEventListener('DOMContentLoaded', function() {
    const baseImageInput = document.getElementById('baseImageName');
    if (baseImageInput) {
        baseImageInput.addEventListener('input', debounce((e) => {
            validateBaseImage(e.target.value.trim().toLowerCase());
        }, 500));
    }
});

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
    const versionInput = document.getElementById('version').value.trim();

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
        let imageSource = '';
        let version = '';

        // Handle Laravel specifically
        if (baseImageName === 'laravel') {
            imageSource = 'bitnami/laravel';
            version = versionInput.includes(':') ? versionInput.split(':')[1] : 'latest';
        } else {
            // For other images, use the input as is
            imageSource = baseImageName;
            version = versionInput.includes(':') ? versionInput.split(':')[1] : 'latest';
        }

        const fullVersion = `${imageSource}:${version}`;

        // Image exists, proceed with building
        buildButton.innerHTML = '<i class="bi bi-arrow-repeat spin me-1"></i>Building...';

        // Get the URL from the modal's data attribute
        const createUrl = document.getElementById('aiBuilderModal').dataset.createUrl;

        // Prepare request body
        const requestBody = {
            appName: baseImageName.substring(0, 4),
            base_image_name: baseImageName,
            imageSource: imageSource,
            version: fullVersion,
            StorageSize: parseInt(storageSize) + "Gi",
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
            showToast(`Successfully initiated build for ${fullVersion}`, 'success');
            
            setTimeout(() => {
                const modal = bootstrap.Modal.getInstance(document.getElementById('aiBuilderModal'));
                modal.hide();
                
                document.getElementById('aiBuilderForm').reset();
                document.getElementById('storageSizeValue').textContent = '1';
                
                setTimeout(() => window.location.reload(), 500);
            }, 1000);
        } else {
            const errorMessage = data.message || 'Failed to build base image';
            showToast(`Error: ${errorMessage}. Please try again.`, 'error');
            buildButton.disabled = false;
            buildButton.innerHTML = originalButtonText;
        }
    } catch (error) {
        console.error('Error building base image:', error);
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

        // Get the current user's ID token
        const currentUser = firebase.auth().currentUser;
        if (!currentUser) throw new Error('User not authenticated');

        // Step 3: Delete the old base image
        const deleteResponse = await fetch(`/api/base-images/${baseImage._id}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${await currentUser.getIdToken()}`
            }
        });

        if (!deleteResponse.ok) {
            throw new Error('Failed to delete old base image');
        }

        // Format imageSource based on whether it's an official image
        let imageSource;
        if (baseImage.version) {
            const versionParts = baseImage.version.split(':')[0]; // e.g., "bitnami/laravel" from "bitnami/laravel:latest"
            if (versionParts.includes('/')) {
                // Non-official image (e.g., "bitnami/laravel")
                imageSource = versionParts;
            } else {
                // Official image (e.g., "mysql")
                imageSource = `library/${versionParts}`;
            }
        } else {
            // Fallback: check if baseImageName contains a slash
            imageSource = baseImageName.includes('/') ? baseImageName : `library/${baseImageName}`;
        }

        // Prepare request body with the correct format
        const requestBody = {
            appName: baseImageName.substring(0, 4),
            base_image_name: baseImageName,
            imageSource: imageSource,
            version: baseImage.version || `${baseImageName}:latest`,
            StorageSize: baseImage.storage_size || "1Gi",
            user_id: currentUser.uid
        };

        console.log('Rebuilding base image with data:', requestBody);

        // Get the create URL from the modal's data attribute
        const createUrl = document.getElementById('aiBuilderModal').dataset.createUrl;

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
        showToast('Base image rebuild initiated successfully', 'success');

        // Refresh the page after a short delay
        setTimeout(() => {
            window.location.reload();
        }, 1500);

    } catch (error) {
        console.error('Error rebuilding base image:', error);
        showToast('Failed to rebuild base image: ' + error.message, 'error');
        // Close the modal on error
        const modalInstance = bootstrap.Modal.getInstance(document.querySelector('.modal'));
        if (modalInstance) {
            modalInstance.hide();
            // Remove the modal element after hiding
            setTimeout(() => {
                document.querySelector('.modal')?.remove();
            }, 150);
        }
    }
}

class BaseImagesController {
    constructor() {
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        const form = document.getElementById('baseImageForm');
        if (form) {
            form.addEventListener('submit', this.handleSubmit.bind(this));
        }
    }

    async handleSubmit(event) {
        event.preventDefault();
        
        try {
            const user = firebase.auth().currentUser;
            if (!user) throw new Error('No user logged in');
            
            const token = await user.getIdToken(true);
            
            const formData = {
                appName: document.getElementById('appName').value,
                version: document.getElementById('version').value,
                description: document.getElementById('description').value,
                isOfficial: document.getElementById('isOfficial').checked,
                isDatabase: document.getElementById('isDatabase').checked,
                databaseServer: document.getElementById('databaseServer').value,
                user_id: user.uid
            };

            // Format imageSource based on whether it's an official image or not
            const imageName = formData.appName.trim();
            formData.imageSource = formData.isOfficial ? `library/${imageName}` : imageName;

            console.log('Creating base image with data:', formData);

            const response = await fetch(CREATE_BASE_IMAGE_AI_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to create base image');
            }

            const result = await response.json();
            console.log('Base image created successfully:', result);
            
            alert('Base image created successfully!');
            window.location.href = '/base-images/list';
            
        } catch (error) {
            console.error('Error creating base image:', error);
            alert(error.message || 'Failed to create base image');
        }
    }
}
 