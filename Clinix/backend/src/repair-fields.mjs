// One-off repair: rewrite gender / contact values that were destroyed when those
// columns were still too small to hold AES ciphertext (they got truncated).
// Only restores values we have a known-good source for (the original seed data);
// records entered by hand must be re-typed in the app because the old values
// are unrecoverable. Safe to re-run.

import 'dotenv/config';
import { pool } from './db.js';
import { encrypt, decrypt, isEncrypted } from './crypto.js';

const STUDENTS = [
  { id: '121451', gender: 'Female', contact: '0917 555 0123' }, // Jessa Salazar
  { id: '543293', gender: 'Female', contact: '0991 555 0175' }, // Paula Lazo
  { id: '324514', gender: 'Male',   contact: '0932 555 0199' }, // Arvin Cruz
  { id: '432652', gender: 'Male',   contact: '0918 555 0148' }, // Ronaldo Mendez (already OK)
];
const FACULTY = [
  { id: 'F001', contact: '0917 111 2233' }, // Dr. Maria Santos
  { id: 'F002', contact: '0918 222 3344' }, // Nurse Pedro Cruz
];

const corrupted = (v) => v && isEncrypted(v) && decrypt(v) === '';
let fixed = 0;

for (const s of STUDENTS) {
  const [rows] = await pool.query('SELECT gender, contact_number FROM students WHERE student_id = ?', [s.id]);
  if (!rows.length) { console.log(`- student ${s.id}: not found, skipped`); continue; }
  const sets = [], vals = [];
  if (corrupted(rows[0].gender) || !rows[0].gender) { sets.push('gender = ?'); vals.push(encrypt(s.gender)); }
  if (corrupted(rows[0].contact_number) || !rows[0].contact_number) { sets.push('contact_number = ?'); vals.push(encrypt(s.contact)); }
  if (!sets.length) { console.log(`- student ${s.id}: already intact`); continue; }
  vals.push(s.id);
  await pool.query(`UPDATE students SET ${sets.join(', ')} WHERE student_id = ?`, vals);
  console.log(`- student ${s.id}: restored ${sets.length} field(s)`);
  fixed += sets.length;
}

for (const f of FACULTY) {
  const [rows] = await pool.query('SELECT contact FROM faculty WHERE staff_id = ?', [f.id]);
  if (!rows.length) { console.log(`- faculty ${f.id}: not found, skipped`); continue; }
  if (!corrupted(rows[0].contact) && rows[0].contact) { console.log(`- faculty ${f.id}: already intact`); continue; }
  await pool.query('UPDATE faculty SET contact = ? WHERE staff_id = ?', [encrypt(f.contact), f.id]);
  console.log(`- faculty ${f.id}: restored contact`);
  fixed++;
}

// Report anything still unrecoverable so it can be re-typed in the app.
const [left] = await pool.query('SELECT student_id, name, gender, contact_number FROM students');
const stillBad = left.filter((r) => corrupted(r.gender) || corrupted(r.contact_number));
console.log(`\nRestored ${fixed} value(s).`);
if (stillBad.length) {
  console.log('Still needs manual re-entry (no known-good source):');
  for (const r of stillBad) {
    const miss = [corrupted(r.gender) && 'sex', corrupted(r.contact_number) && 'contact'].filter(Boolean).join(' + ');
    console.log(`  · ${decrypt(r.name) || r.student_id} (${r.student_id}) — ${miss}`);
  }
}
await pool.end();
