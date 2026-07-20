import { useState } from 'react';
import { Eye, EyeOff, AlertCircle, Heart, BarChart2, Shield, Zap, Lock, User } from 'lucide-react';
import { ACCOUNTS, Role } from '../auth';

type Props = { onLogin: (role: Role) => void };
const FEATURES = [
  { icon: BarChart2, title: 'Analytics',  sub: 'Real-time performance' },
  { icon: Shield,    title: 'Security',   sub: 'Enterprise-grade protection' },
  { icon: Zap,       title: 'Speed',      sub: 'Fast & reliable access' },
];
const CLINIC_PHOTO = 'https://images.unsplash.com/photo-1758448093806-88b2089068ab?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=900';

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
      const account = ACCOUNTS.find(
        (a) => a.username === username.trim() && a.password === password
      );
      if (account) {
        try {
          localStorage.setItem('clinixSession', 'active');
          localStorage.setItem('clinixRole', account.role);
        } catch {}
        onLogin(account.role);
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
        {/* subtle bg blobs */}
        <div style={{ position:'absolute', top:-140, left:-140, width:440, height:440, borderRadius:'50%', background:'rgba(59,130,246,0.07)', pointerEvents:'none' }} />
        <div style={{ position:'absolute', bottom:-100, left:-60, width:340, height:340, borderRadius:'50%', background:'rgba(29,78,216,0.08)', pointerEvents:'none' }} />

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
          <div className="flex items-center gap-3" style={{ pointerEvents:'auto' }}>
            <div style={{ width:40, height:40, borderRadius:11, background:'linear-gradient(135deg,#3B82F6,#1D4ED8)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 4px 14px rgba(59,130,246,0.4)' }}>
              <Heart size={19} style={{ color:'#fff' }} />
            </div>
            <div>
              <p style={{ fontSize:16, fontWeight:900, color:'#F8FAFC', letterSpacing:'-0.02em', lineHeight:1 }}>Clinix</p>
              <p style={{ fontSize:11, color:'#3B82F6', fontWeight:600, marginTop:2 }}>BISU Calape Campus</p>
            </div>
          </div>

          {/* Hero */}
          <div style={{ maxWidth:240 }}>
            <p style={{ fontSize:13, color:'#3B82F6', fontWeight:700, marginBottom:8 }}>Welcome back!</p>
            <h1 style={{ fontSize:38, fontWeight:900, color:'#F8FAFC', lineHeight:1.1, letterSpacing:'-0.03em', marginBottom:12 }}>
              Good to see<br />you again!
            </h1>
            <p style={{ fontSize:13, color:'#94A3B8', lineHeight:1.75 }}>
              Sign in to access the clinic system and continue providing excellent care.
            </p>
          </div>

          {/* Features + footer */}
          <div>
            <div className="flex items-start gap-6 mb-5">
              {FEATURES.map(({ icon: Icon, title, sub }) => (
                <div key={title} className="flex items-start gap-2">
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

        <div className="w-full" style={{ maxWidth:370 }}>

          {/* Lock icon */}
          <div className="flex justify-center mb-5">
            <div style={{ width:56, height:56, borderRadius:'50%', background:'linear-gradient(135deg,#3B82F6,#1D4ED8)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 6px 20px rgba(59,130,246,0.35)' }}>
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
            <div className="flex items-center gap-2.5 rounded-xl px-4 py-3 mb-4"
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
                <span style={{ fontSize:12, color:'#3B82F6', cursor:'pointer', fontWeight:500 }}>Forgot password?</span>
              </div>
              <div style={inputBox} onFocus={e => focusBox(e.currentTarget)} onBlur={e => blurBox(e.currentTarget)} tabIndex={-1}>
                <Lock size={15} style={{ color:'#94A3B8', flexShrink:0 }} />
                <input type={showPassword ? 'text' : 'password'} value={password}
                  onChange={e => { setPassword(e.target.value); setError(''); }}
                  placeholder="Enter your password" autoComplete="current-password" style={inputEl} />
                <button type="button" onClick={() => setShowPassword(v => !v)}
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
              className="flex items-center justify-center gap-2.5 w-full"
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
          <div className="rounded-xl overflow-hidden" style={{ border:'1px solid #E2E8F0' }}>
            <div className="px-4 py-2 flex items-center gap-2" style={{ background:'#F8FAFC', borderBottom:'1px solid #E2E8F0' }}>
              <Shield size={11} style={{ color:'#94A3B8' }} />
              <p style={{ fontSize:10, fontWeight:700, color:'#94A3B8', textTransform:'uppercase', letterSpacing:'0.08em' }}>Demo Access</p>
            </div>
            <div>
              {[
                { role: 'Admin',     username: 'admin',     password: 'clinix2024' },
                { role: 'Assistant', username: 'assistant', password: 'assist2024' },
                { role: 'Staff',     username: 'staff',     password: 'staff123' },
              ].map((acc, i) => (
                <div key={acc.username} className="grid grid-cols-3 items-center px-4 py-2"
                  style={{ borderTop: i > 0 ? '1px solid #F1F5F9' : 'none' }}>
                  <p style={{ fontSize:11, fontWeight:700, color:'#64748B' }}>{acc.role}</p>
                  <div className="flex items-center gap-1.5">
                    <User size={11} style={{ color:'#CBD5E1', flexShrink:0 }} />
                    <p style={{ fontSize:12, fontWeight:800, color:'#3B82F6', fontFamily:'monospace' }}>{acc.username}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Lock size={11} style={{ color:'#CBD5E1', flexShrink:0 }} />
                    <p style={{ fontSize:12, fontWeight:800, color:'#3B82F6', fontFamily:'monospace' }}>{acc.password}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <p className="text-center mt-5" style={{ fontSize:12, color:'#CBD5E1' }}>
            Need help?{' '}
            <span style={{ color:'#3B82F6', cursor:'pointer', fontWeight:600 }}>Contact administrator</span>
          </p>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
