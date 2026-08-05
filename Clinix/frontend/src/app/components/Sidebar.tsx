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
  Activity,
  ChevronDown,
} from 'lucide-react';

import { Page } from '../App';
import { Role, canAccess } from '../auth';
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
}: {
  role: Role;
  activePage: Page;
  onNavigate: (p: Page) => void;
  onLogout?: () => void;
  certificatesEnabled?: boolean;
}) {
  const { isDark } = useTheme();
  const navItems = NAV_ITEMS.filter((item) =>
    canAccess(role, item.id) && (item.id !== 'certificates' || certificatesEnabled),
  );

  const bg        = isDark ? '#0D1230' : '#1B2A6E';
  const divider   = isDark ? '#131D4D' : '#273685';
  const itemInactive = '#A9B5E1';
  const itemHoverBg  = 'rgba(255,255,255,0.08)';
  const itemHoverColor = '#FFFFFF';
  const activeBg  = 'rgba(245,197,24,0.15)';
  const activeBorder = 'rgba(245,197,24,0.35)';
  const settingsActive = activePage === 'settings';

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

      {/* Bottom actions */}
      <div className="shrink-0" style={{ padding: '6px 12px 12px', borderTop: `1px solid ${divider}` }}>
        {/* Logout */}
        <button
          onClick={() => onLogout?.()}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-xl transition-all"
          style={{ fontSize: 13, color: itemInactive }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = itemHoverBg;
            (e.currentTarget as HTMLElement).style.color = itemHoverColor;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'transparent';
            (e.currentTarget as HTMLElement).style.color = itemInactive;
          }}
        >
          <span style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <LogOut size={14} />
          </span>
          Logout
        </button>
      </div>

      {/* Settings — opened from the version block rather than a labelled nav item */}
      {canAccess(role, 'settings') && (
        <button
          onClick={() => onNavigate('settings')}
          title="Settings"
          aria-label="Settings"
          className="shrink-0 w-full flex items-center gap-3 transition-colors"
          style={{
            padding: '12px 16px',
            borderTop: `1px solid ${divider}`,
            background: settingsActive ? 'rgba(255,255,255,0.06)' : 'transparent',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = itemHoverBg; }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = settingsActive ? 'rgba(255,255,255,0.06)' : 'transparent';
          }}
        >
          <span
            className="flex items-center justify-center shrink-0 rounded-full"
            style={{ width: 34, height: 34, background: '#F5C518' }}
          >
            <Activity size={18} style={{ color: bg }} strokeWidth={2.6} />
          </span>
          <span className="text-left min-w-0">
            <span style={{ display: 'block', fontWeight: 700, fontSize: 14, color: '#FFFFFF', lineHeight: 1.2 }}>Clinix</span>
            <span style={{ display: 'block', fontSize: 11, color: '#8FA0DC', lineHeight: 1.3 }}>v{APP_VERSION}</span>
          </span>
          <ChevronDown
            size={16}
            className="ml-auto shrink-0"
            style={{
              color: '#8FA0DC',
              transform: settingsActive ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s ease',
            }}
          />
        </button>
      )}
    </aside>
  );
}
