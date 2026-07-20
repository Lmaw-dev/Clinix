import type { Page } from './App';

// ─── Roles & Accounts ──────────────────────────────────────────────────────

export type Role = 'admin' | 'assistant' | 'staff';

export const ACCOUNTS: Array<{ username: string; password: string; role: Role }> = [
  { username: 'admin', password: 'clinix2024', role: 'admin' },
  { username: 'assistant', password: 'assist2024', role: 'assistant' },
  { username: 'staff', password: 'staff123', role: 'staff' },
];

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
  admin: ALL_PAGES,
  // Same access as admin; confidential features are gated per-feature below.
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
