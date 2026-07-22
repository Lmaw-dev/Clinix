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
  await pool.query(`
    UPDATE students
    SET
      first_name = COALESCE(NULLIF(first_name, ''), SUBSTRING_INDEX(name, ' ', 1)),
      last_name = COALESCE(NULLIF(last_name, ''), SUBSTRING_INDEX(name, ' ', -1)),
      middle_name = COALESCE(middle_name, '')
  `);
  await pool.query(`
    ALTER TABLE students
      MODIFY last_name VARCHAR(80) NOT NULL,
      MODIFY first_name VARCHAR(80) NOT NULL,
      MODIFY middle_name VARCHAR(80) NULL
  `);
  await pool.query(`
    ALTER TABLE faculty
      ADD COLUMN IF NOT EXISTS photo LONGTEXT NULL
  `);
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
}
