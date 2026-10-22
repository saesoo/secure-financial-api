//handles requests to routes that don't exist

function notFound(req, res) {
    res.status(404).json({
        status: 'error', message: 'Not found.'
    });

}

// catches every error in the app
// the four parameters are what tell Express this is an error handler
function errorHandler (err, req, res, next) {
    // full details stay in the server terminal only, never in the response
    console.error(err);
    
    // if a response is already partly sent, let Express finish/close it
    if (res.headersSent) {
        return next(err);
    }

    // client mistakes carry a 4xx status 
    const status = err.status || err.statusCode;
    if (status >= 400 && status < 500) {
        const message = status === 413 ? 'Request too large.' : 'Invalid request.';
        return res.status(status).json({status: 'error', message});
    
    }
    res.status(500).json({status: 'error', message: 'Internal server error.'});
}

module.exports = { notFound, errorHandler };