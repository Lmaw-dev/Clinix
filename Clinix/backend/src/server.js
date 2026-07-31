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
import { ensureDbUpdates, pingDb, pool } from './db.js';
import { encrypt, decrypt } from './crypto.js';
import { hashPassword, verifyPassword } from './password.js';
import { ensureMysqlRunning, autostartHint } from './mysql-autostart.js';

const app = express();
const port = Number(process.env.PORT || 4001);

// Allow the configured origin, or reflect any origin (LAN devices) when unset.
app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json({ limit: '5mb' }));

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
    // status and the boarding flag stay plaintext so search, filtering and joins
    // keep working.
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
    },
    encrypted: ['name', 'role', 'contact', 'medicalHistory', 'photo'],
  },
  medicalRecords: {
    table: 'medical_records',
    id: 'id',
    order: 'record_date',
    fields: {
      id: 'id',
      studentId: 'student_id',
      name: 'name',
      summary: 'summary',
      date: 'record_date',
    },
    encrypted: ['name', 'summary'],
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
    },
    // Medicine/supply reference data — not personal; left queryable/plaintext.
    encrypted: [],
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
    order: 'consultation_date',
    fields: {
      id: 'id',
      studentId: 'student_id',
      studentName: 'student_name',
      date: 'consultation_date',
      summary: 'summary',
      outcome: 'outcome',
    },
    encrypted: ['studentName', 'summary', 'outcome'],
  },
  activities: {
    table: 'activities',
    id: 'id',
    order: 'ts',
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
  const row = {};
  for (const [apiKey, dbKey] of Object.entries(config.fields)) {
    if (body[apiKey] !== undefined) row[dbKey] = enc.includes(apiKey) ? encrypt(body[apiKey]) : body[apiKey];
  }
  return row;
}

function fromDb(config, row) {
  const enc = config.encrypted || [];
  const out = {};
  for (const [apiKey, dbKey] of Object.entries(config.fields)) {
    out[apiKey] = enc.includes(apiKey) ? decrypt(row[dbKey]) : row[dbKey];
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
    res.json({ ok: true, role: acc.role, username: acc.username, name: [acc.firstName, acc.lastName].filter(Boolean).join(' ') || acc.username });
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

app.get('/api/accounts', async (_req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM accounts');
    res.json(rows.map((r) => accountFromDb(r, false))); // never expose passwords
  } catch (error) { next(error); }
});

app.post('/api/accounts', async (req, res, next) => {
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

app.put('/api/accounts/:id', async (req, res, next) => {
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

app.delete('/api/accounts/:id', async (req, res, next) => {
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
      if (req.query.status) { where.push('s.status = ?'); values.push(req.query.status); }
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

app.post('/api/:resource', async (req, res, next) => {
  try {
    const config = routeConfig(req, res);
    if (!config) return;
    const row = toDb(config, req.body);
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
    const row = toDb(config, req.body);
    delete row[config.id];
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
let dbReady = false;

async function initDb({ quiet = false } = {}) {
  try {
    await ensureDbUpdates();
    await seedAccountsIfEmpty();
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

// Simple readiness flag for the health endpoint / debugging.
app.get('/api/db-status', (_req, res) => res.json({ dbReady }));

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
