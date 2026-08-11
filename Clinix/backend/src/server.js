import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import rateLimit from 'express-rate-limit';
import { DEFAULT_ACADEMICS, ensureDbUpdates, pingDb, pool } from './db.js';
import { encrypt, decrypt } from './crypto.js';
import { hashPassword, verifyPassword } from './password.js';
import { ensureMysqlRunning, autostartHint } from './mysql-autostart.js';
import { suggestFromHistory, modelStats } from './learned-suggest.js';
import { ensureSessionTable, createSession, revokeSession, requireAuth, requireRole } from './auth.js';
import { requireWriteAccess } from './permissions.js';

let dbReady = false;

const app = express();
const port = Number(process.env.PORT || 4001);

// Allow the configured origin, or reflect any origin (LAN devices) when unset.
app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
// 5 MB is generous for a single record — the largest thing anyone posts is a
// student photo — but a whole-clinic restore is a different order of magnitude,
// so that one route gets its own parser below and is skipped here. Letting the
// global parser see it would reject the upload as 413 before the route ran.
const RESTORE_PATH = '/api/backup/restore';
const jsonParser = express.json({ limit: '5mb' });
app.use((req, res, next) => (req.path === RESTORE_PATH ? next() : jsonParser(req, res, next)));

// ── Rate limiting ────────────────────────────────────────────────────────────
// Without a limit, anyone on the network can fire thousands of login attempts a
// minute and brute-force a password. These caps are per client IP.
//
// The auth limiter counts FAILED attempts only (skipSuccessfulRequests), so a
// staff member working normally never trips it — only someone guessing does.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10, // 10 failed attempts per IP per 15 minutes
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Please wait a few minutes and try again.' },
});

// A generous ceiling on the rest of the API — high enough that normal clinic use
// never notices, low enough to blunt a runaway script or scraping attempt.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300, // per IP per minute
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
});

app.use('/api', apiLimiter);

// Every /api route below this line requires a valid session token, except the
// handful listed as public in auth.js (health, db-status, login).
// This sits above the route definitions on purpose: a route added later is
// protected by default rather than by the author remembering to protect it.
app.use('/api', requireAuth());

// Knowing *who* is asking is not the same as knowing they may do it. A staff
// account holds a perfectly valid token and could still send
// DELETE /api/students/000001 by hand — the sidebar that hides the page from
// them lives in the browser, where anyone can ignore it. See permissions.js for
// the map; like the line above, it sits here so a route added later is covered
// by default rather than by the author remembering.
app.use('/api', requireWriteAccess());

// ── File uploads (per-person documents) ──────────────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB per file
});

function docFromDb(row) {
  return {
    id: row.id,
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    fileName: decrypt(row.file_name),
    mimeType: row.mime_type,
    size: Number(row.size_bytes ?? 0),
    uploadedAt: row.uploaded_at,
    formId: row.form_id ?? null,
    formName: decrypt(row.form_name),
  };
}

// Convert a Word document to PDF (LibreOffice or MS Word) for exact-fidelity preview.
const convertScript = path.join(__dirname, '..', 'scripts', 'docx2pdf.ps1');
const pdfConversions = new Map(); // stored_name -> in-flight Promise (dedupe concurrent requests)

function convertToPdf(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const ps = spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', convertScript, '-In', inputPath, '-Out', outputPath,
    ], { windowsHide: true });
    let stderr = '';
    ps.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    ps.on('error', reject);
    ps.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputPath)) resolve(outputPath);
      else reject(new Error(stderr.trim() || `Conversion failed (exit ${code})`));
    });
  });
}

// Returns a path to a PDF rendering of the document, converting + caching as needed.
async function ensurePdf(doc) {
  const srcPath = path.join(uploadsDir, doc.stored_name);
  if (!fs.existsSync(srcPath)) throw new Error('Source file missing on the server');
  if (path.extname(doc.stored_name).toLowerCase() === '.pdf') return srcPath;
  const pdfPath = path.join(uploadsDir, `${doc.stored_name}.pdf`);
  if (fs.existsSync(pdfPath)) return pdfPath;
  if (!pdfConversions.has(doc.stored_name)) {
    pdfConversions.set(
      doc.stored_name,
      convertToPdf(srcPath, pdfPath).finally(() => pdfConversions.delete(doc.stored_name)),
    );
  }
  await pdfConversions.get(doc.stored_name);
  return pdfPath;
}

const tables = {
  students: {
    table: 'students',
    id: 'student_id',
    order: 'last_name, first_name, middle_name',
    fields: {
      studentId: 'student_id',
      name: 'name',
      lastName: 'last_name',
      firstName: 'first_name',
      middleInitial: 'middle_name',
      course: 'course_code',
      yearLevel: 'year_level',
      gender: 'gender',
      contactNumber: 'contact_number',
      email: 'email',
      medicalConditions: 'medical_conditions',
      status: 'status',
      dateGraduated: 'date_graduated',
      statusUpdatedAt: 'status_updated_at',
      statusUpdatedBy: 'status_updated_by',
      photo: 'photo',
      birthdate: 'birthdate',
      bloodType: 'blood_type',
      schoolYear: 'school_year',
      guardianName: 'guardian_name',
      guardianRelationship: 'guardian_relationship',
      guardianContact: 'guardian_contact',
      confidentialNotes: 'confidential_notes',
      allergies: 'allergies',
      currentMedications: 'current_medications',
      medicalOthers: 'medical_others',
      height: 'height',
      weight: 'weight',
      currentProvince: 'current_province',
      currentCity: 'current_city',
      currentBarangay: 'current_barangay',
      currentPurok: 'current_purok',
      currentZip: 'current_zip',
      homeProvince: 'home_province',
      homeCity: 'home_city',
      homeBarangay: 'home_barangay',
      homePurok: 'home_purok',
      homeZip: 'home_zip',
      isBoarding: 'is_boarding',
      boardingHouseName: 'boarding_house_name',
      boardingHouseAddress: 'boarding_house_address',
      landlordName: 'landlord_name',
      landlordContact: 'landlord_contact',
    },
    // Personal / health fields are encrypted at rest. IDs, course code, year,
    // status, the graduation date, the status audit columns and the boarding
    // flag stay plaintext so search, filtering, reporting and joins keep working.
    encrypted: [
      'name', 'lastName', 'firstName', 'middleInitial', 'gender', 'contactNumber', 'email', 'medicalConditions', 'photo',
      'birthdate', 'bloodType', 'schoolYear', 'guardianName', 'guardianRelationship', 'guardianContact', 'confidentialNotes',
      'allergies', 'currentMedications', 'medicalOthers', 'height', 'weight',
      'currentProvince', 'currentCity', 'currentBarangay', 'currentPurok', 'currentZip',
      'homeProvince', 'homeCity', 'homeBarangay', 'homePurok', 'homeZip',
      'boardingHouseName', 'boardingHouseAddress', 'landlordName', 'landlordContact',
    ],
  },
  faculty: {
    table: 'faculty',
    id: 'staff_id',
    order: 'name',
    fields: {
      staffId: 'staff_id',
      name: 'name',
      role: 'role',
      contact: 'contact',
      medicalHistory: 'medical_history',
      photo: 'photo',
      // Organisational placement.
      college: 'college',
      employmentCategory: 'employment_category',
      employmentType: 'employment_type',
      // Clinic consultation record — the same details kept for a student.
      birthdate: 'birthdate',
      bloodType: 'blood_type',
      office: 'office',
      homeAddress: 'home_address',
      presentAddress: 'present_address',
      guardianName: 'guardian_name',
      guardianContact: 'guardian_contact',
      confidentialNotes: 'confidential_notes',
    },
    // Same split as students: anything describing the person or their health is
    // encrypted, while the college and employment classification stay readable
    // so departments can be filtered and reported on without decrypting the
    // whole table first.
    encrypted: [
      'name', 'role', 'contact', 'medicalHistory', 'photo',
      'birthdate', 'bloodType', 'office', 'homeAddress', 'presentAddress',
      'guardianName', 'guardianContact', 'confidentialNotes',
    ],
  },
  medicalRecords: {
    table: 'medical_records',
    id: 'id',
    order: 'record_date DESC',
    fields: {
      id: 'id',
      studentId: 'student_id',
      name: 'name',
      summary: 'summary',
      date: 'record_date',
      status: 'status',
    },
    encrypted: ['name', 'summary'],
  },
  medicalForms: {
    table: 'medical_forms',
    id: 'id',
    order: 'form_date DESC',
    fields: {
      id: 'id',
      name: 'name',
      description: 'description',
      date: 'form_date',
      templateDocId: 'template_doc_id',
      templateFileName: 'template_file_name',
    },
    // A form is a blank template, not somebody's health information.
    encrypted: [],
  },
  formulary: {
    table: 'formulary',
    id: 'id',
    order: 'complaint',
    fields: {
      id: 'id',
      complaint: 'complaint',
      itemCode: 'item_code',
      itemName: 'item_name',
      dose: 'dose',
      notes: 'notes',
      addedBy: 'added_by',
    },
    // The clinic's own dispensing protocol, not a patient's record — there is
    // no personal information here, and leaving it readable keeps the complaint
    // column searchable.
    encrypted: [],
  },
  prescriptions: {
    table: 'prescriptions',
    id: 'id',
    order: 'created_at DESC',
    fields: {
      id: 'id',
      consultationId: 'consultation_id',
      patientId: 'patient_id',
      patientName: 'patient_name',
      itemCode: 'item_code',
      itemName: 'item_name',
      quantity: 'quantity',
      dosage: 'dosage',
      instructions: 'instructions',
      dispensedBy: 'dispensed_by',
      date: 'prescription_date',
    },
    // Who received what medicine is health information. The item code and
    // quantity stay readable so stock movements can be totalled and reported.
    encrypted: ['patientName', 'dosage', 'instructions', 'dispensedBy'],
  },
  visits: {
    table: 'visits',
    id: 'id',
    order: 'visit_date',
    fields: {
      id: 'id',
      studentId: 'student_id',
      studentName: 'student_name',
      date: 'visit_date',
      reason: 'reason',
      staff: 'staff',
    },
    encrypted: ['studentName', 'reason', 'staff'],
  },
  inventory: {
    table: 'inventory_items',
    id: 'code',
    order: 'name',
    fields: {
      code: 'code',
      name: 'name',
      qty: 'qty',
      unit: 'unit',
      expiry: 'expiry',
      category: 'category',
      monthly: 'monthly',
      archived: 'archived',
    },
    // Medicine/supply reference data — not personal; left queryable/plaintext.
    encrypted: [],
    json: ['monthly'],
    booleans: ['archived'],
  },
  certificates: {
    table: 'certificates',
    id: 'id',
    order: 'certificate_date',
    fields: {
      id: 'id',
      studentId: 'student_id',
      studentName: 'student_name',
      date: 'certificate_date',
      status: 'status',
    },
    encrypted: ['studentName'],
  },
  consultations: {
    table: 'consultations',
    id: 'id',
    // Newest first, matching how the log reads on screen.
    order: 'consultation_date DESC, visit_time DESC',
    fields: {
      id: 'id',
      studentId: 'student_id',
      studentName: 'student_name',
      date: 'consultation_date',
      time: 'visit_time',
      age: 'age',
      sex: 'sex',
      courseOrOffice: 'course_or_office',
      purpose: 'purpose',
      chiefComplaint: 'chief_complaint',
      management: 'management',
      summary: 'summary',
      outcome: 'outcome',
      reason: 'reason',
      staff: 'staff',
      // Consultation record — assessment and vital signs taken at intake.
      personType: 'person_type',
      bloodType: 'blood_type',
      bp: 'vital_bp',
      rr: 'vital_rr',
      pr: 'vital_pr',
      temp: 'vital_temp',
      o2sat: 'vital_o2sat',
      assessment: 'assessment',
      recordedAt: 'recorded_at',
      // Workflow
      consultStatus: 'consult_status',
      recordedBy: 'recorded_by',
      evaluatedBy: 'evaluated_by',
      confirmedBy: 'confirmed_by',
    },
    // Everything describing the person or their health is encrypted. The date,
    // time, purpose, status and student_id stay readable so the log can be
    // ordered, filtered and reported on without decrypting every row.
    encrypted: [
      'studentName', 'age', 'sex', 'courseOrOffice', 'chiefComplaint', 'management',
      'summary', 'outcome', 'reason', 'staff', 'bloodType',
      'bp', 'rr', 'pr', 'temp', 'o2sat', 'assessment',
      'recordedBy', 'evaluatedBy', 'confirmedBy',
    ],
  },
  activities: {
    table: 'activities',
    id: 'id',
    // Newest first — the dashboard shows the most recent clinic activity.
    order: 'ts DESC',
    fields: {
      id: 'id',
      msg: 'msg',
      ts: 'ts',
    },
    encrypted: ['msg'],
  },
};

