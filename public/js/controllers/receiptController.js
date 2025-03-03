document.addEventListener('DOMContentLoaded', function() {
    console.log('ReceiptController initializing...');
    let datePickerInitialized = false;

    // Initialize Firebase
    try {
        const firebaseConfig = JSON.parse(document.querySelector('[data-firebase-config]').dataset.firebaseConfig);
        if (!firebase.apps?.length) {
            firebase.initializeApp(firebaseConfig);
            console.log('Firebase initialized successfully');
        } else {
            console.log('Firebase already initialized');
        }
    } catch (error) {
        console.error('Firebase initialization error:', error);
        return;
    }
    
    // Function to format currency in Indonesian Rupiah
    function formatCurrency(amount) {
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0
        }).format(amount || 0);
    }

    // Function to load application data
    async function loadApplicationData() {
        try {
            const user = firebase.auth().currentUser;
            if (!user) {
                console.log('No user logged in when trying to load application data');
                return;
            }

            console.log('Current user for app data:', user.uid);

            const token = await user.getIdToken();
            console.log('Making API request for application info...');

            // Get application info
            const appInfoResponse = await fetch('/api/receipt/application-info', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            console.log('API Response status for app info:', appInfoResponse.status);

            if (!appInfoResponse.ok) {
                const errorText = await appInfoResponse.text();
                console.error('API Error Response:', errorText);
                throw new Error(`Failed to fetch application info: ${appInfoResponse.status}`);
            }

            const appData = await appInfoResponse.json();
            console.log('Received app data:', appData);
            
            // Update application info from profile.raku_ai
            document.getElementById('appName').textContent = appData.appName;
            document.getElementById('appType').textContent = appData.appType;
            document.getElementById('platform').textContent = appData.platform;
            
            // Update status with proper styling
            const statusElement = document.getElementById('status');
            statusElement.textContent = appData.status;
            if (appData.status.toLowerCase() === 'approved') {
                statusElement.style.color = '#28a745'; // Green for approved
            } else if (appData.status.toLowerCase() === 'pending') {
                statusElement.style.color = '#ffc107'; // Yellow for pending
            } else {
                statusElement.style.color = '#dc3545'; // Red for other states
            }
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
    
    // Function to update receipt statistics based on date range
    async function updateReceiptStats(startDate = null, endDate = null) {
        try {
            const user = firebase.auth().currentUser;
            if (!user) {
                console.log('No user logged in when trying to update receipt stats');
                return;
            }

            console.log('Current user for receipt stats:', user.uid);
            const token = await user.getIdToken();
            
            // If no dates provided, use today's date for both
            if (!startDate || !endDate) {
                startDate = moment().format('YYYY-MM-DD');
                endDate = moment().format('YYYY-MM-DD');
                console.log('No date range provided, using today:', startDate);
            }
            
            // Build URL with date parameters
            let url = `/api/receipt/stats?start=${startDate}&end=${endDate}`;
            console.log(`Fetching receipt stats with URL: ${url}`);
            
            const receiptResponse = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            console.log('API Response status for receipt stats:', receiptResponse.status);

            if (receiptResponse.ok) {
                const receiptData = await receiptResponse.json();
                console.log('Received receipt data:', receiptData);
                
                // Update receipt statistics
                document.getElementById('receiptsSent').textContent = receiptData.receiptCount.toString();
                document.getElementById('cost').textContent = formatCurrency(receiptData.totalCost);
            } else {
                const errorText = await receiptResponse.text();
                console.error('API Error Response for receipt stats:', errorText);
                document.getElementById('receiptsSent').textContent = '0';
                document.getElementById('cost').textContent = 'Rp0';
            }
        } catch (error) {
            console.error('Error updating receipt statistics:', error);
            document.getElementById('receiptsSent').textContent = '0';
            document.getElementById('cost').textContent = 'Rp0';
        }
    }
    
    // Initialize date range picker
    function initDateRangePicker() {
        try {
            if (window.jQuery && $.fn.daterangepicker) {
                const $ = window.jQuery;
                
                console.log('Initializing date range picker...');
                
                // Initialize the date range picker
                $('#receiptDateRangePicker').daterangepicker({
                    opens: 'left',
                    maxDate: new Date(),
                    autoApply: false,
                    showDropdowns: true,
                    alwaysShowCalendars: true,
                    ranges: {
                       'Today': [moment(), moment()],
                       'Yesterday': [moment().subtract(1, 'days'), moment().subtract(1, 'days')],
                       'Last 7 Days': [moment().subtract(6, 'days'), moment()],
                       'Last 30 Days': [moment().subtract(29, 'days'), moment()],
                       'This Month': [moment().startOf('month'), moment().endOf('month')],
                       'Last Month': [moment().subtract(1, 'month').startOf('month'), moment().subtract(1, 'month').endOf('month')]
                    },
                    // Default to today instead of current month
                    startDate: moment(),
                    endDate: moment(),
                    locale: {
                        format: 'DD MMM YYYY',
                        separator: ' - ',
                        applyLabel: 'Apply',
                        cancelLabel: 'Cancel',
                        fromLabel: 'From',
                        toLabel: 'To',
                        customRangeLabel: 'Custom Range',
                        weekLabel: 'W',
                        daysOfWeek: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
                        monthNames: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
                        firstDay: 1
                    }
                });

                // Set initial value to today
                const today = moment().format('DD MMM YYYY');
                $('#receiptDateRangePicker').val(`${today} - ${today}`);
                console.log('Date picker value set to:', $('#receiptDateRangePicker').val());
                
                // Apply handler when date range changes
                $('#receiptDateRangePicker').on('apply.daterangepicker', function(ev, picker) {
                    const start = picker.startDate.format('YYYY-MM-DD');
                    const end = picker.endDate.format('YYYY-MM-DD');
                    console.log(`Date range changed to: ${start} to ${end}`);
                    updateReceiptStats(start, end);
                });
                
                console.log('Date range picker initialized with today as default');
                return true;
            } else {
                console.error('jQuery or daterangepicker not available');
                return false;
            }
        } catch (error) {
            console.error('Error initializing date range picker:', error);
            return false;
        }
    }

    // We shouldn't try to load data immediately, as Firebase auth might not be ready
    // Instead, we'll do everything in the auth state change handler
    
    // Handle Firebase auth state changes
    console.log('Setting up Firebase auth state change listener...');
    firebase.auth().onAuthStateChanged((user) => {
        if (user) {
            console.log('User logged in, UID:', user.uid);
            
            // Initialize or refresh application data
            loadApplicationData();
            
            // Initialize date range picker if not already done
            if (!datePickerInitialized) {
                datePickerInitialized = initDateRangePicker();
            }
            
            // Always update receipt statistics with today's date
            // This ensures we have data even if the date picker isn't initialized
            const today = moment().format('YYYY-MM-DD');
            console.log('Loading receipt statistics for today:', today);
            updateReceiptStats(today, today);
            
        } else {
            console.log('User logged out or not logged in, clearing UI...');
            document.getElementById('appName').textContent = '-';
            document.getElementById('appType').textContent = '-';
            document.getElementById('platform').textContent = '-';
            document.getElementById('status').textContent = '-';
            document.getElementById('receiptsSent').textContent = '0';
            document.getElementById('cost').textContent = 'Rp0';
        }
    });
    
    console.log('ReceiptController initialization complete');
}); 