// One-time migration: encrypt existing plaintext rows in place.
// Run once after enabling encryption:  node src/migrate-encrypt.js
// Safe to run multiple times — already-encrypted values are skipped.

import 'dotenv/config';
import { pool } from './db.js';
import { encrypt, isEncrypted } from './crypto.js';

// table -> { pk, columns: [encrypted db columns] }
const TARGETS = {
  students: { pk: 'student_id', columns: ['name', 'last_name', 'first_name', 'middle_name', 'gender', 'contact_number', 'medical_conditions', 'photo'] },
  faculty: { pk: 'staff_id', columns: ['name', 'role', 'contact', 'medical_history', 'photo'] },
  medical_records: { pk: 'id', columns: ['name', 'summary'] },
  visits: { pk: 'id', columns: ['student_name', 'reason', 'staff'] },
  certificates: { pk: 'id', columns: ['student_name'] },
  consultations: { pk: 'id', columns: ['student_name', 'summary', 'outcome'] },
  activities: { pk: 'id', columns: ['msg'] },
  documents: { pk: 'id', columns: ['file_name', 'form_name'] },
};

let totalRows = 0;

for (const [table, { pk, columns }] of Object.entries(TARGETS)) {
  let rows;
  try {
    [rows] = await pool.query(`SELECT * FROM ${table}`);
  } catch {
    console.log(`- ${table}: table not found, skipped`);
    continue;
  }
  let changed = 0;
  for (const row of rows) {
    const sets = [];
    const values = [];
    for (const col of columns) {
      const val = row[col];
      if (val !== null && val !== undefined && val !== '' && !isEncrypted(val)) {
        sets.push(`${col} = ?`);
        values.push(encrypt(String(val)));
      }
    }
    if (sets.length) {
      values.push(row[pk]);
      await pool.query(`UPDATE ${table} SET ${sets.join(', ')} WHERE ${pk} = ?`, values);
      changed++;
    }
  }
  totalRows += changed;
  console.log(`- ${table}: encrypted ${changed} of ${rows.length} row(s)`);
}

console.log(`\nDone. ${totalRows} row(s) newly encrypted.`);
await pool.end();
