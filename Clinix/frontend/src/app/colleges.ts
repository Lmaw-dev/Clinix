import { useSyncExternalStore } from 'react';
import { API_URL, apiFetch } from './api';

// ── Shared source of truth for colleges & their courses ────────────────────────
// Any component can read the current list with useColleges() (re-renders on change)
// or getColleges() (one-off read). Admins add/remove entries from Settings, and the
// changes flow to the Student & Faculty forms/filters automatically.
//
// This list used to live in localStorage, which made it a per-browser opinion
// about what the clinic offers — while students.course_code carries a foreign
// key into the `courses` table. A course added in Settings therefore existed
// nowhere the save could see it: picking it in Add Student failed on the
// constraint, and a second computer never saw the course at all. The database
// owns the list now; localStorage stays only as a cache, so a reload with the
// backend down still renders dropdowns instead of blank ones.

export type College = { name: string; courses: string[] };

export const YEAR_OPTIONS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];

// ── How a staff member is employed ──────────────────────────────────────────
// The clinic's own classification: a category, and the employment types valid
// within it. This lived privately inside the Faculty screen, which meant the
// Reports department filter had no way to offer the same list and had to guess
// it from whatever categories happened to be present in the data — so the
// option group vanished entirely while no staff member had been classified yet.
// One list, used by the form that writes it and every screen that reads it.

export const EMPLOYMENT_CLASSIFICATIONS: { category: string; types: string[] }[] = [
  { category: 'Non-teaching', types: ['Permanent', 'Casual', 'Contract of Service'] },
  { category: 'Teaching', types: ['Permanent', 'Temporary', 'Contract of Service', 'Part time'] },
  { category: 'Agency', types: ['Security guard'] },
];

/** Just the category names, in the order the clinic lists them. */
export const EMPLOYMENT_CATEGORIES = EMPLOYMENT_CLASSIFICATIONS.map((c) => c.category);

export function employmentTypesFor(category: string): string[] {
  return EMPLOYMENT_CLASSIFICATIONS.find((c) => c.category === category)?.types ?? [];
}

/**
 * The offices/departments currently in use across a roster.
 *
 * A college covers teaching faculty, but a registrar, a guidance counsellor or
 * an accounting clerk belongs to an office instead — that office *is* their
 * department. It was a free-text box, so "Registrar", "Registrar's Office" and
 * "registrar" were three different departments as far as any filter could tell,
 * and none of them could be offered as a choice.
 *
 * Rather than a separate list somebody has to maintain, the vocabulary is the
 * set already on the records: matched case-insensitively so the same office
 * cannot appear twice, keeping the spelling it was first entered with.
 */
export function officesInUse(people: { office?: string }[]): string[] {
  const seen = new Map<string, string>();
  people.forEach((p) => {
    const name = (p.office || '').trim();
    if (name && !seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
  });
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
}

/** Reuse the existing spelling of an office when one already matches. */
export function normalizeOffice(name: string, known: string[]): string {
  const raw = (name || '').trim();
  if (!raw) return '';
  return known.find((o) => o.toLowerCase() === raw.toLowerCase()) || raw;
}

const CACHE_KEY = 'clinixColleges';
const YEARS_CACHE_KEY = 'clinixCourseYears';

/** How many years a program runs when nobody has said otherwise. */
export const DEFAULT_COURSE_YEARS = 4;

/** What the API returns: codes and display names, courses nested per college. */
type ApiCollege = { code: string; name: string; courses: { code: string; name: string; years: number }[] };

function cachedColleges(): College[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((c: unknown): c is College => !!c && typeof (c as College).name === 'string')
      .map((c: College) => ({
        name: c.name,
        courses: Array.isArray(c.courses) ? c.courses.filter((x): x is string => typeof x === 'string') : [],
      }));
  } catch {
    return [];
  }
}

// ── Program length ──────────────────────────────────────────────────────────
// Year-end processing needs to know when a student has reached the *end* of
// their program, and that is not the same year level for everyone: a 2-year
// course graduates at 2nd Year, a 4-year one at 4th. Flattened out of the API's
// nested shape into a course → years map so nothing that already reads the
// plain string list has to change.

function cachedYears(): Record<string, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(YEARS_CACHE_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [course, years] of Object.entries(parsed)) {
      const n = Number(years);
      if (Number.isFinite(n) && n >= 1 && n <= YEAR_OPTIONS.length) out[course] = Math.round(n);
    }
    return out;
  } catch {
    return {};
  }
}

