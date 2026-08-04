import { useEffect, useRef } from 'react';
import { useTheme } from '../ThemeContext';

// ── Logout confirmation ───────────────────────────────────────────────────────
// Styled after the familiar social-app confirm sheet: a plain card, the question
// on its own line, and right-aligned secondary/primary buttons.

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

  // Esc cancels, Enter confirms — the same shortcuts the other dialogs use.
  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
      else if (e.key === 'Enter') { e.preventDefault(); onConfirm(); }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  const card      = isDark ? '#161F49' : '#FFFFFF';
  const txt       = isDark ? '#FFFFFF' : '#0B1437';
  const greyBg    = isDark ? '#1B2A6E' : '#EEF1FA';
  const greyHov   = isDark ? '#233478' : '#DEE3F5';

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{
        zIndex: 2100,
        background: 'rgba(9,14,40,0.5)',
        animation: 'clxLogoutFade 0.15s ease-out both',
      }}
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="clx-logout-title"
    >
      <style>{`
        @keyframes clxLogoutFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes clxLogoutPop {
          from { opacity: 0; transform: scale(0.94); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>

      <div
        className="w-full overflow-hidden"
        style={{
          maxWidth: 380,
          background: card,
          borderRadius: 12,
          boxShadow: '0 12px 28px rgba(11,20,55,0.22), 0 2px 4px rgba(11,20,55,0.12)',
          animation: 'clxLogoutPop 0.16s ease-out both',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <p
          id="clx-logout-title"
          style={{
            padding: '24px 20px 18px',
            fontSize: 17,
            fontWeight: 600,
            color: txt,
            lineHeight: 1.4,
            textAlign: 'center',
          }}
        >
          Are you sure you want to logout?
        </p>

        <div className="flex justify-end gap-2" style={{ padding: '0 16px 16px' }}>
          <button
            ref={cancelRef}
            onClick={onCancel}
            style={{
              minWidth: 78,
              padding: '8px 14px',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              color: txt,
              background: greyBg,
              transition: 'background-color 0.15s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = greyHov; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = greyBg; }}
          >
            No
          </button>
          <button
            onClick={onConfirm}
            style={{
              minWidth: 78,
              padding: '8px 14px',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              color: '#FFFFFF',
              background: '#2563EB',
              transition: 'background-color 0.15s',
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#1D4ED8'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = '#2563EB'; }}
          >
            Yes
          </button>
        </div>
      </div>
    </div>
  );
}
