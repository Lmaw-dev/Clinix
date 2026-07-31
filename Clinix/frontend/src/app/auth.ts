import type { Page } from './App';

// ─── Roles & Accounts ──────────────────────────────────────────────────────

export type Role = 'admin' | 'assistant' | 'staff';

// An account. Every field except role/id is AES-encrypted in the database; the
// backend returns them decrypted (passwords are never returned).
export type Account = {
  id?: string;
  role: Role;
  empId?: string;
  username: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  birthdate?: string;
  email?: string;
  address?: string;
  contact?: string;
};

const API_URL = (import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:4001/api`).replace(/\/$/, '');

// Offline fallback so the demo can still log in if the backend is unreachable.
const FALLBACK_ACCOUNTS: Array<{ username: string; password: string; role: Role }> = [
  { username: 'admin', password: 'clinix2024', role: 'admin' },
  { username: 'assistant', password: 'assist2024', role: 'assistant' },
  { username: 'staff', password: 'staff123', role: 'staff' },
];

export type LoginResult = { role: Role; username: string; name: string };

/** Thrown when the backend refuses the attempt outright (e.g. too many tries). */
export class LoginBlockedError extends Error {}

/** Authenticate via the backend — the password is checked against its bcrypt hash. */
export async function apiLogin(username: string, password: string): Promise<LoginResult | null> {
  try {
    const res = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.trim(), password }),
    });
    if (res.ok) { const d = await res.json(); return { role: d.role, username: d.username, name: d.name }; }
    if (res.status === 401 || res.status === 400) return null; // reached backend, wrong creds
    // Rate limited. This must NOT fall through to the offline fallback below —
    // doing so would let anyone bypass the brute-force limit by tripping it.
    if (res.status === 429) {
      const d = await res.json().catch(() => ({} as { error?: string }));
      throw new LoginBlockedError(d.error || 'Too many sign-in attempts. Please wait a few minutes.');
    }
    throw new Error('login failed');
  } catch (err) {
    if (err instanceof LoginBlockedError) throw err;
    // Backend unreachable — allow the built-in defaults so the app isn't locked out.
    const a = FALLBACK_ACCOUNTS.find((x) => x.username.toLowerCase() === username.trim().toLowerCase() && x.password === password);
    return a ? { role: a.role, username: a.username, name: a.username } : null;
  }
}

export async function listAccountsApi(): Promise<Account[]> {
  const res = await fetch(`${API_URL}/accounts`);
  if (!res.ok) throw new Error('Failed to load accounts');
  return res.json();
}

export async function createAccountApi(data: Partial<Account>): Promise<void> {
  const res = await fetch(`${API_URL}/accounts`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Create failed'); }
}

export async function updateAccountApi(id: string, data: Partial<Account>): Promise<void> {
  const res = await fetch(`${API_URL}/accounts/${id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Update failed');
}

/** The username of the signed-in user (from the session). */
export function currentUsername(): string {
  try { return localStorage.getItem('clinixUser') || ''; } catch { return ''; }
}

/** Change your own password. Throws with a readable message on failure. */
export async function changePasswordApi(username: string, currentPassword: string, newPassword: string): Promise<void> {
  const res = await fetch(`${API_URL}/change-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, currentPassword, newPassword }),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e.error || 'Could not change the password');
  }
}

export async function deleteAccountApi(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/accounts/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) throw new Error('Delete failed');
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrator',
  assistant: 'Assistant Administrator',
  staff: 'Staff',
};

export const ROLE_DEFAULT_NAMES: Record<Role, string> = {
  admin: 'Clinic Admin',
  assistant: 'Assistant Admin',
  staff: 'Clinic Staff',
};

// ─── Page access ───────────────────────────────────────────────────────────

const ALL_PAGES: Page[] = [
  'dashboard',
  'students',
  'faculty',
  'medical-records',
  'inventory',
  'certificates',
  'consultations',
  'reports',
  'settings',
];

export const ROLE_PAGES: Record<Role, Page[]> = {
  // Admin manages accounts + the consultation logs.
  admin: [...ALL_PAGES, 'accounts'],
  // Assistant evaluates/inputs the consultation logs (no accounts).
  assistant: ALL_PAGES,
  // Staff takes the consultation record (intake / vital signs) + dashboard + reports.
  // Settings is included so they can change their own password; admin-only
  // sections inside Settings are gated separately.
  staff: ['dashboard', 'consultation-record', 'reports', 'settings'],
};

export function canAccess(role: Role, page: Page): boolean {
  return ROLE_PAGES[role].includes(page);
}

// ─── Fine-grained permissions ──────────────────────────────────────────────
// Confidential info that only the main admin can see. Gate any sensitive
// UI with canViewConfidential(role) — the assistant account will fail this
// check. Specific restricted features to be listed here as they're defined.

export function canViewConfidential(role: Role): boolean {
  return role === 'admin';
}

/** The role of the currently signed-in user (read from the session). */
export function currentRole(): Role {
  try {
    const stored = localStorage.getItem('clinixRole');
    return isValidRole(stored) ? stored : 'admin';
  } catch { return 'admin'; }
}

/** Convenience: is the current user allowed to see confidential info (admin only)? */
export function canSeeConfidential(): boolean {
  return canViewConfidential(currentRole());
}

export function isValidRole(value: unknown): value is Role {
  return value === 'admin' || value === 'assistant' || value === 'staff';
}
