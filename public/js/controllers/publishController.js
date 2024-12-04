class PublishController {
    constructor() {
        this.form = document.getElementById('publishForm');
        this.categorySelect = document.getElementById('category');
        this.statusSwitch = document.getElementById('statusSwitch');
        this.statusText = document.getElementById('statusText');
        this.initializeFirebase();
        this.initializeTinyMCE();
        this.initializeEventListeners();
        this.loadCategories();
        this.setupImagePreviews();
        this.setupStatusSwitch();
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
        e.preventDefault();
        
        try {
            const user = firebase.auth().currentUser;
            if (!user) throw new Error('No user logged in');
            
            const token = await user.getIdToken();
            const formData = new FormData();
            
            const isEdit = this.form.dataset.edit === 'true';
            const appId = this.form.dataset.appId;

            // Add form data
            formData.append('title', document.getElementById('appName').value);
            formData.append('description', tinymce.get('description').getContent());
            formData.append('support_detail', document.getElementById('support_detail').value);
            formData.append('price', document.getElementById('price').value);
            formData.append('category', document.getElementById('category').value);
            formData.append('status', this.statusSwitch.checked ? 'Published' : 'Draft');

            // Handle icon upload
            const iconFile = document.getElementById('appIcon').files[0];
            if (iconFile) {
                formData.append('icon', iconFile);
            }

            // Handle screenshots upload
            const screenshotFiles = document.getElementById('screenshots').files;
            if (screenshotFiles.length > 0) {
                // Get all existing screenshots
                const existingScreenshots = document.querySelectorAll('.screenshot-container:not(.new-screenshot)').length;
                formData.append('existingScreenshotsCount', existingScreenshots);

                // Append each screenshot file
                for (let i = 0; i < screenshotFiles.length; i++) {
                    const file = screenshotFiles[i];
                    // Generate a unique filename using timestamp
                    const timestamp = Date.now();
                    const newFilename = `${timestamp}-${i+1}.${file.name.split('.').pop()}`;
                    
                    // Create a new File object with the new filename
                    const renamedFile = new File([file], newFilename, { type: file.type });
                    formData.append('screenshots', renamedFile);
                }
            }

            const url = isEdit ? `/api/my-apps/${appId}` : '/api/applications/publish';
            const method = isEdit ? 'PUT' : 'POST';
            
            const response = await fetch(url, {
                method: method,
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to save application');
            }

            alert(isEdit ? 'Application updated successfully!' : 'Application published successfully!');
            window.location.href = '/my-apps';
        } catch (error) {
            console.error('Error:', error);
            alert(error.message || 'Failed to save application');
        }
    }

    initializeTinyMCE() {
        tinymce.init({
            selector: '#description',
            plugins: 'anchor autolink charmap codesample emoticons image link lists media searchreplace table visualblocks wordcount checklist mediaembed casechange export formatpainter pageembed linkchecker a11ychecker tinymcespellchecker permanentpen powerpaste advtable advcode editimage tableofcontents footnotes mergetags autocorrect typography inlinecss',
            toolbar: 'undo redo | blocks fontfamily fontsize | bold italic underline strikethrough | link image media table mergetags | addcomment showcomments | spellcheckdialog a11ycheck typography | align lineheight | checklist numlist bullist indent outdent | emoticons charmap | removeformat',
            height: 500,
            menubar: true,
            statusbar: true,
            branding: false,
            promotion: false,
            setup: function(editor) {
                editor.on('change', function() {
                    editor.save(); // Save content to textarea
                });
            }
        });
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
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));
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
}

document.addEventListener('DOMContentLoaded', () => {
    new PublishController();
}); 