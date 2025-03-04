const mongoose = require('mongoose');

const globalPriceSchema = new mongoose.Schema({
    price: {
        marp: { type: Number },
        ordr: { type: Number },
        pros: { type: Number },
        rece: { type: Number }
    },
    price_object: { type: String, required: true }
}, {
    collection: 'global_price'
});

const GlobalPrice = mongoose.models.GlobalPrice || mongoose.model('GlobalPrice', globalPriceSchema);

module.exports = GlobalPrice; 