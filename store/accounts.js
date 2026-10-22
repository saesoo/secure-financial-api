
const pool = require('../db');

async function create(userId, name, currency) {
    const result = await pool.query(
        `INSERT INTO accounts (user_id, name, currency)
         VALUES ($1, $2, $3)
         RETURNING id, name, currency, balance, created_at`,
        [userId, name, currency]
    );
    return result.rows[0];
}

async function listByUser(userId) {
    const result = await pool.query(
        'SELECT id, name, currency, balance, created_at FROM accounts WHERE user_id = $1 ORDER BY id',
        [userId]
    );
    return result.rows;
}

async function findByIdForUser(id, userId) {
    const result = await pool.query(
        `SELECT id, name, currency, balance, created_at
         FROM accounts
         WHERE id = $1 AND user_id = $2`,
        [id, userId]
    );
    return result.rows[0];
}


module.exports = { create, listByUser, findByIdForUser };
