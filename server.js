require('dotenv').config(); // must run before the app (and anything else) reads process.env

const logger = require('./logger');

// refuse to start without a strong signing secret
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.error('JWT_SECRET is missing or too short (need 32+ characters). Check your .env file.');
    process.exit(1);
}

if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is missing. Check your .env file.');
    process.exit(1);
}

// loaded only after the checks above, so the app never runs with a bad config
const app = require('./app');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    logger.info({ port: PORT }, 'Server listening');
});
