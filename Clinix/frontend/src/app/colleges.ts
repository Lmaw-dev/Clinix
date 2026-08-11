import { useSyncExternalStore } from 'react';

// ── Shared, persisted source of truth for colleges & their courses ──────────────
// Any component can read the current list with useColleges() (re-renders on change)
// or getColleges() (one-off read). Admins add/remove entries from Settings, and the
// changes flow to the Student & Faculty forms/filters automatically. Persisted in
// localStorage so additions survive reloads.

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

const STORAGE_KEY = 'clinixColleges';
const YEARS_KEY = 'clinixCourseYears';

/** How many years a program runs when nobody has said otherwise. */
export const DEFAULT_COURSE_YEARS = 4;

const DEFAULT_COLLEGES: College[] = [
  { name: 'CTECH', courses: ['BSCS', 'BSIT-FPST', 'BSIT-ELECT'] },
  { name: 'CTE', courses: ['BEED', 'BSED-ENGLISH', 'BSED-MATH'] },
  { name: 'COM', courses: ['BSM'] },
  { name: 'COF', courses: ['BSF'] },
];

function clone(list: College[]): College[] {
  return list.map((c) => ({ name: c.name, courses: [...c.courses] }));
}

function load(): College[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return clone(DEFAULT_COLLEGES);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return clone(DEFAULT_COLLEGES);
    const cleaned = parsed
      .filter((c: unknown): c is College => !!c && typeof (c as College).name === 'string')
      .map((c: College) => ({
        name: c.name,
        courses: Array.isArray(c.courses) ? c.courses.filter((x): x is string => typeof x === 'string') : [],
      }));
    return cleaned.length ? cleaned : clone(DEFAULT_COLLEGES);
  } catch {
    return clone(DEFAULT_COLLEGES);
  }
}

// ── Program length ──────────────────────────────────────────────────────────
// Year-end processing needs to know when a student has reached the *end* of
// their program, and that is not the same year level for everyone: a 2-year
// course graduates at 2nd Year, a 4-year one at 4th. Kept as a course → years
// map rather than a field on College.courses so nothing that already reads the
// plain string list has to change.

function loadYears(): Record<string, number> {
  try {
    const raw = localStorage.getItem(YEARS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
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

// Reassigned (new reference) on every mutation so useSyncExternalStore detects change.
let colleges: College[] = load();
let courseYears: Record<string, number> = loadYears();
const listeners = new Set<() => void>();

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(colleges)); } catch { /* ignore quota errors */ }
  try { localStorage.setItem(YEARS_KEY, JSON.stringify(courseYears)); } catch { /* ignore quota errors */ }
  listeners.forEach((fn) => fn());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

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

/** Set a program's length. Passing the default removes the override. */
export function setCourseYears(course: string, years: number): Result {
  const key = (course || '').trim();
  if (!key) return { ok: false, error: 'No course given' };
  const n = Math.round(Number(years));
  if (!Number.isFinite(n) || n < 1 || n > YEAR_OPTIONS.length) {
    return { ok: false, error: `Program length must be between 1 and ${YEAR_OPTIONS.length} years` };
  }
  const next = { ...courseYears };
  if (n === DEFAULT_COURSE_YEARS) delete next[key]; else next[key] = n;
  courseYears = next;
  persist();
  return { ok: true };
}

/** Normalize a stored/imported college name to its canonical casing, if known. */
export function normalizeCollegeName(name?: string): string {
  const raw = (name || '').trim();
  if (!raw) return '';
  return colleges.find((c) => c.name.toLowerCase() === raw.toLowerCase())?.name || raw;
}

// ── Mutations (return { ok, error } so the UI can show a message) ────────────────

type Result = { ok: boolean; error?: string };

export function addCollege(name: string): Result {
  const n = name.trim();
  if (!n) return { ok: false, error: 'Enter a college name' };
  if (colleges.some((c) => c.name.toLowerCase() === n.toLowerCase())) {
    return { ok: false, error: `"${n}" already exists` };
  }
  colleges = [...colleges, { name: n, courses: [] }];
  persist();
  return { ok: true };
}

export function removeCollege(name: string): Result {
  if (!colleges.some((c) => c.name === name)) return { ok: false, error: 'College not found' };
  colleges = colleges.filter((c) => c.name !== name);
  persist();
  return { ok: true };
}

export function addCourse(collegeName: string, course: string): Result {
  const c = course.trim();
  if (!c) return { ok: false, error: 'Enter a course name' };
  const college = colleges.find((x) => x.name === collegeName);
  if (!college) return { ok: false, error: 'College not found' };
  if (college.courses.some((x) => x.toLowerCase() === c.toLowerCase())) {
    return { ok: false, error: `"${c}" already exists in ${collegeName}` };
  }
  colleges = colleges.map((x) =>
    x.name === collegeName ? { ...x, courses: [...x.courses, c] } : x,
  );
  persist();
  return { ok: true };
}

export function removeCourse(collegeName: string, course: string): Result {
  const college = colleges.find((x) => x.name === collegeName);
  if (!college || !college.courses.includes(course)) return { ok: false, error: 'Course not found' };
  colleges = colleges.map((x) =>
    x.name === collegeName ? { ...x, courses: x.courses.filter((cc) => cc !== course) } : x,
  );
  const { [course]: _removed, ...rest } = courseYears;
  courseYears = rest;
  persist();
  return { ok: true };
}

/** Restore the built-in default colleges/courses. */
export function resetColleges(): Result {
  colleges = clone(DEFAULT_COLLEGES);
  courseYears = {};
  persist();
  return { ok: true };
}
