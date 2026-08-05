import { useEffect, useRef, useState } from 'react';
import {
  LayoutDashboard,
  GraduationCap,
  Users,
  FileText,
  Pill,
  Award,
  MessageSquare,
  BarChart2,
  ShieldCheck,
  LogOut,
  ChevronDown,
  Settings,
  Sun,
  Moon,
  Info,
} from 'lucide-react';

import { Page } from '../App';
import { Role, canAccess, ROLE_LABELS, ROLE_DEFAULT_NAMES } from '../auth';
import { useTheme } from '../ThemeContext';
import { ClinixLogo } from './ClinixLogo';
import { APP_VERSION } from '../version';

const NAV_ITEMS: Array<{
  id: Page;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
}> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'students', label: 'Students', icon: GraduationCap },
  { id: 'faculty', label: 'Faculty & Staff', icon: Users },
  { id: 'medical-records', label: 'Medical Forms', icon: FileText },
  { id: 'inventory', label: 'Medicine Inventory', icon: Pill },
  { id: 'certificates', label: 'Medical Certificates', icon: Award },
  { id: 'consultations', label: 'Consultation Logs', icon: MessageSquare },
  { id: 'reports', label: 'Reports & Statistics', icon: BarChart2 },
  { id: 'accounts', label: 'Accounts', icon: ShieldCheck },
  // Settings is not listed here — it is opened from the version block pinned to
  // the sidebar footer.
];