// Encrypt sensitive fields on the way into MySQL, decrypt on the way out.
function toDb(config, body) {
  const enc = config.encrypted || [];
  const json = config.json || [];
  const bools = config.booleans || [];
  const row = {};
  for (const [apiKey, dbKey] of Object.entries(config.fields)) {
    if (body[apiKey] === undefined) continue;
    const value = body[apiKey];
    // Structured values (e.g. the 12-month stock sheet) are stored as JSON text.
    if (json.includes(apiKey)) row[dbKey] = value === null ? null : JSON.stringify(value);
    else if (bools.includes(apiKey)) row[dbKey] = value ? 1 : 0;
    else if (enc.includes(apiKey)) row[dbKey] = encrypt(value);
    else row[dbKey] = value;
  }
  return row;
}

function parseJsonColumn(value) {
  if (value === null || value === undefined || value === '') return null;
  try {
    return JSON.parse(value);
  } catch {
    // Hand-edited or truncated data: return nothing rather than crashing the
    // whole list request over one bad row.
    console.warn('[db] could not parse a JSON column value');
    return null;
  }
}

function fromDb(config, row) {
  const enc = config.encrypted || [];
  const json = config.json || [];
  const bools = config.booleans || [];
  const out = {};
  for (const [apiKey, dbKey] of Object.entries(config.fields)) {
    if (json.includes(apiKey)) out[apiKey] = parseJsonColumn(row[dbKey]);
    else if (bools.includes(apiKey)) out[apiKey] = Boolean(row[dbKey]);
    else if (enc.includes(apiKey)) out[apiKey] = decrypt(row[dbKey]);
    else out[apiKey] = row[dbKey];
  }
  return out;
}

function routeConfig(req, res) {
  const config = tables[req.params.resource];
  if (!config) {
    res.status(404).json({ error: 'Unknown resource' });
    return null;
  }
  return config;
}

// Registered here, above the generic /api/:resource routes — those match any
// single path segment, so further down this file "db-status" was being read as
// a resource name and answered "Unknown resource" instead.
app.get('/api/db-status', (_req, res) => res.json({ dbReady }));

app.get('/api/health', async (_req, res, next) => {
  try {
    res.json({ ok: true, db: await pingDb() });
  } catch (error) {
    next(error);
  }
});

// ── System-wide settings (shared across all devices) ─────────────────────────
app.get('/api/settings', async (_req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT setting_key, setting_value FROM app_settings');
    const out = {};
    rows.forEach((r) => { out[r.setting_key] = r.setting_value; });
    res.json(out);
  } catch (error) {
    next(error);
  }
});

app.put('/api/settings/:key', async (req, res, next) => {
  try {
    const value = String(req.body?.value ?? '');
    await pool.query(
      'INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
      [req.params.key, value],
    );
    res.json({ key: req.params.key, value });
  } catch (error) {
    next(error);
  }
});

// ── Accounts & login (id, username, password, name, birthdate, email, address,
//    contact are all AES-encrypted; login decrypts to verify) ──────────────────
const ACCOUNT_COLS = {
  empId: 'emp_id', username: 'username', password: 'password',
  firstName: 'first_name', lastName: 'last_name', middleName: 'middle_name',
  birthdate: 'birthdate', email: 'email', address: 'address', contact: 'contact',
};

// The password is never included: it is a one-way hash, so there is nothing
// meaningful to return, and leaving it out keeps the hash off the wire entirely.
function accountFromDb(row) {
  const out = { id: row.id, role: row.role };
  for (const [apiKey, col] of Object.entries(ACCOUNT_COLS)) {
    if (apiKey === 'password') continue;
    out[apiKey] = decrypt(row[col]);
  }
  return out;
}

export async function seedAccountsIfEmpty() {
  const [rows] = await pool.query('SELECT COUNT(*) AS n FROM accounts');
  if (rows[0].n > 0) return;
  const defaults = [
    { role: 'admin', username: 'admin', password: 'clinix2024' },
    { role: 'assistant', username: 'assistant', password: 'assist2024' },
    { role: 'staff', username: 'staff', password: 'staff123' },
  ];
  for (const d of defaults) {
    await pool.query(
      'INSERT INTO accounts (id, role, username, password) VALUES (?, ?, ?, ?)',
      [randomUUID(), d.role, encrypt(d.username), await hashPassword(d.password)],
    );
  }
  console.log('[accounts] seeded default admin / assistant / staff accounts (username encrypted, password hashed)');
}

/**
 * One-time lift of the old shared admin_profile row onto the admin's account.
 *
 * The nurse has a name and a photo saved under the previous design; dropping
 * those routes without moving the data would blank her profile on the next
 * sign-in. Only fills gaps — an account that already has a name or a photo is
 * left alone — so this is safe to run on every boot, which is what happens.
 *
 * The admin_profile table itself is deliberately left in place. It holds the
 * only copy of this data until somebody confirms the migration worked.
 */
export async function migrateAdminProfileToAccount() {
  let rows;
  try {
    [rows] = await pool.query('SELECT name, photo FROM admin_profile WHERE id = 1');
  } catch {
    return; // table never existed on this install
  }
  if (!rows.length) return;

  const name = decrypt(rows[0].name) || '';
  const photo = decrypt(rows[0].photo) || '';
  if (!name && !photo) return;

  const [admins] = await pool.query(`SELECT * FROM accounts WHERE role = 'admin' LIMIT 1`);
  if (!admins.length) return;
  const admin = admins[0];

  const sets = [];
  const vals = [];
  const hasName = Boolean(decrypt(admin.first_name) || decrypt(admin.last_name));
  if (name && !hasName) {
    const split = splitFullName(name);
    if (split) {
      sets.push('first_name = ?', 'last_name = ?');
      vals.push(encrypt(split.firstName), encrypt(split.lastName));
    }
  }
  if (photo && !decrypt(admin.photo)) {
    sets.push('photo = ?');
    vals.push(encrypt(photo));
  }
  if (!sets.length) return;

  vals.push(admin.id);
  await pool.query(`UPDATE accounts SET ${sets.join(', ')} WHERE id = ?`, vals);
  console.log('[accounts] moved the shared admin profile onto the admin account (name/photo are per-account now)');
}

