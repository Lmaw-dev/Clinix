// One-time seed for the clinic protocol table.
// Run:  node src/seed-formulary.js
//
// WHAT THIS IS
// A starting set of complaint -> medicine pairings, drawn only from what this
// clinic already stocks. It exists so the protocol lookup and the learned
// suggester have something to work with on day one instead of sitting empty.
//
// WHAT THIS IS NOT
// Clinical authority. Every row is written as a DRAFT and must be reviewed by
// the clinic's nurse before anyone relies on it. The nurse edits, deletes, and
// adds; this file only saves her the blank page.
//
// TWO DELIBERATE OMISSIONS
//
// 1. No doses. A dose depends on the patient, and it is the nurse's call. The
//    dose column is left empty for her to fill in.
//
// 2. No prescription-only medicines. The clinic stocks Cefuroxime, Captopril,
//    Salbutamol, Tranexamic Acid and a steroid-containing eye/ear preparation.
//    Every one of those needs a physician's assessment, not a lookup table, so
//    none of them appear below. Leaving them out is the point, not an oversight.
//
// Safe to re-run: a complaint that already has an entry is left alone.

import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { pool } from './db.js';
import { encrypt, decrypt } from './crypto.js';

// Pairings limited to over-the-counter medicines a school clinic nurse manages
// routinely. Matched to stock by name so a clinic with different items simply
// gets fewer rows rather than references to things it does not have.
const DRAFT_PROTOCOL = [
  { complaint: 'Fever',                    match: 'paracetamol' },
  { complaint: 'Headache',                 match: 'paracetamol' },
  { complaint: 'Body pain',                match: 'paracetamol' },
  { complaint: 'Dysmenorrhea',             match: 'mefenamic' },
  { complaint: 'Menstrual cramps',         match: 'mefenamic' },
  { complaint: 'Toothache',                match: 'mefenamic' },
  { complaint: 'Diarrhea',                 match: 'loperamide' },
  { complaint: 'Loose bowel movement',     match: 'loperamide' },
  { complaint: 'Dehydration',              match: 'ors' },
  { complaint: 'Hyperacidity',             match: 'kremil' },
  { complaint: 'Stomach pain',             match: 'kremil' },
  { complaint: 'Abdominal cramps',         match: 'hyoscine' },
  { complaint: 'Dizziness',                match: 'meclizine' },
  { complaint: 'Vertigo',                  match: 'meclizine' },
  { complaint: 'Cough',                    match: 'guaifenesin' },
  { complaint: 'Colds',                    match: 'symdex' },
  { complaint: 'Flu symptoms',             match: 'symdex' },
  { complaint: 'Minor wound',              match: 'mupirocin' },
  { complaint: 'Abrasion',                 match: 'mupirocin' },
  { complaint: 'Skin infection',           match: 'mupirocin' },
];

const NOTE = 'DRAFT - seeded from stock. Review, correct or delete before relying on it.';

const [items] = await pool.query(
  'SELECT code, name FROM inventory_items WHERE archived = 0 AND qty > 0',
);
const [existing] = await pool.query('SELECT complaint FROM formulary');
const alreadyCovered = new Set(existing.map((r) => (decrypt(r.complaint) || '').toLowerCase().trim()));

let added = 0;
let skipped = 0;
let unmatched = 0;

for (const { complaint, match } of DRAFT_PROTOCOL) {
  if (alreadyCovered.has(complaint.toLowerCase())) {
    console.log(`- ${complaint}: already in the protocol, left alone`);
    skipped++;
    continue;
  }

  const item = items.find((i) => String(i.name).toLowerCase().includes(match));
  if (!item) {
    console.log(`- ${complaint}: no stocked item matching "${match}" — skipped`);
    unmatched++;
    continue;
  }

  await pool.query(
    `INSERT INTO formulary (id, complaint, item_code, item_name, dose, notes, added_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      encrypt(complaint),
      item.code,
      encrypt(item.name),
      // Dose deliberately blank — see the header.
      null,
      encrypt(NOTE),
      encrypt('seed (needs nurse review)'),
    ],
  );
  console.log(`+ ${complaint} -> ${item.name}`);
  added++;
}

console.log(`\n${added} draft entries added, ${skipped} already present, ${unmatched} had no matching stock.`);
if (added) {
  console.log('\nEvery new row is marked DRAFT and has no dose.');
  console.log('Have the clinic nurse review them in Settings before the clinic relies on them.');
}
await pool.end();
