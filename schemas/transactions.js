const { z } = require('zod');

const createTransactionSchema = z
    .object({
        type: z.enum(['deposit', 'withdrawal']),
        amount: z.number().int().positive().max(1000000) // cents, so at most $10,000
    })
    .strict();

// header names arrive lowercase; other headers are expected, so this one is not strict
const idempotencyHeaderSchema = z.object({
    'idempotency-key': z
        .string()
        .regex(/^[A-Za-z0-9_-]{8,64}$/, 'Must be 8-64 characters: letters, numbers, - or _')
});

// ?limit=1 to ?limit=100
const listQuerySchema = z
    .object({
        limit: z.string().regex(/^([1-9]\d?|100)$/, 'Must be a number from 1 to 100').optional()
    })
    .strict();

module.exports = { createTransactionSchema, idempotencyHeaderSchema, listQuerySchema };