app.post('/api/login', authLimiter, async (req, res, next) => {
  try {
    const username = String(req.body?.username ?? '').trim();
    const password = String(req.body?.password ?? '');
    if (!username || !password) { res.status(400).json({ error: 'Username and password required' }); return; }
    const [rows] = await pool.query('SELECT * FROM accounts');
    // Usernames stay encrypted, and GCM uses a random IV, so we can't match
    // ciphertext directly — decrypt each one to find the account. The password is
    // then checked against its bcrypt hash (never decrypted; it isn't reversible).
    const match = rows.find((r) => decrypt(r.username).toLowerCase() === username.toLowerCase());
    const check = match
      ? await verifyPassword(password, match.password)
      : { ok: false, needsUpgrade: false };
    if (!check.ok) { res.status(401).json({ error: 'Incorrect username or password' }); return; }
    // Account still holds a legacy encrypted password — now that we've confirmed
    // the plaintext, replace it with a hash so it is never reversible again.
    if (check.needsUpgrade) {
      await pool.query('UPDATE accounts SET password = ? WHERE id = ?', [await hashPassword(password), match.id]);
      console.log('[accounts] upgraded a legacy password to a bcrypt hash on sign-in');
    }
    const acc = accountFromDb(match);
    // The token is what actually grants access from here on; the role in this
    // reply only tells the UI what to draw. The server re-checks it per request.
    const { token, expiresInHours } = await createSession(match.id, acc.role);
    res.json({
      ok: true, token, expiresInHours,
      role: acc.role, username: acc.username,
      name: [acc.firstName, acc.lastName].filter(Boolean).join(' ') || acc.username,
    });
  } catch (error) { next(error); }
});

// Any signed-in user changes their OWN password (the current one is verified
// against the stored hash; the new one is hashed before it is written).
app.post('/api/change-password', authLimiter, async (req, res, next) => {
  try {
    const username = String(req.body?.username ?? '').trim();
    const currentPassword = String(req.body?.currentPassword ?? '');
    const newPassword = String(req.body?.newPassword ?? '');
    if (!username || !currentPassword || !newPassword) {
      res.status(400).json({ error: 'username, currentPassword and newPassword are required' }); return;
    }
    if (newPassword.length < 8) { res.status(400).json({ error: 'New password must be at least 8 characters' }); return; }
    const [rows] = await pool.query('SELECT * FROM accounts');
    const acct = rows.find((r) => decrypt(r.username).toLowerCase() === username.toLowerCase());
    if (!acct) { res.status(404).json({ error: 'Account not found' }); return; }
    const { ok } = await verifyPassword(currentPassword, acct.password);
    if (!ok) {
      res.status(401).json({ error: 'Current password is incorrect' }); return;
    }
    await pool.query('UPDATE accounts SET password = ? WHERE id = ?', [await hashPassword(newPassword), acct.id]);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.post('/api/logout', async (req, res, next) => {
  try {
    await revokeSession(req.user?.token);
    res.json({ ok: true });
  } catch (error) { next(error); }
});

// Account management is administration, not clinic work. The UI hides it from
// other roles, but hiding a screen is not access control — the check has to be
// here, where the request actually lands.
app.get('/api/accounts', requireRole('admin'), async (_req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM accounts');
    res.json(rows.map((r) => accountFromDb(r, false))); // never expose passwords
  } catch (error) { next(error); }
});

app.post('/api/accounts', requireRole('admin'), async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!b.username || !b.password || !b.role) { res.status(400).json({ error: 'username, password and role are required' }); return; }
    const [existing] = await pool.query('SELECT username FROM accounts');
    if (existing.some((r) => decrypt(r.username).toLowerCase() === String(b.username).trim().toLowerCase())) {
      res.status(409).json({ error: 'Username already exists' }); return;
    }
    const id = randomUUID();
    const cols = ['id', 'role'];
    const vals = [id, String(b.role)];
    for (const [apiKey, col] of Object.entries(ACCOUNT_COLS)) {
      if (b[apiKey] === undefined || b[apiKey] === '') continue;
      cols.push(col);
      // The password is hashed (one-way); every other field is encrypted (readable back).
      vals.push(apiKey === 'password' ? await hashPassword(String(b[apiKey])) : encrypt(String(b[apiKey])));
    }
    await pool.query(`INSERT INTO accounts (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, vals);
    res.status(201).json({ id, role: b.role });
  } catch (error) { next(error); }
});

app.put('/api/accounts/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const b = req.body || {};
    const sets = [];
    const vals = [];
    if (b.role) { sets.push('role = ?'); vals.push(String(b.role)); }
    for (const [apiKey, col] of Object.entries(ACCOUNT_COLS)) {
      if (b[apiKey] === undefined || b[apiKey] === '') continue;
      sets.push(`${col} = ?`);
      // Admin password resets land here — hash, never encrypt.
      vals.push(apiKey === 'password' ? await hashPassword(String(b[apiKey])) : encrypt(String(b[apiKey])));
    }
    if (!sets.length) { res.status(400).json({ error: 'No fields to update' }); return; }
    vals.push(req.params.id);
    const [r] = await pool.query(`UPDATE accounts SET ${sets.join(', ')} WHERE id = ?`, vals);
    if (!r.affectedRows) { res.status(404).json({ error: 'Not found' }); return; }
    res.json({ ok: true });
  } catch (error) { next(error); }
});

app.delete('/api/accounts/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const [r] = await pool.query('DELETE FROM accounts WHERE id = ?', [req.params.id]);
    if (!r.affectedRows) { res.status(404).json({ error: 'Not found' }); return; }
    res.status(204).end();
  } catch (error) { next(error); }
});

// ── Document routes (registered before the generic /api/:resource routes) ─────
app.get('/api/documents', async (req, res, next) => {
  try {
    const { ownerType, ownerId, formId } = req.query;
    let rows;
    if (formId) {
      // All student copies compiled under a medical form.
      [rows] = await pool.query(
        'SELECT * FROM documents WHERE form_id = ? ORDER BY uploaded_at DESC',
        [String(formId)],
      );
    } else if (ownerType && ownerId) {
      [rows] = await pool.query(
        'SELECT * FROM documents WHERE owner_type = ? AND owner_id = ? ORDER BY uploaded_at DESC',
        [String(ownerType), String(ownerId)],
      );
    } else {
      res.status(400).json({ error: 'ownerType+ownerId or formId is required' });
      return;
    }
    res.json(rows.map(docFromDb));
  } catch (error) {
    next(error);
  }
});

app.post('/api/documents', upload.single('file'), async (req, res, next) => {
  try {
    const { ownerType, ownerId, formId, formName } = req.body;
    if (!ownerType || !ownerId || !req.file) {
      if (req.file) fs.unlink(req.file.path, () => {});
      res.status(400).json({ error: 'ownerType, ownerId and a file are required' });
      return;
    }
    const id = randomUUID();
    const uploadedAt = new Date();
    await pool.query(
      'INSERT INTO documents (id, owner_type, owner_id, file_name, stored_name, mime_type, size_bytes, uploaded_at, form_id, form_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, String(ownerType), String(ownerId), encrypt(req.file.originalname), req.file.filename, req.file.mimetype, req.file.size, uploadedAt, formId ? String(formId) : null, formName ? encrypt(String(formName)) : null],
    );
    res.status(201).json({
      id, ownerType, ownerId,
      fileName: req.file.originalname, mimeType: req.file.mimetype,
      size: req.file.size, uploadedAt: uploadedAt.toISOString(),
      formId: formId || null, formName: formName || null,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/documents/:id/file', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM documents WHERE id = ?', [req.params.id]);
    if (!rows.length) { res.status(404).json({ error: 'Not found' }); return; }
    const doc = rows[0];
    const filePath = path.join(uploadsDir, doc.stored_name);
    if (!fs.existsSync(filePath)) { res.status(404).json({ error: 'File is missing on the server' }); return; }
    const disposition = req.query.download ? 'attachment' : 'inline';
    res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(decrypt(doc.file_name))}`);
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    next(error);
  }
});

