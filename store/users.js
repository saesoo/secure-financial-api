// temporary in-memory user store; replace with database queries later
const users = new Map(); // email -> { id, email, passwordHash }
let nextId = 1;

function findByEmail(email) {
    return users.get(email);
}

function create(email, passwordHash) {
    const user = { id: nextId++, email, passwordHash };
    users.set(email, user);
    return user;
}

module.exports = { findByEmail, create };
