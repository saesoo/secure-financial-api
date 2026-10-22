const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const users = require('../store/users');
const validate = require('../middleware/validate');
const { registerSchema, loginSchema } = require('../schemas/auth');
const refreshTokens = require('../store/refreshTokens');



const router = express.Router();

const BCRYPT_ROUNDS = 12;
// compared against when the email doesn't exist, so login takes the same time
// whether or not an account exists (prevents user enumeration by timing)
const DUMMY_HASH = bcrypt.hashSync('dummy-password', BCRYPT_ROUNDS);


function signToken(user) {
    return jwt.sign(
        { email: user.email }, // keep the payload small; it is signed, NOT encrypted
        process.env.JWT_SECRET,
        { subject: String(user.id), expiresIn: process.env.JWT_EXPIRES_IN || '15m', algorithm: 'HS256' }
    );
}

router.post('/register', validate(registerSchema), async (req, res) => {
    const { email, password } = req.body;

    if (await users.findByEmail(email)) {
        return res.status(409).json({ status: 'error', message: 'Unable to register with those details.' });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    let user;
    try {
        user = await users.create(email, passwordHash);
    } catch (err) {
        // 23505 = unique violation: someone registered this email between our check and insert
        if (err.code === '23505') {
            return res.status(409).json({ status: 'error', message: 'Unable to register with those details.' });
        }
        throw err;

    }
    
    req.log.info({ event: 'register_success', userId: user.id }, 'User registered');
    res.status(201).json({ status: 'success', user: { id: user.id, email: user.email } });
});

router.post('/login', validate(loginSchema), async (req, res) => {
    const { email, password } = req.body;

    const user = await users.findByEmail(email);
    const match = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);

    if (!user || !match) {
        req.log.warn({ event: 'login_failed', ip: req.ip }, 'Login failed');
        return res.status(401).json({ status: 'error', message: 'Invalid email or password.' });
    }

    req.log.info({ event: 'login_success', userId: user.id }, 'Login succeeded');

    const refreshToken = await refreshTokens.create(user.id);

    res.status(200).json({
        status: 'success',
        token: signToken(user),
        tokenType: 'Bearer',
        expiresIn: process.env.JWT_EXPIRES_IN || '15m',
        refreshToken
    });
});



module.exports = router;