// Exact-fidelity preview: serve (converting + caching if needed) a PDF of the doc.
app.get('/api/documents/:id/pdf', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM documents WHERE id = ?', [req.params.id]);
    if (!rows.length) { res.status(404).json({ error: 'Not found' }); return; }
    const doc = rows[0];
    let pdfPath;
    try {
      pdfPath = await ensurePdf(doc);
    } catch (err) {
      // No converter available (LibreOffice/Word) — signal the client to fall back.
      res.status(422).json({ error: `PDF conversion unavailable: ${err.message}` });
      return;
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(decrypt(doc.file_name).replace(/\.[^.]+$/, '.pdf'))}`);
    fs.createReadStream(pdfPath).pipe(res);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/documents/:id', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM documents WHERE id = ?', [req.params.id]);
    if (!rows.length) { res.status(404).json({ error: 'Not found' }); return; }
    await pool.query('DELETE FROM documents WHERE id = ?', [req.params.id]);
    fs.unlink(path.join(uploadsDir, rows[0].stored_name), () => {});
    fs.unlink(path.join(uploadsDir, `${rows[0].stored_name}.pdf`), () => {}); // cached pdf, if any
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

// ── Clinic protocol lookup ───────────────────────────────────────────────────
// Answers before the AI does: instant, offline, free, and every row was put
// there by the nurse. Matching is loose because nobody types a complaint the
// same way twice — "dysmenorrhea", "Dysmenorrhea since this morning" and
// "menstrual cramps" should all find the same protocol row.
// ── What this clinic usually gives ───────────────────────────────────────────
// Trained on the clinic's own formulary and dispensing history. Unlike the exact
// protocol lookup above, this generalises: "having fever since last night"
// reaches the same answer as "Fever". Unlike the language model, it stays
// silent on a complaint whose words it has never seen — which is the behaviour
// that matters, because the alternative is a confident wrong answer.
//
// Costs nothing to run and needs no network, so it is safe to call on every
// consultation rather than behind a button.
app.get('/api/suggest/learned', async (req, res, next) => {
  try {
    const complaint = String(req.query.complaint ?? '');
    if (!complaint.trim()) { res.json({ suggestions: [], trainedOn: 0 }); return; }

    const result = await suggestFromHistory(complaint);

    // Attach live stock so the panel can show what is dispensable right now.
    const [stockRows] = await pool.query('SELECT * FROM inventory_items');
    const stock = new Map(stockRows.map((r) => [r.code, r]));

    res.json({
      ...result,
      suggestions: result.suggestions.map((s) => {
        const item = stock.get(s.itemCode);
        const qty = Number(item?.qty ?? 0);
        return {
          ...s,
          itemName: item ? item.name : s.itemName,
          inStock: Boolean(item) && qty > 0 && !Number(item.archived),
          available: qty,
          unit: item?.unit ?? '',
        };
      }),
    });
  } catch (error) { next(error); }
});

// How much the model has learned — shown to the nurse and useful evidence for
// the write-up: the system's knowledge is the clinic's own, and it is countable.
app.get('/api/suggest/learned/stats', async (_req, res, next) => {
  try { res.json(await modelStats()); }
  catch (error) { next(error); }
});

app.get('/api/formulary/suggest', async (req, res, next) => {
  try {
    const complaint = String(req.query.complaint ?? '').toLowerCase().trim();
    if (!complaint) { res.json({ matches: [] }); return; }

    const [rows] = await pool.query('SELECT * FROM formulary');
    const [stockRows] = await pool.query('SELECT * FROM inventory_items');
    const stock = new Map(stockRows.map((r) => [r.code, r]));

    const matches = rows
      .map((r) => fromDb(tables.formulary, r))
      .filter((entry) => {
        const key = String(entry.complaint ?? '').toLowerCase().trim();
        if (!key) return false;
        // Either the nurse's phrase appears in what was typed, or the other way
        // round — a short protocol key matches a longer written complaint.
        return complaint.includes(key) || key.includes(complaint);
      })
      .map((entry) => {
        const item = entry.itemCode ? stock.get(entry.itemCode) : null;
        const qty = Number(item?.qty ?? 0);
        return {
          ...entry,
          inStock: Boolean(item) && qty > 0 && !item.archived,
          available: qty,
          unit: item?.unit ?? '',
        };
      });

    res.json({ matches });
  } catch (error) { next(error); }
});

// ── Your own profile ─────────────────────────────────────────────────────────
// This used to be /api/admin-profile, reading and writing a single shared row in
// admin_profile. Every role's Settings screen saved to it, so a staff member who
// changed their photo replaced the name and picture the whole clinic saw — and
// the only way to stop that was to forbid everyone but the admin from having a
// profile at all, which is what the dashboard did.
//
// A profile belongs to an account. These two routes read and write the profile
// of whoever is signed in, taken from the session rather than from anything the
// caller sends, so there is no version of this request that reaches somebody
// else's row. Changing another person's account is a separate, admin-only thing:
// see /api/accounts.

/** Profile columns an account owns and may edit about itself. */
const PROFILE_COLS = {
  empId: 'emp_id',
  firstName: 'first_name',
  lastName: 'last_name',
  middleName: 'middle_name',
  birthdate: 'birthdate',
  email: 'email',
  address: 'address',
  contact: 'contact',
  photo: 'photo',
};

/**
 * "Maria Dela Cruz" → { firstName: 'Maria Dela', lastName: 'Cruz' }.
 *
 * The Settings screen offers one "Full Name" box, but the accounts table keeps
 * the parts separate so the roster can sort by surname. Last token wins as the
 * surname — the same convention the legacy backfill in db.js uses.
 */
function splitFullName(full) {
  const parts = String(full ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
}

function profileFromDb(row) {
  const out = { id: row.id, role: row.role, username: decrypt(row.username) };
  for (const [apiKey, col] of Object.entries(PROFILE_COLS)) out[apiKey] = decrypt(row[col]) || '';
  // What the sidebar and the dashboard greeting actually show. Falling back to
  // the username means a freshly created account is never greeted as nobody.
  out.name = [out.firstName, out.lastName].filter(Boolean).join(' ') || out.username;
  return out;
}

app.get('/api/me', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM accounts WHERE id = ?', [req.user.accountId]);
    if (!rows.length) { res.status(404).json({ error: 'Account not found' }); return; }
    res.json(profileFromDb(rows[0]));
  } catch (error) { next(error); }
});

app.put('/api/me', async (req, res, next) => {
  try {
    const body = req.body || {};
    const tooBig = oversizedImage(body);
    if (tooBig) { res.status(413).json({ error: tooBig }); return; }

    // One "Full Name" box on screen, two columns underneath. Explicit
    // first/last still win if a caller sends them.
    const patch = { ...body };
    if (patch.fullName !== undefined && patch.firstName === undefined && patch.lastName === undefined) {
      const split = splitFullName(patch.fullName);
      if (split) Object.assign(patch, split);
    }

    const sets = [];
    const vals = [];
    for (const [apiKey, col] of Object.entries(PROFILE_COLS)) {
      if (patch[apiKey] === undefined) continue;
      sets.push(`${col} = ?`);
      vals.push(encrypt(String(patch[apiKey])));
    }
    // Role and username are identity, not profile: neither is editable here, so
    // this route can never be used to promote yourself or take over a login.
    if (!sets.length) { res.status(400).json({ error: 'No profile fields to update' }); return; }

    vals.push(req.user.accountId);
    await pool.query(`UPDATE accounts SET ${sets.join(', ')} WHERE id = ?`, vals);
    const [rows] = await pool.query('SELECT * FROM accounts WHERE id = ?', [req.user.accountId]);
    res.json(profileFromDb(rows[0]));
  } catch (error) { next(error); }
});

// ── Dispensing medicine ──────────────────────────────────────────────────────
// Handing medicine to a patient and taking it out of stock must be one action.
// Doing it as two separate API calls would let a crash or a lost connection
// leave the clinic with a prescription nobody deducted, or a deduction with no
// record of where the medicine went.
//
// The whole thing runs in one transaction and the stock row is locked with
// SELECT ... FOR UPDATE, so two people dispensing the last box at the same time
// cannot both succeed.

/** Apply a dispensed quantity to the 12-month tracking sheet, if the item has one. */
function applyMonthlyDispense(monthlyJson, quantity, remainingAfter) {
  const monthly = parseJsonColumn(monthlyJson);
  if (!Array.isArray(monthly) || monthly.length !== 12) return null;
  const month = new Date().getMonth();
  const current = monthly[month] || { remaining: null, dispensed: null };
  monthly[month] = {
    remaining: remainingAfter,
    dispensed: Number(current.dispensed || 0) + quantity,
  };
  return JSON.stringify(monthly);
}

app.post('/api/prescriptions', async (req, res, next) => {
  const body = req.body || {};
  const quantity = Number(body.quantity);
  const itemCode = String(body.itemCode ?? '').trim();

  if (!itemCode) { res.status(400).json({ error: 'itemCode is required' }); return; }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    res.status(400).json({ error: 'quantity must be a whole number greater than zero' }); return;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Lock the stock row for the rest of the transaction.
    const [items] = await conn.query('SELECT * FROM inventory_items WHERE code = ? FOR UPDATE', [itemCode]);
    if (!items.length) {
      await conn.rollback();
      res.status(404).json({ error: `No inventory item with code "${itemCode}"` });
      return;
    }
    const item = items[0];
    const inStock = Number(item.qty ?? 0);
    if (inStock < quantity) {
      await conn.rollback();
      res.status(409).json({
        error: `Only ${inStock} ${item.unit || 'unit(s)'} of ${item.name} left — cannot dispense ${quantity}.`,
        available: inStock,
      });
      return;
    }

    const remainingAfter = inStock - quantity;
    const monthly = applyMonthlyDispense(item.monthly, quantity, remainingAfter);
    if (monthly) {
      await conn.query('UPDATE inventory_items SET qty = ?, monthly = ? WHERE code = ?', [remainingAfter, monthly, itemCode]);
    } else {
      await conn.query('UPDATE inventory_items SET qty = ? WHERE code = ?', [remainingAfter, itemCode]);
    }

    const id = String(body.id || randomUUID());
    const row = toDb(tables.prescriptions, {
      ...body,
      id,
      itemCode,
      quantity,
      itemName: body.itemName || item.name,
      date: body.date || new Date().toISOString().slice(0, 10),
    });
    const columns = Object.keys(row);
    await conn.query(
      `INSERT INTO prescriptions (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      columns.map((c) => row[c]),
    );

    await conn.commit();
    res.status(201).json({ ...body, id, quantity, itemCode, remaining: remainingAfter });
  } catch (error) {
    await conn.rollback().catch(() => {});
    next(error);
  } finally {
    conn.release();
  }
});

// Deleting a prescription puts the medicine back. A mis-typed quantity is a
// normal mistake, and without this the only way to correct the stock would be to
// edit the inventory by hand — which loses the audit trail.
app.delete('/api/prescriptions/:id', async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query('SELECT * FROM prescriptions WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!rows.length) {
      await conn.rollback();
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const presc = rows[0];
    const [items] = await conn.query('SELECT * FROM inventory_items WHERE code = ? FOR UPDATE', [presc.item_code]);
    if (items.length) {
      const restored = Number(items[0].qty ?? 0) + Number(presc.quantity ?? 0);
      const monthly = applyMonthlyDispense(items[0].monthly, -Number(presc.quantity ?? 0), restored);
      if (monthly) {
        await conn.query('UPDATE inventory_items SET qty = ?, monthly = ? WHERE code = ?', [restored, monthly, presc.item_code]);
      } else {
        await conn.query('UPDATE inventory_items SET qty = ? WHERE code = ?', [restored, presc.item_code]);
      }
    }
    await conn.query('DELETE FROM prescriptions WHERE id = ?', [req.params.id]);
    await conn.commit();
    res.status(204).end();
  } catch (error) {
    await conn.rollback().catch(() => {});
    next(error);
  } finally {
    conn.release();
  }
});

