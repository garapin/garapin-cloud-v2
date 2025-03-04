/**
 * This is a replacement implementation for the receipt stats endpoint.
 * Replace the app.get('/api/receipt/stats', ...) route in app.js with this code.
 */

app.get('/api/receipt/stats', verifyToken, requireRakuAIApproval, async (req, res) => {
    try {
        console.log('Receipt stats request for user:', req.user._id.toString());
        console.log('Date range:', req.query.start, 'to', req.query.end);
        console.log('User ID:', req.user._id, 'Provider UID:', req.user.provider_uid);
        
        if (!global.RakuReceipt) {
            console.log('RakuReceipt model not available');
            return res.json({ receiptCount: 0, totalCost: 0 });
        }
        
        // Build a simple query with just user_id and optional date range
        const query = { 
            user_id: req.user._id.toString() 
        };
        
        // Add date range filter if provided
        if (req.query.start && req.query.end) {
            // Set the start date to the beginning of the day (00:00:00) in UTC+7
            const startDate = new Date(req.query.start);
            startDate.setHours(0, 0, 0, 0);
            // Adjust for UTC+7
            startDate.setTime(startDate.getTime() - (7 * 60 * 60 * 1000));
            
            // Set the end date to the end of the day (23:59:59.999) in UTC+7
            const endDate = new Date(req.query.end);
            endDate.setHours(23, 59, 59, 999);
            // Adjust for UTC+7
            endDate.setTime(endDate.getTime() - (7 * 60 * 60 * 1000));
            
            console.log('Date range in UTC:', 
                startDate.toISOString(), 'to', 
                endDate.toISOString());
            
            // Try both date fields
            query.$or = [
                { created_at: { $gte: startDate, $lte: endDate } },
                { sentDate: { $gte: startDate, $lte: endDate } }
            ];
        }
        
        console.log('Simple query:', JSON.stringify(query));
        
        // Fetch all the receipts for this user directly
        const allReceipts = await global.RakuReceipt.find(query).lean();
        
        console.log(`Found ${allReceipts.length} total receipts for query`);
        
        // Process the receipt data in memory
        let receiptCount = 0;
        let totalCost = 0;
        
        // If we have receipts, process them
        if (allReceipts.length > 0) {
            // First check if we have a sample receipt for debugging
            console.log('First receipt fields:', Object.keys(allReceipts[0]));
            console.log('First receipt sample:', {
                id: allReceipts[0]._id,
                status: allReceipts[0].status,
                price_rece: allReceipts[0].price_rece,
                created_at: allReceipts[0].created_at
            });
            
            // Count receipts and sum price_rece values
            receiptCount = allReceipts.length;
            
            // Sum the price_rece field, handling potential null/undefined values
            totalCost = allReceipts.reduce((sum, receipt) => {
                const price = receipt.price_rece || 0;
                return sum + price;
            }, 0);
            
            console.log(`Calculated receipt count: ${receiptCount}`);
            console.log(`Calculated total cost: ${totalCost}`);
        }
        
        // Send the results back to the client
        res.json({
            receiptCount,
            totalCost
        });
    } catch (error) {
        console.error('Error fetching receipt statistics:', error);
        res.status(500).json({ 
            error: 'Failed to fetch receipt statistics', 
            details: error.message,
            receiptCount: 0,
            totalCost: 0
        });
    }
}); 