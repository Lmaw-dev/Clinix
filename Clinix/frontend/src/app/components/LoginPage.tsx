import { useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { apiLogin, Role } from '../auth';
import CAMPUS_PHOTO from '../../assets/campus-gate.png';

type Props = { onLogin: (role: Role, username: string) => void };

/* ── Design tokens, taken from the reference comp (1024 × 768) ───────────── */
const FONT      = "'Montserrat', 'Segoe UI', system-ui, sans-serif";
const YELLOW    = '#F5C518';
const YELLOW_DK = '#E8B910';
const NAVY      = '#0B1A54';

/* The comp is a fixed 1024×768 canvas. Everything below is positioned in that
   coordinate space and the whole stage is scaled to the viewport, so the
   proportions stay exactly as drawn on any desktop size. */
const W = 1024;
const H = 768;

export function LoginPage({ onLogin }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const userRef = useRef<HTMLInputElement>(null);

  /* Viewport → stage scale. CSS can't divide a length by a length, so the
     scale factor has to be computed here. */
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Below this the fixed canvas would shrink text past legibility, so the same
  // pieces reflow into a single stacked column instead.
  const compact = vp.w < 900 || vp.h < 600;
  const scale   = Math.min(vp.w / W, vp.h / H);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!username || !password) {
      setError('Enter your username and password.');
      return;
    }
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

  // Only the in-flight request disables the button. Greying it out on empty
  // fields turned it olive against the blue behind the glass, and the comp
  // shows a solid yellow button at rest.
  const disabled = loading;

  /* ── Sign-in card ─────────────────────────────────────────────────────── */
  const card = (
    <div
      className="clx-card clx-in"
      style={{
        width: compact ? '100%' : 416,
        maxWidth: 416,
        padding: '30px 55px',
        borderRadius: 28,
        animationDelay: '0.22s',
      }}
    >
      <h2
        style={{
          fontSize: 36, fontWeight: 800, color: '#FFFFFF',
          lineHeight: 1.05, letterSpacing: '-0.02em',
          textAlign: 'center', margin: 0, marginBottom: 34,
          textShadow: '0 2px 14px rgba(6,16,58,0.45)',
        }}
      >
        Sign in
      </h2>

      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="clx-user" className="clx-label">Username</label>
        <input
          id="clx-user"
          ref={userRef}
          className="clx-field"
          type="text"
          value={username}
          onChange={e => { setUsername(e.target.value); setError(''); }}
          placeholder="nurse.calape"
          autoComplete="username"
          autoFocus
        />

        <div style={{ height: 20 }} />

        <label htmlFor="clx-pass" className="clx-label">Password</label>
        <input
          id="clx-pass"
          className="clx-field clx-field-pass"
          type="password"
          value={password}
          onChange={e => { setPassword(e.target.value); setError(''); }}
          placeholder="••••••••••••"
          autoComplete="current-password"
        />

        {error && (
          <div className="clx-error" role="alert">
            <AlertCircle size={14} style={{ color: '#FFC9C9', flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 34 }}>
          <button type="submit" disabled={disabled} className="clx-btn clx-btn-login">
            {loading ? (
              <>
                <span className="clx-spin" /> Signing in…
              </>
            ) : (
              'Login'
            )}
          </button>
        </div>
      </form>
    </div>
  );

  /* ── Left-hand copy block ─────────────────────────────────────────────── */
  const copy = (
    <>
      <h1
        className="clx-in"
        style={{
          fontSize: 60, fontWeight: 800, color: '#FFFFFF',
          lineHeight: 0.98, letterSpacing: '-0.035em',
          margin: 0, animationDelay: '0.08s',
          textShadow: '0 4px 26px rgba(4,12,45,0.5)',
        }}
      >
        Login
      </h1>
      <p
        className="clx-in"
        style={{
          fontSize: 19, fontWeight: 700, color: '#FFFFFF',
          margin: 0, marginTop: 14, letterSpacing: '-0.005em',
          animationDelay: '0.13s',
          textShadow: '0 2px 16px rgba(4,12,45,0.5)',
        }}
      >
        Sign in to continue
      </p>

      <p
        className="clx-in"
        style={{
          fontSize: 14.5, lineHeight: 1.55, fontWeight: 500,
          color: 'rgba(255,255,255,0.88)', maxWidth: 380,
          // absorbs the removed rule's own margins so nothing below shifts
          margin: 0, marginTop: compact ? 63 : 133, animationDelay: '0.2s',
          textShadow: '0 1px 12px rgba(4,12,45,0.5)',
        }}
      >
        Empowering Bohol Island State University – Calape Campus with a modern
        clinic management system that centralizes consultations, medical records,
        certificates, and inventory for efficient healthcare administration.
      </p>

      <button
        type="button"
        className="clx-btn clx-btn-learn clx-in"
        style={{ marginTop: compact ? 34 : 42, animationDelay: '0.24s' }}
        onClick={() => userRef.current?.focus()}
      >
        Learn More
      </button>
    </>
  );

  /* ── Brand mark ───────────────────────────────────────────────────────── */
  /* Vector rebuild of the Clinix logo: gold "C" ring + medical cross, with the
     left half of the "X" rendered as the blue chevron. Drawn rather than
     bitmapped so it has no background plate and stays sharp at any size. */
  const brand = (
    <div className="clx-in" style={{ animationDelay: '0.04s' }}>
      <svg
        width="70" height="57" viewBox="275 185 800 650"
        fill="none" role="img" aria-label="Clinix"
      >
        <defs>
          <linearGradient id="clxGold" x1="0.18" y1="0" x2="0.62" y2="1">
            <stop offset="0%"   stopColor="#FFE372" />
            <stop offset="42%"  stopColor="#F8C61F" />
            <stop offset="100%" stopColor="#E39C05" />
          </linearGradient>
          <linearGradient id="clxBlue" x1="0.1" y1="0" x2="0.85" y2="1">
            <stop offset="0%"   stopColor="#0C3ED6" />
            <stop offset="46%"  stopColor="#2371F2" />
            <stop offset="100%" stopColor="#062A9B" />
          </linearGradient>
        </defs>

        {/* gold X — right half only; the left half is the blue chevron below */}
        <path d="M900,318 L1075,318 L829,523 L731,459 Z" fill="url(#clxGold)" />
        <path d="M900,706 L1075,706 L829,501 L731,565 Z" fill="url(#clxGold)" />

        {/* gold "C" ring, open to the right */}
        <path
          d="M752.6,223 A325,325 0 1 0 752.6,797 L705.7,708.6 A225,225 0 1 1 705.7,311.4 Z"
          fill="url(#clxGold)"
        />

        {/* medical cross inside the ring */}
        <g fill="url(#clxGold)">
          <rect x="415" y="476" width="200" height="78" rx="15" />
          <rect x="476" y="415" width="78"  height="200" rx="15" />
        </g>

        {/* blue chevron — the left half of the X */}
        <path
          d="M540,305 L866,512 L540,719 L540,609 L690,512 L540,415 Z"
          fill="url(#clxBlue)"
        />
      </svg>

      <div
        style={{
          fontSize: 12, fontWeight: 500, color: '#FFFFFF',
          letterSpacing: '0.34em', marginTop: 5, marginLeft: 3,
          textShadow: '0 2px 10px rgba(4,12,45,0.5)',
        }}
      >
        CLINI<span style={{ color: YELLOW, fontWeight: 800 }}>X</span>
      </div>
    </div>
  );

  /* ── Decorative motifs ────────────────────────────────────────────────── */
  const squares = (
    <svg width="52" height="46" viewBox="0 0 52 46" fill="none" aria-hidden="true">
      <rect x="19.8" y="0.8" width="14.4" height="14.4" stroke="rgba(255,255,255,0.75)" strokeWidth="1.6" />
      <rect x="1.8" y="12.8" width="16.4" height="16.4" stroke="rgba(255,255,255,0.55)" strokeWidth="1.6" />
      <rect x="24.8" y="18.8" width="14.4" height="14.4" fill="rgba(255,255,255,0.16)" stroke="rgba(255,255,255,0.7)" strokeWidth="1.6" />
      <rect x="10.8" y="30.8" width="11.4" height="11.4" stroke="rgba(255,255,255,0.45)" strokeWidth="1.6" />
    </svg>
  );

  /* ── Background (shared by both layouts) ──────────────────────────────── */
  const background = (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <img
        src={CAMPUS_PHOTO}
        alt=""
        aria-hidden="true"
        className="clx-photo"
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          objectFit: 'cover', objectPosition: '50% 58%',
          filter: 'blur(4px) brightness(0.5) saturate(1.4)',
          transform: 'scale(1.07)',
        }}
      />
      {/* deep cobalt wash */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background:
          'linear-gradient(158deg, rgba(5,12,52,0.96) 0%, rgba(9,24,94,0.90) 28%, rgba(17,42,136,0.78) 55%, rgba(6,17,68,0.95) 100%)',
      }} />
      {/* centre light bloom */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(105% 78% at 40% 50%, rgba(42,92,215,0.34) 0%, rgba(42,92,215,0) 64%)',
      }} />
      {/* corner vignette */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(100% 100% at 48% 44%, rgba(3,8,34,0) 34%, rgba(3,8,34,0.78) 100%)',
      }} />
    </div>
  );

  const styles = (
    <style>{`
      @keyframes clxSpin { to { transform: rotate(360deg); } }
      @keyframes clxIn {
        from { opacity: 0; transform: translateY(16px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @keyframes clxPhotoIn {
        from { opacity: 0; transform: scale(1.12); }
        to   { opacity: 1; transform: scale(1.06); }
      }
      @keyframes clxErrIn {
        0%   { opacity: 0; transform: translateX(-6px); }
        25%  { transform: translateX(5px); }
        50%  { transform: translateX(-3px); }
        75%  { transform: translateX(2px); }
        100% { opacity: 1; transform: translateX(0); }
      }

      .clx-root  { font-family: ${FONT}; }
      .clx-in    { opacity: 0; animation: clxIn 0.65s cubic-bezier(.16,.84,.44,1) both; }
      .clx-photo { animation: clxPhotoIn 1.3s cubic-bezier(.16,.84,.44,1) both; }

      /* glassmorphism panel */
      .clx-card {
        background: linear-gradient(150deg, rgba(255,255,255,0.17) 0%, rgba(255,255,255,0.07) 100%);
        backdrop-filter: blur(18px) saturate(1.25);
        -webkit-backdrop-filter: blur(18px) saturate(1.25);
        border: 1px solid rgba(255,255,255,0.22);
        box-shadow:
          0 28px 64px rgba(4,12,45,0.38),
          inset 0 1px 0 rgba(255,255,255,0.28);
      }

      .clx-label {
        display: block;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.09em;
        text-transform: uppercase;
        color: #FFFFFF;
        margin-bottom: 9px;
        padding-left: 18px;
        text-shadow: 0 1px 8px rgba(4,12,45,0.4);
      }

      .clx-field {
        display: block;
        width: 100%;
        height: 38px;
        padding: 0 18px;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.20);
        background: rgba(255,255,255,0.22);
        color: #FFFFFF;
        font-family: ${FONT};
        font-size: 13px;
        font-weight: 500;
        outline: none;
        transition: background 0.18s, border-color 0.18s, box-shadow 0.18s;
      }
      .clx-field::placeholder { color: rgba(255,255,255,0.58); font-weight: 400; }
      /* the bullet glyph sits tiny at 13px, so the masked placeholder reads as
         a row of full stops unless it is bumped up */
      .clx-field-pass::placeholder { font-size: 17px; letter-spacing: 1px; }
      .clx-field:hover        { background: rgba(255,255,255,0.26); }
      .clx-field:focus {
        background: rgba(255,255,255,0.30);
        border-color: rgba(245,197,24,0.85);
        box-shadow: 0 0 0 3px rgba(245,197,24,0.22);
      }
      /* Chrome's autofill repaint would otherwise punch a solid white pill
         through the glass. */
      .clx-field:-webkit-autofill,
      .clx-field:-webkit-autofill:focus {
        -webkit-text-fill-color: #FFFFFF;
        -webkit-box-shadow: 0 0 0 40px rgba(38,62,140,0.96) inset;
        caret-color: #FFFFFF;
      }

      .clx-btn {
        border: none;
        border-radius: 999px;
        background: ${YELLOW};
        color: #FFFFFF;
        font-family: ${FONT};
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0.005em;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        box-shadow: 0 6px 18px rgba(245,197,24,0.30);
        transition: background 0.2s, transform 0.18s, box-shadow 0.18s;
      }
      .clx-btn-login { width: 149px; height: 36px; }
      .clx-btn-learn { width: 159px; height: 38px; }

      .clx-btn:not(:disabled):hover {
        background: ${YELLOW_DK};
        transform: translateY(-1px);
        box-shadow: 0 10px 26px rgba(245,197,24,0.40);
      }
      .clx-btn:not(:disabled):active { transform: translateY(0); }
      /* Stay yellow when disabled — a translucent fill blends with the blue
         behind the glass and turns olive. */
      .clx-btn:disabled {
        opacity: 0.55;
        box-shadow: none;
        cursor: not-allowed;
      }
      .clx-btn:focus-visible {
        outline: 2px solid #FFFFFF;
        outline-offset: 3px;
      }

      .clx-spin {
        width: 13px; height: 13px;
        border: 2px solid rgba(255,255,255,0.45);
        border-top-color: #FFFFFF;
        border-radius: 50%;
        display: inline-block;
        animation: clxSpin 0.7s linear infinite;
      }

      .clx-error {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 14px;
        padding: 8px 14px;
        border-radius: 999px;
        background: rgba(220,38,38,0.30);
        border: 1px solid rgba(255,140,140,0.45);
        font-size: 12px;
        font-weight: 600;
        color: #FFE4E4;
        animation: clxErrIn 0.45s ease both;
      }

      /* dotted matrices */
      .clx-dots {
        background-image: radial-gradient(circle, rgba(255,255,255,0.58) 1.2px, transparent 1.3px);
        background-size: 13.5px 13.5px;
        pointer-events: none;
      }

      @media (prefers-reduced-motion: reduce) {
        .clx-in, .clx-photo, .clx-error { animation: none !important; opacity: 1 !important; transform: none !important; }
        .clx-photo { transform: scale(1.07) !important; }
      }
    `}</style>
  );

  /* ── Stacked fallback for small windows ───────────────────────────────── */
  if (compact) {
    return (
      <div className="clx-root" style={{ position: 'relative', minHeight: '100vh', width: '100%', background: NAVY, overflowX: 'hidden' }}>
        {background}
        <div style={{ position: 'relative', zIndex: 2, padding: '40px 24px 56px', maxWidth: 460, margin: '0 auto' }}>
          {brand}
          <div style={{ marginTop: 34 }}>{copy}</div>
          <div style={{ marginTop: 44 }}>{card}</div>
        </div>
        {styles}
      </div>
    );
  }

  /* ── Pixel-accurate 1024×768 stage ────────────────────────────────────── */
  return (
    <div
      className="clx-root"
      style={{
        position: 'relative', height: '100vh', width: '100%',
        background: NAVY, overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {background}

      <div
        style={{
          position: 'relative', zIndex: 2,
          width: W, height: H, flex: '0 0 auto',
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
        }}
      >
        {/* dot matrix — top centre */}
        <div
          className="clx-dots"
          style={{
            position: 'absolute', left: 425, top: -6, width: 138, height: 66,
            WebkitMaskImage: 'linear-gradient(to bottom, #000 35%, transparent 100%)',
            maskImage: 'linear-gradient(to bottom, #000 35%, transparent 100%)',
          }}
        />
        {/* dot matrix — bottom right */}
        <div
          className="clx-dots"
          style={{
            position: 'absolute', left: 930, top: 672, width: 108, height: 104,
            WebkitMaskImage: 'linear-gradient(to top left, #000 25%, transparent 88%)',
            maskImage: 'linear-gradient(to top left, #000 25%, transparent 88%)',
          }}
        />
        {/* stacked squares — top right */}
        <div className="clx-in" style={{ position: 'absolute', left: 922, top: 52, animationDelay: '0.3s' }}>
          {squares}
        </div>

        {/* brand */}
        <div style={{ position: 'absolute', left: 84, top: 68 }}>{brand}</div>

        {/* left copy */}
        <div style={{ position: 'absolute', left: 78, top: 172, width: 400 }}>{copy}</div>

        {/* glass card */}
        <div style={{ position: 'absolute', left: 531, top: 214 }}>{card}</div>
      </div>

      {styles}
    </div>
  );
}
