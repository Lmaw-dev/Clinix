import { useEffect, useRef } from 'react';
import { LogOut } from 'lucide-react';
import { useTheme } from '../ThemeContext';

// ── Logout confirmation ───────────────────────────────────────────────────────
// Follows the same shape as ConfirmDialog: icon badge and copy on the left, a
// ruled footer, and right-aligned secondary/primary buttons — so the two read as
// the same system rather than two unrelated prompts.

export function LogoutDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { isDark } = useTheme();
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Esc cancels. Enter is deliberately left to the browser so it activates
  // whichever button holds focus — Cancel starts focused, and a global
  // Enter-confirms handler would sign the user out from under a focus ring
  // that says "Cancel".
  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onCancel]);

  if (!open) return null;

  /* Theme surface tokens, resolved once and handed to the stylesheet below as
     custom properties so hover and focus states can live in real CSS. */
  const vars = {
    '--lg-card':        isDark ? '#161F49' : '#FFFFFF',
    '--lg-border':      isDark ? 'rgba(255,255,255,0.10)' : '#E4E9F6',
    '--lg-title':       isDark ? '#FFFFFF' : '#0B1437',
    '--lg-muted':       isDark ? '#A9B5E1' : '#5A6690',
    '--lg-rule':        isDark ? 'rgba(255,255,255,0.08)' : '#EEF1FA',
    '--lg-badge-bg':    isDark ? 'rgba(245,197,24,0.16)' : '#FCF3CE',
    '--lg-badge-fg':    isDark ? '#F5C518' : '#8A6D08',
    '--lg-ghost-bg':    isDark ? '#1B2A6E' : '#FFFFFF',
    '--lg-ghost-hov':   isDark ? '#233478' : '#F3F6FD',
    '--lg-ghost-bd':    isDark ? 'rgba(255,255,255,0.14)' : '#D9DFF0',
    '--lg-ghost-fg':    isDark ? '#E6EAF8' : '#33406E',
    '--lg-ring':        isDark ? '#F5C518' : '#1B2A6E',
  } as React.CSSProperties;

  return (
    <div
      className="lg-overlay fixed inset-0 flex items-center justify-center p-4"
      style={{ ...vars, zIndex: 2100 }}
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="clx-logout-title"
      aria-describedby="clx-logout-desc"
    >
      <style>{`
        @keyframes lgFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes lgRise {
          from { opacity: 0; transform: translateY(8px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }

        .lg-overlay {
          background: rgba(9,14,40,0.55);
          backdrop-filter: blur(3px);
          -webkit-backdrop-filter: blur(3px);
          animation: lgFade 0.16s ease-out both;
        }

        .lg-card {
          width: 100%;
          max-width: 396px;
          background: var(--lg-card);
          border: 1px solid var(--lg-border);
          border-radius: 16px;
          box-shadow: 0 20px 44px rgba(11,20,55,0.26), 0 3px 10px rgba(11,20,55,0.10);
          animation: lgRise 0.2s cubic-bezier(.16,.84,.44,1) both;
          overflow: hidden;
        }

        .lg-body { display: flex; gap: 14px; padding: 22px 22px 20px; }

        .lg-badge {
          display: flex; align-items: center; justify-content: center;
          width: 42px; height: 42px; flex-shrink: 0;
          border-radius: 50%;
          background: var(--lg-badge-bg);
          color: var(--lg-badge-fg);
        }

        .lg-title {
          font-size: 16px; font-weight: 700; line-height: 1.35;
          color: var(--lg-title); margin: 3px 0 0;
          letter-spacing: -0.01em;
        }
        .lg-desc {
          font-size: 13px; font-weight: 400; line-height: 1.55;
          color: var(--lg-muted); margin: 7px 0 0;
        }

        .lg-foot {
          display: flex; justify-content: flex-end; gap: 10px;
          padding: 14px 22px;
          border-top: 1px solid var(--lg-rule);
        }

        .lg-btn {
          min-width: 96px; height: 38px; padding: 0 18px;
          border-radius: 10px;
          font-size: 13.5px; font-weight: 600;
          cursor: pointer;
          display: inline-flex; align-items: center; justify-content: center; gap: 7px;
          transition: background-color 0.16s, border-color 0.16s, box-shadow 0.16s;
        }
        .lg-btn:focus-visible {
          outline: 2px solid var(--lg-ring);
          outline-offset: 2px;
        }

        .lg-ghost {
          background: var(--lg-ghost-bg);
          border: 1px solid var(--lg-ghost-bd);
          color: var(--lg-ghost-fg);
        }
        .lg-ghost:hover { background: var(--lg-ghost-hov); }

        .lg-primary {
          background: #1B2A6E;
          border: 1px solid #1B2A6E;
          color: #FFFFFF;
          box-shadow: 0 2px 8px rgba(27,42,110,0.28);
        }
        .lg-primary:hover { background: #25378C; border-color: #25378C; }
        .lg-primary:active { background: #17245E; }

        @media (max-width: 420px) {
          .lg-foot { flex-direction: column-reverse; }
          .lg-btn { width: 100%; }
        }

        @media (prefers-reduced-motion: reduce) {
          .lg-overlay, .lg-card { animation: none !important; }
        }
      `}</style>

      <div className="lg-card" onClick={(e) => e.stopPropagation()}>
        <div className="lg-body">
          <span className="lg-badge" aria-hidden="true">
            <LogOut size={19} />
          </span>

          <div style={{ minWidth: 0, flex: 1 }}>
            <p id="clx-logout-title" className="lg-title">Sign out of Clinix?</p>
            <p id="clx-logout-desc" className="lg-desc">
              Your session will end on this device. You&rsquo;ll need to sign in again to open
              clinic records.
            </p>
          </div>
        </div>

        <div className="lg-foot">
          <button ref={cancelRef} type="button" className="lg-btn lg-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="lg-btn lg-primary" onClick={onConfirm}>
            <LogOut size={15} />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
