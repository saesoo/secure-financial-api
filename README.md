# Secure Financial API

![Tests](https://github.com/saesoo/secure-financial-api/actions/workflows/tests.yml/badge.svg)
![Security checks](https://github.com/saesoo/secure-financial-api/actions/workflows/security.yml/badge.svg)

A REST API for financial data built with Node.js, Express and PostgreSQL. Users register, log in with JWTs, open accounts, and make deposits and withdrawals. The project is built around one question: how do you handle money and personal data safely? Every security decision below is covered by an automated test, and the API is deployed on AWS EC2 behind nginx with HTTPS.

Live health check: `https://api.annelisesoonyadeth.dev/api/health`

## Highlights

- JWT authentication with short-lived access tokens and rotating, hashed refresh tokens (reuse detection and logout)
- Object-level authorization: users can only ever see or change their own accounts
- Money handled safely: integer cents, row-level locking, idempotency keys, database-enforced rules
- Strict schema validation on every request (zod), including URL parameters and headers
- Rate limiting, secure headers, restricted CORS, and error responses that never leak internals
- Structured audit logging with secrets redacted
- Automated tests, dependency auditing and CI on every push
- Deployed to AWS EC2 (Ubuntu) behind nginx with a Let's Encrypt certificate, running as a systemd service

## Security measures

Mapped to the [OWASP API Security Top 10 (2023)](https://owasp.org/API-Security/editions/2023/en/0x11-t10/):

| Risk | What this project does |
|---|---|
| API1: Broken object level authorization | Every account query includes `AND user_id = $2`. Another user's account returns the same `404` as one that does not exist. |
| API2: Broken authentication | bcrypt (12 rounds) password hashing, algorithm pinned to HS256, 15-minute access tokens, single-use refresh tokens that are stored only as SHA-256 hashes, and reuse of a refresh token revokes all of that user's sessions. Login responds identically and takes similar time for unknown users and wrong passwords. |
| API3: Broken object property level authorization | Request schemas are strict, so unexpected fields (`role`, `balance`, ...) are rejected, which blocks mass assignment. |
| API4: Unrestricted resource consumption | Per-IP rate limiting, a 10 KB body limit (also enforced by nginx), and a capped page size on listings. |
| API6: Unrestricted access to sensitive business flows | Withdrawals lock the account row inside a database transaction, so simultaneous requests cannot overdraw it. A required `Idempotency-Key` stops duplicate payments on retries. Amounts are positive integers with a per-transaction cap. A `CHECK (balance >= 0)` constraint is the last line of defense. |
| API8: Security misconfiguration | `helmet` headers, no `X-Powered-By`, nginx version hidden, CORS limited to an allow-list of origins, and a central error handler that returns generic messages (no stack traces). |
| Transport security | HTTPS only: nginx terminates TLS (TLS 1.3, Let's Encrypt certificate renewed automatically), HTTP redirects to HTTPS, and `Strict-Transport-Security` is sent. |
| Network exposure | The EC2 security group allows only ports 80 and 443 from the internet and SSH from a single IP. The app and PostgreSQL listen on `127.0.0.1` only. |
| Injection | Parameterized queries only. Inputs are also validated before they reach the database. |
| Logging and monitoring | Structured JSON logs (pino) with `Authorization` headers and password fields redacted, and the real client IP recorded behind the proxy. Security events are logged: failed logins, rejected tokens, access to accounts the user does not own, refused withdrawals, rate-limit hits and refresh-token reuse. |
| Vulnerable components | `npm audit` and Dependabot run in CI, and installs use the lock file (`npm ci`). |

Not applicable here: API5 (no admin or role-based functions), API7 (the API makes no outbound requests on behalf of users), API9 and API10.

## Tech stack

Node.js, Express 5, PostgreSQL 17, `pg` (raw SQL), `jsonwebtoken`, `bcryptjs`, `zod`, `helmet`, `express-rate-limit`, `pino`. Tests use Node's built-in test runner with `supertest`. CI runs on GitHub Actions. Deployed with nginx, Let's Encrypt (certbot), systemd and Docker on AWS EC2.

## API reference

All request and response bodies are JSON. Protected routes need `Authorization: Bearer <access token>`.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | none | Health check |
| POST | `/api/auth/register` | none | Create a user. Password must be 12-72 characters |
| POST | `/api/auth/login` | none | Returns `token` (access), `refreshToken` |
| POST | `/api/auth/refresh` | none | Exchange a refresh token for a new access token and a new refresh token |
| POST | `/api/auth/logout` | none | Revoke a refresh token |
| GET | `/api/me` | Bearer | The authenticated user |
| POST | `/api/accounts` | Bearer | Create an account (`name`, `currency`: USD, EUR or GBP) |
| GET | `/api/accounts` | Bearer | List your accounts |
| GET | `/api/accounts/:id` | Bearer | One of your accounts |
| POST | `/api/accounts/:id/transactions` | Bearer + `Idempotency-Key` header | Deposit or withdrawal (`type`, `amount` in cents, max 1,000,000) |
| GET | `/api/accounts/:id/transactions?limit=20` | Bearer | History, newest first (`limit` 1-100) |

Amounts and balances are whole numbers of cents: `1050` means $10.50.

Status codes: `200` / `201` success, `400` invalid input, `401` not authenticated, `404` not found (or not yours), `409` conflict (duplicate email or reused idempotency key), `413` body too large, `422` insufficient funds, `429` rate limited.

### Example

```bash
# register and log in
curl -s -H "Content-Type: application/json" \
  -d '{"email":"annie@example.com","password":"correct-horse-battery"}' \
  http://localhost:3000/api/auth/register

curl -s -H "Content-Type: application/json" \
  -d '{"email":"annie@example.com","password":"correct-horse-battery"}' \
  http://localhost:3000/api/auth/login

# open an account and deposit $100.00
curl -s -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Savings","currency":"USD"}' http://localhost:3000/api/accounts

curl -s -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "Idempotency-Key: deposit-0001" \
  -d '{"type":"deposit","amount":10000}' \
  http://localhost:3000/api/accounts/1/transactions
```

Sending the same request again with the same `Idempotency-Key` returns the original result and does not apply it twice.

## Getting started

Requirements: Node.js 24 and Docker (for PostgreSQL).

```bash
git clone https://github.com/saesoo/secure-financial-api.git
cd secure-financial-api
npm install
```

**1. Start PostgreSQL**

```bash
docker run --name finapi-postgres \
  -e POSTGRES_PASSWORD=choose-an-admin-password \
  -p 127.0.0.1:5432:5432 \
  -v finapi-pgdata:/var/lib/postgresql/data \
  -d postgres:17
```

**2. Create the app's database user, database and tables**

```bash
docker exec -it finapi-postgres psql -U postgres -c "CREATE USER finapi_app WITH PASSWORD 'choose-an-app-password';"
docker exec -it finapi-postgres psql -U postgres -c "CREATE DATABASE finapi OWNER finapi_app;"
docker exec -i finapi-postgres psql -U finapi_app -d finapi < schema.sql
```

**3. Create a `.env` file** (it is gitignored; never commit it)

```
JWT_SECRET=<64 random bytes as hex>
JWT_EXPIRES_IN=15m
DATABASE_URL=postgres://finapi_app:<app-password>@localhost:5432/finapi
ALLOWED_ORIGINS=http://localhost:5173
PORT=3000
```

Generate a secret with `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`. The server refuses to start without a secret of at least 32 characters.

**4. Run**

```bash
node server.js
curl http://localhost:3000/api/health
```

Optional settings: `LOG_LEVEL` (default `info`), `RATE_LIMIT_MAX` (default `100` requests per 15 minutes per IP), `HOST` (default `127.0.0.1`, the address the server listens on) and `NODE_ENV=production` (plain JSON logs).

## Running the tests

Tests run against a separate database and wipe its tables, so they refuse to start unless the database name ends in `_test`.

```bash
docker exec -it finapi-postgres psql -U postgres -c "CREATE DATABASE finapi_test OWNER finapi_app;"
docker exec -i finapi-postgres psql -U finapi_app -d finapi_test < schema.sql
```

Create `.env.test` (gitignored):

```
NODE_ENV=test
JWT_SECRET=<a different 64-byte hex secret>
JWT_EXPIRES_IN=15m
DATABASE_URL=postgres://finapi_app:<app-password>@localhost:5432/finapi_test
ALLOWED_ORIGINS=http://localhost:5173
LOG_LEVEL=silent
RATE_LIMIT_MAX=100000
```

```bash
npm test
```

The suite covers registration and login, JWT tampering and `alg: none` forgery, ownership checks between two users, input validation and mass assignment, overdrafts, idempotency, ten simultaneous withdrawals, refresh-token rotation and theft detection, logout, error handling, and CORS and security headers. GitHub Actions runs the same suite against a PostgreSQL service on every push.

## Deployment

The API runs on a single AWS EC2 instance (t3.micro, 2 vCPU, about 1 GB of memory, Ubuntu 24.04):

- **nginx** is the only public entry point. It terminates TLS with a Let's Encrypt certificate (renewed automatically), redirects HTTP to HTTPS, limits request bodies, and proxies to the app. It overwrites `X-Forwarded-For` with the real client address, and the app trusts exactly one proxy hop, so rate limiting and logs see real client IPs.
- **The app** runs as a non-root `systemd` service that restarts on failure and starts at boot. It listens on `127.0.0.1:3000` only.
- **PostgreSQL** runs in Docker, bound to `127.0.0.1:5432`, with its data on a named volume and a restart policy.
- **Firewall (security group):** ports 80 and 443 are open to the internet, SSH is restricted to a single IP, and ports 3000 and 5432 are not reachable from outside.
- **Secrets** (JWT signing key, database password) are generated on the server into a `.env` file readable only by the service user. They are never committed to the repository.
- **Updating:** `git pull && npm ci --omit=dev && sudo systemctl restart finapi`.

## Project structure

```
app.js                 Express app (middleware order and routes)
server.js              Loads config, checks it, starts the server
db.js                  PostgreSQL connection pool
logger.js              pino logger with redaction
schema.sql             Database tables
routes/                auth.js, accounts.js (HTTP layer)
store/                 users.js, accounts.js, transactions.js, refreshTokens.js (all SQL lives here)
schemas/               zod request schemas
middleware/            authenticate, validate, rateLimiter, requestLogger, errorHandler
tests/                 Automated tests and helpers
.github/               CI workflows and Dependabot
```

## Design decisions

- **Money is stored as integer cents,** never floats, to avoid rounding errors.
- **Withdrawals run in a transaction with `SELECT ... FOR UPDATE`.** Overlapping requests queue on the account row, so the balance check and the update cannot interleave. A test fires ten concurrent withdrawals against a balance that only covers three.
- **Refresh tokens are random, single-use, and stored hashed.** Each use issues a replacement. Presenting an already-used token is treated as theft and revokes every session for that user.
- **Ownership is enforced inside the SQL,** not by fetching a row and comparing afterwards, so there is no code path where the check can be skipped.
- **All SQL lives in `store/`.** Routes never build queries, which keeps injection risk in one reviewable place.

## Performance

Measured on the EC2 instance itself with `autocannon` (10 seconds per test, one run), against the app on `localhost`. Network, nginx and TLS time are not included. The load generator shares the instance's 2 vCPUs with the app and PostgreSQL, so these numbers are conservative. Login is excluded because bcrypt is intentionally slow.

| Endpoint | Connections | p50 | p99 | Throughput |
|---|---|---|---|---|
| Health check | 10 | 2 ms | 7 ms | ~3,400 req/s |
| List accounts | 10 | 6 ms | 13 ms | ~1,450 req/s |
| Get one account | 10 | 6 ms | 82 ms | ~1,100 req/s |
| Transaction history (20 rows) | 10 | 11 ms | 18 ms | ~880 req/s |
| List accounts | 50 | 31 ms | 49 ms | ~1,575 req/s |

Median response times stayed between 2 and 11 ms at 10 concurrent connections and 31 ms at 50. In the "get one account" run, occasional slow requests (maximum 172 ms) pushed the 99th percentile to 82 ms while the median stayed at 6 ms. A real client also pays for network latency and the TLS handshake on top of these figures.

## Known limitations

- An access token stays valid until it expires (15 minutes) even after logout. That is inherent to stateless JWTs, and is why they are short-lived.
- Refresh rotation is strict. If a legitimate client loses the response to a refresh and retries with the old token, it is treated as reuse and the user must log in again.
- Rate-limit counters are kept in memory, so they reset on restart and are per server instance.
- Registration is open and there is no email verification, so a public instance can accumulate junk accounts. Rate limiting only slows this down.
- Single instance: no high availability, and no automated database backups yet.
- No password reset, transfers between accounts, or role-based access.

## Roadmap

- Automated deployment from GitHub Actions
- Scheduled database backups
- Optional: httpOnly cookie delivery for refresh tokens once a browser frontend exists
