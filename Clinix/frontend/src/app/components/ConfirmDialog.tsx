import { useState, useEffect, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';

// ── In-app confirmation dialog ────────────────────────────────────────────────
// Replaces the browser's native confirm() so prompts match the app's UI.
// Usage (inside an async function):
//   if (!(await confirmDialog({ title: 'Archive student?', message: '…' }))) return;
// Mount <ConfirmHost /> once near the app root.

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean; // red confirm button for destructive actions
};

type Pending = { opts: ConfirmOptions; resolve: (ok: boolean) => void };

let openDialog: ((opts: ConfirmOptions) => Promise<boolean>) | null = null;

/** Ask the user to confirm. Resolves true (confirmed) or false (cancelled). */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  // Fallback to the native dialog if the host isn't mounted for some reason.
  if (!openDialog) return Promise.resolve(window.confirm(opts.message || opts.title));
  return openDialog(opts);
}

export function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    openDialog = (opts) => new Promise<boolean>((resolve) => setPending({ opts, resolve }));
    return () => { openDialog = null; };
  }, []);

  // Focus the confirm button, and support Esc (cancel) / Enter (confirm).
  useEffect(() => {
    if (!pending) return;
    confirmRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); close(false); }
      else if (e.key === 'Enter') { e.preventDefault(); close(true); }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [pending]);

  function close(ok: boolean) {
    setPending((p) => { p?.resolve(ok); return null; });
  }

  if (!pending) return null;
  const { title, message, confirmLabel, cancelLabel, danger } = pending.opts;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 2000, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(2px)' }}
      onClick={() => close(false)}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-sm overflow-hidden rounded-2xl bg-white dark:bg-slate-800 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 px-5 pt-5">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            style={{ background: danger ? '#FEE2E2' : '#DBEAFE', color: danger ? '#DC2626' : '#2563EB' }}
          >
            <AlertTriangle size={19} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-slate-900 dark:text-slate-100" style={{ fontSize: 15, fontWeight: 700 }}>{title}</p>
            {message && (
              <p className="mt-1 text-slate-500 dark:text-slate-400" style={{ fontSize: 13, lineHeight: 1.5 }}>{message}</p>
            )}
          </div>
          <button
            onClick={() => close(false)}
            className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4">
          <button
            onClick={() => close(false)}
            className="rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-2 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
            style={{ fontSize: 13, fontWeight: 500 }}
          >
            {cancelLabel || 'Cancel'}
          </button>
          <button
            ref={confirmRef}
            onClick={() => close(true)}
            className="rounded-lg px-4 py-2 text-white transition-colors"
            style={{ fontSize: 13, fontWeight: 600, background: danger ? '#DC2626' : '#2563EB' }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = danger ? '#B91C1C' : '#1D4ED8'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = danger ? '#DC2626' : '#2563EB'; }}
          >
            {confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
