const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.test') });

// safety: tests wipe tables, so refuse to run against anything but a test database
if (!/_test$/.test(process.env.DATABASE_URL || '')) {
    throw new Error('Refusing to run: DATABASE_URL must point to a database whose name ends in _test');
}

const request = require('supertest');
const app = require('../app');
const pool = require('../db');

const PASSWORD = 'correct-horse-battery';

async function resetDb() {
    await pool.query('TRUNCATE transactions, accounts, users RESTART IDENTITY CASCADE');
}

// registers and logs in a user; returns what the tests need to act as them
async function createUser(name) {
    const email = `${name}@example.com`;
    await request(app).post('/api/auth/register').send({ email, password: PASSWORD }).expect(201);
    const res = await request(app).post('/api/auth/login').send({ email, password: PASSWORD }).expect(200);
    return { email, password: PASSWORD, token: res.body.token, auth: `Bearer ${res.body.token}` };
}

async function createAccount(user, name = 'Main') {
    const res = await request(app)
        .post('/api/accounts')
        .set('Authorization', user.auth)
        .send({ name, currency: 'USD' })
        .expect(201);
    return res.body.account;
}

// every transaction needs a unique Idempotency-Key (8-64 chars: letters, numbers, - or _)
let keyCount = 0;
function newKey() {
    keyCount += 1;
    return `test-key-${Date.now()}-${keyCount}`;
}

function transact(user, accountId, body, key = newKey()) {
    return request(app)
        .post(`/api/accounts/${accountId}/transactions`)
        .set('Authorization', user.auth)
        .set('Idempotency-Key', key)
        .send(body);
}

async function getBalance(accountId) {
    const result = await pool.query('SELECT balance FROM accounts WHERE id = $1', [accountId]);
    return Number(result.rows[0].balance);
}

module.exports = { app, pool, request, resetDb, createUser, createAccount, transact, getBalance };
