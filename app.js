const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const authRoutes = require('./routes/auth');
const accountRoutes = require('./routes/accounts');
const authenticate = require('./middleware/authenticate');
const limiter = require('./middleware/rateLimiter');
const requestLogger = require('./middleware/requestLogger');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const app = express();

app.use(requestLogger);
app.use(helmet());
app.use(cors({ origin: allowedOrigins }));
app.use(limiter);
app.use(express.json({ limit: '10kb' }));

app.use('/api/auth', authRoutes);
app.use('/api/accounts', accountRoutes);

// example protected route: only works with a valid token
app.get('/api/me', authenticate, (req, res) => {
    res.status(200).json({ status: 'success', user: req.user });
});

app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'success',
        message: 'Financial API is online.',
        timestamp: new Date().toISOString()
    });
});

app.use(notFound);
app.use(errorHandler);

module.exports = app;
