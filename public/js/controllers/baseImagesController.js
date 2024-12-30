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
        const token = await firebase.auth().currentUser.getIdToken(true);

        console.log('Inserting application with:', {
            baseImageId,
            userId,
            publisherId
        });

        const response = await fetch('/api/applications/insert', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                baseImageId,
                userId,
                publisherId
            })
        });

        if (!response.ok) {
            const error = await response.json();
            console.error('Server error:', error);
            throw new Error(error.message || 'Failed to insert application');
        }

        const result = await response.json();
        console.log('Application inserted successfully:', result);
        return result;
    } catch (error) {
        console.error('Error inserting application:', error);
        throw error;
    }
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
        const fullVersion = `${imageSource}:${version}`;

        buildButton.innerHTML = '<i class="bi bi-arrow-repeat spin me-1"></i>Building...';

        const createUrl = document.getElementById('aiBuilderModal').dataset.createUrl;
        const currentUser = firebase.auth().currentUser;
        if (!currentUser) throw new Error('User not authenticated');
        const token = await currentUser.getIdToken(true);

        const requestBody = {
            appName: baseImageName.substring(0, 4),
            base_image_name: baseImageName,
            imageSource: imageSource,
            version: fullVersion,
            StorageSize: parseInt(storageSize) + "Gi",
            user_id: currentUser.uid
        };

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
        console.log('Base image created:', baseImageResult);

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

        console.log('Base image created:', baseImageResult);
        console.log('User data:', userData);

        const applicationResult = await insertApplication(
            baseImageResult._id,
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
function showToast(message, type = 'info') {
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
 