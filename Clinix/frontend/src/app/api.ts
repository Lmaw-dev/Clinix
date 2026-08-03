// ── The one place API requests are made ──────────────────────────────────────
// Every call to the backend goes through apiFetch so the session token is
// attached in exactly one place. Twenty-odd call sites each remembering to add
// an Authorization header is twenty-odd chances to forget, and a forgotten one
// fails as a 401 at runtime rather than at build time.

export const API_URL = (
  import.meta.env.VITE_API_URL ||
  `${window.location.protocol}//${window.location.hostname}:4001/api`
).replace(/\/$/, '');

const TOKEN_KEY = 'clinixToken';

export function getToken(): string {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}

export function setToken(token: string): void {
  try { localStorage.setItem(TOKEN_KEY, token); } catch { /* private mode — session lasts this tab */ }
}

export function clearToken(): void {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

/**
 * Called when the server rejects our token. The app registers a handler that
 * returns the user to the sign-in screen, so an expired session surfaces as
 * "please sign in again" rather than as every panel silently going blank.
 */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn;
}

/** fetch() against the API, with the session token attached. */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(input, { ...init, headers });

  // 401 means the token is gone or expired — not that this one call failed.
  // Clear it and let the app send the user back to sign in.
  if (res.status === 401) {
    clearToken();
    onUnauthorized?.();
  }
  return res;
}
