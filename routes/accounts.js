const express = require('express');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const accounts = require('../store/accounts');
const { createAccountSchema, idParamSchema } = require('../schemas/accounts');
const transactions = require('../store/transactions');

const {
    createTransactionSchema,
    idempotencyHeaderSchema,
    listQuerySchema
} = require('../schemas/transactions');

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

router.post(
    '/:id/transactions',
    validate(idParamSchema, 'params'),
    validate(idempotencyHeaderSchema, 'headers'),
    validate(createTransactionSchema),
    async (req, res) => {
        const { type, amount } = req.body;

        const result = await transactions.createTransaction({
            accountId: req.params.id,
            userId: req.user.id,
            type,
            amount,
            key: req.headers['idempotency-key']
        });

        if (result.status === 'not_found') {
            return res.status(404).json({ status: 'error', message: 'Not found.' });
        }
        if (result.status === 'insufficient_funds') {
            return res.status(422).json({ status: 'error', message: 'Insufficient funds.' });
        }
        if (result.status === 'key_conflict') {
            return res.status(409).json({
                status: 'error',
                message: 'This Idempotency-Key was already used for a different request.'
            });
        }
        if (result.status === 'replayed') {
            return res.status(200).json({
                status: 'success',
                replayed: true,
                transaction: result.transaction,
                balance: result.balance
            });
        }

        res.status(201).json({
            status: 'success',
            transaction: result.transaction,
            balance: result.balance
        });
    }
);

router.get(
    '/:id/transactions',
    validate(idParamSchema, 'params'),
    validate(listQuerySchema, 'query'),
    async (req, res) => {
        const account = await accounts.findByIdForUser(req.params.id, req.user.id);

        if (!account) {
            return res.status(404).json({ status: 'error', message: 'Not found.' });
        }

        const limit = Number(req.query.limit) || 20;
        const list = await transactions.listForAccount(req.params.id, req.user.id, limit);

        res.status(200).json({ status: 'success', transactions: list });
    }
);



module.exports = router;
