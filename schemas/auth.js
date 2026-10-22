const { z } = require('zod');

// register: strict rules, because we are creating a password
const registerSchema = z
    .object({
        email: z.string().max(254).trim().toLowerCase().email('Must be a valid email'),
        password: z
            .string()
            .min(12, 'Must be at least 12 characters')
            .max(72, 'Must be at most 72 characters')
    })
    .strict(); // reject any extra fields

// login: only check the shape, so we don't reveal the password rules
const loginSchema = z
    .object({
        email: z.string().min(1).max(254).trim().toLowerCase(),
        password: z.string().min(1).max(72)
    })
    .strict();

// refresh: just the token string
const refreshSchema = z
    .object({
        refreshToken: z.string().min(20).max(200)
    })
    .strict();


module.exports = { registerSchema, loginSchema, refreshSchema };
