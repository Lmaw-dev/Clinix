import bcrypt from 'bcryptjs';
import { decrypt, isEncrypted } from './crypto.js';

// ── Password hashing (bcrypt) ──────────────────────────────────────────────────
// Passwords are hashed, NOT encrypted. Encryption is reversible: anyone holding
// DATA_ENC_KEY could read every user's password back out. A hash is one-way — the
// server can check a password without ever being able to recover it, so even a
// full database + key compromise does not hand over the users' actual passwords.
// bcrypt also salts each hash automatically (identical passwords hash differently)
// and is deliberately slow, which is what makes offline guessing expensive.
//
// Legacy rows encrypted with the old scheme still verify (see verifyPassword) and
// are upgraded to a hash the next time that user signs in, so no one is locked out.

const ROUNDS = 12; // ~250ms per hash on typical hardware — slow on purpose

/** Hash a plaintext password for storage. */
export function hashPassword(plain) {
  return bcrypt.hash(String(plain), ROUNDS);
}

export function isHashed(value) {
  return typeof value === 'string' && /^\$2[aby]\$/.test(value);
}

/**
 * Check a plaintext password against a stored value.
 * Returns { ok, needsUpgrade } — needsUpgrade is true when the stored value was a
 * legacy encrypted password that verified, meaning the caller should re-store it
 * as a hash.
 */
export async function verifyPassword(plain, stored) {
  if (typeof stored !== 'string' || !stored) return { ok: false, needsUpgrade: false };
  if (isHashed(stored)) {
    return { ok: await bcrypt.compare(String(plain), stored), needsUpgrade: false };
  }
  // Legacy: password was stored AES-encrypted (or, older still, plaintext).
  const legacy = isEncrypted(stored) ? decrypt(stored) : stored;
  const ok = legacy !== '' && legacy === String(plain);
  return { ok, needsUpgrade: ok };
}
