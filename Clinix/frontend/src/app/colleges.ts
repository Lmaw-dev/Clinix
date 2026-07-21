import { useSyncExternalStore } from 'react';

// ── Shared, persisted source of truth for colleges & their courses ──────────────
// Any component can read the current list with useColleges() (re-renders on change)
// or getColleges() (one-off read). Admins add/remove entries from Settings, and the
// changes flow to the Student & Faculty forms/filters automatically. Persisted in
// localStorage so additions survive reloads.

export type College = { name: string; courses: string[] };

export const YEAR_OPTIONS = ['1st Year', '2nd Year', '3rd Year', '4th Year'];

const STORAGE_KEY = 'clinixColleges';

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

// Reassigned (new reference) on every mutation so useSyncExternalStore detects change.
let colleges: College[] = load();
const listeners = new Set<() => void>();

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(colleges)); } catch { /* ignore quota errors */ }
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
  persist();
  return { ok: true };
}

/** Restore the built-in default colleges/courses. */
export function resetColleges(): Result {
  colleges = clone(DEFAULT_COLLEGES);
  persist();
  return { ok: true };
}
