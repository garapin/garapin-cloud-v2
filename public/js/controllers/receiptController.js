document.addEventListener('DOMContentLoaded', function() {
    let datePickerInitialized = false;

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
                return;
            }

            const token = await user.getIdToken();

            // Get application info
            const appInfoResponse = await fetch('/api/receipt/application-info', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!appInfoResponse.ok) {
                const errorText = await appInfoResponse.text();
                console.error('API Error Response:', errorText);
                throw new Error(`Failed to fetch application info: ${appInfoResponse.status}`);
            }

            const appData = await appInfoResponse.json();
            
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
                return;
            }

            const token = await user.getIdToken();
            
            // If no dates provided, use today's date for both
            if (!startDate || !endDate) {
                startDate = moment().format('YYYY-MM-DD');
                endDate = moment().format('YYYY-MM-DD');
            }
            
            // Build URL with date parameters
            let url = `/api/receipt/stats?start=${startDate}&end=${endDate}`;
            
            const receiptResponse = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (receiptResponse.ok) {
                const receiptData = await receiptResponse.json();
                
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
                
                // Apply handler when date range changes
                $('#receiptDateRangePicker').on('apply.daterangepicker', function(ev, picker) {
                    const start = picker.startDate.format('YYYY-MM-DD');
                    const end = picker.endDate.format('YYYY-MM-DD');
                    updateReceiptStats(start, end);
                });
                
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

    // Handle Firebase auth state changes
    firebase.auth().onAuthStateChanged((user) => {
        if (user) {
            // Initialize or refresh application data
            loadApplicationData();
            
            // Initialize date range picker if not already done
            if (!datePickerInitialized) {
                datePickerInitialized = initDateRangePicker();
            }
            
            // Always update receipt statistics with today's date
            // This ensures we have data even if the date picker isn't initialized
            const today = moment().format('YYYY-MM-DD');
            updateReceiptStats(today, today);
            
        } else {
            document.getElementById('appName').textContent = '-';
            document.getElementById('appType').textContent = '-';
            document.getElementById('platform').textContent = '-';
            document.getElementById('status').textContent = '-';
            document.getElementById('receiptsSent').textContent = '0';
            document.getElementById('cost').textContent = 'Rp0';
        }
    });
}); 