import {
  LayoutDashboard,
  GraduationCap,
  Users,
  FileText,
  Stethoscope,
  Pill,
  Award,
  MessageSquare,
  BarChart2,
  Settings,
  LogOut,
  Activity,
} from 'lucide-react';
import { Page } from '../App';
import { useTheme } from '../ThemeContext';

const NAV_ITEMS: Array<{
  id: Page;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'students', label: 'Students', icon: GraduationCap },
  { id: 'faculty', label: 'Faculty & Staff', icon: Users },
  { id: 'medical-records', label: 'Medical Records', icon: FileText },
  { id: 'visits', label: 'Visit / History', icon: Stethoscope },
  { id: 'inventory', label: 'Medicine Inventory', icon: Pill },
  { id: 'certificates', label: 'Medical Certificates', icon: Award },
  { id: 'consultations', label: 'Consultation Logs', icon: MessageSquare },
  { id: 'reports', label: 'Reports & Statistics', icon: BarChart2 },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function Sidebar({
  activePage,
  onNavigate,
  onLogout,
}: {
  activePage: Page;
  onNavigate: (p: Page) => void;
  onLogout?: () => void;
}) {
  const { isDark } = useTheme();

  const bg        = isDark ? '#020817' : '#0F172A';
  const divider   = isDark ? '#0F172A' : '#1E293B';
  const itemInactive = '#64748B';
  const itemHoverBg  = 'rgba(255,255,255,0.05)';
  const itemHoverColor = '#CBD5E1';
  const activeBg  = 'rgba(59,130,246,0.18)';
  const activeBorder = 'rgba(59,130,246,0.25)';

  return (
    <aside
      className="flex flex-col shrink-0 h-full overflow-hidden transition-colors"
      style={{ width: 232, background: bg }}
    >
      {/* Brand */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center shrink-0 rounded-xl"
            style={{ width: 36, height: 36, background: 'linear-gradient(135deg, #3B82F6, #1D4ED8)' }}
          >
            <Activity size={17} className="text-white" />
          </div>
          <div>
            <p style={{ fontWeight: 700, fontSize: 14, color: '#F8FAFC', lineHeight: 1.2 }}>Clinix</p>
            <p style={{ fontSize: 10, color: '#64748B', lineHeight: 1.3 }}>BISU Calape Campus</p>
          </div>
        </div>
      </div>

      <div style={{ height: 1, background: divider, margin: '0 12px 8px' }} />

      {/* Nav */}
      <nav className="flex-1 px-3 pb-3 overflow-y-auto" style={{ overflowX: 'hidden' }}>
        <p
          className="px-3 mb-2 mt-2 uppercase"
          style={{ fontSize: 9, fontWeight: 700, color: '#334155', letterSpacing: '0.1em' }}
        >
          Workspace
        </p>

        <ul style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
            const active = activePage === id;
            return (
              <li key={id}>
                <button
                  onClick={() => onNavigate(id)}
                  className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all"
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
                      style={{ width: 26, height: 26, background: 'rgba(59,130,246,0.3)' }}
                    >
                      <Icon size={13} className="text-blue-300" />
                    </span>
                  ) : (
                    <span style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
      <div style={{ padding: '8px 12px 16px', borderTop: `1px solid ${divider}` }}>
        {/* Logout */}
        <button
          onClick={() => onLogout?.()}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all"
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
          <span style={{ width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <LogOut size={14} />
          </span>
          Logout
        </button>
      </div>
    </aside>
  );
}
