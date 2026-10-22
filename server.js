// setting up the Express application with a basic GET endpoint

require('dotenv').config(); // must run before anything reads process.env

const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const authenticate = require('./middleware/authenticate');
const limiter = require('./middleware/rateLimiter');
const helmet = require('helmet');
const { notFound, errorHandler } = require('./middleware/errorHandler');



// refuse to start without a strong signing secret
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.error('JWT_SECRET is missing or too short (need 32+ characters). Check your .env file.');
    process.exit(1);
}

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const app = express();

app.use(helmet());
app.use(cors({ origin: allowedOrigins}));
app.use(limiter);
app.use(express.json({ limit: '10kb' }));
app.use('/api/auth', authRoutes);

// example protected route: only works with a valid token
app.get('/api/me', authenticate, (req, res) => {
    res.status(200).json({ status: 'success', user: req.user });
});

app.get('/api/health', (req, res) => {
    const start = process.hrtime();

    // return a JSON payload
    res.status(200).json({
        status: 'success',
        message: 'Financial API is online.',
        timestamp: new Date().toISOString()
    });

    const diff = process.hrtime(start);
    console.log(`Response time: ${(diff[0] * 1e9 + diff[1]) / 1e6} ms`);

});

app.use(notFound);
app.use(errorHandler);

// start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});