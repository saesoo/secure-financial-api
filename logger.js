const pino = require('pino');
const usePretty = !['production', 'test'].includes(process.env.NODE_ENV);



const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    // backup safety net: if these fields ever end up in a log, they print as [REDACTED]
    redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.password_hash', '*.token'],
        censor: '[REDACTED]'
    },
    // readable output in development, plain JSON lines in production
    ...(usePretty ? { transport: { target: 'pino-pretty' } } : {})
});

module.exports = logger;
