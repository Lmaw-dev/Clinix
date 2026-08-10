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
 * A date as YYYY-MM-DD in *local* time. Defaults to today.
 *
 * `new Date().toISOString().slice(0, 10)` is the obvious way to write this and
 * it is wrong anywhere east of Greenwich: at 07:00 in Manila the UTC date is
 * still yesterday, so anything comparing against it — "today's consultations",
 * a seven-day trend — silently reports the wrong day until 8am. Consultation
 * dates are stored as local calendar days, so they have to be built and
 * compared as local calendar days. Same reasoning as toDateInput above.
 */
export function isoDate(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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

// ── End-of-school-year processing ────────────────────────────────────────────
// Promote every enrolled student one year level, and graduate the ones who have
// reached the end of their program. Nothing is deleted or moved: a graduate's
// row and their whole medical history stay exactly where they are.
//
// This runs on the server in one transaction rather than as a few hundred
// separate saves from the browser, so a dropped connection halfway through
// cannot leave the roster half-promoted.

export type YearEndCandidate = {
  studentId: string;
  name: string;
  course: string;
  yearLevel: string;
  /** The last year level of this student's program. */
  finalYear: number;
  /** Where they are going, or null when they are graduating. */
  nextYearLevel: string | null;
  /** Only on skipped rows — why they could not be processed. */
  reason?: string;
};

export type YearEndPlan = {
  promote: YearEndCandidate[];
  graduate: YearEndCandidate[];
  skipped: YearEndCandidate[];
};

export type YearEndResult = {
  promoted: number;
  graduated: number;
  skipped: number;
  dateGraduated: string;
};

async function yearEnd(action: 'preview' | 'commit', body: object): Promise<Response> {
  return request(`/students/year-end/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** What year-end processing *would* do. Changes nothing. */
export async function previewYearEndApi(courseYears: Record<string, number>): Promise<YearEndPlan> {
  const res = await yearEnd('preview', { courseYears });
  return res.json();
}

export async function commitYearEndApi(
  courseYears: Record<string, number>,
  dateGraduated: string,
): Promise<YearEndResult> {
  const res = await yearEnd('commit', { courseYears, dateGraduated });
  return res.json();
}

// ── Your own profile ─────────────────────────────────────────────────────────
// The details of whoever is signed in. There is no id to pass: the server reads
// the account from the session token, so these calls cannot reach anyone else's
// profile even if someone edits the request. Managing *other* people's accounts
// is a separate, admin-only screen (see auth.ts).
//
// This replaced a single shared row that every role wrote to, where the last
// person to save their photo replaced the one the whole clinic saw.

export type UserProfile = {
  /** Display name, composed by the server from the first and last name. */
  name: string;
  photo: string;
  firstName: string;
  lastName: string;
  middleName: string;
  empId: string;
  birthdate: string;
  email: string;
  address: string;
  contact: string;
  /** Read-only here — changing a login or a role is an admin action. */
  username: string;
  role: string;
};

export const EMPTY_PROFILE: UserProfile = {
  name: '', photo: '', firstName: '', lastName: '', middleName: '',
  empId: '', birthdate: '', email: '', address: '', contact: '',
  username: '', role: '',
};

function normalizeProfile(d: Record<string, unknown>): UserProfile {
  return {
    name: text(d.name), photo: text(d.photo),
    firstName: text(d.firstName), lastName: text(d.lastName), middleName: text(d.middleName),
    empId: text(d.empId), birthdate: text(d.birthdate), email: text(d.email),
    address: text(d.address), contact: text(d.contact),
    username: text(d.username), role: text(d.role),
  };
}

export async function getMyProfileApi(): Promise<UserProfile> {
  const res = await request('/me');
  return normalizeProfile(await res.json());
}

/**
 * Save changes to your own profile. `fullName` is accepted as a convenience —
 * Settings shows one name box, and the server splits it into the first/last
 * columns the accounts table keeps. Returns the saved profile.
 */
export async function saveMyProfileApi(
  changes: Partial<UserProfile> & { fullName?: string },
): Promise<UserProfile> {
  const res = await request('/me', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  });
  return normalizeProfile(await res.json());
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

// ── What this clinic usually gives ───────────────────────────────────────────
// Trained on the clinic's own protocol and dispensing history. Generalises past
// exact wording, and returns nothing when the complaint's words are unfamiliar
// — silence rather than a guess.

export type LearnedSuggestion = {
  itemCode: string;
  itemName: string;
  confidence: number;
  matchedWords: string[];
  examples: number;
  inStock: boolean;
  available: number;
  unit: string;
};

export async function learnedSuggestions(complaint: string): Promise<LearnedSuggestion[]> {
  if (!complaint.trim()) return [];
  try {
    const res = await apiFetch(`${API_URL}/suggest/learned?complaint=${encodeURIComponent(complaint)}`);
    if (!res.ok) return [];
    const d = await res.json();
    return Array.isArray(d.suggestions) ? d.suggestions : [];
  } catch {
    return [];
  }
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
