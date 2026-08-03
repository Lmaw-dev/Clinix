import type { Page } from './App';
import { API_URL, apiFetch, setToken, clearToken } from './api';

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


// There is deliberately no offline fallback account list here. One used to
// exist so the app could still be opened with the backend down, but the
// passwords shipped inside the JavaScript bundle — readable by anyone who
// opened the browser's developer tools, on a system holding medical records.
// Signing in requires the server, which is also the only thing that can issue
// a session token.

export type LoginResult = { role: Role; username: string; name: string };

/** Thrown when the backend refuses the attempt outright (e.g. too many tries). */
export class LoginBlockedError extends Error {}

/**
 * Authenticate via the backend. The password is checked against its bcrypt
 * hash, and a successful sign-in returns a session token — that token, not this
 * screen, is what actually grants access to any record.
 */
export async function apiLogin(username: string, password: string): Promise<LoginResult | null> {
  let res: Response;
  try {
    res = await apiFetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username.trim(), password }),
    });
  } catch {
    // The server is the only thing that can verify a password and mint a token,
    // so being unable to reach it is a hard failure, not a reason to let someone in.
    throw new LoginBlockedError('Cannot reach the Clinix server. Check that it is running.');
  }

  if (res.ok) {
    const d = await res.json();
    setToken(d.token);
    return { role: d.role, username: d.username, name: d.name };
  }
  if (res.status === 401 || res.status === 400) return null; // reached backend, wrong credentials
  if (res.status === 429) {
    const d = await res.json().catch(() => ({} as { error?: string }));
    throw new LoginBlockedError(d.error || 'Too many sign-in attempts. Please wait a few minutes.');
  }
  throw new LoginBlockedError('Sign-in failed. Please try again.');
}

/** End the session on the server as well as in this browser. */
export async function apiLogout(): Promise<void> {
  try {
    await apiFetch(`${API_URL}/logout`, { method: 'POST' });
  } catch {
    // Even if the server cannot be reached, drop the local token.
  }
  clearToken();
}

export async function listAccountsApi(): Promise<Account[]> {
  const res = await apiFetch(`${API_URL}/accounts`);
  if (!res.ok) throw new Error('Failed to load accounts');
  return res.json();
}

export async function createAccountApi(data: Partial<Account>): Promise<void> {
  const res = await apiFetch(`${API_URL}/accounts`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Create failed'); }
}

export async function updateAccountApi(id: string, data: Partial<Account>): Promise<void> {
  const res = await apiFetch(`${API_URL}/accounts/${id}`, {
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
  const res = await apiFetch(`${API_URL}/change-password`, {
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
  const res = await apiFetch(`${API_URL}/accounts/${id}`, { method: 'DELETE' });
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
  // Staff reaches consultations through the same log as everyone else, but can
  // only record vital signs on it — see canManageConsultationLog below.
  // Settings is included so they can change their own password; admin-only
  // sections inside Settings are gated separately.
  staff: ['dashboard', 'consultations', 'reports', 'settings'],
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

// ─── Consultation workflow ─────────────────────────────────────────────────
// Everyone works from the one Consultation Log, but not with the same powers.
// The nurse (admin) and the assistant own the log itself: they add entries,
// set the purpose of visit, and evaluate/confirm. Staff only assist — they take
// the assessment and vital signs of whoever is being checked up, and cannot
// create, edit or delete a log entry.

/** Add / edit / delete log entries and evaluate or confirm them. */
export function canManageConsultationLog(role: Role): boolean {
  return role === 'admin' || role === 'assistant';
}

/** Record the assessment and vital signs on a consultation. */
export function canRecordVitals(role: Role): boolean {
  return role === 'admin' || role === 'assistant' || role === 'staff';
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
