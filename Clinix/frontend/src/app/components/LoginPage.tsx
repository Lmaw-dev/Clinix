import { useState } from 'react';
import { Eye, EyeOff, AlertCircle, User, Lock } from 'lucide-react';
import { apiLogin, Role } from '../auth';
import CAMPUS_PHOTO from '../../assets/campus-gate.png';

type Props = { onLogin: (role: Role, username: string) => void };

const SERIF = "'Playfair Display', Georgia, 'Times New Roman', serif";
const PAGE  = '#1B2A6E'; // brand deep blue (blue-900)
const INK   = '#FFFFFF'; // white primary text on blue
const MUTED = '#C6CEEC'; // blue-200
const LABEL = '#DEE3F5'; // blue-100
const LINE  = 'rgba(169,181,225,0.35)'; // blue-300 border
const INPUT_BG = '#273685'; // blue-800 input fill
const BLUE  = '#4C5CAE'; // blue-600
const YELLOW = '#F5C518'; // brand yellow (yellow-400)
const YELLOW_DK = '#E3B10D'; // yellow-500
const LINK  = '#F5C518'; // yellow (readable on blue)

export function LoginPage({ onLogin }: Props) {
  const [username, setUsername]         = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember]         = useState(false);
  const [error, setError]               = useState('');
  const [loading, setLoading]           = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    let account: Awaited<ReturnType<typeof apiLogin>>;
    try {
      account = await apiLogin(username, password);
    } catch (err) {
      // Blocked by the server's brute-force limit — show why, don't retry.
      setError(err instanceof Error ? err.message : 'Could not sign in.');
      setLoading(false);
      return;
    }
    if (account) {
      try {
        localStorage.setItem('clinixSession', 'active');
        localStorage.setItem('clinixRole', account.role);
        localStorage.setItem('clinixUser', account.username);
      } catch {}
      onLogin(account.role, account.username);
    } else {
      setError('Incorrect username or password.');
      setLoading(false);
    }
  }

  const disabled = loading || !username || !password;

  const inputBox: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10,
    background: INPUT_BG,
    border: `1px solid ${LINE}`,
    borderRadius: 10, padding: '12px 14px',
    transition: 'border-color 0.18s, box-shadow 0.18s',
  };
  const inputEl: React.CSSProperties = {
    flex: 1, background: 'none', border: 'none', outline: 'none',
    fontSize: 14, color: INK, minWidth: 0,
  };
  function focusBox(el: HTMLElement) {
    el.style.borderColor = YELLOW;
    el.style.boxShadow   = '0 0 0 3px rgba(245,197,24,0.25)';
  }
  function blurBox(el: HTMLElement) {
    el.style.borderColor = LINE;
    el.style.boxShadow   = 'none';
  }

  return (
    <div className="flex h-screen w-full overflow-hidden" style={{ background: PAGE }}>

      {/* ══════════════ LEFT — IMAGE (full-bleed, no card) ══════════════ */}
      <div className="hidden lg:block relative" style={{ width: '56%', overflow: 'hidden' }}>
        <img src={CAMPUS_PHOTO} alt="Bohol Island State University — Calape Campus"
          className="clx-photo"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />

        {/* top & bottom scrims — keep brand/caption legible without a card */}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(27,42,110,0.42) 0%, transparent 22%, transparent 62%, rgba(27,42,110,0.55) 100%)', pointerEvents: 'none' }} />

        {/* SMOOTH BLEND — right edge dissolves into the navy form background */}
        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(90deg, transparent 0%, transparent 42%, rgba(27,42,110,0.35) 66%, rgba(27,42,110,0.85) 88%, ${PAGE} 100%)`, pointerEvents: 'none' }} />

        {/* Brand — top-left over image */}
        <div className="clx-in" style={{ position: 'absolute', top: 34, left: 40, zIndex: 2, animationDelay: '0.05s' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: SERIF, fontSize: 20, fontWeight: 700, color: '#FFFFFF', letterSpacing: '-0.01em', textShadow: '0 2px 10px rgba(0,0,0,0.4)' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: YELLOW, display: 'inline-block' }} />
            Clinix
          </span>
        </div>

        {/* Caption — bottom-left over image */}
        <div style={{ position: 'absolute', left: 40, right: 120, bottom: 34, zIndex: 2 }}>
          <p style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 600, color: '#EEF1FA', lineHeight: 1.15, letterSpacing: '-0.01em', textShadow: '0 2px 12px rgba(0,0,0,0.45)' }}>
            Bohol Island State University
          </p>
          <p style={{ fontSize: 13, color: 'rgba(248,250,252,0.90)', marginTop: 5, fontWeight: 500, textShadow: '0 1px 8px rgba(0,0,0,0.5)' }}>
            Calape Campus · Clinic Management System
          </p>
        </div>
      </div>

      {/* ══════════════ RIGHT — FORM ══════════════ */}
      <div className="flex-1 flex flex-col justify-center" style={{ padding: '40px 48px', minWidth: 0 }}>
        <div className="clx-in w-full mx-auto" style={{ maxWidth: 380, animationDelay: '0.12s' }}>

          {/* mobile brand */}
          <div className="lg:hidden" style={{ marginBottom: 28 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: SERIF, fontSize: 20, fontWeight: 700, color: INK, letterSpacing: '-0.01em' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: YELLOW, display: 'inline-block' }} />
              Clinix
            </span>
          </div>

          {/* Heading */}
          <h1 style={{ fontFamily: SERIF, fontSize: 40, fontWeight: 700, color: INK, lineHeight: 1.05, letterSpacing: '-0.02em', marginBottom: 10 }}>
            Welcome back!
          </h1>
          <p style={{ fontSize: 14.5, color: MUTED, marginBottom: 30, lineHeight: 1.5 }}>
            Sign in to continue caring for the campus.
          </p>

          {/* Error */}
          {error && (
            <div className="clx-error flex items-center gap-2.5 rounded-lg px-4 py-3 mb-5"
              style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)' }}>
              <AlertCircle size={15} style={{ color: '#F87171', flexShrink: 0 }} />
              <p style={{ fontSize: 13, color: '#FCA5A5', fontWeight: 500 }}>{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit}>

            {/* Username */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 13.5, fontWeight: 600, color: LABEL, display: 'block', marginBottom: 8 }}>Username</label>
              <div style={inputBox} onFocus={e => focusBox(e.currentTarget)} onBlur={e => blurBox(e.currentTarget)} tabIndex={-1}>
                <User size={16} style={{ color: MUTED, flexShrink: 0 }} />
                <input type="text" value={username} onChange={e => { setUsername(e.target.value); setError(''); }}
                  placeholder="Enter your username" autoComplete="username" autoFocus style={inputEl} />
              </div>
            </div>

            {/* Password */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13.5, fontWeight: 600, color: LABEL, display: 'block', marginBottom: 8 }}>Password</label>
              <div style={inputBox} onFocus={e => focusBox(e.currentTarget)} onBlur={e => blurBox(e.currentTarget)} tabIndex={-1}>
                <Lock size={16} style={{ color: MUTED, flexShrink: 0 }} />
                <input type={showPassword ? 'text' : 'password'} value={password}
                  onChange={e => { setPassword(e.target.value); setError(''); }}
                  placeholder="Enter your password" autoComplete="current-password" style={inputEl} />
                <button type="button" onClick={() => setShowPassword(v => !v)}
                  style={{ color: MUTED, background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', flexShrink: 0 }}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Remember + forgot */}
            <div className="flex items-center justify-between" style={{ marginBottom: 24 }}>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)}
                  style={{ width: 15, height: 15, accentColor: BLUE, cursor: 'pointer' }} />
                <span style={{ fontSize: 13, color: MUTED }}>Remember me</span>
              </label>
              <span className="clx-link" style={{ fontSize: 13, color: LINK, cursor: 'pointer', fontWeight: 500 }}>Forgot password?</span>
            </div>

            {/* Submit */}
            <button type="submit" disabled={disabled}
              className="clx-submit flex items-center justify-center gap-2 w-full"
              style={{
                padding: '13px', borderRadius: 10, fontSize: 14.5, fontWeight: 700,
                color: '#000000', border: 'none',
                cursor: disabled ? 'not-allowed' : 'pointer',
                background: disabled ? 'rgba(245,197,24,0.35)' : YELLOW,
                boxShadow: disabled ? 'none' : '0 4px 14px rgba(245,197,24,0.30)',
                transition: 'background 0.2s, transform 0.18s, box-shadow 0.18s',
              }}>
              {loading
                ? <><span style={{ width: 14, height: 14, border: '2px solid rgba(0,0,0,0.35)', borderTopColor: '#000000', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} /> Signing in…</>
                : 'Log in'}
            </button>
          </form>

          {/* Divider */}
          <div style={{ height: 1, background: LINE, margin: '26px 0 18px' }} />

          {/* Demo access */}
          <div className="clx-demo" style={{ border: `1px solid ${LINE}`, borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '7px 14px', fontSize: 10.5, fontWeight: 700, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.09em', borderBottom: `1px solid ${LINE}`, background: '#273685' }}>
              Demo Access
            </div>
            {[
              { role: 'Admin',     username: 'admin',     password: 'clinix2024' },
              { role: 'Assistant', username: 'assistant', password: 'assist2024' },
              { role: 'Staff',     username: 'staff',     password: 'staff123' },
            ].map((acc, i) => (
              <button type="button" key={acc.username}
                onClick={() => { setUsername(acc.username); setPassword(acc.password); setError(''); }}
                className="clx-demo-row grid grid-cols-3 items-center w-full text-left"
                style={{ padding: '8px 14px', border: 'none', background: 'transparent', cursor: 'pointer', borderTop: i > 0 ? `1px solid ${LINE}` : 'none' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: INK }}>{acc.role}</span>
                <span style={{ fontSize: 12, color: LINK, fontFamily: 'monospace' }}>{acc.username}</span>
                <span style={{ fontSize: 12, color: LINK, fontFamily: 'monospace' }}>{acc.password}</span>
              </button>
            ))}
          </div>

          <p className="text-center" style={{ fontSize: 13, color: MUTED, marginTop: 20 }}>
            Need help?{' '}
            <span className="clx-link" style={{ color: LINK, cursor: 'pointer', fontWeight: 600 }}>Contact administrator</span>
          </p>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes clxIn {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes clxPhotoIn {
          from { opacity: 0; transform: scale(1.05); }
          to   { opacity: 1; transform: scale(1); }
        }
        @keyframes clxErrIn {
          0%   { opacity: 0; transform: translateX(-6px); }
          25%  { transform: translateX(5px); }
          50%  { transform: translateX(-3px); }
          75%  { transform: translateX(2px); }
          100% { opacity: 1; transform: translateX(0); }
        }

        .clx-in    { opacity: 0; animation: clxIn 0.6s cubic-bezier(.16,.84,.44,1) both; }
        .clx-photo { animation: clxPhotoIn 1.1s cubic-bezier(.16,.84,.44,1) both; }
        .clx-error { animation: clxErrIn 0.45s ease both; }

        .clx-submit:not(:disabled):hover  { background: ${YELLOW_DK} !important; transform: translateY(-1px); box-shadow: 0 8px 22px rgba(245,197,24,0.38) !important; }
        .clx-submit:not(:disabled):active { transform: translateY(0); }

        .clx-link { transition: opacity 0.15s ease; }
        .clx-link:hover { opacity: 0.7; text-decoration: underline; }

        .clx-demo-row { transition: background 0.15s ease; }
        .clx-demo-row:hover { background: rgba(255,255,255,0.05); }

        @media (prefers-reduced-motion: reduce) {
          .clx-in, .clx-photo, .clx-error { animation: none !important; opacity: 1 !important; transform: none !important; }
        }
      `}</style>
    </div>
  );
}
