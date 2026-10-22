const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { app, pool, request, resetDb, createUser, createAccount, transact, getBalance } = require('./helpers');

// close the database pool once, after every test in this file has finished
after(() => pool.end());

describe('transactions', () => {
    let annie, account;

    beforeEach(async () => {
        await resetDb();
        annie = await createUser('annie');
        account = await createAccount(annie);
    });

    it('credits a deposit and debits a withdrawal', async () => {
        const deposit = await transact(annie, account.id, { type: 'deposit', amount: 10000 });
        assert.equal(deposit.status, 201);
        assert.equal(deposit.body.balance, '10000');

        const withdrawal = await transact(annie, account.id, { type: 'withdrawal', amount: 8000 });
        assert.equal(withdrawal.status, 201);
        assert.equal(withdrawal.body.balance, '2000');
    });

    it('refuses an overdraft and leaves the balance alone', async () => {
        await transact(annie, account.id, { type: 'deposit', amount: 2000 });
        const res = await transact(annie, account.id, { type: 'withdrawal', amount: 5000 });

        assert.equal(res.status, 422);
        assert.equal(await getBalance(account.id), 2000);
    });

    it('rejects invalid amounts', async () => {
        const badAmounts = [-500, 0, 10.5, '100', 99999999, null];
        for (const amount of badAmounts) {
            const res = await transact(annie, account.id, { type: 'deposit', amount });
            assert.equal(res.status, 400, `amount ${JSON.stringify(amount)} should be rejected`);
        }
        assert.equal(await getBalance(account.id), 0);
    });

    it('rejects an unknown transaction type and extra fields', async () => {
        const badType = await transact(annie, account.id, { type: 'transfer', amount: 100 });
        const extra = await transact(annie, account.id, { type: 'deposit', amount: 100, accountId: 2 });

        assert.equal(badType.status, 400);
        assert.equal(extra.status, 400);
    });

    it('requires an Idempotency-Key header', async () => {
        const res = await request(app)
            .post(`/api/accounts/${account.id}/transactions`)
            .set('Authorization', annie.auth)
            .send({ type: 'deposit', amount: 100 });

        assert.equal(res.status, 400);
    });

    it('does not apply the same request twice (idempotency)', async () => {
        const key = 'retry-key-0001';
        const first = await transact(annie, account.id, { type: 'deposit', amount: 5000 }, key);
        const retry = await transact(annie, account.id, { type: 'deposit', amount: 5000 }, key);

        assert.equal(first.status, 201);
        assert.equal(retry.status, 200);
        assert.equal(retry.body.replayed, true);
        assert.equal(await getBalance(account.id), 5000);

        const rows = await pool.query('SELECT count(*) FROM transactions');
        assert.equal(rows.rows[0].count, '1');
    });

    it('rejects a reused key with a different request', async () => {
        const key = 'retry-key-0002';
        await transact(annie, account.id, { type: 'deposit', amount: 5000 }, key);
        const conflict = await transact(annie, account.id, { type: 'deposit', amount: 99999 }, key);

        assert.equal(conflict.status, 409);
        assert.equal(await getBalance(account.id), 5000);
    });

    it('never lets simultaneous withdrawals overdraw the account', async () => {
        await transact(annie, account.id, { type: 'deposit', amount: 1000 });

        // ten 300-cent withdrawals at once against 1000 cents: only three can succeed
        const results = await Promise.all(
            Array.from({ length: 10 }, () => transact(annie, account.id, { type: 'withdrawal', amount: 300 }))
        );

        const succeeded = results.filter((r) => r.status === 201).length;
        const refused = results.filter((r) => r.status === 422).length;

        assert.equal(succeeded, 3);
        assert.equal(refused, 7);
        assert.equal(await getBalance(account.id), 100);
    });

    it('keeps the stored balance equal to the sum of the history', async () => {
        await transact(annie, account.id, { type: 'deposit', amount: 7000 });
        await transact(annie, account.id, { type: 'withdrawal', amount: 1250 });
        await transact(annie, account.id, { type: 'deposit', amount: 400 });

        const sum = await pool.query(
            `SELECT COALESCE(SUM(CASE WHEN type = 'deposit' THEN amount ELSE -amount END), 0) AS total
             FROM transactions WHERE account_id = $1`,
            [account.id]
        );
        assert.equal(Number(sum.rows[0].total), await getBalance(account.id));
    });
});
