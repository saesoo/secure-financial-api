const { describe, it, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { app, pool, request, resetDb, createUser } = require('./helpers');

// close the database pool once, after every test in this file has finished
after(() => pool.end());

async function login(user) {
    const res = await request(app).post('/api/auth/login').send({ email: user.email, password: user.password });
    return res.body;
}

function refresh(refreshToken) {
    return request(app).post('/api/auth/refresh').send({ refreshToken });
}

describe('refresh tokens', () => {
    let annie;

    beforeEach(async () => {
        await resetDb();
        annie = await createUser('annie');
    });

    it('login returns a refresh token and stores only its hash', async () => {
        const { refreshToken } = await login(annie);
        assert.ok(refreshToken && refreshToken.length >= 40);

        const stored = await pool.query('SELECT token_hash FROM refresh_tokens WHERE token_hash = $1', [refreshToken]);
        assert.equal(stored.rows.length, 0);
    });

    it('exchanges a refresh token for a new access token and a new refresh token', async () => {
        const first = await login(annie);
        const res = await refresh(first.refreshToken);

        assert.equal(res.status, 200);
        assert.ok(res.body.token);
        assert.ok(res.body.refreshToken);
        assert.notEqual(res.body.refreshToken, first.refreshToken);

        // the new access token really works
        const me = await request(app).get('/api/me').set('Authorization', `Bearer ${res.body.token}`);
        assert.equal(me.status, 200);
    });

    it('lets the new refresh token be used in turn', async () => {
        const first = await login(annie);
        const second = await refresh(first.refreshToken);
        const third = await refresh(second.body.refreshToken);
        assert.equal(third.status, 200);
    });

    it('treats a reused token as theft and revokes every session', async () => {
        const first = await login(annie);
        const second = await refresh(first.refreshToken); // legitimate rotation

        const replay = await refresh(first.refreshToken); // an attacker replays the old token
        assert.equal(replay.status, 401);

        // the newest token, which was valid a moment ago, is now dead too
        const afterTheft = await refresh(second.body.refreshToken);
        assert.equal(afterTheft.status, 401);
    });

    it('lets only one of many simultaneous requests use the same token', async () => {
        const first = await login(annie);

        // open eight database connections first, so the requests really do overlap
        await Promise.all(Array.from({ length: 8 }, () => pool.query('SELECT pg_sleep(0.3)')));

        // eight requests with the same token at once: exactly one may win
        const results = await Promise.all(
            Array.from({ length: 8 }, () => refresh(first.refreshToken))
        );

        const succeeded = results.filter((r) => r.status === 200).length;
        assert.equal(succeeded, 1);
    });

    it('rejects an unknown token with the same message as a reused one', async () => {
        const unknown = await refresh('x'.repeat(64));
        const first = await login(annie);
        await refresh(first.refreshToken);
        const reused = await refresh(first.refreshToken);

        assert.equal(unknown.status, 401);
        assert.deepEqual(unknown.body, reused.body);
    });

    it('rejects an expired token', async () => {
        const { refreshToken } = await login(annie);
        await pool.query("UPDATE refresh_tokens SET expires_at = now() - interval '1 minute'");

        const res = await refresh(refreshToken);
        assert.equal(res.status, 401);
    });

    it('rejects a malformed request body', async () => {
        const noToken = await request(app).post('/api/auth/refresh').send({});
        const extra = await request(app).post('/api/auth/refresh').send({ refreshToken: 'x'.repeat(64), role: 'admin' });
        const number = await request(app).post('/api/auth/refresh').send({ refreshToken: 12345 });

        assert.equal(noToken.status, 400);
        assert.equal(extra.status, 400);
        assert.equal(number.status, 400);
    });

    it("one user's reuse does not revoke another user's sessions", async () => {
        const bob = await createUser('bob');
        const bobSession = await login(bob);

        const first = await login(annie);
        await refresh(first.refreshToken);
        await refresh(first.refreshToken); // theft detected for annie

        const bobRefresh = await refresh(bobSession.refreshToken);
        assert.equal(bobRefresh.status, 200);
    });
});

describe('logout', () => {
    let annie;

    beforeEach(async () => {
        await resetDb();
        annie = await createUser('annie');
    });

    function logout(refreshToken) {
        return request(app).post('/api/auth/logout').send({ refreshToken });
    }

    it('revokes the refresh token so it can no longer be used', async () => {
        const { refreshToken } = await login(annie);

        const out = await logout(refreshToken);
        assert.equal(out.status, 200);

        const res = await refresh(refreshToken);
        assert.equal(res.status, 401);
    });

    it('only ends that one session, not the others', async () => {
        const phone = await login(annie);
        const laptop = await login(annie);

        await logout(phone.refreshToken);

        const laptopRefresh = await refresh(laptop.refreshToken);
        assert.equal(laptopRefresh.status, 200);
    });

    it('answers the same way for an unknown token, so nothing leaks', async () => {
        const { refreshToken } = await login(annie);
        const real = await logout(refreshToken);
        const unknown = await logout('x'.repeat(64));

        assert.equal(unknown.status, 200);
        assert.deepEqual(unknown.body, real.body);
    });

    it('can safely be called twice', async () => {
        const { refreshToken } = await login(annie);
        await logout(refreshToken);
        const again = await logout(refreshToken);
        assert.equal(again.status, 200);
    });

    it('rejects a malformed request body', async () => {
        const res = await request(app).post('/api/auth/logout').send({});
        assert.equal(res.status, 400);
    });
});
