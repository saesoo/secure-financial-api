const jwt = require('jsonwebtoken');

// protects a route: requires "Authorization: Bearer <token>"
function authenticate(req, res, next) {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
        return res.status(401).json({ status: 'error', message: 'Authentication required.' });
    }

    try {
        // pin the algorithm so a token can't pick a weaker one (e.g. "none")
        const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
        req.user = { id: payload.sub, email: payload.email };
        next();
    } catch (err) {
        // same message for expired, malformed, or tampered tokens
        return res.status(401).json({ status: 'error', message: 'Invalid or expired token.' });
    }
}

module.exports = authenticate;
