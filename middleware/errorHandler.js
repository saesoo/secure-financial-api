//handles requests to routes that don't exist

function notFound(req, res) {
    res.status(404).json({
        status: 'error', message: 'Not found.'
    });

}

function errorHandler(err, req, res, next) {
    const status = err.status || err.statusCode;
    const isClientError = status >= 400 && status < 500;

    // 4xx are already logged as warnings by the request logger;
    // unexpected errors get the full details and stack trace here
    if (!isClientError) {
        req.log.error({ err }, 'Unhandled error');
    }

    // if a response is already partly sent, let Express finish/close it
    if (res.headersSent) {
        return next(err);
    }

    if (isClientError) {
        const message = status === 413 ? 'Request too large.' : 'Invalid request.';
        return res.status(status).json({ status: 'error', message });
    }

    res.status(500).json({ status: 'error', message: 'Internal server error.' });
}


module.exports = { notFound, errorHandler };