// ── Student status: audit trail and year-end promotion ───────────────────────

const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];

/** '2nd Year' → 2. Returns 0 for a blank or unrecognised value. */
function yearNumber(level) {
  const i = YEAR_LEVELS.indexOf(String(level || '').trim());
  return i < 0 ? 0 : i + 1;
}

function sqlToday() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Decide the status audit columns for a student UPDATE, in place on `row`.
 *
 * The caller's own values for these have already been stripped — it sends back
 * the whole student record it was given, audit columns included, so taking them
 * at face value would let anyone forge "changed by X at Y". They are re-derived
 * here, and only when the status genuinely differs from what is already stored:
 * re-saving an unrelated field must not rewrite the history of who last
 * graduated or dropped this student.
 */
async function stampStatusChange(row, studentId, user, requestedGradDate) {
  const [rows] = await pool.query('SELECT status, date_graduated FROM students WHERE student_id = ?', [studentId]);
  const before = rows[0];
  if (!before || before.status === row.status) return;

  row.status_updated_at = new Date();
  row.status_updated_by = user?.accountId ?? null;
  // Leaving a stale graduation date on someone who turned out not to have
  // graduated would misreport them in every historical, per-SY report.
  row.date_graduated = row.status === 'graduated' ? (requestedGradDate || sqlToday()) : null;
}

/**
 * Work out what end-of-school-year processing would do, without doing it.
 *
 * `courseYears` maps a course code to how many years that program runs, so a
 * 2-year course graduates at 2nd Year and a 4-year one at 4th. Anything not
 * listed falls back to 4. Only enrolled students are touched: a graduate stays
 * graduated and a dropped student is not quietly promoted back into the roster.
 */
async function planYearEnd(courseYears) {
  const [rows] = await pool.query(
    `SELECT student_id, name, last_name, first_name, course_code, year_level
     FROM students WHERE status = 'enrolled'`,
  );
  const promote = [];
  const graduate = [];
  const skipped = [];
  for (const r of rows) {
    const finalYear = Math.min(Number(courseYears?.[r.course_code]) || 4, YEAR_LEVELS.length);
    const current = yearNumber(r.year_level);
    const entry = {
      studentId: r.student_id,
      name: decrypt(r.name) || [decrypt(r.first_name), decrypt(r.last_name)].filter(Boolean).join(' '),
      course: r.course_code,
      yearLevel: r.year_level,
      finalYear,
    };
    // A blank or unreadable year level cannot be promoted by guessing — the
    // record is listed so somebody fixes it rather than silently skipped.
    if (!current) { skipped.push({ ...entry, reason: 'No year level recorded' }); continue; }
    if (current >= finalYear) graduate.push({ ...entry, nextYearLevel: null });
    else promote.push({ ...entry, nextYearLevel: YEAR_LEVELS[current] });
  }
  return { promote, graduate, skipped };
}

function yearEndBody(req) {
  const courseYears = req.body?.courseYears && typeof req.body.courseYears === 'object' ? req.body.courseYears : {};
  return { courseYears, dateGraduated: String(req.body?.dateGraduated || '').trim() || sqlToday() };
}

// Preview first, always. A one-click year-end would move 300+ records on a
// mis-click, and the roster is never as tidy as the rule assumes: irregulars,
// shiftees and stop-outs all need a human to look at the list before it runs.
app.post('/api/students/year-end/preview', requireRole('admin'), async (req, res, next) => {
  try {
    const { courseYears } = yearEndBody(req);
    res.json(await planYearEnd(courseYears));
  } catch (error) {
    next(error);
  }
});

app.post('/api/students/year-end/commit', requireRole('admin'), async (req, res, next) => {
  const { courseYears, dateGraduated } = yearEndBody(req);
  const conn = await pool.getConnection();
  try {
    const { promote, graduate, skipped } = await planYearEnd(courseYears);
    await conn.beginTransaction();
    const now = new Date();
    const by = req.user?.accountId ?? null;
    for (const s of promote) {
      await conn.query(
        `UPDATE students SET year_level = ?, status_updated_at = ?, status_updated_by = ?
         WHERE student_id = ? AND status = 'enrolled'`,
        [s.nextYearLevel, now, by, s.studentId],
      );
    }
    for (const s of graduate) {
      await conn.query(
        `UPDATE students SET status = 'graduated', date_graduated = ?, status_updated_at = ?, status_updated_by = ?
         WHERE student_id = ? AND status = 'enrolled'`,
        [dateGraduated, now, by, s.studentId],
      );
    }
    await conn.commit();
    console.log(`[students] year-end: ${promote.length} promoted, ${graduate.length} graduated by account ${by}`);
    res.json({ promoted: promote.length, graduated: graduate.length, skipped: skipped.length, dateGraduated });
  } catch (error) {
    await conn.rollback().catch(() => {});
    next(error);
  } finally {
    conn.release();
  }
});

// ── Registrar masterlist sync ────────────────────────────────────────────────
// Each semester the registrar hands the clinic a masterlist of who is actually
// enrolled, in what course, at what year level. That file is the authority on
// enrolment — this endpoint reconciles the roster against it.
//
// Deliberately narrow: it writes year_level, course_code, status and school_year
// and nothing else. The registrar's file has no allergies, no guardian, no
// address, no photo, so treating it as a whole-record import would blank every
// clinic field it happens not to carry. Those columns are never in the UPDATE.

/** Registrar files write the year level a dozen ways. '2', 'II', 'Year 2' → '2nd Year'. */
function normalizeYearLevel(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const exact = YEAR_LEVELS.find((y) => y.toLowerCase() === raw.toLowerCase());
  if (exact) return exact;
  const words = { first: 1, second: 2, third: 3, fourth: 4, i: 1, ii: 2, iii: 3, iv: 4 };
  const cleaned = raw.toLowerCase().replace(/year|level|yr\.?|\s+/g, ' ').trim();
  const digit = cleaned.match(/\d+/);
  const n = digit ? Number(digit[0]) : words[cleaned];
  return n >= 1 && n <= YEAR_LEVELS.length ? YEAR_LEVELS[n - 1] : '';
}

/**
 * Map a registrar status word onto one of the three the system stores.
 * Anything unrecognised returns '' so the row is reported rather than guessed
 * at — 'LOA' quietly becoming 'dropped' is exactly the kind of silent mistake
 * this whole preview step exists to prevent.
 */
function normalizeStatus(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return 'enrolled'; // a name on an enrolment masterlist is enrolled
  if (['enrolled', 'enrolled ', 'active', 'regular', 'irregular', 'officially enrolled', 'e'].includes(raw)) return 'enrolled';
  if (['graduated', 'graduate', 'alumni', 'completed', 'g'].includes(raw)) return 'graduated';
  if (['dropped', 'dropout', 'drop', 'not enrolled', 'unenrolled', 'inactive', 'withdrawn', 'd'].includes(raw)) return 'dropped';
  return '';
}

function personName(row) {
  const full = String(row.name ?? '').trim();
  const last = String(row.lastName ?? '').trim();
  const first = String(row.firstName ?? '').trim();
  const mi = String(row.middleName ?? row.middleInitial ?? '').trim().slice(0, 1).toUpperCase();
  const composed = [first, mi ? `${mi}.` : '', last].filter(Boolean).join(' ');
  return { full: composed || full, last: last || full, first, mi };
}

/**
 * Compare the uploaded masterlist against the stored roster, changing nothing.
 *
 * Buckets are what the admin approves or rejects, so each one answers a
 * different question: `update` is a real change, `unchanged` is proof the row
 * was read, `invalid` needs the file fixed, and `missing` is the interesting
 * one — enrolled here but absent from the registrar's file. Those are never
 * auto-dropped: a per-college file, a late encoder or a student on leave all
 * look identical from here, so the admin picks which ones to act on.
 */
async function planMasterlist(rawRows, schoolYear) {
  const [courseRows] = await pool.query('SELECT code FROM courses');
  const courseByKey = new Map(courseRows.map((c) => [c.code.toLowerCase(), c.code]));

  const [studentRows] = await pool.query(
    'SELECT student_id, name, last_name, first_name, course_code, year_level, status FROM students',
  );
  const stored = new Map(studentRows.map((s) => [s.student_id, s]));

  const create = [];
  const update = [];
  const unchanged = [];
  const invalid = [];
  const seen = new Set();

  for (const [index, raw] of (Array.isArray(rawRows) ? rawRows : []).entries()) {
    const line = index + 2; // +1 for zero-based, +1 for the header row
    const name = personName(raw || {});
    const studentId = String(raw?.studentId ?? '').replace(/\D/g, '');
    const entry = {
      line,
      studentId,
      name: name.full,
      course: String(raw?.course ?? '').trim(),
      yearLevel: normalizeYearLevel(raw?.yearLevel),
      status: normalizeStatus(raw?.status),
    };
    const reject = (reason) => invalid.push({ ...entry, reason });

    if (studentId.length !== 6) { reject(`Student ID must be 6 digits (got "${raw?.studentId ?? ''}")`); continue; }
    if (seen.has(studentId)) { reject('Duplicate student ID in this file'); continue; }
    seen.add(studentId);

    const course = courseByKey.get(entry.course.toLowerCase());
    if (!course) { reject(entry.course ? `Unknown course "${entry.course}"` : 'No course in this row'); continue; }
    entry.course = course;
    if (!entry.yearLevel) { reject(`Unrecognised year level "${raw?.yearLevel ?? ''}"`); continue; }
    if (!entry.status) { reject(`Unrecognised status "${raw?.status ?? ''}"`); continue; }

    const before = stored.get(studentId);
    if (!before) {
      if (!name.full) { reject('New student with no name — cannot create the record'); continue; }
      create.push({ ...entry, lastName: name.last, firstName: name.first, middleName: name.mi, gender: String(raw?.gender ?? '').trim() });
      continue;
    }

    const changes = [];
    if (before.year_level !== entry.yearLevel) changes.push(`${before.year_level || 'no year'} → ${entry.yearLevel}`);
    if (before.course_code !== course) changes.push(`${before.course_code} → ${course}`);
    if (before.status !== entry.status) changes.push(`${before.status} → ${entry.status}`);
    const known = { ...entry, name: entry.name || decrypt(before.name) || studentId, from: { yearLevel: before.year_level, course: before.course_code, status: before.status } };
    if (changes.length) update.push({ ...known, changes: changes.join(', ') });
    else unchanged.push(known);
  }

  // Only students the system still believes are enrolled: a graduate or an
  // already-dropped student being absent from this semester's file is expected.
  const missing = studentRows
    .filter((s) => s.status === 'enrolled' && !seen.has(s.student_id))
    .map((s) => ({
      studentId: s.student_id,
      name: decrypt(s.name) || [decrypt(s.first_name), decrypt(s.last_name)].filter(Boolean).join(' ') || s.student_id,
      course: s.course_code,
      yearLevel: s.year_level,
      status: s.status,
      reason: 'Enrolled here but not in this masterlist',
    }));

  return { create, update, unchanged, invalid, missing, schoolYear: String(schoolYear ?? '').trim() };
}

