const crypto = require('crypto');
const pool = require('../db');

const REFRESH_TOKEN_DAYS = 7;

// the database only ever sees this hash, never the token itself
function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

// creates a refresh token for a user and returns the plain token.
// this is the only moment the plain token exists on the server
async function create(userId) {
    const token = crypto.randomBytes(48).toString('base64url');

    await pool.query(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, now() + make_interval(days => $3))`,
        [userId, hashToken(token), REFRESH_TOKEN_DAYS]
    );

    return token;
}

module.exports = { create, hashToken };
