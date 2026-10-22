const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minute window
    limit: Number(process.env.RATE_LIMIT_MAX) || 100, // max requests per IP per window
    standardHeaders: 'draft-7', // send RateLimit-* headers so clients can see their quota
    legacyHeaders: false, // skip the old X-RateLimit-* headers
    message: { status: 'error', message: 'Too many requests. Please try again later.' },
    handler: (req, res, next, options) => {
        req.log.warn({ event: 'rate_limited', ip: req.ip }, 'Rate limit exceeded');
        res.status(options.statusCode).json(options.message);
    }
});

module.exports = limiter;