function masterlistBody(req) {
  return {
    rows: Array.isArray(req.body?.rows) ? req.body.rows : [],
    schoolYear: String(req.body?.schoolYear ?? '').trim(),
  };
}

app.post('/api/students/masterlist/preview', requireRole('admin'), async (req, res, next) => {
  try {
    const { rows, schoolYear } = masterlistBody(req);
    if (!rows.length) { res.status(400).json({ error: 'The file had no readable rows' }); return; }
    res.json(await planMasterlist(rows, schoolYear));
  } catch (error) {
    next(error);
  }
});

// The commit re-plans from the same rows rather than trusting a plan posted back
// by the browser: otherwise the "which students get dropped" list would be the
// caller's to write, and the preview would be decoration rather than a control.
// `dropMissing` carries only the IDs the admin ticked, and is intersected with
// the freshly computed `missing` bucket.
app.post('/api/students/masterlist/commit', requireRole('admin'), async (req, res, next) => {
  const { rows, schoolYear } = masterlistBody(req);
  const requestedDrops = new Set(
    (Array.isArray(req.body?.dropMissing) ? req.body.dropMissing : []).map((id) => String(id)),
  );
  const conn = await pool.getConnection();
  try {
    const plan = await planMasterlist(rows, schoolYear);
    if (!plan.create.length && !plan.update.length && !requestedDrops.size) {
      res.json({ created: 0, updated: 0, dropped: 0, unchanged: plan.unchanged.length, invalid: plan.invalid.length });
      return;
    }
    const now = new Date();
    const by = req.user?.accountId ?? null;
    const sy = plan.schoolYear ? encrypt(plan.schoolYear) : null;

    await conn.beginTransaction();

    for (const s of plan.create) {
      await conn.query(
        `INSERT INTO students
           (student_id, name, last_name, first_name, middle_name, course_code, year_level, gender,
            status, date_graduated, status_updated_at, status_updated_by, school_year)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          s.studentId, encrypt(s.name), encrypt(s.lastName), encrypt(s.firstName), encrypt(s.middleName),
          s.course, s.yearLevel, encrypt(s.gender),
          s.status, s.status === 'graduated' ? sqlToday() : null, now, by, sy,
        ],
      );
    }

    for (const s of plan.update) {
      // school_year is only written when the admin supplied one, so a blank box
      // does not wipe the term already recorded against each student.
      const sets = ['year_level = ?', 'course_code = ?', 'status = ?'];
      const values = [s.yearLevel, s.course, s.status];
      if (sy !== null) { sets.push('school_year = ?'); values.push(sy); }
      // The audit columns move only on a genuine status change — re-running the
      // import must not rewrite who last graduated or dropped each student.
      if (s.from.status !== s.status) {
        sets.push('status_updated_at = ?', 'status_updated_by = ?', 'date_graduated = ?');
        values.push(now, by, s.status === 'graduated' ? sqlToday() : null);
      }
      await conn.query(`UPDATE students SET ${sets.join(', ')} WHERE student_id = ?`, [...values, s.studentId]);
    }

    // Appearing in this term's masterlist is what sets a student's school year,
    // whether or not their year level moved — so the ones that were already
    // correct are stamped too. Without this, "already correct" students would be
    // the only ones left showing last term, which reads as a bug in every report
    // that groups by school year.
    if (sy !== null && plan.unchanged.length) {
      await conn.query(
        `UPDATE students SET school_year = ? WHERE student_id IN (${plan.unchanged.map(() => '?').join(', ')})`,
        [sy, ...plan.unchanged.map((s) => s.studentId)],
      );
    }

    const drops = plan.missing.filter((s) => requestedDrops.has(s.studentId));
    for (const s of drops) {
      await conn.query(
        `UPDATE students SET status = 'dropped', date_graduated = NULL, status_updated_at = ?, status_updated_by = ?
         WHERE student_id = ? AND status = 'enrolled'`,
        [now, by, s.studentId],
      );
    }

    await conn.commit();
    console.log(
      `[students] masterlist: ${plan.create.length} created, ${plan.update.length} updated, ` +
      `${drops.length} dropped by account ${by}`,
    );
    res.json({
      created: plan.create.length,
      updated: plan.update.length,
      dropped: drops.length,
      unchanged: plan.unchanged.length,
      invalid: plan.invalid.length,
    });
  } catch (error) {
    await conn.rollback().catch(() => {});
    next(error);
  } finally {
    conn.release();
  }
});

// ── Colleges & courses ───────────────────────────────────────────────────────
// Registered above the generic /api/:resource routes, which match any single
// path segment and would otherwise swallow "academics" as an unknown resource.
//
// The clinic's academic structure is not a browser preference: students.course_code
// is a foreign key into `courses`, so a course that exists only in one admin's
// localStorage cannot have a student saved against it. Everything here is
// admin-only to write and readable by anyone signed in, because every roster
// screen needs the list to populate its dropdowns.

/** The full structure, shaped the way the app's dropdowns consume it. */
async function readAcademics() {
  const [collegeRows] = await pool.query('SELECT code, name FROM colleges ORDER BY code');
  const [courseRows] = await pool.query('SELECT code, college_code, name, years FROM courses ORDER BY code');
  return collegeRows.map((c) => ({
    code: c.code,
    name: c.name,
    courses: courseRows
      .filter((k) => k.college_code === c.code)
      .map((k) => ({ code: k.code, name: k.name, years: Number(k.years) || DEFAULT_COURSE_YEARS })),
  }));
}

const DEFAULT_COURSE_YEARS = 4;
const MAX_COURSE_YEARS = 4;

/** A college/course code as it is stored: trimmed and upper-cased. */
function academicCode(value, max) {
  return String(value ?? '').trim().toUpperCase().slice(0, max);
}

app.get('/api/academics', async (_req, res, next) => {
  try {
    res.json(await readAcademics());
  } catch (error) {
    next(error);
  }
});

app.post('/api/academics/colleges', requireRole('admin'), async (req, res, next) => {
  try {
    const code = academicCode(req.body?.code, 16);
    if (!code) { res.status(400).json({ error: 'Enter a college name' }); return; }
    const name = String(req.body?.name ?? '').trim().slice(0, 100) || code;
    const [existing] = await pool.query('SELECT code FROM colleges WHERE code = ?', [code]);
    if (existing.length) { res.status(409).json({ error: `"${code}" already exists` }); return; }
    await pool.query('INSERT INTO colleges (code, name) VALUES (?, ?)', [code, name]);
    console.log(`[academics] college ${code} added by account ${req.user?.accountId ?? 'unknown'}`);
    res.status(201).json(await readAcademics());
  } catch (error) {
    next(error);
  }
});

app.delete('/api/academics/colleges/:code', requireRole('admin'), async (req, res, next) => {
  try {
    const code = academicCode(req.params.code, 16);
    // The database would refuse this anyway (courses.college_code is RESTRICT),
    // but as a 500 that says nothing. Name what is in the way instead.
    const [courses] = await pool.query('SELECT code FROM courses WHERE college_code = ?', [code]);
    if (courses.length) {
      res.status(409).json({
        error: `Remove its ${courses.length} course${courses.length === 1 ? '' : 's'} first (${courses.map((c) => c.code).join(', ')}).`,
      });
      return;
    }
    const [result] = await pool.query('DELETE FROM colleges WHERE code = ?', [code]);
    if (!result.affectedRows) { res.status(404).json({ error: 'College not found' }); return; }
    console.log(`[academics] college ${code} removed by account ${req.user?.accountId ?? 'unknown'}`);
    res.json(await readAcademics());
  } catch (error) {
    next(error);
  }
});

app.post('/api/academics/courses', requireRole('admin'), async (req, res, next) => {
  try {
    const collegeCode = academicCode(req.body?.collegeCode, 16);
    const code = academicCode(req.body?.code, 32);
    if (!code) { res.status(400).json({ error: 'Enter a course name' }); return; }
    const [college] = await pool.query('SELECT code FROM colleges WHERE code = ?', [collegeCode]);
    if (!college.length) { res.status(404).json({ error: 'College not found' }); return; }
    const [existing] = await pool.query('SELECT college_code FROM courses WHERE code = ?', [code]);
    if (existing.length) {
      res.status(409).json({ error: `"${code}" already exists in ${existing[0].college_code}` });
      return;
    }
    const name = String(req.body?.name ?? '').trim().slice(0, 100) || code;
    const years = Number(req.body?.years);
    await pool.query(
      'INSERT INTO courses (code, college_code, name, years) VALUES (?, ?, ?, ?)',
      [code, collegeCode, name, Number.isFinite(years) && years >= 1 && years <= MAX_COURSE_YEARS ? Math.round(years) : DEFAULT_COURSE_YEARS],
    );
    console.log(`[academics] course ${code} added to ${collegeCode} by account ${req.user?.accountId ?? 'unknown'}`);
    res.status(201).json(await readAcademics());
  } catch (error) {
    next(error);
  }
});

app.put('/api/academics/courses/:code', requireRole('admin'), async (req, res, next) => {
  try {
    const code = academicCode(req.params.code, 32);
    const years = Number(req.body?.years);
    if (!Number.isFinite(years) || years < 1 || years > MAX_COURSE_YEARS) {
      res.status(400).json({ error: `Program length must be between 1 and ${MAX_COURSE_YEARS} years` });
      return;
    }
    const [result] = await pool.query('UPDATE courses SET years = ? WHERE code = ?', [Math.round(years), code]);
    if (!result.affectedRows) { res.status(404).json({ error: 'Course not found' }); return; }
    res.json(await readAcademics());
  } catch (error) {
    next(error);
  }
});

app.delete('/api/academics/courses/:code', requireRole('admin'), async (req, res, next) => {
  try {
    const code = academicCode(req.params.code, 32);
    const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM students WHERE course_code = ?', [code]);
    if (n) {
      res.status(409).json({ error: `${n} student${n === 1 ? ' is' : 's are'} enrolled in ${code}. Move them to another course first.` });
      return;
    }
    const [result] = await pool.query('DELETE FROM courses WHERE code = ?', [code]);
    if (!result.affectedRows) { res.status(404).json({ error: 'Course not found' }); return; }
    console.log(`[academics] course ${code} removed by account ${req.user?.accountId ?? 'unknown'}`);
    res.json(await readAcademics());
  } catch (error) {
    next(error);
  }
});

app.post('/api/academics/reset', requireRole('admin'), async (req, res, next) => {
  const conn = await pool.getConnection();
  try {
    const defaultCourses = new Set(DEFAULT_ACADEMICS.flatMap((c) => c.courses.map((k) => k.code)));
    // Restoring the defaults means removing everything added since — but a
    // course with students in it cannot go, and silently keeping it while
    // reporting success would be a lie. Refuse the whole reset and say which.
    const [inUse] = await conn.query(
      `SELECT c.code, COUNT(s.student_id) AS n FROM courses c
       JOIN students s ON s.course_code = c.code
       GROUP BY c.code`,
    );
    const blocked = inUse.filter((r) => !defaultCourses.has(r.code));
    if (blocked.length) {
      res.status(409).json({
        error: `Cannot reset: ${blocked.map((r) => `${r.code} (${r.n} student${r.n === 1 ? '' : 's'})`).join(', ')} still in use.`,
      });
      return;
    }
    await conn.beginTransaction();
    await conn.query(`DELETE FROM courses WHERE code NOT IN (${[...defaultCourses].map(() => '?').join(', ')})`, [...defaultCourses]);
    const defaultColleges = DEFAULT_ACADEMICS.map((c) => c.code);
    await conn.query(`DELETE FROM colleges WHERE code NOT IN (${defaultColleges.map(() => '?').join(', ')})`, defaultColleges);
    for (const college of DEFAULT_ACADEMICS) {
      await conn.query('INSERT INTO colleges (code, name) VALUES (?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)', [college.code, college.name]);
      for (const course of college.courses) {
        await conn.query(
          `INSERT INTO courses (code, college_code, name, years) VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE college_code = VALUES(college_code), name = VALUES(name), years = VALUES(years)`,
          [course.code, college.code, course.name, course.years],
        );
      }
    }
    await conn.commit();
    console.log(`[academics] reset to defaults by account ${req.user?.accountId ?? 'unknown'}`);
    res.json(await readAcademics());
  } catch (error) {
    await conn.rollback().catch(() => {});
    next(error);
  } finally {
    conn.release();
  }
});

// ── Backup & restore ─────────────────────────────────────────────────────────
// Settings used to "back up" by writing out seven localStorage keys — a stale
// mirror of one browser, not the clinic's data — and the Restore button showed
// a toast and did nothing at all. Both now go through MySQL.
//
// Rows are dumped decrypted, in the same shape the API serves, so a backup
// stays readable if DATA_ENC_KEY is ever rotated and re-encrypts on the way
// back in. That makes the file itself sensitive: it is the whole clinic's
// health records in plain text, and the UI says so before it downloads.
//
// Deliberately NOT included: accounts and sessions (restoring them could lock
// every admin out or reinstate a revoked login) and documents (their metadata
// is meaningless without the uploaded files, which live on disk — deploy/backup-clinix.ps1
// is what captures those).
const BACKUP_VERSION = 1;

// Parents before children: courses need their college, students need their
// course, and everything else hangs off students. Restore walks this forwards
// and clears tables backwards.
const BACKUP_ORDER = [
  'faculty', 'students', 'medicalForms', 'formulary', 'inventory',
  'medicalRecords', 'visits', 'certificates', 'consultations', 'prescriptions', 'activities',
];

app.get('/api/backup', requireRole('admin'), async (req, res, next) => {
  try {
    const collections = {};
    for (const resource of BACKUP_ORDER) {
      const config = tables[resource];
      // dateStrings, and not the driver's default Date objects, because a
      // backup has to survive the round trip. mysql2 builds a Date in local
      // time; JSON.stringify then writes it in UTC, and MySQL reads that
      // "2026-07-31T16:00:00.000Z" back as the literal date 2026-07-31 with the
      // zone thrown away — so in Manila (UTC+8) every date in the clinic moved
      // one day earlier on every restore, and kept moving on each one after.
      // As strings the values go out and come back exactly as stored.
      const [rows] = await pool.query({ sql: `SELECT * FROM ${config.table}`, dateStrings: true });
      collections[resource] = rows.map((row) => fromDb(config, row));
    }
    const academics = await readAcademics();
    const counts = Object.fromEntries(Object.entries(collections).map(([k, v]) => [k, v.length]));
    console.log(`[backup] created by account ${req.user?.accountId ?? 'unknown'}: ${JSON.stringify(counts)}`);
    res.json({
      version: BACKUP_VERSION,
      generatedAt: new Date().toISOString(),
      database: process.env.DB_NAME || 'clinix',
      excludes: ['accounts', 'sessions', 'documents'],
      academics,
      collections,
    });
  } catch (error) {
    next(error);
  }
});

app.post(RESTORE_PATH, express.json({ limit: '256mb' }), requireRole('admin'), async (req, res) => {
  const backup = req.body;
  if (!backup || typeof backup !== 'object' || !backup.collections || typeof backup.collections !== 'object') {
    res.status(400).json({ error: 'That file is not a Clinix backup.' });
    return;
  }
  if (Number(backup.version) !== BACKUP_VERSION) {
    res.status(400).json({ error: `That backup is version ${backup.version ?? 'unknown'}; this system reads version ${BACKUP_VERSION}.` });
    return;
  }
  // Every listed collection must be an array before anything is deleted — half
  // a restore is worse than none.
  for (const resource of BACKUP_ORDER) {
    const rows = backup.collections[resource];
    if (rows !== undefined && !Array.isArray(rows)) {
      res.status(400).json({ error: `The "${resource}" section of that backup is damaged.` });
      return;
    }
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Children first, so no delete trips a foreign key on its way out.
    for (const resource of [...BACKUP_ORDER].reverse()) {
      await conn.query(`DELETE FROM ${tables[resource].table}`);
    }

    const academics = Array.isArray(backup.academics) ? backup.academics : [];
    if (academics.length) {
      await conn.query('DELETE FROM courses');
      await conn.query('DELETE FROM colleges');
      for (const college of academics) {
        const code = academicCode(college?.code, 16);
        if (!code) continue;
        await conn.query('INSERT INTO colleges (code, name) VALUES (?, ?)', [code, String(college?.name ?? code).slice(0, 100)]);
        for (const course of Array.isArray(college?.courses) ? college.courses : []) {
          const courseCode = academicCode(course?.code, 32);
          if (!courseCode) continue;
          const years = Number(course?.years);
          await conn.query(
            'INSERT INTO courses (code, college_code, name, years) VALUES (?, ?, ?, ?)',
            [courseCode, code, String(course?.name ?? courseCode).slice(0, 100),
              Number.isFinite(years) && years >= 1 && years <= MAX_COURSE_YEARS ? Math.round(years) : DEFAULT_COURSE_YEARS],
          );
        }
      }
    }

    const restored = {};
    for (const resource of BACKUP_ORDER) {
      const config = tables[resource];
      const rows = Array.isArray(backup.collections[resource]) ? backup.collections[resource] : [];
      let written = 0;
      for (const item of rows) {
        if (!item || typeof item !== 'object') continue;
        const row = toDb(config, item);
        const columns = Object.keys(row);
        if (!columns.length) continue;
        await conn.query(
          `INSERT INTO ${config.table} (${columns.map((c) => `\`${c}\``).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
          columns.map((c) => row[c]),
        );
        written += 1;
      }
      restored[resource] = written;
    }

    await conn.commit();
    console.log(`[backup] restored by account ${req.user?.accountId ?? 'unknown'}: ${JSON.stringify(restored)}`);
    res.json({ restored });
  } catch (error) {
    await conn.rollback().catch(() => {});
    // A malformed row surfaces here as a SQL error. The rollback means nothing
    // changed, which is the one thing the admin needs to be told.
    console.error(`[backup] restore failed, nothing changed: ${error.message}`);
    res.status(400).json({ error: `Restore failed and nothing was changed: ${error.message}` });
  } finally {
    conn.release();
  }
});

app.get('/api/:resource', async (req, res, next) => {
  try {
    const config = routeConfig(req, res);
    if (!config) return;
    if (req.params.resource === 'students') {
      const where = [];
      const values = [];
      if (req.query.college) { where.push('c.college_code = ?'); values.push(String(req.query.college).toUpperCase()); }
      if (req.query.course) { where.push('s.course_code = ?'); values.push(String(req.query.course).toUpperCase()); }
      if (req.query.yearLevel) { where.push('s.year_level = ?'); values.push(req.query.yearLevel); }
      // status=enrolled, status=graduated,dropped, or status=all for everyone.
      // Omitting it also returns everyone: the app loads the roster once and
      // switches between the Enrolled / Alumni / Dropped views in the browser.
      if (req.query.status && req.query.status !== 'all') {
        const wanted = String(req.query.status).split(',').map((v) => v.trim()).filter(Boolean);
        if (wanted.length) {
          where.push(`s.status IN (${wanted.map(() => '?').join(', ')})`);
          values.push(...wanted);
        }
      }
      if (req.query.q) {
        values.push(`%${req.query.q}%`);
        where.push(`CONCAT_WS(' ', s.student_id, s.last_name, s.first_name, s.middle_name, s.name, s.course_code, s.year_level, s.gender, s.contact_number, s.medical_conditions) LIKE ?`);
      }
      const [rows] = await pool.query(
        `SELECT s.* FROM students s JOIN courses c ON c.code = s.course_code ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY s.last_name, s.first_name, s.middle_name`,
        values,
      );
      res.json(rows.map((row) => fromDb(config, row)));
      return;
    }
    const [rows] = await pool.query(`SELECT * FROM ${config.table} ORDER BY ${config.order}`);
    res.json(rows.map((row) => fromDb(config, row)));
  } catch (error) {
    next(error);
  }
});

app.get('/api/:resource/:id', async (req, res, next) => {
  try {
    const config = routeConfig(req, res);
    if (!config) return;
    const [rows] = await pool.query(`SELECT * FROM ${config.table} WHERE ${config.id} = ?`, [req.params.id]);
    if (!rows.length) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json(fromDb(config, rows[0]));
  } catch (error) {
    next(error);
  }
});

// ── Oversized image guard ────────────────────────────────────────────────────
// A photo is stored as a base64 data URL, encrypted, in a LONGTEXT column. The
// column is not the constraint — MySQL's max_allowed_packet is, and on a stock
// XAMPP that is 1 MB. Encryption adds about a third (measured: a 500 KB photo
// lands as 683 KB), so anything past roughly 780 KB kills the connection
// mid-write. That surfaced as "read ECONNRESET" and a 500, which tells the
// nurse nothing and leaves her unsure whether the record saved.
//
// The UI already downscales to 480px JPEG, landing at 30-80 KB, so this should
// never fire in normal use. It exists so that when it does — a pasted
// screenshot, a browser where the canvas downscale failed — the answer is a
// sentence rather than a dropped connection.
const MAX_IMAGE_BYTES = 700 * 1024;

/** Returns an error message when an image field is too large to store, else null. */
function oversizedImage(body) {
  for (const field of ['photo']) {
    const value = body?.[field];
    if (typeof value !== 'string' || !value) continue;
    // Encryption inflates the stored value; check what will actually be
    // written, not what arrived.
    const stored = Math.ceil(value.length * 1.34);
    if (stored > MAX_IMAGE_BYTES) {
      return `That image is too large (about ${Math.round(value.length / 1024)} KB). `
           + `Please use one under ${Math.floor(MAX_IMAGE_BYTES / 1.34 / 1024)} KB, or crop it smaller.`;
    }
  }
  return null;
}

app.post('/api/:resource', async (req, res, next) => {
  try {
    const config = routeConfig(req, res);
    if (!config) return;
    const tooBig = oversizedImage(req.body);
    if (tooBig) { res.status(413).json({ error: tooBig }); return; }
    const row = toDb(config, req.body);
    if (req.params.resource === 'students') {
      // Same reasoning as the PUT path: the audit columns are the server's to
      // write, not the caller's to claim.
      row.status_updated_at = new Date();
      row.status_updated_by = req.user?.accountId ?? null;
      row.date_graduated = row.status === 'graduated' ? (req.body.dateGraduated || sqlToday()) : null;
    }
    const columns = Object.keys(row);
    if (!columns.length) {
      res.status(400).json({ error: 'No valid fields' });
      return;
    }
    const placeholders = columns.map(() => '?').join(', ');
    await pool.query(
      `INSERT INTO ${config.table} (${columns.join(', ')}) VALUES (${placeholders})`,
      columns.map((column) => row[column]),
    );
    res.status(201).json(req.body);
  } catch (error) {
    next(error);
  }
});

app.put('/api/:resource/:id', async (req, res, next) => {
  try {
    const config = routeConfig(req, res);
    if (!config) return;
    const tooBig = oversizedImage(req.body);
    if (tooBig) { res.status(413).json({ error: tooBig }); return; }
    const row = toDb(config, req.body);
    delete row[config.id];
    if (req.params.resource === 'students') {
      // Unconditional: a payload with no `status` but a forged `statusUpdatedBy`
      // must still have that stripped, so the strip cannot live behind the
      // "did the status change?" check.
      delete row.status_updated_at;
      delete row.status_updated_by;
      delete row.date_graduated;
      if (row.status !== undefined) {
        await stampStatusChange(row, req.params.id, req.user, req.body.dateGraduated);
      }
    }
    const columns = Object.keys(row);
    if (!columns.length) {
      res.status(400).json({ error: 'No valid fields' });
      return;
    }
    const [result] = await pool.query(
      `UPDATE ${config.table} SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE ${config.id} = ?`,
      [...columns.map((column) => row[column]), req.params.id],
    );
    if (!result.affectedRows) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json({ ...req.body, id: req.params.id });
  } catch (error) {
    next(error);
  }
});

app.delete('/api/:resource/:id', async (req, res, next) => {
  try {
    const config = routeConfig(req, res);
    if (!config) return;
    const [result] = await pool.query(`DELETE FROM ${config.table} WHERE ${config.id} = ?`, [req.params.id]);
    if (!result.affectedRows) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

// ── Serve the built frontend ─────────────────────────────────────────────────
// When frontend/dist exists (after `npm run build`), this process serves the UI
// as well as the API, so a deployed clinic PC has ONE thing running on ONE URL
// (http://localhost:4001) instead of a separate dev server. During development
// the Vite dev server is still used and this block simply does nothing.
const distDir = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  // Single-page app: any non-API GET falls back to index.html so deep links work.
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) { next(); return; }
    res.sendFile(path.join(distDir, 'index.html'));
  });
  console.log('[web] Serving the built frontend from frontend/dist');
} else {
  console.log('[web] frontend/dist not found — API only (run "npm run build" in frontend/ to serve the UI here)');
}

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: error.message || 'Server error' });
});

