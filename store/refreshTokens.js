const crypto = require('crypto');
const pool = require('../db');

const REFRESH_TOKEN_DAYS = 7;

// the database only ever sees this hash, never the token itself
function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

// creates a refresh token for a user and returns the plain token.
// this is the only moment the plain token exists on the server.
// db is the pool by default, or a client that is in the middle of a transaction
async function create(userId, db = pool) {
    const token = crypto.randomBytes(48).toString('base64url');

    await db.query(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, now() + make_interval(days => $3))`,
        [userId, hashToken(token), REFRESH_TOKEN_DAYS]
    );

    return token;
}

// swaps a refresh token for a brand new one. each token works exactly once.
// returns { status: 'ok', user, token }, { status: 'invalid' },
// or { status: 'reuse_detected', userId }
async function rotate(token) {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // lock the row so two requests with the same token cannot both succeed
        const found = await client.query(
            `SELECT rt.id, rt.user_id, rt.used_at, rt.revoked_at,
                    rt.expires_at <= now() AS expired, u.email
             FROM refresh_tokens rt
             JOIN users u ON u.id = rt.user_id
             WHERE rt.token_hash = $1
             FOR UPDATE OF rt`,
            [hashToken(token)]
        );

        if (found.rows.length === 0) {
            await client.query('ROLLBACK');
            return { status: 'invalid' };
        }

        const row = found.rows[0];

        // this token was already exchanged, so someone is replaying a copy.
        // revoke every session for this user and save that change
        if (row.used_at) {
            await client.query(
                'UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
                [row.user_id]
            );
            await client.query('COMMIT');
            return { status: 'reuse_detected', userId: row.user_id };
        }

        if (row.revoked_at || row.expired) {
            await client.query('ROLLBACK');
            return { status: 'invalid' };
        }

        await client.query('UPDATE refresh_tokens SET used_at = now() WHERE id = $1', [row.id]);
        const newToken = await create(row.user_id, client);

        await client.query('COMMIT');
        return { status: 'ok', user: { id: row.user_id, email: row.email }, token: newToken };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

// ends one session by revoking its refresh token.
// returns the user's id if a live token was revoked, or null if there was nothing to revoke
async function revoke(token) {
    const result = await pool.query(
        `UPDATE refresh_tokens SET revoked_at = now()
         WHERE token_hash = $1 AND revoked_at IS NULL
         RETURNING user_id`,
        [hashToken(token)]
    );

    return result.rows.length > 0 ? result.rows[0].user_id : null;
}

module.exports = { create, rotate, revoke, hashToken };

