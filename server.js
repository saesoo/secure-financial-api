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
// listen only on the loopback address: nginx on the same machine is the only thing that
// should reach the app, and it also means X-Forwarded-For can't be faked by outside clients
const HOST = process.env.HOST || '127.0.0.1';

app.listen(PORT, HOST, () => {
    logger.info({ host: HOST, port: PORT }, 'Server listening');
});
