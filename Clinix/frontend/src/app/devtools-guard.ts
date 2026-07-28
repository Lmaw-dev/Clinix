// ── Browser dev-tools deterrent ────────────────────────────────────────────────
// Blocks the common shortcuts that open the browser's developer tools / view-source
// and the right-click menu. This is a DETERRENT for casual users, not real security
// — a determined user can still bypass it (disable JS, use a proxy, call the API
// directly). Actual protection lives in the backend (AES encryption, auth,
// validation). Developer escape hatch: open the app with "?dev" in the URL.

export function installDevtoolsGuard() {
  try {
    if (new URLSearchParams(window.location.search).has('dev')) return; // dev mode: keep F12
  } catch { /* ignore */ }

  const blockedWithCtrlShift = new Set(['I', 'J', 'C']); // Inspect, Console, Element-picker
  const blockedWithCtrl = new Set(['U', 'S']);           // View-source, Save-page

  window.addEventListener('keydown', (e) => {
    const key = (e.key || '').toUpperCase();
    const ctrlish = e.ctrlKey || e.metaKey; // Ctrl (Win/Linux) or Cmd (Mac)
    const isBlocked =
      key === 'F12' ||
      (ctrlish && e.shiftKey && blockedWithCtrlShift.has(key)) ||
      (e.metaKey && e.altKey && blockedWithCtrlShift.has(key)) || // Mac inspect: Cmd+Opt+I/J/C
      (ctrlish && !e.shiftKey && blockedWithCtrl.has(key));

    if (isBlocked) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }, true);

  // Disable the right-click context menu (its "Inspect" entry opens dev tools).
  window.addEventListener('contextmenu', (e) => { e.preventDefault(); }, true);

  // A visible warning for anyone who still gets the console open (self-XSS deterrent).
  try {
    const warn = 'background:#DC2626;color:#fff;font-size:18px;font-weight:700;padding:4px 10px;border-radius:4px';
    // eslint-disable-next-line no-console
    console.log('%cStop!', warn);
    // eslint-disable-next-line no-console
    console.log('%cThis is a browser feature for developers. Do not paste or run anything here — it may compromise clinic data (Clinix security).', 'font-size:13px;color:#334155');
  } catch { /* ignore */ }
}
