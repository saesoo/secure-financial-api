// usage: validate(schema) checks req.body
//        validate(schema, 'params') checks the URL parameters, like :id
function validate(schema, source = 'body') {
    return (req, res, next) => {
        const result = schema.safeParse(req[source]);

        if (!result.success) {
            const errors = result.error.issues.map((issue) => ({
                field: issue.path.join('.') || source,
                message: issue.message
            }));
            return res.status(400).json({ status: 'error', errors });
        }

        if (source === 'body') {
            req.body = result.data; // the cleaned data (trimmed, lowercased)
        }
        next();
    };
}

module.exports = validate;
