const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const users = require('../store/users');

const router = express.Router();

const BCRYPT_ROUNDS = 12;
// compared against when the email doesn't exist, so login takes the same time
// whether or not an account exists (prevents user enumeration by timing)
const DUMMY_HASH = bcrypt.hashSync('dummy-password', BCRYPT_ROUNDS);

function validCredentials(email, password) {
    return (
        typeof email === 'string' &&
        typeof password === 'string' &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
        password.length >= 12 &&
        password.length <= 72 // bcrypt ignores anything past 72 bytes
    );
}

function signToken(user) {
    return jwt.sign(
        { email: user.email }, // keep the payload small; it is signed, NOT encrypted
        process.env.JWT_SECRET,
        { subject: String(user.id), expiresIn: process.env.JWT_EXPIRES_IN || '15m', algorithm: 'HS256' }
    );
}

router.post('/register', async (req, res) => {
    const { email, password } = req.body || {};

    if (!validCredentials(email, password)) {
        return res.status(400).json({
            status: 'error',
            message: 'Provide a valid email and a password of 12-72 characters.'
        });
    }

    const normalized = email.trim().toLowerCase();
    if (users.findByEmail(normalized)) {
        return res.status(409).json({ status: 'error', message: 'Unable to register with those details.' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = users.create(normalized, passwordHash);

    res.status(201).json({ status: 'success', user: { id: user.id, email: user.email } });
});

router.post('/login', async (req, res) => {
    const { email, password } = req.body || {};

    if (typeof email !== 'string' || typeof password !== 'string') {
        return res.status(400).json({ status: 'error', message: 'Email and password are required.' });
    }

    const user = users.findByEmail(email.trim().toLowerCase());
    const match = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);

    if (!user || !match) {
        return res.status(401).json({ status: 'error', message: 'Invalid email or password.' });
    }

    res.status(200).json({
        status: 'success',
        token: signToken(user),
        tokenType: 'Bearer',
        expiresIn: process.env.JWT_EXPIRES_IN || '15m'
    });
});

module.exports = router;
