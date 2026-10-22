const express = require('express');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const accounts = require('../store/accounts');
const { createAccountSchema, idParamSchema } = require('../schemas/accounts');

const router = express.Router();

// every route in this file requires a valid token
router.use(authenticate);

router.post('/', validate(createAccountSchema), async (req, res) => {
    const { name, currency } = req.body;
    const account = await accounts.create(req.user.id, name, currency);
    res.status(201).json({ status: 'success', account });
});

router.get('/', async (req, res) => {
    const list = await accounts.listByUser(req.user.id);
    res.status(200).json({ status: 'success', accounts: list });
});

router.get('/:id', validate(idParamSchema, 'params'), async (req, res) => {
    const account = await accounts.findByIdForUser(req.params.id, req.user.id);

    if (!account) {
        return res.status(404).json({ status: 'error', message: 'Not found.' });
    }

    res.status(200).json({ status: 'success', account });
});


module.exports = router;
