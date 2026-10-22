const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const { app, pool, request } = require('./helpers');

// close the database pool once, after every test in this file has finished
after(() => pool.end());

describe('error handling', () => {
    it('answers broken JSON with a generic 400 and no stack trace', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .set('Content-Type', 'application/json')
            .send('{bad json');

        assert.equal(res.status, 400);
        assert.deepEqual(res.body, { status: 'error', message: 'Invalid request.' });
        assert.equal(res.text.includes('node_modules'), false);
    });

    it('answers an unknown route with a JSON 404', async () => {
        const res = await request(app).get('/api/nothing');
        assert.equal(res.status, 404);
        assert.equal(res.body.status, 'error');
    });

    it('rejects an oversized body with a 413', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ email: 'a@b.com', password: 'x'.repeat(20000) });
        assert.equal(res.status, 413);
    });
});

describe('security headers and CORS', () => {
    it('does not announce the framework and sets protective headers', async () => {
        const res = await request(app).get('/api/health');

        assert.equal(res.headers['x-powered-by'], undefined);
        assert.equal(res.headers['x-content-type-options'], 'nosniff');
    });

    it('does not grant CORS access to an unknown origin', async () => {
        const res = await request(app).get('/api/health').set('Origin', 'https://evil.example');
        assert.equal(res.headers['access-control-allow-origin'], undefined);
    });

    it('grants CORS access to an allowed origin', async () => {
        const res = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
        assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:5173');
    });
});
