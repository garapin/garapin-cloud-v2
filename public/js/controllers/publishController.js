class PublishController {
    constructor() {
        console.log('PublishController constructor started');
        
        this.form = document.getElementById('publishForm');
        console.log('Found form:', this.form);
        
        if (!this.form) {
            console.error('Publish form not found');
            return;
        }
        
        this.categorySelect = document.getElementById('category');
        this.statusSwitch = document.getElementById('statusSwitch');
        this.statusText = document.getElementById('statusText');
        
        this.initializeFirebase();
        this.initializeEventListeners();
        this.loadCategories();
        this.setupImagePreviews();
        this.setupStatusSwitch();
        this.selectedBaseImages = new Set();
        this.mainBaseImageId = null;
        
        // Initialize base image handling
        this.initializeBaseImageSearch();
        this.initializeBaseImageCards();

        // Initialize form and editor
        this.initializeForm();
        this.initializeTinyMCE();

        console.log('PublishController constructor completed');

        // Add styles for base image cards
        const style = document.createElement('style');
        style.textContent = `
            .base-image-card {
                transition: transform 0.2s, box-shadow 0.2s;
            }
            .base-image-card:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 8px rgba(0,0,0,0.1);
            }
            .base-image-card.selected {
                background-color: #e9ecef;
                transform: scale(0.98);
            }
            .selected-base-image {
                transition: all 0.3s ease;
            }
            .selected-base-image.highlight {
                background-color: rgba(108, 125, 255, 0.1);
                transform: scale(1.02);
            }
            .selected-base-image.highlight .card {
                border-color: #6C7DFF;
            }
            .base-images-scroll::-webkit-scrollbar {
                height: 8px;
            }
            .base-images-scroll::-webkit-scrollbar-track {
                background: #f1f1f1;
                border-radius: 4px;
            }
            .base-images-scroll::-webkit-scrollbar-thumb {
                background: #888;
                border-radius: 4px;
            }
            .base-images-scroll::-webkit-scrollbar-thumb:hover {
                background: #555;
            }
        `;
        document.head.appendChild(style);
    }

    initializeFirebase() {
        try {
            const firebaseConfig = JSON.parse(document.querySelector('[data-firebase-config]').dataset.firebaseConfig);
            if (!firebase.apps?.length) {
                firebase.initializeApp(firebaseConfig);
            }
            
            firebase.auth().onAuthStateChanged(async (user) => {
                if (user) {
                    const token = await user.getIdToken();
                    const response = await fetch('/auth/user', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            name: user.displayName,
                            email: user.email,
                            provider_uid: user.uid,
                            photoURL: user.photoURL
                        })
                    });

                    if (response.ok) {
                        const userData = await response.json();
                        this.updateUI(user);
                        localStorage.setItem('authToken', token);
                    }
                } else {
                    // Handle logged out state
                    document.getElementById('userName').textContent = 'Guest';
                    document.getElementById('userPhotoContainer').innerHTML = '<i class="bi bi-person-circle" style="font-size: 1.2rem;"></i>';
                    localStorage.removeItem('authToken');
                    window.location.href = '/'; // Redirect to login if not authenticated
                }
            });
        } catch (error) {
            console.error('Firebase initialization error:', error);
        }
    }

    updateUI(user) {
        const userPhotoContainer = document.getElementById('userPhotoContainer');
        const userName = document.getElementById('userName');

        if (user) {
            if (user.photoURL) {
                userPhotoContainer.innerHTML = `<img src="${user.photoURL}" alt="Profile" class="rounded-circle" style="width: 24px; height: 24px;">`;
            }
            if (user.displayName) {
                userName.textContent = user.displayName;
            }
        }
    }

    async handleSubmit(e) {
        console.log('handleSubmit called', e);
        e.preventDefault();
        
        if (!this.validateBaseImages()) {
            console.log('Base image validation failed');
            return;
        }
        
        try {
            const user = firebase.auth().currentUser;
            if (!user) throw new Error('No user logged in');
            
            let token = await user.getIdToken(true);

            const isEdit = this.form.dataset.edit === 'true';
            const appId = this.form.dataset.appId;

            // Get selected base image IDs
            const selectedBaseImageElements = document.querySelectorAll('.selected-base-image');
            console.log('Selected base image elements:', selectedBaseImageElements);
            
            const selectedBaseImages = Array.from(selectedBaseImageElements).map(el => el.dataset.id);
            console.log('Selected base image IDs:', selectedBaseImages);
            
            const mainBaseImageRadio = document.querySelector('.main-base-image-radio:checked');
            console.log('Main base image radio:', mainBaseImageRadio);
            
            const mainBaseImageId = mainBaseImageRadio ? mainBaseImageRadio.value : null;
            console.log('Main base image ID:', mainBaseImageId);

            // Create the request payload
            const payload = {
                title: document.getElementById('appName').value,
                description: tinymce.get('description') ? tinymce.get('description').getContent() : document.getElementById('description').value,
                support_detail: document.getElementById('support_detail').value,
                price: parseInt(document.getElementById('price').value, 10),
                category: document.getElementById('category').value,
                status: this.statusSwitch.checked ? 'Published' : 'Draft',
                base_image: selectedBaseImages,
                main_base_image: mainBaseImageId,
                user_id: user.uid
            };

            if (isEdit) {
                payload._id = appId;
            }

            // Log the complete payload for debugging
            console.log('Complete payload before sending:', JSON.stringify(payload, null, 2));

            // First, send the base data as JSON
            const url = isEdit ? `/api/my-apps/${appId}` : '/api/applications/publish';
            console.log('Sending main update request to:', url);
            
            const response = await fetch(url, {
                method: isEdit ? 'PUT' : 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            // Parse JSON response only once
            const responseData = await response.json();
            console.log('Main update response:', responseData);
            
            if (!response.ok) {
                throw new Error(responseData.error || 'Failed to save application');
            }

            // Show success message for main update
            const message = isEdit ? 'Application updated successfully!' : 'Application published successfully!';
            alert(message);

            // If there are files to upload, handle them separately
            if (document.getElementById('appIcon').files.length > 0 || 
                document.getElementById('screenshots').files.length > 0) {
                
                const formData = new FormData();
                
                // Handle icon upload
                const iconFile = document.getElementById('appIcon').files[0];
                if (iconFile) {
                    formData.append('icon', iconFile);
                }

                // Handle screenshots upload
                const screenshotFiles = document.getElementById('screenshots').files;
                if (screenshotFiles.length > 0) {
                    const existingScreenshots = document.querySelectorAll('.screenshot-container:not(.new-screenshot)').length;
                    formData.append('existingScreenshotsCount', existingScreenshots);

                    for (let i = 0; i < screenshotFiles.length; i++) {
                        const file = screenshotFiles[i];
                        const timestamp = Date.now();
                        const newFilename = `${timestamp}-${i+1}.${file.name.split('.').pop()}`;
                        const renamedFile = new File([file], newFilename, { type: file.type });
                        formData.append('screenshots', renamedFile);
                    }
                }

                // Send files if any
                if (formData.has('icon') || formData.has('screenshots')) {
                    console.log('Sending file upload request...');
                    const fileUploadUrl = `/api/my-apps/${responseData._id || appId}/upload-files`;
                    const fileResponse = await fetch(fileUploadUrl, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`
                        },
                        body: formData
                    });

                    if (!fileResponse.ok) {
                        const fileError = await fileResponse.json();
                        console.error('File upload failed:', fileError);
                        throw new Error('Failed to upload files');
                    }
                }
            }

            // Redirect after everything is done
            window.location.replace('/my-apps/list');

        } catch (error) {
            console.error('Error:', error);
            alert(error.message || 'Failed to save application');
        }
    }

    async loadCategories() {
        try {
            console.log('Fetching categories...');
            const response = await fetch('/api/categories');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const categories = await response.json();
            
            // Clear existing options
            this.categorySelect.innerHTML = '<option value="">Select a category</option>';
            
            // Add new options
            categories.forEach(category => {
                const option = document.createElement('option');
                option.value = category._id;
                option.textContent = category.category_name;
                if (window.selectedCategory && category._id === window.selectedCategory) {
                    option.selected = true;
                }
                this.categorySelect.appendChild(option);
            });
        } catch (error) {
            console.error('Error loading categories:', error);
            alert('Failed to load categories. Please try again.');
        }
    }

    initializeEventListeners() {
        console.log('Initializing event listeners');
        if (this.form) {
            this.form.addEventListener('submit', this.handleSubmit.bind(this));
            console.log('Form submit event listener attached to:', this.form);
        } else {
            console.error('Form element not found in initializeEventListeners');
        }

        // Add base image search functionality
        const baseImageSearch = document.getElementById('baseImageSearch');
        if (baseImageSearch) {
            baseImageSearch.addEventListener('input', this.handleBaseImageSearch.bind(this));
            // Trigger initial state
            this.handleBaseImageSearch({ target: baseImageSearch });
        }
    }

    handleBaseImageSearch(event) {
        const searchTerm = event.target.value.toLowerCase().trim();
        const baseImageCards = document.querySelectorAll('.base-image-card');
        
        if (searchTerm === '') {
            // When search is empty, show only first 5 cards
            baseImageCards.forEach((card, index) => {
                card.style.display = index < 5 ? '' : 'none';
            });
        } else {
            // When searching, show all matching cards
            baseImageCards.forEach(card => {
                const title = card.getAttribute('data-name').toLowerCase();
                card.style.display = title.includes(searchTerm) ? '' : 'none';
            });
        }
    }

    setupImagePreviews() {
        // Icon preview
        const iconInput = document.getElementById('appIcon');
        const iconPreview = document.getElementById('iconPreview');
        
        iconInput?.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    iconPreview.src = e.target.result;
                };
                reader.readAsDataURL(e.target.files[0]);
            }
        });

        // Screenshots preview
        const screenshotsInput = document.getElementById('screenshots');
        const previewsContainer = document.getElementById('screenshotPreviews');
        
        screenshotsInput?.addEventListener('change', (e) => {
            const files = e.target.files;
            
            // Clear any previous new screenshots
            document.querySelectorAll('.new-screenshot').forEach(el => el.remove());

            Array.from(files).forEach((file, index) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const div = document.createElement('div');
                    div.className = 'col-6 col-md-4 screenshot-container new-screenshot';
                    div.innerHTML = `
                        <div class="position-relative">
                            <img src="${e.target.result}" alt="New Screenshot" class="img-fluid rounded">
                            <button type="button" class="btn btn-danger btn-sm position-absolute top-0 end-0 m-1 remove-new-screenshot">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    `;
                    previewsContainer.appendChild(div);
                };
                reader.readAsDataURL(file);
            });
        });

        // Handle screenshot deletion
        document.addEventListener('click', async (e) => {
            const deleteBtn = e.target.closest('.delete-screenshot');
            const removeNewBtn = e.target.closest('.remove-new-screenshot');

            if (deleteBtn) {
                e.preventDefault();
                if (confirm('Are you sure you want to delete this screenshot?')) {
                    const index = deleteBtn.dataset.index;
                    try {
                        const token = await firebase.auth().currentUser.getIdToken();
                        const response = await fetch(`/api/my-apps/${this.form.dataset.appId}/screenshots/${index}`, {
                            method: 'DELETE',
                            headers: {
                                'Authorization': `Bearer ${token}`
                            }
                        });

                        if (response.ok) {
                            deleteBtn.closest('.screenshot-container').remove();
                        } else {
                            throw new Error('Failed to delete screenshot');
                        }
                    } catch (error) {
                        console.error('Error deleting screenshot:', error);
                        alert('Failed to delete screenshot');
                    }
                }
            } else if (removeNewBtn) {
                removeNewBtn.closest('.screenshot-container').remove();
            }
        });
    }

    setupStatusSwitch() {
        if (this.statusSwitch) {
            const statusTextSpan = document.createElement('span');
            statusTextSpan.id = 'statusText';
            statusTextSpan.className = 'ms-2';
            statusTextSpan.style.fontSize = '0.9em';
            this.statusSwitch.parentNode.appendChild(statusTextSpan);

            const updateStatusText = (checked) => {
                statusTextSpan.textContent = checked ? 'Published' : 'Draft';
                statusTextSpan.style.color = checked ? '#198754' : '#6c757d';
            };

            // Set initial state
            updateStatusText(this.statusSwitch.checked);

            // Handle changes
            this.statusSwitch.addEventListener('change', (e) => {
                updateStatusText(e.target.checked);
            });
        }
    }

    initializeBaseImageHandlers() {
        const baseImagesContainer = document.getElementById('baseImagesContainer');
        const searchInput = document.getElementById('baseImageSearch');
        const selectedBaseImagesContainer = document.getElementById('selectedBaseImages');

        // Initialize selected base images from existing data
        document.querySelectorAll('.selected-base-image').forEach(el => {
            this.selectedBaseImages.add(el.dataset.id);
        });

        // Handle base image selection
        baseImagesContainer.addEventListener('click', async (e) => {
            const card = e.target.closest('.base-image-card');
            if (!card) return;

            const baseImageId = card.dataset.id;
            if (this.selectedBaseImages.has(baseImageId)) {
                console.log('Base image already selected:', baseImageId);
                return;
            }

            // Clear existing selections first
            this.selectedBaseImages.clear();
            selectedBaseImagesContainer.innerHTML = '';

            // Add the selected base image
            this.selectedBaseImages.add(baseImageId);
            const baseImageElement = this.createBaseImageElement({
                id: baseImageId,
                name: card.dataset.name,
                version: card.dataset.version,
                thumbnail: card.dataset.thumbnail,
                description: card.dataset.description
            });
            selectedBaseImagesContainer.appendChild(baseImageElement);

            // Set this as the main base image
            const mainRadio = baseImageElement.querySelector('.main-base-image-radio');
            mainRadio.checked = true;
            this.mainBaseImageId = baseImageId;

            // Check if this base image requires a database
            const databaseServer = card.dataset.database;
            if (databaseServer && 
                !['None*', 'N/A', 'null', 'None Required', 'none', 'None required'].includes(databaseServer?.toLowerCase())) {
                
                console.log('Looking for matching database server:', databaseServer);
                
                // Find the corresponding database base image
                const dbBaseImage = Array.from(document.querySelectorAll('.base-image-card'))
                    .find(dbCard => {
                        const isDbImage = dbCard.dataset.isDatabase === 'true';
                        const dbName = dbCard.dataset.name.toLowerCase();
                        const requiredDb = databaseServer.toLowerCase();
                        
                        console.log('Checking database image:', {
                            name: dbCard.dataset.name,
                            isDbImage,
                            dbName,
                            requiredDb,
                            matches: dbName.includes(requiredDb) || requiredDb.includes(dbName)
                        });

                        return isDbImage && (dbName.includes(requiredDb) || requiredDb.includes(dbName));
                    });

                if (dbBaseImage) {
                    console.log('Found matching database image:', dbBaseImage.dataset.name);
                    
                    // Add the database base image
                    this.selectedBaseImages.add(dbBaseImage.dataset.id);
                    const dbBaseImageElement = this.createBaseImageElement({
                        id: dbBaseImage.dataset.id,
                        name: dbBaseImage.dataset.name,
                        version: dbBaseImage.dataset.version,
                        thumbnail: dbBaseImage.dataset.thumbnail,
                        description: dbBaseImage.dataset.description
                    });
                    selectedBaseImagesContainer.appendChild(dbBaseImageElement);
                }
            }

            // Add selection effect
            card.classList.add('selected');
            setTimeout(() => card.classList.remove('selected'), 200);
        });

        // Handle remove buttons
        selectedBaseImagesContainer.addEventListener('click', (e) => {
            if (e.target.closest('.remove-base-image')) {
                const baseImageElement = e.target.closest('.selected-base-image');
                const baseImageId = baseImageElement.dataset.id;
                
                this.selectedBaseImages.delete(baseImageId);
                if (this.mainBaseImageId === baseImageId) {
                    this.mainBaseImageId = null;
                }
                baseImageElement.remove();

                // If this was the main application, remove all base images
                if (baseImageElement.querySelector('.main-base-image-radio').checked) {
                    selectedBaseImagesContainer.innerHTML = '';
                    this.selectedBaseImages.clear();
                    this.mainBaseImageId = null;
                }
            }
        });

        // Handle main base image selection
        selectedBaseImagesContainer.addEventListener('change', (e) => {
            if (e.target.classList.contains('main-base-image-radio')) {
                this.mainBaseImageId = e.target.value;
                console.log('Set main base image to:', this.mainBaseImageId);
            }
        });
    }

    createBaseImageElement({ id, name, version, thumbnail, description }) {
        const div = document.createElement('div');
        div.className = 'col-12 selected-base-image';
        div.dataset.id = id;
        
        const thumbnailHtml = thumbnail ? 
            `<img src="${thumbnail}" alt="${name}" class="me-3" style="width: 48px; height: 48px; object-fit: contain;">` :
            `<div class="d-flex align-items-center justify-content-center me-3" style="height: 48px; width: 48px; background-color: #f8f9fa; border-radius: 8px;">
                <span class="display-6 text-muted" style="font-size: 1.5rem;">
                    ${name.charAt(0).toUpperCase()}
                </span>
            </div>`;
        
        div.innerHTML = `
            <div class="card">
                <div class="card-body p-3">
                    <div class="d-flex align-items-start">
                        ${thumbnailHtml}
                        <div class="flex-grow-1">
                            <h6 class="mb-1">${name}</h6>
                            <div class="mb-1">
                                <span class="badge bg-primary" style="font-size: 0.7rem;">
                                    <i class="bi bi-tag-fill me-1"></i>
                                    ${version}
                                </span>
                            </div>
                            <p class="text-muted mb-0" style="font-size: 0.8rem; line-height: 1.2;">
                                ${description || ''}
                            </p>
                        </div>
                        <div class="d-flex align-items-center gap-2 ms-2">
                            <div class="form-check">
                                <input class="form-check-input main-base-image-radio" 
                                    type="radio" 
                                    name="mainBaseImage" 
                                    value="${id}">
                                <label class="form-check-label">Main</label>
                            </div>
                            <button type="button" class="btn btn-outline-danger btn-sm remove-base-image">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        return div;
    }

    validateBaseImages() {
        const errorElement = document.getElementById('baseImageError');
        if (this.selectedBaseImages.size === 0 || !this.mainBaseImageId) {
            errorElement.style.display = 'block';
            return false;
        }
        errorElement.style.display = 'none';
        return true;
    }

    initializeForm() {
        // ... rest of the form initialization ...
    }

    initializeTinyMCE() {
        // ... rest of the TinyMCE initialization ...
    }

    // Handle base image card click
    handleBaseImageCardClick(card) {
        console.log('Base image card clicked:', card.dataset);
        const baseImageId = card.dataset.id;
        const baseImageName = card.dataset.name;
        const baseImageVersion = card.dataset.version;
        const baseImageThumbnail = card.dataset.thumbnail;
        const baseImageDescription = card.dataset.description;
        const baseImageDatabase = card.dataset.database;

        // Check if this base image is already selected
        const existingImage = document.querySelector(`.selected-base-image[data-id="${baseImageId}"]`);
        if (existingImage) {
            // If already selected, highlight it briefly and scroll to it
            existingImage.classList.add('highlight');
            existingImage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            setTimeout(() => existingImage.classList.remove('highlight'), 1000);
            return;
        }

        // Create new selected base image element
        const selectedBaseImagesContainer = document.getElementById('selectedBaseImages');
        const newSelectedImage = document.createElement('div');
        newSelectedImage.className = 'col-12 selected-base-image';
        newSelectedImage.dataset.id = baseImageId;

        // Generate HTML for the selected base image
        const thumbnailHtml = baseImageThumbnail ? 
            `<img src="${baseImageThumbnail}" alt="${baseImageName}" class="me-3" style="width: 48px; height: 48px; object-fit: contain;">` :
            `<div class="d-flex align-items-center justify-content-center me-3" style="height: 48px; width: 48px; background-color: #f8f9fa; border-radius: 8px;">
                <span class="display-6 text-muted" style="font-size: 1.5rem;">${baseImageName.charAt(0).toUpperCase()}</span>
            </div>`;

        newSelectedImage.innerHTML = `
            <div class="card">
                <div class="card-body p-3">
                    <div class="d-flex align-items-start">
                        ${thumbnailHtml}
                        <div class="flex-grow-1">
                            <h6 class="mb-1">${baseImageName}</h6>
                            <div class="mb-1">
                                <span class="badge bg-primary" style="font-size: 0.7rem;">
                                    <i class="bi bi-tag-fill me-1"></i>
                                    ${baseImageVersion}
                                </span>
                                ${baseImageDatabase ? `
                                    <span class="badge bg-info ms-1" style="font-size: 0.7rem;">
                                        <i class="bi bi-database me-1"></i>
                                        ${baseImageDatabase}
                                    </span>
                                ` : ''}
                            </div>
                            <p class="text-muted mb-0" style="font-size: 0.8rem; line-height: 1.2;">
                                ${baseImageDescription || ''}
                            </p>
                        </div>
                        <div class="d-flex align-items-center gap-2 ms-2">
                            <div class="form-check">
                                <input class="form-check-input main-base-image-radio" 
                                    type="radio" 
                                    name="mainBaseImage" 
                                    value="${baseImageId}">
                                <label class="form-check-label">Main</label>
                            </div>
                            <button type="button" class="btn btn-outline-danger btn-sm remove-base-image">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Add to selected base images container
        selectedBaseImagesContainer.appendChild(newSelectedImage);

        // If this is the first base image, automatically set it as main
        const mainRadios = document.querySelectorAll('.main-base-image-radio');
        if (mainRadios.length === 1) {
            mainRadios[0].checked = true;
            this.mainBaseImageId = baseImageId;
        }

        // Add event listeners for the new elements
        const removeButton = newSelectedImage.querySelector('.remove-base-image');
        if (removeButton) {
            removeButton.addEventListener('click', () => {
                newSelectedImage.remove();
                // Show error if no base images are selected
                const selectedImages = document.querySelectorAll('.selected-base-image');
                if (selectedImages.length === 0) {
                    document.getElementById('baseImageError').style.display = 'block';
                }
            });
        }

        const mainRadio = newSelectedImage.querySelector('.main-base-image-radio');
        if (mainRadio) {
            mainRadio.addEventListener('change', () => {
                this.mainBaseImageId = baseImageId;
                document.getElementById('baseImageError').style.display = 'none';
            });
        }

        // Hide error message if it was shown
        document.getElementById('baseImageError').style.display = 'none';

        // Add selection effect to the card
        card.classList.add('selected');
        setTimeout(() => card.classList.remove('selected'), 200);

        console.log('Added base image:', baseImageId);
    }

    // Initialize controls for a selected base image
    initializeBaseImageControls(container) {
        // Remove button
        const removeButton = container.querySelector('.remove-base-image');
        if (removeButton) {
            removeButton.addEventListener('click', () => {
                container.remove();
                // Show error if no base images are selected
                const selectedImages = document.querySelectorAll('.selected-base-image');
                if (selectedImages.length === 0) {
                    document.getElementById('baseImageError').style.display = 'block';
                }
            });
        }

        // Main radio button
        const mainRadio = container.querySelector('.main-base-image-radio');
        if (mainRadio) {
            mainRadio.addEventListener('change', () => {
                document.getElementById('baseImageError').style.display = 'none';
            });
        }
    }

    // Get selected base images data for form submission
    getSelectedBaseImagesData() {
        const selectedImages = document.querySelectorAll('.selected-base-image');
        const baseImages = [];
        let mainBaseImageId = null;

        selectedImages.forEach(image => {
            const imageId = image.dataset.id;
            baseImages.push(imageId);

            const mainRadio = image.querySelector('.main-base-image-radio');
            if (mainRadio && mainRadio.checked) {
                mainBaseImageId = imageId;
            }
        });

        return {
            baseImages,
            mainBaseImageId
        };
    }

    // Validate base images selection
    validateBaseImages() {
        const { baseImages, mainBaseImageId } = this.getSelectedBaseImagesData();
        if (baseImages.length === 0 || !mainBaseImageId) {
            document.getElementById('baseImageError').style.display = 'block';
            return false;
        }
        return true;
    }

    // Initialize base image cards
    initializeBaseImageCards() {
        const baseImageCards = document.querySelectorAll('.base-image-card');
        baseImageCards.forEach(card => {
            card.addEventListener('click', () => this.handleBaseImageCardClick(card));
        });
    }

    // Initialize base image search
    initializeBaseImageSearch() {
        const searchInput = document.getElementById('baseImageSearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase();
                const cards = document.querySelectorAll('.base-image-card');
                
                cards.forEach(card => {
                    const name = card.dataset.name.toLowerCase();
                    const description = card.dataset.description.toLowerCase();
                    const version = card.dataset.version.toLowerCase();
                    const database = (card.dataset.database || '').toLowerCase();
                    
                    const matches = name.includes(searchTerm) || 
                                  description.includes(searchTerm) || 
                                  version.includes(searchTerm) ||
                                  database.includes(searchTerm);
                    
                    card.style.display = matches ? '' : 'none';
                });
            });
        }
    }

    async handleFormSubmit(event) {
        event.preventDefault();

        // Validate base images
        if (!this.validateBaseImages()) {
            return;
        }

        const form = event.target;
        const isEdit = form.dataset.edit === 'true';
        const appId = form.dataset.appId;

        try {
            // Get current user
            const user = firebase.auth().currentUser;
            if (!user) {
                throw new Error('User not authenticated');
            }

            // Get base images data
            const { baseImages, mainBaseImageId } = this.getSelectedBaseImagesData();
            if (baseImages.length === 0 || !mainBaseImageId) {
                throw new Error('Please select at least one base image and designate a main base image');
            }

            // Prepare form data
            const formData = {
                title: document.getElementById('appName').value,
                description: document.getElementById('description').value,
                support_detail: document.getElementById('support_detail').value,
                price: parseInt(document.getElementById('price').value) || 0,
                category: document.getElementById('category').value,
                status: document.getElementById('statusSwitch').checked ? 'Published' : 'Draft',
                base_image: baseImages,
                main_base_image: mainBaseImageId
            };

            // Get the token
            const token = await user.getIdToken(true);

            // Send the request
            const response = await fetch(isEdit ? `/api/applications/${appId}` : '/api/applications/insert', {
                method: isEdit ? 'PUT' : 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(formData)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Failed to save application');
            }

            const result = await response.json();
            console.log('Application saved:', result);

            // Redirect to applications page
            window.location.href = '/applications';

        } catch (error) {
            console.error('Error saving application:', error);
            // Show error to user
            alert(error.message || 'Failed to save application');
        }
    }
} 