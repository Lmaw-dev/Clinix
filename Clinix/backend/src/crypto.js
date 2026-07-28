import crypto from 'node:crypto';

// ── Application-layer field encryption (AES-256-GCM) ────────────────────────────
// Sensitive values are encrypted before they are written to MySQL and decrypted
// when read back, so the database only ever stores ciphertext. The 256-bit key
// lives in the environment (DATA_ENC_KEY in .env) — never in the database — so a
// stolen database dump is unreadable without it. GCM also authenticates the data
// (tamper-evident). Encrypted values are marked with a prefix so legacy plaintext
// rows keep working during migration.

const ALGO = 'aes-256-gcm';
const PREFIX = 'enc:v1:';

function loadKey() {
  const hex = process.env.DATA_ENC_KEY;
  if (hex && /^[0-9a-fA-F]{64}$/.test(hex.trim())) {
    return Buffer.from(hex.trim(), 'hex'); // 32 bytes = AES-256
  }
  // Dev fallback: derive a stable key from a passphrase so the app still runs,
  // but warn loudly — production/thesis MUST set DATA_ENC_KEY.
  console.warn('[crypto] DATA_ENC_KEY not set (need 64 hex chars). Using an insecure derived key — set DATA_ENC_KEY in .env.');
  return crypto.scryptSync(process.env.DATA_ENC_PASSPHRASE || 'clinix-dev-key', 'clinix-static-salt', 32);
}

const KEY = loadKey();

/** Encrypt a value for storage. Empty/nullish values pass through unchanged. */
export function encrypt(value) {
  if (value === null || value === undefined || value === '') return value;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

/** Decrypt a stored value. Non-encrypted (legacy plaintext) values pass through. */
export function decrypt(value) {
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) return value;
  try {
    const raw = Buffer.from(value.slice(PREFIX.length), 'base64');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);
    const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    // Wrong key, or the stored ciphertext was corrupted/truncated. Never leak the
    // raw "enc:v1:…" blob to the UI — return empty so the field renders as "—".
    console.warn('[crypto] could not decrypt a stored value (wrong key or corrupted data)');
    return '';
  }
}

export function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}
