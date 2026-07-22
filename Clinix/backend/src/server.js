import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { ensureDbUpdates, pingDb, pool } from './db.js';

const app = express();
const port = Number(process.env.PORT || 4001);

// Allow the configured origin, or reflect any origin (LAN devices) when unset.
app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json({ limit: '5mb' }));

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
    fileName: row.file_name,
    mimeType: row.mime_type,
    size: Number(row.size_bytes ?? 0),
    uploadedAt: row.uploaded_at,
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
      medicalConditions: 'medical_conditions',
      status: 'status',
      photo: 'photo',
    },
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
    },
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
  },
};

function toDb(config, body) {
  const row = {};
  for (const [apiKey, dbKey] of Object.entries(config.fields)) {
    if (body[apiKey] !== undefined) row[dbKey] = body[apiKey];
  }
  return row;
}

function fromDb(config, row) {
  const out = {};
  for (const [apiKey, dbKey] of Object.entries(config.fields)) out[apiKey] = row[dbKey];
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

// ── Document routes (registered before the generic /api/:resource routes) ─────
app.get('/api/documents', async (req, res, next) => {
  try {
    const { ownerType, ownerId } = req.query;
    if (!ownerType || !ownerId) {
      res.status(400).json({ error: 'ownerType and ownerId are required' });
      return;
    }
    const [rows] = await pool.query(
      'SELECT * FROM documents WHERE owner_type = ? AND owner_id = ? ORDER BY uploaded_at DESC',
      [String(ownerType), String(ownerId)],
    );
    res.json(rows.map(docFromDb));
  } catch (error) {
    next(error);
  }
});

app.post('/api/documents', upload.single('file'), async (req, res, next) => {
  try {
    const { ownerType, ownerId } = req.body;
    if (!ownerType || !ownerId || !req.file) {
      if (req.file) fs.unlink(req.file.path, () => {});
      res.status(400).json({ error: 'ownerType, ownerId and a file are required' });
      return;
    }
    const id = randomUUID();
    const uploadedAt = new Date();
    await pool.query(
      'INSERT INTO documents (id, owner_type, owner_id, file_name, stored_name, mime_type, size_bytes, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, String(ownerType), String(ownerId), req.file.originalname, req.file.filename, req.file.mimetype, req.file.size, uploadedAt],
    );
    res.status(201).json({
      id, ownerType, ownerId,
      fileName: req.file.originalname, mimeType: req.file.mimetype,
      size: req.file.size, uploadedAt: uploadedAt.toISOString(),
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
    res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(doc.file_name)}`);
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
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(doc.file_name.replace(/\.[^.]+$/, '.pdf'))}`);
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

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: error.message || 'Server error' });
});

await ensureDbUpdates();

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
