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
            // Get fresh token
            const user = firebase.auth().currentUser;
            if (!user) {
                throw new Error('No user logged in');
            }
            const token = await user.getIdToken(true); // Force token refresh

            const formData = new FormData();
            
            // Basic info
            formData.append('title', document.getElementById('appName').value);
            formData.append('description', tinymce.get('description').getContent());
            formData.append('support_detail', document.getElementById('support_detail').value);
            formData.append('price', document.getElementById('price').value);
            formData.append('category', document.getElementById('category').value);
            formData.append('status', this.statusSwitch.checked ? 'published' : 'draft');

            // Handle icon upload
            const iconFile = document.getElementById('appIcon').files[0];
            if (iconFile) {
                formData.append('icon', iconFile);
            }

            // Handle screenshots upload
            const screenshots = document.getElementById('screenshots').files;
            if (screenshots.length > 0) {
                for (let i = 0; i < Math.min(screenshots.length, 5); i++) {
                    formData.append('screenshots', screenshots[i]);
                }
            }

            // Optional app file
            const appFile = document.getElementById('appFile').files[0];
            if (appFile) {
                formData.append('appFile', appFile);
            }

            // Send to server
            const response = await fetch('/api/applications/publish', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            if (response.ok) {
                const result = await response.json();
                const status = this.statusSwitch.checked ? 'published' : 'draft';
                const message = status === 'published' ? 'Application published successfully!' : 'Application saved as draft!';
                alert(message);
                window.location.href = '/dashboard';
            } else {
                const error = await response.json();
                console.error('Server error:', error);
                if (error.code === 'auth/id-token-expired') {
                    // Token expired, retry with fresh token
                    const newToken = await user.getIdToken(true);
                    // Retry the request
                    return this.handleSubmit(e);
                }
                alert(`Error: ${error.message || 'Failed to save application'}`);
            }
        } catch (error) {
            console.error('Error saving application:', error);
            alert('Failed to save application. Please try again.');
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
            console.log('Categories loaded:', categories);
            
            // Clear existing options
            this.categorySelect.innerHTML = '<option value="">Select a category</option>';
            
            // Add new options
            categories.forEach(category => {
                const option = document.createElement('option');
                option.value = category._id;
                option.textContent = category.category_name;
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
        
        iconInput.addEventListener('change', (e) => {
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
        const screenshotPreviews = document.getElementById('screenshotPreviews');

        screenshotsInput.addEventListener('change', (e) => {
            screenshotPreviews.innerHTML = ''; // Clear existing previews
            const files = e.target.files;

            if (files.length === 0) {
                // Show default screenshot if no files selected
                screenshotPreviews.innerHTML = `
                    <img src="/images/default-screenshot.svg" alt="Default Screenshot" 
                         class="rounded" style="width: 160px; height: 90px; object-fit: cover;">
                `;
                return;
            }

            for (let i = 0; i < Math.min(files.length, 5); i++) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    screenshotPreviews.innerHTML += `
                        <img src="${e.target.result}" alt="Screenshot ${i + 1}" 
                             class="rounded" style="width: 160px; height: 90px; object-fit: cover;">
                    `;
                };
                reader.readAsDataURL(files[i]);
            }
        });
    }

    setupStatusSwitch() {
        this.statusSwitch.addEventListener('change', (e) => {
            this.statusText.textContent = e.target.checked ? 'Published' : 'Not Published';
            this.statusText.style.color = e.target.checked ? '#198754' : '#6c757d'; // Green when published, grey when not
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new PublishController();
}); 