document.addEventListener('DOMContentLoaded', function() {
    console.log('ReceiptController initializing...');

    // Initialize Firebase
    try {
        const firebaseConfig = JSON.parse(document.querySelector('[data-firebase-config]').dataset.firebaseConfig);
        if (!firebase.apps?.length) {
            firebase.initializeApp(firebaseConfig);
        }
    } catch (error) {
        console.error('Firebase initialization error:', error);
        return;
    }

    // Function to load application data
    async function loadApplicationData() {
        try {
            const user = firebase.auth().currentUser;
            if (!user) {
                console.log('No user logged in');
                return;
            }

            console.log('Current user:', user.uid); // Debug log

            const token = await user.getIdToken();
            console.log('Making API request...'); // Debug log

            const response = await fetch('/api/raku-ai/application-info', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            console.log('API Response status:', response.status); // Debug log

            if (!response.ok) {
                const errorText = await response.text();
                console.error('API Error Response:', errorText);
                throw new Error(`Failed to fetch application info: ${response.status}`);
            }

            const data = await response.json();
            console.log('Received data:', data); // Debug log
            
            // Update application info from profile.raku_ai
            document.getElementById('appName').textContent = data.applicationName;
            document.getElementById('appType').textContent = data.applicationType;
            document.getElementById('platform').textContent = data.platform;
            
            // Update status with proper styling
            const statusElement = document.getElementById('status');
            statusElement.textContent = data.status;
            if (data.status.toLowerCase() === 'approved') {
                statusElement.style.color = '#28a745'; // Green for approved
            } else if (data.status.toLowerCase() === 'pending') {
                statusElement.style.color = '#ffc107'; // Yellow for pending
            } else {
                statusElement.style.color = '#dc3545'; // Red for other states
            }

            // Update receipt statistics
            document.getElementById('receiptsSent').textContent = data.receiptsSent;
            document.getElementById('cost').textContent = data.cost;
            
            // Update date range
            document.getElementById('dateRange').textContent = data.dateRange;
        } catch (error) {
            console.error('Error loading application data:', error);
            // Show error state in the UI
            document.getElementById('appName').textContent = 'Error loading data';
            document.getElementById('appType').textContent = '-';
            document.getElementById('platform').textContent = '-';
            document.getElementById('status').textContent = 'Error';
            document.getElementById('status').style.color = '#dc3545';
        }
    }

    // Load initial data
    loadApplicationData();

    // Refresh data periodically (every 5 minutes)
    setInterval(loadApplicationData, 5 * 60 * 1000);

    // Handle Firebase auth state changes
    firebase.auth().onAuthStateChanged((user) => {
        if (user) {
            console.log('User logged in, loading data...'); // Debug log
            loadApplicationData();
        } else {
            console.log('User logged out, clearing UI...'); // Debug log
            // Clear the UI when user logs out
            document.getElementById('appName').textContent = '-';
            document.getElementById('appType').textContent = '-';
            document.getElementById('platform').textContent = '-';
            document.getElementById('status').textContent = '-';
            document.getElementById('receiptsSent').textContent = '0';
            document.getElementById('cost').textContent = '0';
        }
    });
}); 