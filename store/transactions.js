const pool = require('../db');

// returns an object with a status:
//   'created' | 'replayed' | 'not_found' | 'insufficient_funds' | 'key_conflict'
async function createTransaction({ accountId, userId, type, amount, key }) {
    // a transaction needs ONE connection for all its steps, so we borrow one from the pool
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // lock this account's row. Any other request for the same account waits here.
        // the user_id condition is the ownership check, same as the BOLA fix
        const account = await client.query(
            'SELECT balance FROM accounts WHERE id = $1 AND user_id = $2 FOR UPDATE',
            [accountId, userId]
        );

        if (account.rows.length === 0) {
            await client.query('ROLLBACK');
            return { status: 'not_found' };
        }

        const balance = Number(account.rows[0].balance);

        // have we already processed this key? (checked AFTER the lock, so retries can't race)
        const prior = await client.query(
            `SELECT id, type, amount, created_at FROM transactions
             WHERE account_id = $1 AND idempotency_key = $2`,
            [accountId, key]
        );

        if (prior.rows.length > 0) {
            await client.query('ROLLBACK');
            const old = prior.rows[0];
            const sameRequest = old.type === type && String(old.amount) === String(amount);
            return sameRequest
                ? { status: 'replayed', transaction: old, balance }
                : { status: 'key_conflict' };
        }

        if (type === 'withdrawal' && balance < amount) {
            await client.query('ROLLBACK');
            return { status: 'insufficient_funds' };
        }

        const change = type === 'deposit' ? amount : -amount;

        const updated = await client.query(
            'UPDATE accounts SET balance = balance + $1 WHERE id = $2 RETURNING balance',
            [change, accountId]
        );

        const inserted = await client.query(
            `INSERT INTO transactions (account_id, amount, type, idempotency_key)
             VALUES ($1, $2, $3, $4)
             RETURNING id, type, amount, created_at`,
            [accountId, amount, type, key]
        );

        await client.query('COMMIT');
        return { status: 'created', transaction: inserted.rows[0], balance: updated.rows[0].balance };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release(); // always give the connection back to the pool
    }
}

async function listForAccount(accountId, userId, limit) {
    const result = await pool.query(
        `SELECT t.id, t.type, t.amount, t.created_at
         FROM transactions t
         JOIN accounts a ON a.id = t.account_id
         WHERE t.account_id = $1 AND a.user_id = $2
         ORDER BY t.id DESC
         LIMIT $3`,
        [accountId, userId, limit]
    );
    return result.rows;
}

module.exports = { createTransaction, listForAccount };
