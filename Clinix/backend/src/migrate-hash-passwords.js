// One-time migration: convert stored account passwords from reversible
// encryption (or plaintext) to bcrypt hashes.
// Run once:  node src/migrate-hash-passwords.js
// Safe to run multiple times — already-hashed rows are skipped.
//
// Everyone keeps their existing password; only the way it is stored changes.
// Accounts missed by this script are upgraded automatically the next time the
// user signs in, so running it is a convenience, not a requirement.

import 'dotenv/config';
import { pool } from './db.js';
import { decrypt, isEncrypted } from './crypto.js';
import { hashPassword, isHashed } from './password.js';

const [rows] = await pool.query('SELECT id, username, password FROM accounts');

let hashed = 0;
let skipped = 0;
let failed = 0;

for (const row of rows) {
  const label = decrypt(row.username) || row.id;
  if (isHashed(row.password)) { skipped++; continue; }

  const plain = isEncrypted(row.password) ? decrypt(row.password) : row.password;
  if (!plain) {
    // decrypt() returns '' when the value is corrupted or the key is wrong.
    // Hashing '' would lock the user out silently, so leave the row untouched.
    console.warn(`- ${label}: could not read the stored password (wrong DATA_ENC_KEY or corrupted) — left as is, needs an admin reset`);
    failed++;
    continue;
  }

  await pool.query('UPDATE accounts SET password = ? WHERE id = ?', [await hashPassword(plain), row.id]);
  console.log(`- ${label}: hashed`);
  hashed++;
}

console.log(`\nDone. ${hashed} hashed, ${skipped} already hashed, ${failed} needing attention (of ${rows.length} account(s)).`);
await pool.end();
