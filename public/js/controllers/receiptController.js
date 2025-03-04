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

    // Check for approval overlay - if present, no need to proceed with data loading
    const approvalRequired = document.querySelector('.approval-required-overlay');
    if (approvalRequired) {
        return; // Exit early, no need to load data if approval is required
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
                throw new Error(`Failed to fetch application info: ${appInfoResponse.status}`);
            }

            const appData = await appInfoResponse.json();
            
            // Update application info from profile.raku_ai
            document.getElementById('appName').textContent = appData.appName || appData.app_name || '-';
            document.getElementById('appType').textContent = appData.appType || appData.application_type || '-';
            document.getElementById('platform').textContent = appData.platform || '-';
            
            const statusElement = document.getElementById('status');
            statusElement.textContent = appData.status || '-';
            
            // Update status color based on status
            if (appData.status?.toLowerCase() === 'approved') {
                statusElement.style.color = '#28a745'; // Green for approved
            } else if (appData.status?.toLowerCase() === 'pending') {
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
                console.log('No user logged in for updateReceiptStats');
                return;
            }

            const token = await user.getIdToken();
            
            // If no dates provided, use today's date for both
            if (!startDate || !endDate) {
                // Adjust for UTC+7 timezone - use moment timezone with Asia/Jakarta
                const today = moment().utcOffset('+07:00');
                startDate = today.format('YYYY-MM-DD');
                endDate = today.format('YYYY-MM-DD');
            }
            
            console.log(`Fetching receipt stats for date range: ${startDate} to ${endDate}`);
            
            // Use the same API endpoint as raku-ai.ejs for receipt count calculation
            const receiptCountUrl = `/api/raku-ai/receipt-count?start=${startDate}&end=${endDate}&timezone=%2B07:00`;
            
            try {
                const receiptResponse = await fetch(receiptCountUrl, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (receiptResponse.ok) {
                    const contentType = receiptResponse.headers.get('content-type');
                    
                    if (contentType && contentType.includes('application/json')) {
                        const receiptData = await receiptResponse.json();
                        
                        // Update receipt count - check both possible fields
                        let receiptCount = 0;
                        if (receiptData.count !== undefined) {
                            receiptCount = receiptData.count;
                        } else if (receiptData.receiptCount !== undefined) {
                            receiptCount = receiptData.receiptCount;
                        }
                        
                        document.getElementById('receiptsSent').textContent = receiptCount.toString();

                        // Calculate the cost based on the actual number of receipts found
                        // This matches how the stats endpoint calculates cost (1000 per receipt)
                        const costPerReceipt = 1000; // Standard price per receipt
                        const totalCost = receiptCount * costPerReceipt;
                        document.getElementById('cost').textContent = formatCurrency(totalCost);
                        
                        // Try to get more accurate cost data
                        tryGetActualCostFromStats(startDate, endDate, token, receiptCount);
                    } else {
                        console.error('Receipt count response is not JSON');
                        document.getElementById('receiptsSent').textContent = '0';
                        document.getElementById('cost').textContent = formatCurrency(0);
                    }
                } else {
                    console.error(`Failed to fetch receipt count: ${receiptResponse.status}`);
                    document.getElementById('receiptsSent').textContent = '0';
                    document.getElementById('cost').textContent = formatCurrency(0);
                }
            } catch (error) {
                console.error('Error in receipt count function:', error);
                document.getElementById('receiptsSent').textContent = '0';
                document.getElementById('cost').textContent = formatCurrency(0);
            }
        } catch (error) {
            console.error('Error updating receipt stats:', error);
            document.getElementById('receiptsSent').textContent = '0';
            document.getElementById('cost').textContent = formatCurrency(0);
        }
    }

    // Function to try getting actual cost from stats API (optional, only for accurate cost)
    async function tryGetActualCostFromStats(startDate, endDate, token, receiptCount) {
        try {
            const statsUrl = `/api/receipt/stats?start=${startDate}&end=${endDate}`;
            
            const statsResponse = await fetch(statsUrl, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (statsResponse.ok) {
                const contentType = statsResponse.headers.get('content-type');
                
                if (contentType && contentType.includes('application/json')) {
                    const statsData = await statsResponse.json();
                    
                    // Calculate correct cost based on the receipt count 
                    // from the more accurate receipt-count endpoint
                    const costPerReceipt = statsData.totalCost && statsData.receiptCount ? 
                        statsData.totalCost / statsData.receiptCount : 1000;
                    
                    // Apply the cost per receipt to the accurate count
                    const totalCost = receiptCount * costPerReceipt;
                    
                    document.getElementById('cost').textContent = formatCurrency(totalCost);
                    return;
                }
            }
        } catch (error) {
            console.error('Error calling stats API for cost:', error);
            // We already have fallback cost set, so no action needed
        }
    }

    // Initialize date range picker
    function initDateRangePicker() {
        try {
            if (window.jQuery && $.fn.daterangepicker) {
                const $ = window.jQuery;
                
                // Initialize the date range picker with UTC+7 timezone
                $('#receiptDateRangePicker').daterangepicker({
                    opens: 'left',
                    maxDate: new Date(),
                    autoApply: false,
                    showDropdowns: true,
                    alwaysShowCalendars: true,
                    ranges: {
                       'Today': [moment().utcOffset('+07:00'), moment().utcOffset('+07:00')],
                       'Yesterday': [moment().utcOffset('+07:00').subtract(1, 'days'), moment().utcOffset('+07:00').subtract(1, 'days')],
                       'Last 7 Days': [moment().utcOffset('+07:00').subtract(6, 'days'), moment().utcOffset('+07:00')],
                       'Last 30 Days': [moment().utcOffset('+07:00').subtract(29, 'days'), moment().utcOffset('+07:00')],
                       'This Month': [moment().utcOffset('+07:00').startOf('month'), moment().utcOffset('+07:00').endOf('month')],
                       'Last Month': [moment().utcOffset('+07:00').subtract(1, 'month').startOf('month'), moment().utcOffset('+07:00').subtract(1, 'month').endOf('month')]
                    },
                    // Default to today instead of current month
                    startDate: moment().utcOffset('+07:00'),
                    endDate: moment().utcOffset('+07:00'),
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
                const today = moment().utcOffset('+07:00').format('DD MMM YYYY');
                $('#receiptDateRangePicker').val(`${today} - ${today}`);
                
                // Apply handler when date range changes
                $('#receiptDateRangePicker').on('apply.daterangepicker', function(ev, picker) {
                    const start = picker.startDate.format('YYYY-MM-DD');
                    const end = picker.endDate.format('YYYY-MM-DD');
                    updateReceiptStats(start, end);
                });
                
                return true;
            } else {
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
            // Initialize application data
            loadApplicationData();
            
            // Initialize date range picker if not already done
            if (!datePickerInitialized) {
                datePickerInitialized = initDateRangePicker();
            }
            
            // Always update receipt statistics with today's date
            // This ensures we have data even if the date picker isn't initialized
            const today = moment().utcOffset('+07:00').format('YYYY-MM-DD');
            updateReceiptStats(today, today);
            
        } else {
            // If user is logged out, clear the UI
            document.getElementById('appName').textContent = '-';
            document.getElementById('appType').textContent = '-';
            document.getElementById('platform').textContent = '-';
            document.getElementById('status').textContent = '-';
            document.getElementById('receiptsSent').textContent = '0';
            document.getElementById('cost').textContent = formatCurrency(0);
            
            // If we're on this page but not logged in, redirect to login page
            if (window.location.pathname.includes('/raku-ai/receipt')) {
                window.location.href = '/auth/login?redirect=' + encodeURIComponent(window.location.pathname);
            }
        }
    });

    // No need to call loadApplicationData() directly - the auth state change handler will handle it
}); 