export function Sidebar({
  role,
  activePage,
  onNavigate,
  onLogout,
  certificatesEnabled = true,
  userName,
  username,
}: {
  role: Role;
  activePage: Page;
  onNavigate: (p: Page) => void;
  onLogout?: () => void;
  certificatesEnabled?: boolean;
  /** Display name of the signed-in user, shown at the top of the account menu. */
  userName?: string;
  /** Their sign-in name, shown under it. */
  username?: string;
}) {
  const { isDark, toggle: toggleTheme } = useTheme();
  const navItems = NAV_ITEMS.filter((item) =>
    canAccess(role, item.id) && (item.id !== 'certificates' || certificatesEnabled),
  );

  // The footer block opens an account menu rather than jumping straight to a
  // page, so Settings, the theme and signing out all sit in one place.
  const [menuOpen, setMenuOpen] = useState(false);
  const footerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!footerRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const bg        = isDark ? '#0D1230' : '#1B2A6E';
  const divider   = isDark ? '#131D4D' : '#273685';
  const itemInactive = '#A9B5E1';
  const itemHoverBg  = 'rgba(255,255,255,0.08)';
  const itemHoverColor = '#FFFFFF';
  const activeBg  = 'rgba(245,197,24,0.15)';
  const activeBorder = 'rgba(245,197,24,0.35)';
  const settingsActive = activePage === 'settings';

  // The pop-up menu is a card, not part of the navy panel.
  const menuBg     = isDark ? '#1E293B' : '#FFFFFF';
  const menuBorder = isDark ? '#334155' : '#E2E8F0';
  const menuText   = isDark ? '#E2E8F0' : '#0F172A';
  const menuMuted  = isDark ? '#94A3B8' : '#64748B';
  const menuColors = {
    text: menuText,
    muted: menuMuted,
    hover: isDark ? 'rgba(148,163,184,0.16)' : '#F1F5F9',
  };

  return (
    <aside
      className="flex flex-col shrink-0 h-full overflow-hidden transition-colors"
      style={{ width: 232, background: bg }}
    >
      {/* Brand */}
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-center gap-3">
          {/* The mark sits straight on the navy, as it does on the sign-in and
              landing screens — a gold plate behind it would swallow the gold
              "C" and cross. */}
          <div className="flex items-center justify-center shrink-0" style={{ width: 36, height: 36 }}>
            <ClinixLogo width={36} />
          </div>
          <div>
            <p style={{ fontWeight: 700, fontSize: 14, color: '#FFFFFF', lineHeight: 1.2 }}>Clinix</p>
            <p style={{ fontSize: 10, color: '#F5C518', lineHeight: 1.3 }}>BISU Calape Campus</p>
          </div>
        </div>
      </div>

      <div style={{ height: 1, background: divider, margin: '0 12px 6px' }} />

      {/* Nav — sized to fit; no scrollbar */}
      <nav className="flex-1 min-h-0 px-3 pb-2 flex flex-col justify-start" style={{ overflow: 'hidden' }}>
        <p
          className="px-3 mb-1.5 mt-1 uppercase"
          style={{ fontSize: 9, fontWeight: 700, color: '#C6CEEC', letterSpacing: '0.1em' }}
        >
          Workspace
        </p>

        <ul style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {navItems.map(({ id, label, icon: Icon }) => {
            const active = activePage === id;
            return (
              <li key={id}>
                <button
                  onClick={() => onNavigate(id)}
                  className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-xl transition-all"
                  style={{
                    fontSize: 13,
                    fontWeight: active ? 600 : 400,
                    color: active ? '#FFFFFF' : itemInactive,
                    background: active ? activeBg : 'transparent',
                    border: active ? `1px solid ${activeBorder}` : '1px solid transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (!active) {
                      (e.currentTarget as HTMLElement).style.background = itemHoverBg;
                      (e.currentTarget as HTMLElement).style.color = itemHoverColor;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!active) {
                      (e.currentTarget as HTMLElement).style.background = 'transparent';
                      (e.currentTarget as HTMLElement).style.color = itemInactive;
                    }
                  }}
                >
                  {active ? (
                    <span
                      className="flex items-center justify-center shrink-0 rounded-lg"
                      style={{ width: 24, height: 24, background: 'rgba(245,197,24,0.9)' }}
                    >
                      <Icon size={13} style={{ color: '#1B2A6E' }} />
                    </span>
                  ) : (
                    <span style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon size={14} />
                    </span>
                  )}
                  <span style={{ lineHeight: 1 }}>{label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer — the account menu. Settings, the theme and signing out all open
          from here instead of taking a row of the nav each. */}
      <div ref={footerRef} className="shrink-0 relative">
        {menuOpen && (
          <div
            role="menu"
            aria-label="Account menu"
            className="absolute rounded-xl overflow-hidden"
            style={{
              bottom: 'calc(100% + 6px)', left: 10, right: 10, zIndex: 40,
              background: menuBg,
              border: `1px solid ${menuBorder}`,
              boxShadow: '0 12px 32px rgba(0,0,0,0.28)',
              padding: 6,
            }}
          >
            {/* Who is signed in */}
            <div className="px-3 pt-2 pb-2.5" style={{ borderBottom: `1px solid ${menuBorder}` }}>
              <p className="truncate" style={{ fontSize: 12.5, fontWeight: 600, color: menuText, lineHeight: 1.3 }}>
                {userName || ROLE_DEFAULT_NAMES[role]}
              </p>
              <p className="truncate" style={{ fontSize: 11, color: menuMuted, lineHeight: 1.4 }}>
                {username ? `${username} · ${ROLE_LABELS[role]}` : ROLE_LABELS[role]}
              </p>
            </div>

            <div style={{ paddingTop: 4 }}>
              {canAccess(role, 'settings') && (
                <MenuItem
                  icon={Settings}
                  label="Settings"
                  active={settingsActive}
                  onClick={() => { setMenuOpen(false); onNavigate('settings'); }}
                  colors={menuColors}
                />
              )}
              <MenuItem
                icon={isDark ? Sun : Moon}
                label={isDark ? 'Light mode' : 'Dark mode'}
                onClick={toggleTheme}
                colors={menuColors}
              />
              <MenuItem
                icon={Info}
                label={`Clinix v${APP_VERSION}`}
                muted
                onClick={() => setMenuOpen(false)}
                colors={menuColors}
              />
            </div>

            <div style={{ borderTop: `1px solid ${menuBorder}`, marginTop: 4, paddingTop: 4 }}>
              <MenuItem
                icon={LogOut}
                label="Log out"
                onClick={() => { setMenuOpen(false); onLogout?.(); }}
                colors={menuColors}
              />
            </div>
          </div>
        )}

        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="w-full flex items-center gap-3 transition-colors"
          style={{
            padding: '12px 16px',
            borderTop: `1px solid ${divider}`,
            background: menuOpen || settingsActive ? 'rgba(255,255,255,0.08)' : 'transparent',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = itemHoverBg; }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background =
              menuOpen || settingsActive ? 'rgba(255,255,255,0.08)' : 'transparent';
          }}
        >
          <span className="text-left min-w-0">
            <span style={{ display: 'block', fontWeight: 700, fontSize: 14, color: '#FFFFFF', lineHeight: 1.2 }}>Clinix</span>
            <span style={{ display: 'block', fontSize: 11, color: '#8FA0DC', lineHeight: 1.3 }}>v{APP_VERSION}</span>
          </span>
          <ChevronDown
            size={16}
            className="ml-auto shrink-0"
            style={{
              color: '#8FA0DC',
              transform: menuOpen ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s ease',
            }}
          />
        </button>
      </div>
    </aside>
  );
}

// ── Account menu row ────────────────────────────────────────────────────────
// The menu sits on a light card rather than the navy, so it carries its own
// colours instead of the sidebar's.

type MenuColors = { text: string; muted: string; hover: string };

function MenuItem({
  icon: Icon, label, onClick, colors, active = false, muted = false,
}: {
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  label: string;
  onClick: () => void;
  colors: MenuColors;
  active?: boolean;
  muted?: boolean;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors text-left"
      style={{
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        color: muted ? colors.muted : colors.text,
        background: active ? colors.hover : 'transparent',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = colors.hover; }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = active ? colors.hover : 'transparent';
      }}
    >
      <Icon size={15} style={{ color: colors.muted }} />
      <span className="truncate">{label}</span>
    </button>
  );
}