// Prepare the schema. If MySQL isn't up yet we do NOT crash — we print a clear
// message, start the API anyway, and keep retrying so it self-heals once MySQL
// is started (no need to restart this process).

async function initDb({ quiet = false } = {}) {
  try {
    await ensureDbUpdates();
    await ensureSessionTable();
    await seedAccountsIfEmpty();
    await migrateAdminProfileToAccount();
    dbReady = true;
    console.log('[db] Connected — schema ready.');
    return true;
  } catch (error) {
    dbReady = false;
    if (!quiet) {
      const host = process.env.DB_HOST || '127.0.0.1';
      const dbPort = process.env.DB_PORT || 3306;
      if (error.code === 'ECONNREFUSED') {
        console.error(`\n[db] Cannot reach MySQL at ${host}:${dbPort} — it looks like MySQL is not running.`);
        console.error('     Automatic start did not succeed; start MySQL from the XAMPP Control Panel.');
      } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
        console.error(`\n[db] MySQL refused the credentials in backend/.env (DB_USER / DB_PASSWORD).`);
      } else if (error.code === 'ER_BAD_DB_ERROR') {
        console.error(`\n[db] Database "${process.env.DB_NAME || 'clinix'}" does not exist — create it in phpMyAdmin.`);
      } else {
        console.error('\n[db] Setup failed:', error.message);
      }
      console.error('     The API is still running and will retry every 10s. Uploads/accounts need MySQL.\n');
    }
    return false;
  }
}

// Start MySQL first if it isn't up, so that running the backend is the only
// thing anyone has to do — no XAMPP Control Panel, no second window.
const mysqlStatus = await ensureMysqlRunning();
const hint = autostartHint(mysqlStatus);
if (hint) console.error(`[mysql] ${hint}`);

await initDb();
if (!dbReady) {
  // Keep retrying, and keep trying to start MySQL too: this self-heals if the
  // database is slow to come up or is stopped and restarted later.
  const retry = setInterval(async () => {
    await ensureMysqlRunning();
    if (await initDb({ quiet: true })) clearInterval(retry);
  }, 10_000);
}


// Bind to all interfaces (0.0.0.0) so other devices on the LAN can reach the API.
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Clinix API listening on port ${port} (all interfaces) — e.g. http://<this-pc-ip>:${port}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Close the other backend terminal or run: $env:PORT=4002; npm.cmd run dev`);
    process.exit(1);
  }
  throw error;
});
