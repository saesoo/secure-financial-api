const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { app, pool, request, resetDb, createUser, createAccount, transact, getBalance } = require('./helpers');

// close the database pool once, after every test in this file has finished
after(() => pool.end());

describe('account ownership (BOLA)', () => {
    let annie, bob, anniesAccount;

    beforeEach(async () => {
        await resetDb();
        annie = await createUser('annie');
        bob = await createUser('bob');
        anniesAccount = await createAccount(annie);
    });

    it('lets the owner read their own account', async () => {
        const res = await request(app).get(`/api/accounts/${anniesAccount.id}`).set('Authorization', annie.auth);
        assert.equal(res.status, 200);
    });

    it("hides someone else's account with a 404 identical to a missing one", async () => {
        const notMine = await request(app).get(`/api/accounts/${anniesAccount.id}`).set('Authorization', bob.auth);
        const missing = await request(app).get('/api/accounts/999999').set('Authorization', bob.auth);

        assert.equal(notMine.status, 404);
        assert.equal(missing.status, 404);
        assert.deepEqual(notMine.body, missing.body);
    });

    it("does not list someone else's accounts", async () => {
        const res = await request(app).get('/api/accounts').set('Authorization', bob.auth);
        assert.equal(res.status, 200);
        assert.equal(res.body.accounts.length, 0);
    });

    it("blocks reading someone else's transaction history", async () => {
        const res = await request(app)
            .get(`/api/accounts/${anniesAccount.id}/transactions`)
            .set('Authorization', bob.auth);
        assert.equal(res.status, 404);
    });

    it("blocks depositing into someone else's account", async () => {
        const res = await transact(bob, anniesAccount.id, { type: 'deposit', amount: 5000 });

        assert.equal(res.status, 404);
        assert.equal(await getBalance(anniesAccount.id), 0);
    });

    it('requires a token for every account route', async () => {
        const res = await request(app).get(`/api/accounts/${anniesAccount.id}`);
        assert.equal(res.status, 401);
    });
});

describe('account input validation', () => {
    let annie;

    beforeEach(async () => {
        await resetDb();
        annie = await createUser('annie');
    });

    it('rejects a currency that is not allowed', async () => {
        const res = await request(app)
            .post('/api/accounts')
            .set('Authorization', annie.auth)
            .send({ name: 'Main', currency: 'XXX' });
        assert.equal(res.status, 400);
    });

    it('rejects extra fields such as a starting balance', async () => {
        const res = await request(app)
            .post('/api/accounts')
            .set('Authorization', annie.auth)
            .send({ name: 'Main', currency: 'USD', balance: 1000000 });
        assert.equal(res.status, 400);
    });

    it('rejects an id that is not a positive whole number', async () => {
        const res = await request(app).get('/api/accounts/abc').set('Authorization', annie.auth);
        assert.equal(res.status, 400);
    });
});
