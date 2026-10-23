const pinoHttp = require('pino-http');
const logger = require('../logger');

module.exports = pinoHttp({
    logger,
    // log only the fields we choose: never headers, never bodies
    serializers: {
        req: (req) => ({ id: req.id, method: req.method, url: req.url }),
        res: (res) => ({ statusCode: res.statusCode })
    },
    // behind nginx the raw socket address is always 127.0.0.1, so log Express's req.ip,
    // which uses X-Forwarded-For because 'trust proxy' is set in app.js
    customProps: (req) => ({ clientIp: req.ip }),
    // 5xx = error, 4xx = warn, everything else = info
    customLogLevel: (req, res, err) => {
        if (err || res.statusCode >= 500) return 'error';
        if (res.statusCode >= 400) return 'warn';
        return 'info';
    }
});
