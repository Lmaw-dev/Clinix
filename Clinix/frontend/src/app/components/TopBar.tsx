import { Bell } from 'lucide-react';
import { Page } from '../App';

export function TopBar({
  globalSearch,
  onSearch,
  activePage,
}: {
  globalSearch: string;
  onSearch: (v: string) => void;
  activePage: Page;
}) {
  const isDashboard = activePage === 'dashboard';

  const now = new Date();
  const dateStr = now.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <header
      className="flex items-center shrink-0 px-6"
      style={{
        height: 60,
        background: '#FFFFFF',
        borderBottom: '1px solid #F1F5F9',
        boxShadow: '0 1px 3px 0 rgba(0,0,0,0.04)',
      }}
    >
      {/* Spacer — pushes right-side content to the right */}
      <div className="flex-1" />

      {/* Right side — only visible on dashboard */}
      {isDashboard && (
        <div className="flex items-center gap-3">
          {/* Date pill */}
          <div
            className="hidden sm:flex items-center"
            style={{
              fontSize: 12,
              color: '#64748B',
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: 20,
              padding: '5px 12px',
              fontWeight: 500,
            }}
          >
            {dateStr}
          </div>

          {/* Notification bell */}
          <button
            className="flex items-center justify-center transition-colors"
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              color: '#64748B',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = '#F1F5F9';
              (e.currentTarget as HTMLElement).style.color = '#334155';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = '#F8FAFC';
              (e.currentTarget as HTMLElement).style.color = '#64748B';
            }}
          >
            <Bell size={15} />
          </button>

          {/* Avatar + name */}
          <div className="flex items-center gap-2">
            <div
              className="flex items-center justify-center text-white shrink-0"
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                background: 'linear-gradient(135deg, #3B82F6, #1D4ED8)',
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              AD
            </div>
            <div className="hidden md:block">
              <p style={{ fontSize: 12, fontWeight: 600, color: '#1E293B', lineHeight: 1.2 }}>
                Clinic Admin
              </p>
              <p style={{ fontSize: 10, color: '#94A3B8', lineHeight: 1.2 }}>Administrator</p>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
