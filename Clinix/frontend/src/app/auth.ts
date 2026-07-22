import type { Page } from './App';

// ─── Roles & Accounts ──────────────────────────────────────────────────────

export type Role = 'admin' | 'assistant' | 'staff';

export type Account = { username: string; password: string; role: Role };

// Built-in seed accounts. The live list is stored in localStorage and managed
// by the admin in the Accounts page (see load/save/find helpers below).
export const ACCOUNTS: Account[] = [
  { username: 'admin', password: 'clinix2024', role: 'admin' },
  { username: 'assistant', password: 'assist2024', role: 'assistant' },
  { username: 'staff', password: 'staff123', role: 'staff' },
];

const ACCOUNTS_KEY = 'clinixAccounts';

export function loadAccounts(): Account[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.filter((a) => a && a.username && a.password && isValidRole(a.role));
      }
    }
  } catch { /* fall through to defaults */ }
  return ACCOUNTS.map((a) => ({ ...a }));
}

export function saveAccounts(list: Account[]) {
  try { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list)); } catch { /* ignore quota */ }
}

export function findAccount(username: string, password: string): Account | undefined {
  return loadAccounts().find(
    (a) => a.username.toLowerCase() === username.trim().toLowerCase() && a.password === password,
  );
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
  // Admin also manages user accounts (main-admin only).
  admin: [...ALL_PAGES, 'accounts'],
  // Same access as admin; confidential features (Accounts) are NOT included.
  assistant: ALL_PAGES,
  // Staff monitors consultation logs + dashboard + reports only.
  staff: ['dashboard', 'consultations', 'reports'],
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

export function isValidRole(value: unknown): value is Role {
  return value === 'admin' || value === 'assistant' || value === 'staff';
}
