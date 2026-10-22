const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { app, pool, request, resetDb, createUser } = require('./helpers');

// close the database pool once, after every test in this file has finished
after(() => pool.end());

describe('authentication', () => {
    beforeEach(resetDb);

    it('registers a user without exposing the password or hash', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ email: 'annie@example.com', password: 'correct-horse-battery' });

        assert.equal(res.status, 201);
        assert.equal(res.body.user.email, 'annie@example.com');
        assert.equal(JSON.stringify(res.body).includes('password'), false);
    });

    it('stores a bcrypt hash, never the real password', async () => {
        await createUser('annie');
        const result = await pool.query('SELECT password_hash FROM users');
        assert.ok(result.rows[0].password_hash.startsWith('$2'));
        assert.notEqual(result.rows[0].password_hash, 'correct-horse-battery');
    });

    it('rejects a duplicate email with a generic message', async () => {
        await createUser('annie');
        const res = await request(app)
            .post('/api/auth/register')
            .send({ email: 'ANNIE@example.com', password: 'correct-horse-battery' });

        assert.equal(res.status, 409);
    });

    it('rejects a weak password', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ email: 'annie@example.com', password: 'short' });

        assert.equal(res.status, 400);
    });

    it('rejects extra fields (mass assignment)', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ email: 'annie@example.com', password: 'correct-horse-battery', role: 'admin' });

        assert.equal(res.status, 400);
    });

    it('gives the same error for a wrong password and an unknown user', async () => {
        await createUser('annie');
        const wrongPassword = await request(app)
            .post('/api/auth/login')
            .send({ email: 'annie@example.com', password: 'wrong-password-here' });
        const unknownUser = await request(app)
            .post('/api/auth/login')
            .send({ email: 'nobody@example.com', password: 'wrong-password-here' });

        assert.equal(wrongPassword.status, 401);
        assert.equal(unknownUser.status, 401);
        assert.deepEqual(wrongPassword.body, unknownUser.body);
    });
});

describe('token checks', () => {
    beforeEach(resetDb);

    it('rejects a request with no token', async () => {
        const res = await request(app).get('/api/me');
        assert.equal(res.status, 401);
    });

    it('accepts a valid token', async () => {
        const annie = await createUser('annie');
        const res = await request(app).get('/api/me').set('Authorization', annie.auth);

        assert.equal(res.status, 200);
        assert.equal(res.body.user.email, 'annie@example.com');
    });

    it('rejects a tampered token', async () => {
        const annie = await createUser('annie');
        const res = await request(app).get('/api/me').set('Authorization', `${annie.auth}x`);
        assert.equal(res.status, 401);
    });

    it('rejects a forged token that claims alg "none"', async () => {
        const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
        const forged = `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: '1', email: 'x@x.com' })}.`;

        const res = await request(app).get('/api/me').set('Authorization', `Bearer ${forged}`);
        assert.equal(res.status, 401);
    });
});
