import mysql from 'mysql2/promise';
import 'dotenv/config';

export const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  database: process.env.DB_NAME || 'clinix',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  waitForConnections: true,
  connectionLimit: 10,
});

export async function pingDb() {
  const [rows] = await pool.query('SELECT 1 AS ok');
  return rows[0];
}

export async function ensureDbUpdates() {
  await pool.query(`
    ALTER TABLE students
      ADD COLUMN IF NOT EXISTS last_name VARCHAR(80) NULL AFTER name,
      ADD COLUMN IF NOT EXISTS first_name VARCHAR(80) NULL AFTER last_name,
      ADD COLUMN IF NOT EXISTS middle_name VARCHAR(80) NULL AFTER first_name
  `);
  // Legacy backfill: split a legacy full "name" into first/last. Skipped for rows
  // whose name is encrypted — splitting ciphertext would store garbage.
  await pool.query(`
    UPDATE students
    SET
      first_name = COALESCE(NULLIF(first_name, ''), SUBSTRING_INDEX(name, ' ', 1)),
      last_name = COALESCE(NULLIF(last_name, ''), SUBSTRING_INDEX(name, ' ', -1)),
      middle_name = COALESCE(middle_name, '')
    WHERE name IS NULL OR name NOT LIKE 'enc:v1:%'
  `);
  // NOTE: these columns are intentionally NOT capped at VARCHAR(80) — they hold
  // AES ciphertext, which is far longer than the plaintext. They are widened to
  // TEXT below; capping them here would silently truncate and corrupt the data.
  await pool.query(`
    ALTER TABLE faculty
      ADD COLUMN IF NOT EXISTS photo LONGTEXT NULL
  `);
  // The faculty form has been collecting these all along and the table had
  // nowhere to put them, so every save quietly dropped them: a staff member's
  // college, employment classification, blood type and next of kin were typed
  // in, accepted, and gone on the next reload. TEXT throughout because the
  // personal ones are stored as ciphertext (see the `encrypted` list in
  // server.js) and ciphertext is longer than what it encrypts.
  await pool.query(`
    ALTER TABLE faculty
      ADD COLUMN IF NOT EXISTS college VARCHAR(32) NULL,
      ADD COLUMN IF NOT EXISTS employment_category VARCHAR(40) NULL,
      ADD COLUMN IF NOT EXISTS employment_type VARCHAR(40) NULL,
      ADD COLUMN IF NOT EXISTS birthdate TEXT NULL,
      ADD COLUMN IF NOT EXISTS blood_type TEXT NULL,
      ADD COLUMN IF NOT EXISTS office TEXT NULL,
      ADD COLUMN IF NOT EXISTS home_address TEXT NULL,
      ADD COLUMN IF NOT EXISTS present_address TEXT NULL,
      ADD COLUMN IF NOT EXISTS guardian_name TEXT NULL,
      ADD COLUMN IF NOT EXISTS guardian_contact TEXT NULL,
      ADD COLUMN IF NOT EXISTS confidential_notes TEXT NULL
  `);
  // College and employment category drive the Reports department filter and
  // the Faculty screen's own filters, so they stay queryable — the same reason
  // students keep course_code and status in the clear.
  await pool.query('CREATE INDEX IF NOT EXISTS idx_faculty_college ON faculty (college)').catch(() => {});
  // Per-person document attachments (files stored on disk, metadata here)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS documents (
      id VARCHAR(40) PRIMARY KEY,
      owner_type VARCHAR(16) NOT NULL,
      owner_id VARCHAR(40) NOT NULL,
      file_name VARCHAR(255) NOT NULL,
      stored_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(150) NULL,
      size_bytes BIGINT NULL,
      uploaded_at DATETIME NOT NULL,
      INDEX idx_owner (owner_type, owner_id)
    )
  `);
  // Link a document to a medical form (so a student's file also appears as a
  // compiled copy under that form's original).
  await pool.query(`
    ALTER TABLE documents
      ADD COLUMN IF NOT EXISTS form_id VARCHAR(40) NULL,
      ADD COLUMN IF NOT EXISTS form_name VARCHAR(255) NULL
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_form ON documents (form_id)').catch(() => {});
  // System-wide settings shared across all users/devices (e.g. feature toggles)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      setting_key VARCHAR(64) PRIMARY KEY,
      setting_value TEXT NULL
    )
  `);

  // User accounts — every personal/credential field is stored AES-encrypted (TEXT).
  // Only the internal row id and role stay plaintext (role drives access control).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS accounts (
      id VARCHAR(40) PRIMARY KEY,
      role VARCHAR(16) NOT NULL,
      emp_id TEXT NULL,
      username TEXT NOT NULL,
      password TEXT NOT NULL,
      first_name TEXT NULL,
      last_name TEXT NULL,
      middle_name TEXT NULL,
      birthdate TEXT NULL,
      email TEXT NULL,
      address TEXT NULL,
      contact TEXT NULL
    )
  `);

  // A profile picture belongs to the person, not to the clinic. It used to live
  // in admin_profile — a single shared row — so whoever saved their profile last
  // replaced the name and photo everyone else saw. It is a column on the account
  // now. LONGTEXT because it holds a base64 data URL, encrypted like every other
  // personal field. See migrateAdminProfileToAccount() in server.js for the lift.
  await pool.query('ALTER TABLE accounts ADD COLUMN IF NOT EXISTS photo LONGTEXT NULL').catch(() => {});

  // ── Consultation log moves from the browser into the database ──────────────
  // The log used to live in localStorage, which meant the staff member who took
  // the vital signs and the nurse who read them only saw the same data if they
  // happened to share a browser. These columns give every field a home here.
  //
  // The original table also assumed a consultation always belonged to a student:
  // student_id was CHAR(6) NOT NULL with a foreign key to students. A faculty
  // visit or a walk-in with no ID could never be saved. The key is dropped and
  // the column widened and made optional.
  await pool.query(`
    ALTER TABLE consultations
      ADD COLUMN IF NOT EXISTS visit_time VARCHAR(10) NULL,
      ADD COLUMN IF NOT EXISTS age TEXT NULL,
      ADD COLUMN IF NOT EXISTS sex TEXT NULL,
      ADD COLUMN IF NOT EXISTS course_or_office TEXT NULL,
      ADD COLUMN IF NOT EXISTS purpose VARCHAR(24) NULL,
      ADD COLUMN IF NOT EXISTS chief_complaint TEXT NULL,
      ADD COLUMN IF NOT EXISTS management TEXT NULL,
      ADD COLUMN IF NOT EXISTS reason TEXT NULL,
      ADD COLUMN IF NOT EXISTS staff TEXT NULL,
      ADD COLUMN IF NOT EXISTS person_type VARCHAR(16) NULL,
      ADD COLUMN IF NOT EXISTS blood_type TEXT NULL,
      ADD COLUMN IF NOT EXISTS vital_bp TEXT NULL,
      ADD COLUMN IF NOT EXISTS vital_rr TEXT NULL,
      ADD COLUMN IF NOT EXISTS vital_pr TEXT NULL,
      ADD COLUMN IF NOT EXISTS vital_temp TEXT NULL,
      ADD COLUMN IF NOT EXISTS vital_o2sat TEXT NULL,
      ADD COLUMN IF NOT EXISTS assessment TEXT NULL,
      ADD COLUMN IF NOT EXISTS recorded_at VARCHAR(40) NULL,
      ADD COLUMN IF NOT EXISTS consult_status VARCHAR(16) NULL,
      ADD COLUMN IF NOT EXISTS recorded_by TEXT NULL,
      ADD COLUMN IF NOT EXISTS evaluated_by TEXT NULL,
      ADD COLUMN IF NOT EXISTS confirmed_by TEXT NULL
  `);

  // Drop the students foreign key so faculty and walk-in visits can be logged.
  // Guarded: it is already gone on a database created after this change.
  const [fks] = await pool.query(`
    SELECT constraint_name FROM information_schema.key_column_usage
    WHERE table_schema = DATABASE() AND table_name = 'consultations'
      AND referenced_table_name = 'students'
  `);
  for (const fk of fks) {
    await pool.query(`ALTER TABLE consultations DROP FOREIGN KEY \`${fk.constraint_name}\``);
    console.log(`[db] consultations: dropped foreign key ${fk.constraint_name} (faculty/walk-in visits can now be logged)`);
  }
  // A blank date must be storable too — the log accepts an entry before the
  // nurse has filled everything in.
  await pool.query('ALTER TABLE consultations MODIFY student_id VARCHAR(40) NULL').catch(() => {});
  await pool.query('ALTER TABLE consultations MODIFY consultation_date DATE NULL').catch(() => {});
  await pool.query('CREATE INDEX IF NOT EXISTS idx_consult_purpose ON consultations (purpose)').catch(() => {});

  // ── Inventory moves out of the browser ────────────────────────────────────
  // category/archived drive the UI grouping; monthly holds the 12-month
  // remaining/dispensed sheet as JSON, which is how the clinic already tracks
  // medicines. It is stored as text rather than split into its own table
  // because it is always read and written as one whole sheet.
  await pool.query(`
    ALTER TABLE inventory_items
      ADD COLUMN IF NOT EXISTS category VARCHAR(40) NULL,
      ADD COLUMN IF NOT EXISTS monthly LONGTEXT NULL,
      ADD COLUMN IF NOT EXISTS archived TINYINT(1) NOT NULL DEFAULT 0
  `);
  await pool.query('ALTER TABLE inventory_items MODIFY expiry VARCHAR(20) NULL').catch(() => {});

  // ── Prescriptions ─────────────────────────────────────────────────────────
  // What was actually handed to a patient. Each row is the reason a quantity
  // left the inventory, so stock movements can always be traced back to a
  // person and a consultation instead of an unexplained drop in the count.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS prescriptions (
      id VARCHAR(40) PRIMARY KEY,
      consultation_id VARCHAR(40) NULL,
      patient_id VARCHAR(40) NULL,
      patient_name TEXT NULL,
      item_code VARCHAR(40) NOT NULL,
      item_name TEXT NULL,
      quantity INT NOT NULL DEFAULT 0,
      dosage TEXT NULL,
      instructions TEXT NULL,
      dispensed_by TEXT NULL,
      prescription_date DATE NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_presc_consult (consultation_id),
      INDEX idx_presc_item (item_code)
    )
  `);

  // ── Records/certificates: same student-only assumption as consultations ────
  // Both tables tied every row to a student with a foreign key, so a faculty
  // member or a walk-in could not be given a record or a certificate at all.
  for (const table of ['medical_records', 'certificates']) {
    const [keys] = await pool.query(`
      SELECT constraint_name FROM information_schema.key_column_usage
      WHERE table_schema = DATABASE() AND table_name = ? AND referenced_table_name = 'students'
    `, [table]);
    for (const key of keys) {
      await pool.query(`ALTER TABLE ${table} DROP FOREIGN KEY \`${key.constraint_name}\``);
      console.log(`[db] ${table}: dropped foreign key ${key.constraint_name} (faculty/walk-in entries can now be saved)`);
    }
    await pool.query(`ALTER TABLE ${table} MODIFY student_id VARCHAR(40) NULL`).catch(() => {});
  }
  await pool.query('ALTER TABLE medical_records MODIFY record_date DATE NULL').catch(() => {});
  await pool.query('ALTER TABLE medical_records ADD COLUMN IF NOT EXISTS status VARCHAR(20) NULL').catch(() => {});
  await pool.query('ALTER TABLE certificates MODIFY certificate_date DATE NULL').catch(() => {});
  await pool.query('ALTER TABLE certificates MODIFY status VARCHAR(60) NULL').catch(() => {});

  // ── Medical forms ─────────────────────────────────────────────────────────
  // The blank/original form. Each person's filled copy is a row in `documents`
  // carrying this form's id, so the per-person entries are derived from there
  // rather than duplicated here.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS medical_forms (
      id VARCHAR(40) PRIMARY KEY,
      name TEXT NULL,
      description TEXT NULL,
      form_date DATE NULL,
      template_doc_id VARCHAR(40) NULL,
      template_file_name TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // ── Clinic formulary ──────────────────────────────────────────────────────
  // The nurse's own protocol: "for this complaint, this is what we give here."
  // It is deliberately seeded EMPTY. Pre-filling it with generic drug advice
  // would make it one more thing nobody on the clinic staff actually vouched
  // for; the value of this table is precisely that a licensed nurse decided
  // each row. It fills itself from practice — after dispensing, the nurse can
  // save that pairing as protocol in one click.
  //
  // Because it is the clinic's own decision record, it answers first and
  // offline; the AI suggester is the fallback for presentations not covered.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS formulary (
      id VARCHAR(40) PRIMARY KEY,
      complaint VARCHAR(120) NOT NULL,
      item_code VARCHAR(40) NULL,
      item_name TEXT NULL,
      dose TEXT NULL,
      notes TEXT NULL,
      added_by TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_formulary_complaint (complaint)
    )
  `);

  // ── Student status: enrolled | graduated | dropped ────────────────────────
  // A graduate is NOT deleted and NOT moved anywhere else. These are medical
  // records and have to be retained — a student may come back years later
  // asking for a copy for employment or a board exam. Only the status column
  // changes; the row stays exactly where it is.
  //
  // The old enum had 'not enrolled', which nothing in the UI could ever set and
  // which said nothing about *why* the person left. It is folded into 'dropped'
  // (the closest surviving meaning) so the narrowed enum cannot silently blank
  // those rows out. The widen-update-narrow order matters: narrowing first would
  // turn every 'not enrolled' into '' before the UPDATE could reach it.
  const migrateStatus = async () => {
    await pool.query(`ALTER TABLE students MODIFY status
      ENUM('enrolled','not enrolled','dropped','graduated') NOT NULL DEFAULT 'enrolled'`);
    const [r] = await pool.query(`UPDATE students SET status = 'dropped' WHERE status = 'not enrolled'`);
    if (r.affectedRows) console.log(`[db] students: ${r.affectedRows} "not enrolled" row(s) folded into "dropped"`);
    await pool.query(`ALTER TABLE students MODIFY status
      ENUM('enrolled','graduated','dropped') NOT NULL DEFAULT 'enrolled'`);
  };
  try { await migrateStatus(); } catch (err) { console.warn(`[db] student status migration skipped: ${err.message}`); }

  // Audit trail for the status column. Who changed it and when is the whole
  // point: "graduated" is a claim about a person's record, and a year-end batch
  // touches hundreds of rows at once, so an unattributed change is not good
  // enough. status_updated_by holds accounts.id, which is VARCHAR(40) here —
  // not an INT — because that is what the accounts table actually uses.
  await pool.query(`
    ALTER TABLE students
      ADD COLUMN IF NOT EXISTS date_graduated DATE NULL,
      ADD COLUMN IF NOT EXISTS status_updated_at DATETIME NULL,
      ADD COLUMN IF NOT EXISTS status_updated_by VARCHAR(40) NULL
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_students_status ON students (status)').catch(() => {});

  // ── Widen encrypted columns to TEXT ──
  // AES-256-GCM ciphertext (base64) is longer than the plaintext, so any column
  // that now holds encrypted data must be TEXT to avoid truncation. Guarded so a
  // missing table/column never blocks startup.
  const widen = async (sql) => { try { await pool.query(sql); } catch { /* table/column may not exist yet */ } };
  // Student email (encrypted at rest, like contact_number)
  await widen('ALTER TABLE students ADD COLUMN IF NOT EXISTS email TEXT NULL');
  // Clinic consultation record info + guardian info (encrypted at rest)
  await widen(`ALTER TABLE students
    ADD COLUMN IF NOT EXISTS birthdate TEXT NULL,
    ADD COLUMN IF NOT EXISTS blood_type TEXT NULL,
    ADD COLUMN IF NOT EXISTS school_year TEXT NULL,
    ADD COLUMN IF NOT EXISTS guardian_name TEXT NULL,
    ADD COLUMN IF NOT EXISTS guardian_relationship TEXT NULL,
    ADD COLUMN IF NOT EXISTS guardian_contact TEXT NULL,
    ADD COLUMN IF NOT EXISTS confidential_notes TEXT NULL,
    ADD COLUMN IF NOT EXISTS allergies TEXT NULL,
    ADD COLUMN IF NOT EXISTS current_medications TEXT NULL,
    ADD COLUMN IF NOT EXISTS medical_others TEXT NULL,
    ADD COLUMN IF NOT EXISTS height TEXT NULL,
    ADD COLUMN IF NOT EXISTS weight TEXT NULL`);
  // Structured residence + boarding house info (encrypted at rest, except the plain boolean flag)
  await widen(`ALTER TABLE students
    ADD COLUMN IF NOT EXISTS current_province TEXT NULL,
    ADD COLUMN IF NOT EXISTS current_city TEXT NULL,
    ADD COLUMN IF NOT EXISTS current_barangay TEXT NULL,
    ADD COLUMN IF NOT EXISTS current_purok TEXT NULL,
    ADD COLUMN IF NOT EXISTS current_zip TEXT NULL,
    ADD COLUMN IF NOT EXISTS home_province TEXT NULL,
    ADD COLUMN IF NOT EXISTS home_city TEXT NULL,
    ADD COLUMN IF NOT EXISTS home_barangay TEXT NULL,
    ADD COLUMN IF NOT EXISTS home_purok TEXT NULL,
    ADD COLUMN IF NOT EXISTS home_zip TEXT NULL,
    ADD COLUMN IF NOT EXISTS is_boarding TINYINT(1) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS boarding_house_name TEXT NULL,
    ADD COLUMN IF NOT EXISTS boarding_house_address TEXT NULL,
    ADD COLUMN IF NOT EXISTS landlord_name TEXT NULL,
    ADD COLUMN IF NOT EXISTS landlord_contact TEXT NULL`);
  await widen('ALTER TABLE students MODIFY name TEXT, MODIFY last_name TEXT, MODIFY first_name TEXT, MODIFY middle_name TEXT, MODIFY gender TEXT, MODIFY contact_number TEXT, MODIFY medical_conditions TEXT');
  await widen('ALTER TABLE faculty MODIFY name TEXT, MODIFY role TEXT, MODIFY contact TEXT, MODIFY medical_history TEXT');
  await widen('ALTER TABLE medical_records MODIFY name TEXT, MODIFY summary TEXT');
  await widen('ALTER TABLE visits MODIFY student_name TEXT, MODIFY reason TEXT, MODIFY staff TEXT');
  await widen('ALTER TABLE certificates MODIFY student_name TEXT');
  await widen('ALTER TABLE consultations MODIFY student_name TEXT, MODIFY summary TEXT, MODIFY outcome TEXT');
  await widen('ALTER TABLE activities MODIFY msg TEXT');
  await widen('ALTER TABLE documents MODIFY file_name TEXT, MODIFY form_name TEXT');
  await widen('ALTER TABLE admin_profile MODIFY name TEXT');
  await widen('ALTER TABLE prescriptions MODIFY item_name TEXT');

  // ── Colleges & courses ──────────────────────────────────────────────────────
  // The last list the app still kept per-browser. Settings wrote it to
  // localStorage while students.course_code carries a foreign key into
  // `courses`, so a course added on one computer existed nowhere the save could
  // see it: the student save failed on the constraint, and a second computer
  // never saw the course at all. The tables are created here as well as in
  // schema.sql so an installation that predates them is repaired on startup.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS colleges (
      code VARCHAR(16) PRIMARY KEY,
      name VARCHAR(100) NOT NULL
    ) ENGINE = InnoDB
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS courses (
      code VARCHAR(32) PRIMARY KEY,
      college_code VARCHAR(16) NOT NULL,
      name VARCHAR(100) NOT NULL,
      CONSTRAINT fk_courses_college FOREIGN KEY (college_code) REFERENCES colleges (code)
        ON UPDATE CASCADE ON DELETE RESTRICT
    ) ENGINE = InnoDB
  `);
  // Year-end processing graduates a student at the end of *their* program, and
  // that is not the 4th year for everyone — a 2-year course ends at 2nd Year.
  // Came across from the same local store as the course list itself.
  await widen('ALTER TABLE courses ADD COLUMN IF NOT EXISTS years TINYINT NOT NULL DEFAULT 4');
  await seedAcademics();
}

// The list the app shipped with, as a fresh install's starting point. Only ever
// written when the tables are empty — an existing clinic's edits are never
// overwritten by a restart.
export const DEFAULT_ACADEMICS = [
  {
    code: 'CTECH', name: 'College of Technology',
    courses: [
      { code: 'BSCS', name: 'Bachelor of Science in Computer Science', years: 4 },
      { code: 'BSIT-FPST', name: 'Bachelor of Science in Industrial Technology - Food Preparation and Service Technology', years: 4 },
      { code: 'BSIT-ELECT', name: 'Bachelor of Science in Industrial Technology - Electrical Technology', years: 4 },
    ],
  },
  {
    code: 'CTE', name: 'College of Teacher Education',
    courses: [
      { code: 'BEED', name: 'Bachelor of Elementary Education', years: 4 },
      { code: 'BSED-ENGLISH', name: 'Bachelor of Secondary Education - English', years: 4 },
      { code: 'BSED-MATH', name: 'Bachelor of Secondary Education - Mathematics', years: 4 },
    ],
  },
  { code: 'COM', name: 'College of Management', courses: [{ code: 'BSM', name: 'Bachelor of Science in Management', years: 4 }] },
  { code: 'COF', name: 'College of Fisheries', courses: [{ code: 'BSF', name: 'Bachelor of Science in Fisheries', years: 4 }] },
];

async function seedAcademics() {
  const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM colleges');
  if (n > 0) return;
  for (const college of DEFAULT_ACADEMICS) {
    await pool.query('INSERT IGNORE INTO colleges (code, name) VALUES (?, ?)', [college.code, college.name]);
    for (const course of college.courses) {
      await pool.query(
        'INSERT IGNORE INTO courses (code, college_code, name, years) VALUES (?, ?, ?, ?)',
        [course.code, college.code, course.name, course.years],
      );
    }
  }
  console.log(`[db] seeded ${DEFAULT_ACADEMICS.length} default colleges and their courses`);
}
