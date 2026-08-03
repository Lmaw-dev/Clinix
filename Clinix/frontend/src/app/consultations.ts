import { Consultation } from './App';
import { API_URL, apiFetch } from './api';

// ── Consultation log storage ─────────────────────────────────────────────────
// The log used to live only in localStorage, so a staff member's vital signs and
// the nurse's view of them were separate copies on separate machines. It now
// lives in MySQL through the shared API, and localStorage is kept purely as an
// offline cache so the screen still shows something when the backend is down.


export async function listConsultationsApi(): Promise<Consultation[]> {
  const res = await apiFetch(`${API_URL}/consultations`);
  if (!res.ok) throw new Error('Failed to load consultations');
  const rows: Record<string, unknown>[] = await res.json();
  return rows.map(normalize);
}

export async function createConsultationApi(c: Consultation): Promise<void> {
  const res = await apiFetch(`${API_URL}/consultations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(c),
  });
  if (!res.ok) throw new Error('Could not save the consultation');
}

export async function updateConsultationApi(id: string, changes: Partial<Consultation>): Promise<void> {
  const res = await apiFetch(`${API_URL}/consultations/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  });
  if (!res.ok) throw new Error('Could not save the change');
}

export async function deleteConsultationApi(id: string): Promise<void> {
  const res = await apiFetch(`${API_URL}/consultations/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) throw new Error('Could not delete the consultation');
}

/**
 * A MySQL DATE arrives as a timestamp at local midnight, which JSON serialises
 * in UTC: a visit logged on 31 July in Manila comes back as
 * "2026-07-30T16:00:00.000Z". Slicing that string would file the consultation
 * under the wrong day, so the date is rebuilt from local calendar parts.
 */
function toDateInput(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const raw = String(value);
  // Already a plain calendar date — nothing to reinterpret.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw.slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * MySQL hands dates back as timestamps and nulls for empty text. The log expects
 * plain strings and a YYYY-MM-DD date, so everything is flattened here rather
 * than in each component.
 */
function normalize(row: Record<string, unknown>): Consultation {
  const text = (v: unknown) => (v === null || v === undefined ? '' : String(v));
  return {
    ...(row as unknown as Consultation),
    id: text(row.id),
    studentId: text(row.studentId),
    studentName: text(row.studentName),
    date: toDateInput(row.date),
    summary: text(row.summary),
    outcome: text(row.outcome),
    time: text(row.time),
    age: text(row.age),
    sex: text(row.sex),
    courseOrOffice: text(row.courseOrOffice),
    chiefComplaint: text(row.chiefComplaint),
    management: text(row.management),
    bp: text(row.bp),
    rr: text(row.rr),
    pr: text(row.pr),
    temp: text(row.temp),
    o2sat: text(row.o2sat),
    assessment: text(row.assessment),
    bloodType: text(row.bloodType),
  };
}

const MIGRATED_FLAG = 'clinixConsultationsMigrated';

/**
 * One-time lift of whatever is still sitting in localStorage into the database.
 * Runs only when the server has no consultations yet, so it cannot duplicate an
 * already-populated log. Returns how many entries were moved.
 */
export async function migrateLocalConsultations(local: Consultation[]): Promise<number> {
  if (!local.length) return 0;
  try {
    if (localStorage.getItem(MIGRATED_FLAG) === 'true') return 0;
  } catch { /* storage unavailable — try the migration anyway */ }

  const existing = await listConsultationsApi();
  if (existing.length) {
    // The database already has entries; leaving the local copies alone avoids
    // creating duplicates of records someone else already uploaded.
    try { localStorage.setItem(MIGRATED_FLAG, 'true'); } catch { /* ignore */ }
    return 0;
  }

  let moved = 0;
  for (const c of local) {
    try {
      await createConsultationApi(c);
      moved++;
    } catch {
      // Keep going: one bad row should not strand the rest in the browser.
    }
  }
  if (moved === local.length) {
    try { localStorage.setItem(MIGRATED_FLAG, 'true'); } catch { /* ignore */ }
  }
  return moved;
}
