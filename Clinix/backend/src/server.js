import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { ensureDbUpdates, pingDb, pool } from './db.js';

const app = express();
const port = Number(process.env.PORT || 4001);

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '5mb' }));

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

const server = app.listen(port, () => {
  console.log(`Clinix API: http://localhost:${port}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Close the other backend terminal or run: $env:PORT=4002; npm.cmd run dev`);
    process.exit(1);
  }
  throw error;
});
