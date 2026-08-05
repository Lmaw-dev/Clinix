import crypto from 'node:crypto';
import { pool } from './db.js';

// ── API authentication ───────────────────────────────────────────────────────
// Until now the login screen was the only thing standing between a visitor and
// the records: it decided what to *show*, but every /api route answered anyone
// who asked. On a clinic LAN that means a person on the campus network who knows
// the address could read every student's medical history without signing in.
// The screen is not the boundary — the server is.
//
// Signing in creates a session row and returns a random token. Every later
// request carries that token, and the server resolves it back to an account and
// a role before doing anything.
//
// Only the SHA-256 of the token is stored, for the same reason passwords are
// hashed: a stolen database should not hand over working credentials. The raw
// token exists in the browser and in transit, nowhere else.

const TOKEN_BYTES = 32;
const SESSION_HOURS = 12;

/** Routes that must answer before anyone can possibly hold a token. */
const PUBLIC_PATHS = new Set([
  '/api/health',
  '/api/db-status',
  '/api/login',
]);

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export async function ensureSessionTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash CHAR(64) PRIMARY KEY,
      account_id VARCHAR(40) NOT NULL,
      role VARCHAR(16) NOT NULL,
      created_at DATETIME NOT NULL,
      expires_at DATETIME NOT NULL,
      INDEX idx_sessions_account (account_id)
    )
  `);
  // Expired rows are dead weight and a needless liability; clear them at boot.
  await pool.query('DELETE FROM sessions WHERE expires_at < NOW()').catch(() => {});
}

/** Start a session for an account. Returns the raw token — the only time it exists server-side. */
export async function createSession(accountId, role) {
  const token = crypto.randomBytes(TOKEN_BYTES).toString('hex');
  await pool.query(
    `INSERT INTO sessions (token_hash, account_id, role, created_at, expires_at)
     VALUES (?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? HOUR))`,
    [hashToken(token), accountId, role, SESSION_HOURS],
  );
  return { token, expiresInHours: SESSION_HOURS };
}

export async function revokeSession(token) {
  if (!token) return;
  await pool.query('DELETE FROM sessions WHERE token_hash = ?', [hashToken(token)]);
}

export async function revokeAllForAccount(accountId) {
  await pool.query('DELETE FROM sessions WHERE account_id = ?', [accountId]);
}

function bearerFrom(req) {
  const header = req.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

/**
 * Resolve the request's token to an account, or reject it.
 * Attaches `req.user = { accountId, role, token }` when it succeeds.
 */
export function requireAuth() {
  return async (req, res, next) => {
    // Sub-app paths arrive relative, so rebuild what the client actually asked for.
    const path = req.baseUrl ? `${req.baseUrl}${req.path}` : req.path;
    if (PUBLIC_PATHS.has(path)) { next(); return; }

    const token = bearerFrom(req);
    if (!token) { res.status(401).json({ error: 'Sign in to continue' }); return; }

    try {
      const [rows] = await pool.query(
        'SELECT account_id, role, expires_at FROM sessions WHERE token_hash = ?',
        [hashToken(token)],
      );
      if (!rows.length) { res.status(401).json({ error: 'Session is no longer valid — please sign in again' }); return; }
      if (new Date(rows[0].expires_at).getTime() < Date.now()) {
        await pool.query('DELETE FROM sessions WHERE token_hash = ?', [hashToken(token)]);
        res.status(401).json({ error: 'Session expired — please sign in again' });
        return;
      }

      // Sliding window: an in-use session should not expire under the nurse
      // mid-shift, but an abandoned one still lapses on its own.
      await pool.query(
        'UPDATE sessions SET expires_at = DATE_ADD(NOW(), INTERVAL ? HOUR) WHERE token_hash = ?',
        [SESSION_HOURS, hashToken(token)],
      );

      req.user = { accountId: rows[0].account_id, role: rows[0].role, token };
      next();
    } catch (error) { next(error); }
  };
}

/**
 * Restrict a route to particular roles. The UI already hides these actions, but
 * hiding a button is not access control — anyone can call the endpoint directly.
 */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) { res.status(401).json({ error: 'Sign in to continue' }); return; }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Your account does not have access to this' });
      return;
    }
    next();
  };
}
