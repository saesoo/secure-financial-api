const rateLimit = require('express-rate-limit');

const limiter = rateLimit({

    windowMs: 15 * 60 * 1000, // 15 minute window
    limit: 100,                // max requests per IP per window
    standardHeaders: 'draft-7', // send RateLimit-* headers so clients can see their quota
    legacyHeaders: false,      // skip the old X-RateLimit-* headers
    message: {status: 'error', message: "Too many requests. Please try again later."}



});

module.exports = limiter;

