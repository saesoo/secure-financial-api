const { z } = require('zod');

const createAccountSchema = z
    .object({
        name: z.string().trim().min(1).max(50),
        currency: z.enum(['USD', 'EUR', 'GBP'])
    })
    .strict();

// ids must be plain positive whole numbers (digits only, up to 15 of them)
const idParamSchema = z
    .object({
        id: z.string().regex(/^[1-9]\d{0,14}$/, 'Must be a positive whole number')
    })
    .strict();

module.exports = { createAccountSchema, idParamSchema };