// Reassigned (new reference) on every change so useSyncExternalStore detects it.
let colleges: College[] = cachedColleges();
let courseYears: Record<string, number> = cachedYears();
const listeners = new Set<() => void>();

/** Adopt a server response as the new truth, and cache it for the next reload. */
function apply(rows: ApiCollege[]) {
  colleges = rows.map((c) => ({ name: c.code, courses: c.courses.map((k) => k.code) }));
  courseYears = {};
  rows.forEach((c) => c.courses.forEach((k) => {
    const n = Number(k.years);
    if (Number.isFinite(n) && n >= 1 && n <= YEAR_OPTIONS.length) courseYears[k.code] = Math.round(n);
  }));
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(colleges)); } catch { /* ignore quota errors */ }
  try { localStorage.setItem(YEARS_CACHE_KEY, JSON.stringify(courseYears)); } catch { /* ignore quota errors */ }
  listeners.forEach((fn) => fn());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/**
 * One request against the academics API, applying whatever comes back.
 *
 * Every mutating endpoint returns the full list, so a successful write leaves
 * every open dropdown correct without a second round trip — and, more usefully,
 * without the local copy drifting from the database when two admins are working
 * at once.
 */
async function call(path: string, init?: RequestInit): Promise<Result> {
  try {
    const res = await apiFetch(`${API_URL}/academics${path}`, init);
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, error: (body as { error?: string } | null)?.error || `Request failed (${res.status})` };
    }
    if (Array.isArray(body)) apply(body as ApiCollege[]);
    return { ok: true };
  } catch {
    return { ok: false, error: 'Cannot reach the server — nothing was changed.' };
  }
}

/** Pull the list from the database. Called once the user is signed in. */
export async function loadColleges(): Promise<void> {
  const res = await call('');
  if (!res.ok) throw new Error(res.error || 'Could not load colleges');
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

// ── Reads ───────────────────────────────────────────────────────────────────────

/** One-off, non-reactive read of the current list. */
export function getColleges(): College[] {
  return colleges;
}

/** Reactive read — components re-render when the list changes. */
export function useColleges(): College[] {
  return useSyncExternalStore(subscribe, getColleges, getColleges);
}

/** How many years the given course runs. */
export function courseYearsFor(course: string): number {
  return courseYears[(course || '').trim()] ?? DEFAULT_COURSE_YEARS;
}

/** The whole course → years map, for sending to year-end processing. */
export function getCourseYears(): Record<string, number> {
  return courseYears;
}

export function useCourseYears(): Record<string, number> {
  return useSyncExternalStore(subscribe, getCourseYears, getCourseYears);
}

/** Set a program's length. */
export async function setCourseYears(course: string, years: number): Promise<Result> {
  const key = (course || '').trim();
  if (!key) return { ok: false, error: 'No course given' };
  const n = Math.round(Number(years));
  if (!Number.isFinite(n) || n < 1 || n > YEAR_OPTIONS.length) {
    return { ok: false, error: `Program length must be between 1 and ${YEAR_OPTIONS.length} years` };
  }
  return call(`/courses/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ years: n }),
  });
}

/** Normalize a stored/imported college name to its canonical casing, if known. */
export function normalizeCollegeName(name?: string): string {
  const raw = (name || '').trim();
  if (!raw) return '';
  return colleges.find((c) => c.name.toLowerCase() === raw.toLowerCase())?.name || raw;
}

// ── Mutations (return { ok, error } so the UI can show a message) ────────────────

type Result = { ok: boolean; error?: string };

export async function addCollege(name: string): Promise<Result> {
  const n = name.trim();
  if (!n) return { ok: false, error: 'Enter a college name' };
  return call('/colleges', json({ code: n, name: n }));
}

export async function removeCollege(name: string): Promise<Result> {
  return call(`/colleges/${encodeURIComponent(name)}`, { method: 'DELETE' });
}

export async function addCourse(collegeName: string, course: string): Promise<Result> {
  const c = course.trim();
  if (!c) return { ok: false, error: 'Enter a course name' };
  return call('/courses', json({ collegeCode: collegeName, code: c, name: c }));
}

export async function removeCourse(_collegeName: string, course: string): Promise<Result> {
  // A course code is unique across every college, so the college is not needed
  // to identify it — the parameter stays for the call sites that read naturally
  // with it.
  return call(`/courses/${encodeURIComponent(course)}`, { method: 'DELETE' });
}

/** Restore the built-in default colleges/courses. */
export async function resetColleges(): Promise<Result> {
  return call('/reset', { method: 'POST' });
}
