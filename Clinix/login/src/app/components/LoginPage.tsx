import { useState } from 'react';
import { Eye, EyeOff, AlertCircle, Heart, BarChart2, Shield, Zap, Lock, User } from 'lucide-react';
import CLINIC_PHOTO from '../../assets/campus-gate.jpg';

type Props = { onLogin: () => void };
const CREDENTIALS = { username: 'admin', password: 'clinix2024' };
const FEATURES = [
  { icon: BarChart2, title: 'Analytics',  sub: 'Real-time performance' },
  { icon: Shield,    title: 'Security',   sub: 'Enterprise-grade protection' },
  { icon: Zap,       title: 'Speed',      sub: 'Fast & reliable access' },
];

export function LoginPage({ onLogin }: Props) {
  const [username, setUsername]           = useState('');
  const [password, setPassword]           = useState('');
  const [showPassword, setShowPassword]   = useState(false);
  const [remember, setRemember]           = useState(false);
  const [error, setError]                 = useState('');
  const [loading, setLoading]             = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    setTimeout(() => {
      if (username.trim() === CREDENTIALS.username && password === CREDENTIALS.password) {
        try { localStorage.setItem('clinixSession', 'active'); } catch {}
        onLogin();
      } else {
        setError('Incorrect username or password.');
        setLoading(false);
      }
    }, 700);
  }

  const inputBox: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10,
    background: '#F1F5F9',
    border: '1.5px solid #E2E8F0',
    borderRadius: 10, padding: '10px 14px',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  };
  const inputEl: React.CSSProperties = {
    flex: 1, background: 'none', border: 'none', outline: 'none',
    fontSize: 14, color: '#0F172A', minWidth: 0,
  };
  function focusBox(el: HTMLElement) {
    el.style.borderColor = '#3B82F6';
    el.style.boxShadow   = '0 0 0 3px rgba(59,130,246,0.1)';
    el.style.background  = '#fff';
  }
  function blurBox(el: HTMLElement) {
    el.style.borderColor = '#E2E8F0';
    el.style.boxShadow   = 'none';
    el.style.background  = '#F1F5F9';
  }

  return (
    <div className="flex h-screen w-full overflow-hidden" style={{ background: '#020817' }}>

      {/* ══════════════ LEFT PANEL ══════════════ */}
      <div
        className="hidden lg:block relative overflow-hidden"
        style={{ width: '56%', background: 'linear-gradient(135deg, #020817 0%, #0F172A 50%, #1E293B 100%)' }}
      >
        {/* subtle bg blobs — gently drifting */}
        <div className="clx-blob" style={{ position:'absolute', top:-140, left:-140, width:440, height:440, borderRadius:'50%', background:'rgba(59,130,246,0.10)', filter:'blur(8px)', pointerEvents:'none' }} />
        <div className="clx-blob clx-blob--slow" style={{ position:'absolute', bottom:-100, left:-60, width:340, height:340, borderRadius:'50%', background:'rgba(29,78,216,0.11)', filter:'blur(8px)', pointerEvents:'none' }} />

        {/* faint dot-grid texture */}
        <div style={{ position:'absolute', inset:0, backgroundImage:'radial-gradient(rgba(148,163,184,0.14) 1px, transparent 1px)', backgroundSize:'26px 26px', maskImage:'linear-gradient(120deg, #000 0%, transparent 55%)', WebkitMaskImage:'linear-gradient(120deg, #000 0%, transparent 55%)', pointerEvents:'none' }} />

        {/* CLINIC PHOTO — right half of panel, flush */}
        <div style={{ position:'absolute', right:60, top:0, bottom:0, width:'62%', zIndex:1 }}>
          <img
            src={CLINIC_PHOTO}
            alt="Clinic"
            style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}
          />
          {/* left fade — blends photo into dark panel */}
          <div style={{ position:'absolute', inset:0, background:'linear-gradient(to right, #0F172A 0%, rgba(15,23,42,0.88) 18%, rgba(15,23,42,0.35) 38%, transparent 60%)', pointerEvents:'none' }} />
          {/* top & bottom fades */}
          <div style={{ position:'absolute', inset:0, background:'linear-gradient(to bottom, #020817 0%, transparent 20%, transparent 80%, #1E293B 100%)', pointerEvents:'none' }} />
          {/* overall darkening tint to keep text legible */}
          <div style={{ position:'absolute', inset:0, background:'rgba(2,8,23,0.25)', pointerEvents:'none' }} />
        </div>

        {/* TEXT COLUMN — left side, above photo */}
        <div className="relative flex flex-col justify-between h-full p-12" style={{ zIndex:2, pointerEvents:'none' }}>
          {/* Logo */}
          <div className="flex items-center gap-3 clx-in" style={{ pointerEvents:'auto', animationDelay:'0.05s' }}>
            <div style={{ width:40, height:40, borderRadius:11, background:'linear-gradient(135deg,#3B82F6,#1D4ED8)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 14px rgba(59,130,246,0.4)' }}>
              <Heart size={19} style={{ color:'#fff' }} />
            </div>
            <div>
              <p style={{ fontSize:16, fontWeight:900, color:'#F8FAFC', letterSpacing:'-0.02em', lineHeight:1 }}>Clinix</p>
              <p style={{ fontSize:11, color:'#3B82F6', fontWeight:600, marginTop:2 }}>BISU Calape Campus</p>
            </div>
          </div>

          {/* Hero */}
          <div className="clx-in" style={{ maxWidth:240, animationDelay:'0.15s' }}>
            <p style={{ fontSize:13, color:'#3B82F6', fontWeight:700, marginBottom:8 }}>Welcome back!</p>
            <h1 style={{ fontSize:38, fontWeight:900, color:'#F8FAFC', lineHeight:1.1, letterSpacing:'-0.03em', marginBottom:12 }}>
              Good to see<br />you again!
            </h1>
            <p style={{ fontSize:13, color:'#94A3B8', lineHeight:1.75 }}>
              Sign in to access the clinic system and continue providing excellent care.
            </p>
          </div>

          {/* Features + footer */}
          <div className="clx-in" style={{ animationDelay:'0.25s' }}>
            <div className="flex items-start gap-6 mb-5">
              {FEATURES.map(({ icon: Icon, title, sub }, i) => (
                <div key={title} className="clx-feature flex items-start gap-2" style={{ animationDelay:`${0.35 + i * 0.08}s` }}>
                  <div style={{ width:28, height:28, borderRadius:8, background:'rgba(59,130,246,0.15)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:1 }}>
                    <Icon size={13} style={{ color:'#3B82F6' }} />
                  </div>
                  <div>
                    <p style={{ fontSize:12, fontWeight:700, color:'#CBD5E1' }}>{title}</p>
                    <p style={{ fontSize:10, color:'#64748B', marginTop:1 }}>{sub}</p>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ height:1, background:'rgba(255,255,255,0.07)', marginBottom:12 }} />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Shield size={11} style={{ color:'#64748B' }} />
                <p style={{ fontSize:11, color:'#64748B' }}>Your data is secure with us</p>
              </div>
              <p style={{ fontSize:10, color:'#334155' }}>© 2026 Bisayas State University · Calape Campus</p>
            </div>
          </div>
        </div>

        {/* WAVY white right-edge separator */}
        <div style={{ position:'absolute', right:0, top:0, bottom:0, width:100, zIndex:10, pointerEvents:'none' }}>
          <svg viewBox="0 0 100 800" preserveAspectRatio="none" style={{ width:'100%', height:'100%' }}>
            <path
              d="M 55 0 C 55 0, 10 140, 30 270 C 50 400, 5 480, 20 600 C 35 720, 60 770, 50 800 L 100 800 L 100 0 Z"
              fill="white"
            />
          </svg>
        </div>
      </div>

      {/* ══════════════ RIGHT PANEL ══════════════ */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 py-12" style={{ background:'#ffffff' }}>

        {/* mobile logo */}
        <div className="flex items-center gap-2.5 mb-8 lg:hidden">
          <div style={{ width:36, height:36, borderRadius:10, background:'linear-gradient(135deg,#3B82F6,#1D4ED8)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Heart size={17} style={{ color:'#fff' }} />
          </div>
          <p style={{ fontSize:18, fontWeight:900, color:'#0F172A' }}>Clinix</p>
        </div>

        <div className="w-full clx-card" style={{ maxWidth:370 }}>

          {/* Lock icon */}
          <div className="flex justify-center mb-5">
            <div className="clx-lock" style={{ width:56, height:56, borderRadius:'50%', background:'linear-gradient(135deg,#3B82F6,#1D4ED8)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 6px 20px rgba(59,130,246,0.35)' }}>
              <Lock size={23} style={{ color:'#fff' }} />
            </div>
          </div>

          {/* Heading */}
          <div className="text-center mb-7">
            <h2 style={{ fontSize:21, fontWeight:800, color:'#0F172A', letterSpacing:'-0.02em', marginBottom:5 }}>
              Sign in to your account
            </h2>
            <p style={{ fontSize:13, color:'#94A3B8' }}>Enter your credentials to continue</p>
          </div>

          {/* Error */}
          {error && (
            <div className="clx-error flex items-center gap-2.5 rounded-xl px-4 py-3 mb-4"
              style={{ background:'#FEF2F2', border:'1.5px solid #FECACA' }}>
              <AlertCircle size={14} style={{ color:'#EF4444', flexShrink:0 }} />
              <p style={{ fontSize:13, color:'#DC2626', fontWeight:500 }}>{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Username */}
            <div>
              <label style={{ fontSize:13, fontWeight:600, color:'#374151', display:'block', marginBottom:7 }}>Username</label>
              <div style={inputBox} onFocus={e => focusBox(e.currentTarget)} onBlur={e => blurBox(e.currentTarget)} tabIndex={-1}>
                <User size={15} style={{ color:'#94A3B8', flexShrink:0 }} />
                <input type="text" value={username} onChange={e => { setUsername(e.target.value); setError(''); }}
                  placeholder="Enter your username" autoComplete="username" autoFocus style={inputEl} />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between" style={{ marginBottom:7 }}>
                <label style={{ fontSize:13, fontWeight:600, color:'#374151' }}>Password</label>
                <span className="clx-link" style={{ fontSize:12, color:'#3B82F6', cursor:'pointer', fontWeight:500 }}>Forgot password?</span>
              </div>
              <div style={inputBox} onFocus={e => focusBox(e.currentTarget)} onBlur={e => blurBox(e.currentTarget)} tabIndex={-1}>
                <Lock size={15} style={{ color:'#94A3B8', flexShrink:0 }} />
                <input type={showPassword ? 'text' : 'password'} value={password}
                  onChange={e => { setPassword(e.target.value); setError(''); }}
                  placeholder="Enter your password" autoComplete="current-password" style={inputEl} />
                <button type="button" onClick={() => setShowPassword((v: boolean) => !v)}
                  style={{ color:'#94A3B8', background:'none', border:'none', cursor:'pointer', padding:0, display:'flex', flexShrink:0 }}>
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Remember me */}
            <label className="flex items-center gap-2.5 cursor-pointer pt-0.5">
              <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)}
                style={{ width:14, height:14, accentColor:'#3B82F6', cursor:'pointer' }} />
              <span style={{ fontSize:13, color:'#64748B' }}>Remember me</span>
            </label>

            {/* Submit */}
            <button type="submit" disabled={loading || !username || !password}
              className="clx-submit flex items-center justify-center gap-2.5 w-full"
              style={{
                padding:'12px', borderRadius:10, fontSize:15, fontWeight:700,
                color:'#fff', border:'none', marginTop:4,
                cursor: loading || !username || !password ? 'not-allowed' : 'pointer',
                background: loading || !username || !password
                  ? '#BFDBFE' : 'linear-gradient(135deg,#3B82F6 0%,#1D4ED8 100%)',
                boxShadow: loading || !username || !password ? 'none' : '0 4px 16px rgba(59,130,246,0.35)',
                transition:'all 0.2s',
              }}>
              {loading
                ? <><span style={{ width:14, height:14, border:'2px solid rgba(255,255,255,0.4)', borderTopColor:'#fff', borderRadius:'50%', display:'inline-block', animation:'spin 0.7s linear infinite' }} /> Signing in…</>
                : <><Lock size={15} /> Sign In</>}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-5">
            <div style={{ flex:1, height:1, background:'#F1F5F9' }} />
            <span style={{ fontSize:11, color:'#CBD5E1', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.07em' }}>or</span>
            <div style={{ flex:1, height:1, background:'#F1F5F9' }} />
          </div>

          {/* Demo credentials */}
          <div className="clx-demo rounded-xl overflow-hidden" style={{ border:'1px solid #E2E8F0' }}>
            <div className="px-4 py-2 flex items-center gap-2" style={{ background:'#F8FAFC', borderBottom:'1px solid #E2E8F0' }}>
              <Shield size={11} style={{ color:'#94A3B8' }} />
              <p style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.08em' }}>Demo Access</p>
            </div>
            <div className="grid grid-cols-2">
              <div className="px-4 py-2.5 flex items-center gap-2" style={{ borderRight:'1px solid #F1F5F9' }}>
                <User size={12} style={{ color:'#CBD5E1' }} />
                <div>
                  <p style={{ fontSize:10, color:'#CBD5E1', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em' }}>Username</p>
                  <p style={{ fontSize:13, fontWeight:800, color:'#3B82F6', fontFamily:'monospace' }}>admin</p>
                </div>
              </div>
              <div className="px-4 py-2.5 flex items-center gap-2">
                <Lock size={12} style={{ color:'#CBD5E1' }} />
                <div>
                  <p style={{ fontSize:10, color:'#CBD5E1', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em' }}>Password</p>
                  <p style={{ fontSize:13, fontWeight:800, color:'#3B82F6', fontFamily:'monospace' }}>clinix2024</p>
                </div>
              </div>
            </div>
          </div>

          <p className="text-center mt-5" style={{ fontSize:12, color:'#CBD5E1' }}>
            Need help?{' '}
            <span className="clx-link" style={{ color:'#3B82F6', cursor:'pointer', fontWeight:600 }}>Contact administrator</span>
          </p>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }

        @keyframes clxIn {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes clxCardIn {
          from { opacity: 0; transform: translateY(20px) scale(0.985); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes clxLockPop {
          0%   { opacity: 0; transform: scale(0.6) rotate(-12deg); }
          60%  { opacity: 1; transform: scale(1.08) rotate(4deg); }
          100% { opacity: 1; transform: scale(1) rotate(0); }
        }
        @keyframes clxFloat {
          0%, 100% { transform: translate(0, 0); }
          50%      { transform: translate(24px, -18px); }
        }
        @keyframes clxErrIn {
          0%   { opacity: 0; transform: translateX(-6px); }
          25%  { transform: translateX(5px); }
          50%  { transform: translateX(-3px); }
          75%  { transform: translateX(2px); }
          100% { opacity: 1; transform: translateX(0); }
        }

        .clx-in      { opacity: 0; animation: clxIn 0.6s cubic-bezier(.16,.84,.44,1) both; }
        .clx-feature { opacity: 0; animation: clxIn 0.5s cubic-bezier(.16,.84,.44,1) both; }
        .clx-card    { animation: clxCardIn 0.65s cubic-bezier(.16,.84,.44,1) both; }
        .clx-lock    { animation: clxLockPop 0.7s cubic-bezier(.34,1.56,.64,1) 0.1s backwards; transition: transform 0.25s ease, box-shadow 0.25s ease; }
        .clx-card:hover .clx-lock { transform: translateY(-2px); box-shadow: 0 10px 26px rgba(59,130,246,0.45); }
        .clx-error   { animation: clxErrIn 0.45s ease both; }

        .clx-blob        { animation: clxFloat 14s ease-in-out infinite; }
        .clx-blob--slow  { animation: clxFloat 20s ease-in-out infinite reverse; }

        .clx-submit { transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.2s ease; }
        .clx-submit:not(:disabled):hover  { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(59,130,246,0.45) !important; }
        .clx-submit:not(:disabled):active { transform: translateY(0); }

        .clx-link { transition: color 0.15s ease, opacity 0.15s ease; }
        .clx-link:hover { color: #1D4ED8; text-decoration: underline; }

        .clx-demo { transition: border-color 0.2s ease, box-shadow 0.2s ease; }
        .clx-demo:hover { border-color: #BFDBFE; box-shadow: 0 4px 14px rgba(59,130,246,0.10); }

        @media (prefers-reduced-motion: reduce) {
          .clx-in, .clx-feature, .clx-card, .clx-lock, .clx-error, .clx-blob, .clx-blob--slow {
            animation: none !important; opacity: 1 !important; transform: none !important;
          }
        }
      `}</style>
    </div>
  );
}
