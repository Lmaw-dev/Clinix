import { API_URL, apiFetch } from './api';
// ── Shared storage for the collections that used to live in localStorage ─────
// Every one of these lists was previously kept in the browser, so two devices
// (and two people) never saw the same clinic. They now live in MySQL behind the
// API; localStorage stays only as an offline cache of the last known state.
//
// One helper set is used for all of them so each collection does not invent its
// own slightly different loading, saving and error behaviour.


export type Resource =
  | 'inventory'
  | 'medicalRecords'
  | 'medicalForms'
  | 'certificates'
  | 'activities'
  | 'prescriptions';

async function request(path: string, init?: RequestInit): Promise<Response> {
  const res = await apiFetch(`${API_URL}${path}`, init);
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({} as { error?: string }));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res;
}

export async function listApi<T>(resource: Resource): Promise<T[]> {
  const res = await request(`/${resource}`);
  return res.json();
}

export async function createApi<T extends object>(resource: Resource, item: T): Promise<void> {
  await request(`/${resource}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  });
}

export async function updateApi<T extends object>(resource: Resource, id: string, changes: Partial<T>): Promise<void> {
  await request(`/${resource}/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  });
}

export async function deleteApi(resource: Resource, id: string): Promise<void> {
  await request(`/${resource}/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/**
 * A MySQL DATE arrives as a timestamp at local midnight, which JSON serialises
 * in UTC: a date of 31 July in Manila comes back as "2026-07-30T16:00:00.000Z".
 * Reading the first ten characters would shift it a day earlier, so the date is
 * rebuilt from local calendar parts.
 */
export function toDateInput(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw.slice(0, 10);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Nulls from the database become empty strings for the form inputs. */
export function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

/**
 * "YYYY-MM-DD HH:MM:SS" in local time, which is what a MySQL DATETIME column
 * accepts. Using toISOString() here would store the UTC instant and shift every
 * timestamp by the local offset.
 */
export function toSqlDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** A stored timestamp turned back into something readable on screen. */
export function toDisplayDateTime(value: unknown): string {
  const raw = text(value);
  if (!raw) return '';
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? raw : d.toLocaleString();
}

/**
 * One-time lift of a localStorage collection into the database. It only uploads
 * when the server side is still empty, so running it twice — or on a second
 * device — cannot duplicate records somebody else already saved.
 * Returns how many rows were moved.
 */
export async function migrateLocalCollection<T extends object>(
  resource: Resource,
  local: T[],
  flagKey: string,
): Promise<number> {
  if (!local.length) return 0;
  try {
    if (localStorage.getItem(flagKey) === 'true') return 0;
  } catch { /* storage unavailable — attempt the migration anyway */ }

  const existing = await listApi<T>(resource);
  if (existing.length) {
    try { localStorage.setItem(flagKey, 'true'); } catch { /* ignore */ }
    return 0;
  }

  let moved = 0;
  for (const item of local) {
    try {
      await createApi(resource, item);
      moved++;
    } catch {
      // One unusable row must not strand the rest in the browser.
    }
  }
  if (moved === local.length) {
    try { localStorage.setItem(flagKey, 'true'); } catch { /* ignore */ }
  }
  return moved;
}

/**
 * Run a write against the API without blocking the screen, and say so if it
 * fails. Silence would be the dangerous option here: the change is already
 * visible, so without a message the user would believe it was saved.
 */
export function persist(promise: Promise<unknown>, showToast: (m: string) => void, what: string): void {
  promise.catch((err: unknown) => {
    const detail = err instanceof Error ? err.message : '';
    showToast(`Could not save ${what} to the server${detail ? ` — ${detail}` : ''}`);
  });
}

// ── Admin profile ────────────────────────────────────────────────────────────
// A single row rather than a collection, so it has its own pair of calls.

export type AdminProfileData = { name: string; photo: string };

export async function getAdminProfileApi(): Promise<AdminProfileData> {
  const res = await request('/admin-profile');
  const d = await res.json();
  return { name: text(d.name) || 'Clinic Admin', photo: text(d.photo) };
}

export async function saveAdminProfileApi(profile: AdminProfileData): Promise<void> {
  await request('/admin-profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  });
}

// ── Clinic protocol (the nurse's own formulary) ──────────────────────────────
// Consulted before the AI: instant, offline, and every entry was decided by the
// clinic's own nurse rather than inferred by a model.

export type FormularyEntry = {
  id: string;
  complaint: string;
  itemCode: string | null;
  itemName: string | null;
  dose: string | null;
  notes: string | null;
  addedBy: string | null;
  inStock: boolean;
  available: number;
  unit: string;
};

export async function protocolForComplaint(complaint: string): Promise<FormularyEntry[]> {
  if (!complaint.trim()) return [];
  try {
    const res = await apiFetch(`${API_URL}/formulary/suggest?complaint=${encodeURIComponent(complaint)}`);
    if (!res.ok) return [];
    const d = await res.json();
    return Array.isArray(d.matches) ? d.matches : [];
  } catch {
    return [];
  }
}

/** Record "for this complaint we give this" so the protocol grows from practice. */
export async function saveProtocolEntry(entry: {
  complaint: string; itemCode: string; itemName: string; dose?: string; addedBy?: string;
}): Promise<void> {
  await request('/formulary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: `f${Date.now()}`, ...entry }),
  });
}

// ── AI medicine suggestions ──────────────────────────────────────────────────
// Advisory only. The server is sent the complaint and assessment text — never
// the patient's name, ID or other identifying details — and returns candidate
// medicines. Nothing is dispensed until the nurse acts on one.

export type MedicineSuggestion = {
  genericName: string;
  drugClass: string;
  typicalDose: string;
  rationale: string;
  cautions: string;
  inStock: boolean;
  itemCode: string | null;
  itemName: string | null;
  available: number;
  unit: string;
};

export type SuggestionResult = {
  suggestions: MedicineSuggestion[];
  redFlags: string[];
  referralAdvised: boolean;
  notes: string;
};

export type AiStatus = { enabled: boolean; model?: string; parameterSize?: string; reason?: string; warning?: string };

/**
 * Whether suggestions are available, and if not, why. "Ollama is not running"
 * and "the model is not installed" need different fixes, so the screen says
 * which one it is instead of just hiding the panel.
 */
export async function aiStatusApi(): Promise<AiStatus> {
  try {
    const res = await apiFetch(`${API_URL}/ai/status`);
    if (!res.ok) return { enabled: false };
    return await res.json();
  } catch {
    return { enabled: false, reason: 'Could not reach the Clinix server' };
  }
}

export async function suggestMedicinesApi(clinical: {
  purpose?: string; chiefComplaint?: string; assessment?: string;
  age?: string; sex?: string; vitals?: string;
}): Promise<SuggestionResult> {
  const res = await apiFetch(`${API_URL}/ai/suggest-medicines`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // Only clinical fields are sent. The server drops anything else regardless,
    // but nothing identifying is put on the wire in the first place.
    body: JSON.stringify(clinical),
  });
  const body = await res.json().catch(() => ({} as { error?: string }));
  if (!res.ok) throw new Error(body.error || 'Could not get suggestions');
  return body as SuggestionResult;
}

// ── Prescriptions ────────────────────────────────────────────────────────────

export type Prescription = {
  id?: string;
  consultationId?: string;
  patientId?: string;
  patientName?: string;
  itemCode: string;
  itemName?: string;
  quantity: number;
  dosage?: string;
  instructions?: string;
  dispensedBy?: string;
  date?: string;
};

export class OutOfStockError extends Error {
  available: number;
  constructor(message: string, available: number) {
    super(message);
    this.available = available;
  }
}

/**
 * Dispense medicine: writes the prescription and deducts the stock in a single
 * transaction on the server. Returns the quantity left so the caller can update
 * the inventory on screen without refetching everything.
 */
export async function dispensePrescription(p: Prescription): Promise<{ id: string; remaining: number }> {
  const res = await apiFetch(`${API_URL}/prescriptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(p),
  });
  const body = await res.json().catch(() => ({} as { error?: string; available?: number }));
  if (res.status === 409) {
    throw new OutOfStockError(body.error || 'Not enough stock', Number(body.available ?? 0));
  }
  if (!res.ok) throw new Error(body.error || 'Could not dispense the medicine');
  return { id: String(body.id), remaining: Number(body.remaining ?? 0) };
}

export async function listPrescriptionsApi(): Promise<Prescription[]> {
  const rows = await listApi<Record<string, unknown>>('prescriptions');
  return rows.map((r) => ({
    ...(r as unknown as Prescription),
    id: text(r.id),
    patientName: text(r.patientName),
    itemName: text(r.itemName),
    dosage: text(r.dosage),
    instructions: text(r.instructions),
    dispensedBy: text(r.dispensedBy),
    quantity: Number(r.quantity ?? 0),
    date: toDateInput(r.date),
  }));
}

/** Remove a prescription and put the medicine back into stock. */
export async function deletePrescriptionApi(id: string): Promise<void> {
  await deleteApi('prescriptions', id);
}
