const { Pool } = require('pg');

// a pool keeps several database connections open and reuses them
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// without this, an error on an idle connection would crash the whole app
pool.on('error', (err) => {
    console.error('Unexpected database error:', err.message);
});

module.exports = pool;
