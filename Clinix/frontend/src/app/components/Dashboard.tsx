import { useState, useEffect, useMemo } from 'react';
import {
  GraduationCap,
  Users,
  Stethoscope,
  UserPlus,
  Pill,
  BarChart2,
  FileText,
  TrendingUp,
  AlertCircle,
  AlertTriangle,
  Bell,
  Search,
  X,
  UserRound,
  Activity as ActivityIcon,
  Clock,
  PieChart as PieIcon,
  CalendarDays,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
} from 'recharts';
import {
  Student,
  FacultyMember,
  Consultation,
  MedRecord,
  MedForm,
  InventoryItem,
  Activity as ActivityType,
  Page,
} from '../App';
import { Role, ROLE_LABELS, ROLE_DEFAULT_NAMES, canAccess } from '../auth';
import { isoDate, type UserProfile } from '../store';
import { useTheme } from '../ThemeContext';
import { Modal } from './Modal';

const ILLNESS_KEYWORDS: { keyword: string; label: string }[] = [
  { keyword: 'fever', label: 'Fever' },
  { keyword: 'cough', label: 'Cough' },
  { keyword: 'headache', label: 'Headache' },
  { keyword: 'allergy', label: 'Allergy' },
  { keyword: 'asthma', label: 'Asthma' },
  { keyword: 'flu', label: 'Flu' },
];

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function isThisMonth(dateStr: string) {
  const d = new Date(dateStr); const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

type Props = {
  students: Student[];
  faculty: FacultyMember[];
  consultations: Consultation[];
  medRecords: MedRecord[];
  medForms: MedForm[];
  inventory: InventoryItem[];
  activities: ActivityType[];
  onNavigate: (p: Page) => void;
  userProfile: UserProfile;
  role: Role;
  /** Opens the full profile page in the Students module (when the role can access it) */
  onOpenStudentProfile?: (studentId: string) => void;
};

type QuickResult = { type: 'Student'; person: Student } | { type: 'Faculty & Staff'; person: FacultyMember };

/**
 * The header date and time, ticking once a second.
 *
 * This is its own component on purpose. The clock used to be a `now` state on
 * the Dashboard itself, so every tick re-rendered the whole page — including the
 * charts. Recharts rebuilds its layout when it re-renders and its
 * ResponsiveContainer re-measures, which is what made the bars visibly blink
 * once a second. Keeping the ticking state down here means a tick repaints these
 * two spans and nothing else.
 */
function LiveClock({ C }: { C: { txtMuted: string; txtPrimary: string } }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <span style={{ fontSize: 12, color: C.txtMuted, fontWeight: 500 }}>
        {now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
      </span>
      <span style={{ width: 1, height: 12, background: C.txtMuted, opacity: 0.3, display: 'inline-block' }} />
      <span style={{ fontSize: 13, color: C.txtPrimary, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em' }}>
        {now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </span>
    </>
  );
}

export function Dashboard({
  students, faculty, consultations, medRecords, medForms, inventory, activities, onNavigate, userProfile, role,
  onOpenStudentProfile,
}: Props) {
  const { isDark } = useTheme();

  // Every account has its own profile now, so the greeting is the person's own
  // name whatever their role. It used to be admin-only because there was one
  // shared profile and showing it to everyone would have shown them the nurse's.
  const displayName = userProfile.name || ROLE_DEFAULT_NAMES[role];
  const roleLabel = ROLE_LABELS[role];

  const C = {
    card: isDark ? '#161F49' : '#FFFFFF',
    cardBorder: isDark ? '#1B2A6E' : '#DEE3F5',
    bg: isDark ? '#0D1230' : '#EEF1FA',
    txtPrimary: isDark ? '#FFFFFF' : '#0B1437',
    txtSecond: isDark ? '#C6CEEC' : '#1B2A6E',
    txtMuted: isDark ? '#A9B5E1' : '#64748B',
    grid: isDark ? '#1B2A6E' : '#E8ECF7',
    axis: isDark ? '#A9B5E1' : '#64748B',
    tableTh: isDark ? '#131D4D' : '#F5F7FC',
    subtle: isDark ? '#131D4D' : '#F5F7FC',
    divider: isDark ? '#131D4D' : '#EDF0F9',
    inputBg: isDark ? '#0D1230' : '#FFFFFF',
    inputBorder: isDark ? '#1B2A6E' : '#DEE3F5',
    hover: isDark ? '#131D4D' : '#F7F9FD',
  };

  const SERIES = isDark ? '#6C7FC8' : '#37479A';
  const CAT = isDark
    ? ['#6C7FC8', '#D95926', '#1BAF7A', '#C98500', '#D55181', '#2FA84F']
    : ['#37479A', '#EB6834', '#1BAF7A', '#C98500', '#E87BA4', '#008300'];
  const STATUS = {
    good: isDark ? '#2FA84F' : '#0CA30C',
    warn: isDark ? '#E3B10D' : '#C2950A',
    bad: isDark ? '#EF6B6B' : '#D03B3B',
  };
  const ACCENT = {
    green: isDark ? '#34D399' : '#059669',
    blue: isDark ? '#7C9BEF' : '#2563EB',
    orange: isDark ? '#FB923C' : '#EA700B',
    amber: isDark ? '#FBBF24' : '#C98500',
    red: isDark ? '#F87171' : '#DC2626',
    purple: isDark ? '#A78BFA' : '#7C3AED',
  };

  const tooltipStyle = {
    background: C.card,
    border: `1px solid ${C.cardBorder}`,
    borderRadius: 10,
    fontSize: 12,
    boxShadow: '0 8px 24px rgba(13,18,48,0.14)',
    color: C.txtPrimary,
  };

  const card = `rounded-2xl border`;
  const cardStyle = { background: C.card, borderColor: C.cardBorder, boxShadow: isDark ? 'none' : '0 1px 3px rgba(13,18,48,0.04)' };
  const liftIn = (e: React.MouseEvent) => {
    (e.currentTarget as HTMLElement).style.boxShadow = '0 10px 28px rgba(13,18,48,0.12)';
    (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
  };
  const liftOut = (e: React.MouseEvent) => {
    (e.currentTarget as HTMLElement).style.boxShadow = (cardStyle.boxShadow as string) || '';
    (e.currentTarget as HTMLElement).style.transform = '';
  };

  // ── Derived stats ────────────────────────────────────────────────────────
  const enrolledCount = students.filter((s) => s.status === 'enrolled').length;
  const alumniCount = students.filter((s) => s.status === 'graduated').length;
  const droppedCount = students.length - enrolledCount - alumniCount;

  const todayKey = isoDate();
  const consultToday = consultations.filter((c) => c.date === todayKey).length;
  const consultMonth = consultations.filter((c) => isThisMonth(c.date)).length;

  const formCopies = medForms.reduce((n, f) => n + f.entries.length, 0);
  const studentCopies = medForms.reduce((n, f) => n + f.entries.filter((e) => e.ownerType !== 'faculty').length, 0);
  const otherCopies = formCopies - studentCopies;

  // ── Chart data ─────────────────────────────────────────────────────────────
  // Memoised on the collections they are built from, so a re-render caused by
  // something unrelated — a keystroke in Quick Search, opening the bell — hands
  // Recharts the same array it already has instead of a fresh one. Recharts
  // treats a new `data` identity as new data and rebuilds the chart, which is
  // what these panels were doing on every render.

  // Monthly consultations (last 6 months)
  const monthlyData = useMemo(() => {
    const monthlyMap = new Map<string, number>();
    consultations.forEach((c) => {
      const d = new Date(c.date);
      if (!isNaN(d.getTime())) {
        const key = d.toLocaleString(undefined, { month: 'short', year: '2-digit' });
        monthlyMap.set(key, (monthlyMap.get(key) || 0) + 1);
      }
    });
    return Array.from(monthlyMap.entries()).slice(-6).map(([name, value]) => ({ name, value }));
  }, [consultations]);
  const hasMonthlyData = monthlyData.some((d) => d.value > 0);

  // Department breakdown
  const deptData = useMemo(() => {
    const deptMap = new Map<string, number>();
    students.filter((s) => s.status === 'enrolled').forEach((s) => {
      const k = s.course || 'Unknown';
      deptMap.set(k, (deptMap.get(k) || 0) + 1);
    });
    return Array.from(deptMap.entries()).slice(0, 6).map(([name, value]) => ({
      name: name.length > 10 ? name.slice(0, 9) + '…' : name,
      value,
    }));
  }, [students]);
  const hasDeptData = deptData.some((d) => d.value > 0);

  // Common illnesses from medical record keywords
  const illnessData = useMemo(() => ILLNESS_KEYWORDS.map(({ keyword, label }, i) => ({
    label,
    fill: CAT[i % CAT.length],
    count: medRecords.filter((r) => r.summary.toLowerCase().includes(keyword)).length,
  })), [medRecords]);
  const illnessTotal = illnessData.reduce((s, x) => s + x.count, 0);
  const illnessPie = useMemo(() => illnessData
    .filter((x) => x.count > 0)
    .map((x) => ({ name: x.label, value: x.count, fill: x.fill })), [illnessData]);

  // Low stock alert — items actually running low (has some stock, below 5),
  // excluding the archived "Medication (Old)" sheet and uncounted (0-qty) items.
  const lowStock = inventory.filter((i) => !i.archived && i.category !== 'Medication (Old)' && i.qty > 0 && i.qty < 5);

  // ── Notifications (bell) — derived from live clinic data ──
  const daysUntil = (d: string) => (d ? (new Date(d).getTime() - Date.now()) / 86_400_000 : Infinity);
  const liveStock = inventory.filter((i) => !i.archived && i.category !== 'Medication (Old)');
  const expiredItems = liveStock.filter((i) => daysUntil(i.expiry) < 0);
  const expiringItems = liveStock.filter((i) => { const d = daysUntil(i.expiry); return d >= 0 && d < 90; });
  const outOfStock = liveStock.filter((i) => i.qty <= 0);
  const pendingConsults = consultations.filter((c) => (c.consultStatus || 'Pending') === 'Pending');
  const evaluatedConsults = consultations.filter((c) => c.consultStatus === 'Evaluated');

  type Notif = { id: string; tone: 'danger' | 'warn' | 'info'; title: string; detail: string; page: Page };
  const notifications: Notif[] = [
    expiredItems.length && { id: 'expired', tone: 'danger' as const, title: `${expiredItems.length} expired medicine${expiredItems.length !== 1 ? 's' : ''}`, detail: expiredItems.slice(0, 2).map((i) => i.name).join(', ') + (expiredItems.length > 2 ? '…' : ''), page: 'inventory' as Page },
    lowStock.length && { id: 'low', tone: 'warn' as const, title: `${lowStock.length} item${lowStock.length !== 1 ? 's' : ''} low on stock`, detail: lowStock.slice(0, 2).map((i) => `${i.name} (${i.qty})`).join(', ') + (lowStock.length > 2 ? '…' : ''), page: 'inventory' as Page },
    outOfStock.length && { id: 'out', tone: 'warn' as const, title: `${outOfStock.length} item${outOfStock.length !== 1 ? 's' : ''} out of stock`, detail: outOfStock.slice(0, 2).map((i) => i.name).join(', ') + (outOfStock.length > 2 ? '…' : ''), page: 'inventory' as Page },
    expiringItems.length && { id: 'expiring', tone: 'warn' as const, title: `${expiringItems.length} expiring within 3 months`, detail: expiringItems.slice(0, 2).map((i) => i.name).join(', ') + (expiringItems.length > 2 ? '…' : ''), page: 'inventory' as Page },
    pendingConsults.length && { id: 'pending', tone: 'info' as const, title: `${pendingConsults.length} consultation${pendingConsults.length !== 1 ? 's' : ''} awaiting evaluation`, detail: 'Recorded by staff — needs review', page: 'consultations' as Page },
    evaluatedConsults.length && { id: 'evaluated', tone: 'info' as const, title: `${evaluatedConsults.length} evaluated log${evaluatedConsults.length !== 1 ? 's' : ''} to confirm`, detail: 'Add management & treatment, then confirm', page: 'consultations' as Page },
  ].filter(Boolean) as Notif[];

  const visibleNotifs = notifications.filter((n) => canAccess(role, n.page));

  const statCards = [
    { label: 'Enrolled Students', value: enrolledCount, icon: GraduationCap, iconBg: '#EEF1FA', iconColor: '#4C5CAE', sub: `${students.length} total records` },
    { label: 'Faculty & Staff', value: faculty.length, icon: Users, iconBg: '#FCF3CE', iconColor: '#C2950A', sub: 'Active personnel' },
    { label: 'Consultations', value: consultations.length, icon: Stethoscope, iconBg: '#DEE3F5', iconColor: '#37479A', sub: 'Total logged' },
    { label: 'Medical Forms', value: medForms.length, icon: FileText, iconBg: '#FDFAEC', iconColor: '#9C7708', sub: `${medForms.reduce((n, f) => n + f.entries.length, 0)} student copies` },
  ];

  const quickActions = [
    { label: 'Add Student', desc: 'Register a new student', icon: UserPlus, page: 'students' as Page, accent: ACCENT.blue, badge: 0 },
    { label: 'New Consultation', desc: 'Log a consultation', icon: Stethoscope, page: 'consultations' as Page, accent: ACCENT.green, badge: 0 },
    { label: 'Add Medicine', desc: lowStock.length > 0 ? `${lowStock.length} item${lowStock.length !== 1 ? 's' : ''} low on stock` : 'Update inventory', icon: Pill, page: 'inventory' as Page, accent: ACCENT.orange, badge: lowStock.length },
    { label: 'Generate Report', desc: 'View statistics', icon: BarChart2, page: 'reports' as Page, accent: ACCENT.purple, badge: 0 },
  ].filter((a) => canAccess(role, a.page));

  const [notifOpen, setNotifOpen] = useState(false);
  const [quickSearch, setQuickSearch] = useState('');
  const [selectedPerson, setSelectedPerson] = useState<QuickResult | null>(null);

  const quickQuery = quickSearch.trim().toLowerCase();
  const quickResults: QuickResult[] = quickQuery ? [
    ...students.filter((s) => [s.name, s.studentId, s.course, s.yearLevel].join(' ').toLowerCase().includes(quickQuery)).map((person) => ({ type: 'Student' as const, person })),
    ...faculty.filter((f) => [f.name, f.staffId, f.college, f.role].join(' ').toLowerCase().includes(quickQuery)).map((person) => ({ type: 'Faculty & Staff' as const, person })),
  ].slice(0, 8) : [];

  // ── Shared building blocks ───────────────────────────────────────────────
  function KpiCard({ icon: Icon, accent, title, value, badge, note, rows }: {
    icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
    accent: string; title: string; value: string | number;
    badge?: { text: string; color: string };
    note?: string;
    rows?: { color: string; text: string }[];
  }) {
    return (
      <div className={`${card} p-4`} style={{ ...cardStyle, transition: 'box-shadow 0.2s, transform 0.2s' }}
        onMouseEnter={liftIn} onMouseLeave={liftOut}>
        <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex items-center justify-center rounded-xl shrink-0" style={{ width: 38, height: 38, background: accent + '16' }}>
              <Icon size={17} style={{ color: accent }} />
            </span>
            <p style={{ fontSize: 12.5, fontWeight: 600, color: C.txtSecond, lineHeight: 1.3 }}>{title}</p>
          </div>
          {badge && (
            <span className="font-semibold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0" style={{ background: badge.color + '1C', color: badge.color, fontSize: 10.5 }}>
              {badge.text}
            </span>
          )}
        </div>
        <p style={{ fontSize: 27, fontWeight: 800, color: C.txtPrimary, lineHeight: 1.05, letterSpacing: '-0.02em', marginTop: 12 }}>{value}</p>
        {note && <p style={{ fontSize: 11.5, color: C.txtMuted, marginTop: 8 }}>{note}</p>}
        {rows && (
          <ul className="space-y-1.5 mt-3">
            {rows.map(r => (
              <li key={r.text} className="flex items-center gap-2">
                <span className="rounded-full shrink-0" style={{ width: 7, height: 7, background: r.color }} />
                <span style={{ fontSize: 11.5, color: C.txtSecond }}>{r.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  function SummaryItem({ icon: Icon, color, main, sub }: {
    icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
    color: string; main: string; sub: string;
  }) {
    return (
      <div className="flex items-center gap-3 min-w-0">
        <span className="flex items-center justify-center rounded-full shrink-0" style={{ width: 38, height: 38, background: color + '16' }}>
          <Icon size={17} style={{ color }} />
        </span>
        <div className="min-w-0">
          <p style={{ fontSize: 13.5, fontWeight: 700, color: C.txtPrimary }}>{main}</p>
          <p style={{ fontSize: 12, color: C.txtMuted }}>{sub}</p>
        </div>
      </div>
    );
  }

  function SectionCard({ title, subtitle, children, icon: Icon, action }: {
    title: string; subtitle?: string; children: React.ReactNode;
    icon?: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
    action?: React.ReactNode;
  }) {
    return (
      <div className={`${card} p-5`} style={cardStyle}>
        <div className="flex items-center justify-between gap-3 mb-4" style={{ borderBottom: `1px solid ${C.divider}`, paddingBottom: 14 }}>
          <div className="flex items-center gap-2.5 min-w-0">
            {Icon && (
              <span className="flex items-center justify-center rounded-lg shrink-0" style={{ width: 28, height: 28, background: SERIES + '14' }}>
                <Icon size={14} style={{ color: SERIES }} />
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate" style={{ fontSize: 14, fontWeight: 700, color: C.txtPrimary }}>{title}</p>
              {subtitle && <p className="truncate" style={{ fontSize: 12, color: C.txtMuted, marginTop: 1 }}>{subtitle}</p>}
            </div>
          </div>
          {action}
        </div>
        {children}
      </div>
    );
  }

  function EmptyChart({ title, hint }: { title: string; hint?: string }) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3">
        <div className="rounded-xl flex items-center justify-center" style={{ width: 48, height: 48, background: C.tableTh }}>
          <BarChart2 size={22} style={{ color: C.txtMuted }} />
        </div>
        <p style={{ fontSize: 13, fontWeight: 600, color: C.txtSecond }}>{title}</p>
        <p style={{ fontSize: 12, color: C.txtMuted, textAlign: 'center', maxWidth: 260 }}>
          {hint || 'Data will appear here once records are added.'}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-screen-xl">
      {/* ── Header (sticky holder — stays on top while the dashboard scrolls) ── */}
      <div
        className="flex items-start gap-4"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 30,
          background: C.bg,
          // bleed over <main>'s p-6 (24px) so the bar sits flush at the very top,
          // spans full width, and covers content scrolling beneath
          margin: '-24px -24px 20px',
          padding: '14px 24px 14px',
          borderBottom: `1px solid ${C.cardBorder}`,
        }}
      >
        <div className="shrink-0">
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.txtPrimary, lineHeight: 1.2, letterSpacing: '-0.01em' }}>
            Dashboard
          </h1>
        </div>

        {/* Right: admin bar */}
        <div className="flex flex-1 items-center gap-3 justify-end">

          {/* Quick search — grows to fill the header gap, beside the date */}
          <div className="relative flex-1 min-w-[200px]" style={{ maxWidth: 560 }}>
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={quickSearch}
              onChange={(e) => setQuickSearch(e.target.value)}
              placeholder="Quick search..."
              className="w-full rounded-xl border border-blue-100 bg-white py-2 pl-9 pr-8 text-black outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              style={{ fontSize: 13 }}
            />
            {quickSearch && <button onClick={() => setQuickSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600" aria-label="Clear search"><X size={16} /></button>}
            {quickResults.length > 0 && (
              <div className="absolute left-0 right-0 z-20 mt-2 w-full overflow-hidden rounded-xl border border-blue-100 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-800" style={{ minWidth: 280 }}>
                {quickResults.map((result) => {
                  const person = result.person;
                  return (
                    <button
                      key={result.type === 'Student' ? result.person.studentId : result.person.staffId}
                      onClick={() => {
                        setQuickSearch('');
                        // Students open the full profile page in the Students module for a
                        // consistent UI; the modal preview stays as fallback (e.g. faculty).
                        if (result.type === 'Student' && onOpenStudentProfile) onOpenStudentProfile(result.person.studentId);
                        else setSelectedPerson(result);
                      }}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-blue-50 dark:hover:bg-slate-700">
                      {person.photo ? (
                        <img src={person.photo} alt={person.name} className="h-9 w-9 shrink-0 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600"><UserRound size={17} /></div>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-black dark:text-slate-100" style={{ fontSize: 13, fontWeight: 600 }}>{person.name}</span>
                        <span className="block truncate text-slate-500" style={{ fontSize: 12 }}>{result.type === 'Student' ? `${result.person.studentId} · ${result.person.course || 'No course'} · ${result.person.yearLevel || 'No year level'}` : `${result.person.staffId} · ${result.person.role}`}</span>
                      </span>
                      <span className="text-slate-400" style={{ fontSize: 11 }}>{result.type}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Date + live clock pill */}
          <div
            className="flex items-center gap-2"
            style={{
              background: C.card,
              border: `1px solid ${C.cardBorder}`,
              borderRadius: 20,
              padding: '6px 14px',
            }}
          >
            <LiveClock C={C} />
          </div>

          {/* Bell — opens the notification panel */}
          <div className="relative">
            <button
              onClick={() => setNotifOpen((v) => !v)}
              title={visibleNotifs.length ? `${visibleNotifs.length} notification(s)` : 'No new notifications'}
              className="flex items-center justify-center"
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: C.subtle,
                border: '1px solid #DEE3F5',
                color: C.txtMuted,
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = '#EEF1FA';
                (e.currentTarget as HTMLElement).style.color = '#1B2A6E';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = '#EEF1FA';
                (e.currentTarget as HTMLElement).style.color = '#64748B';
              }}
            >
              <Bell size={15} />
            </button>

            {/* Unread count badge */}
            {visibleNotifs.length > 0 && (
              <span
                className="pointer-events-none absolute flex items-center justify-center text-white"
                style={{
                  top: -4, right: -4, minWidth: 17, height: 17, padding: '0 4px',
                  borderRadius: 999, background: '#DC2626', fontSize: 10, fontWeight: 700,
                  border: '2px solid #FFFFFF',
                }}
              >
                {visibleNotifs.length}
              </span>
            )}

            {notifOpen && (
              <>
                {/* click-away layer */}
                <div className="fixed inset-0" style={{ zIndex: 40 }} onClick={() => setNotifOpen(false)} />
                <div
                  className="absolute right-0 mt-2 overflow-hidden rounded-xl border bg-white shadow-xl dark:bg-slate-800"
                  style={{ zIndex: 50, width: 320, borderColor: C.cardBorder }}
                >
                  <div className="flex items-center justify-between border-b px-4 py-2.5" style={{ borderColor: C.cardBorder }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: C.txtPrimary }}>Notifications</p>
                    <button onClick={() => setNotifOpen(false)} className="text-slate-400 hover:text-slate-600" title="Close">
                      <X size={15} />
                    </button>
                  </div>

                  {visibleNotifs.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <Bell size={20} className="mx-auto mb-2 text-slate-300" />
                      <p style={{ fontSize: 12, color: C.txtMuted }}>You're all caught up.</p>
                    </div>
                  ) : (
                    <ul className="max-h-80 overflow-auto">
                      {visibleNotifs.map((n) => {
                        const dot = n.tone === 'danger' ? '#DC2626' : n.tone === 'warn' ? '#D97706' : '#2563EB';
                        return (
                          <li key={n.id}>
                            <button
                              onClick={() => { onNavigate(n.page); setNotifOpen(false); }}
                              className="flex w-full items-start gap-2.5 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50"
                            >
                              <span className="mt-1.5 shrink-0 rounded-full" style={{ width: 7, height: 7, background: dot }} />
                              <span className="min-w-0 flex-1">
                                <span className="block" style={{ fontSize: 12.5, fontWeight: 600, color: C.txtPrimary }}>{n.title}</span>
                                <span className="block truncate" style={{ fontSize: 11, color: C.txtMuted }}>{n.detail}</span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>

          {/* The signed-in user's avatar */}
          <div className="flex items-center gap-2">
            {userProfile.photo ? (
              <img
                src={userProfile.photo}
                alt={displayName}
                style={{ width: 36, height: 36, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }}
              />
            ) : (
              <div
                className="flex items-center justify-center text-white shrink-0"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  background: 'linear-gradient(135deg, #6C7FC8, #37479A)',
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {displayName.split(' ').filter(Boolean).slice(0,2).map(s=>s[0]).join('').toUpperCase() || 'AD'}
              </div>
            )}
            <div className="hidden md:block">
              <p style={{ fontSize: 12, fontWeight: 600, color: C.txtPrimary, lineHeight: 1.2 }}>
                {displayName}
              </p>
              <p style={{ fontSize: 10, color: C.txtMuted, lineHeight: 1.2 }}>{roleLabel}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-5">
        {/* ── Greeting + Today's Summary strip ── */}
        <div className={`${card} px-5 py-4`} style={cardStyle}>
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
            <div className="min-w-0 shrink-0">
              <p style={{ fontSize: 16, fontWeight: 800, color: C.txtPrimary, lineHeight: 1.2, letterSpacing: '-0.01em' }}>
                {getGreeting()}, {displayName}
              </p>
              <p style={{ fontSize: 12, color: C.txtMuted, marginTop: 4 }}>
                Here's what's happening at the clinic today.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-x-8 gap-y-4 ml-auto">
              <SummaryItem icon={Stethoscope} color={ACCENT.green}
                main={consultToday > 0 ? `${consultToday} Consultation${consultToday !== 1 ? 's' : ''}` : 'No consultations'}
                sub="recorded today" />
              <SummaryItem icon={AlertTriangle} color={lowStock.length > 0 ? ACCENT.orange : ACCENT.green}
                main={lowStock.length > 0 ? `${lowStock.length} Medicine${lowStock.length !== 1 ? 's' : ''}` : 'No medicines'}
                sub="need restocking" />
              <SummaryItem icon={CalendarDays} color={ACCENT.blue}
                main={`${consultMonth} Consultation${consultMonth !== 1 ? 's' : ''}`}
                sub="this month" />
            </div>
          </div>
        </div>

        {/* ── KPI cards ── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {/* The headline is the whole roster on file, because that is what the
              clinic is responsible for keeping. The breakdown below it is what
              says how many of those are currently walking the campus. */}
          <KpiCard icon={GraduationCap} accent={ACCENT.blue} title="Student Records"
            value={students.length.toLocaleString()}
            rows={[
              { color: ACCENT.green, text: `${enrolledCount} Enrolled` },
              { color: C.txtMuted, text: `${alumniCount} Alumni · ${droppedCount} Dropped` },
            ]} />
          <KpiCard icon={Users} accent={ACCENT.purple} title="Faculty & Staff"
            value={faculty.length.toLocaleString()}
            rows={[
              { color: ACCENT.green, text: `${faculty.length} Active Personnel` },
              { color: C.txtMuted, text: '0 Inactive' },
            ]} />
          <KpiCard icon={Stethoscope} accent={ACCENT.green} title="Total Consultations"
            value={consultations.length.toLocaleString()}
            note={`${consultToday} today · ${consultMonth} this month`} />
          <KpiCard icon={FileText} accent={ACCENT.amber} title="Medical Forms"
            value={medForms.length.toLocaleString()}
            rows={[
              { color: ACCENT.blue, text: `${studentCopies} Student Copies` },
              { color: C.txtMuted, text: `${otherCopies} Other Copies` },
            ]} />
        </div>

        {/* ── Quick actions ── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {quickActions.map(({ label, desc, icon: Icon, page, accent, badge }) => (
            <button
              key={page}
              onClick={() => onNavigate(page)}
              className={`${card} relative text-left p-4`}
              style={{
                ...cardStyle,
                borderColor: badge > 0 ? ACCENT.orange + '66' : C.cardBorder,
                cursor: 'pointer',
                transition: 'box-shadow 0.2s, transform 0.2s',
              }}
              onMouseEnter={liftIn}
              onMouseLeave={liftOut}
            >
              {badge > 0 && (
                <span
                  className="absolute flex items-center gap-1 font-semibold px-2 py-0.5 rounded-full"
                  style={{ top: 14, right: 14, background: ACCENT.orange + '1C', color: ACCENT.orange, fontSize: 10.5 }}
                >
                  <AlertCircle size={11} />
                  {badge}
                </span>
              )}
              <span
                className="flex items-center justify-center rounded-xl mb-3"
                style={{ width: 38, height: 38, background: accent + '16' }}
              >
                <Icon size={17} style={{ color: accent }} />
              </span>
              <p style={{ fontSize: 13, fontWeight: 700, color: C.txtPrimary, lineHeight: 1.2 }}>{label}</p>
              <p style={{ fontSize: 11.5, color: badge > 0 ? ACCENT.orange : C.txtMuted, marginTop: 3, fontWeight: badge > 0 ? 600 : 400 }}>{desc}</p>
            </button>
          ))}
        </div>

        {/* ── Charts row ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <SectionCard title="Monthly Consultations" subtitle="Volume over the last months" icon={ActivityIcon}>
            {hasMonthlyData ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={monthlyData} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke={C.grid} strokeWidth={1} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} dy={6} />
                  <YAxis tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v, 'Consultations']} />
                  <Area type="monotone" dataKey="value" stroke={ACCENT.green} strokeWidth={2}
                    fill={ACCENT.green} fillOpacity={0.12}
                    dot={{ r: 3.5, fill: ACCENT.green, stroke: C.card, strokeWidth: 2 }}
                    activeDot={{ r: 5, fill: ACCENT.green, stroke: C.card, strokeWidth: 2 }}
                    isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart title="No consultations yet" hint="New consultation data will appear here once recorded." />
            )}
          </SectionCard>

          <SectionCard title="Students per Program" subtitle="Enrolled students by course" icon={GraduationCap}>
            {hasDeptData ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={deptData} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke={C.grid} strokeWidth={1} vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10.5, fill: C.axis }} axisLine={false} tickLine={false} dy={6} />
                  <YAxis tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: C.hover }} formatter={(v: number) => [v, 'Students']} />
                  <Bar dataKey="value" fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyChart title="No enrollment data" hint="Add students to see program breakdowns." />
            )}
          </SectionCard>
        </div>

        {/* ── Bottom row: Activities + Illness ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5">
          <SectionCard title="Recent Activities" subtitle="Latest actions in the clinic system" icon={Clock}>
            {activities.length === 0 ? (
              <p style={{ fontSize: 13, color: C.txtMuted, textAlign: 'center', padding: '24px 0' }}>No recent activity recorded.</p>
            ) : (
              <div>
                {activities.slice(0, 7).map((a, i, arr) => {
                  const color = a.msg.toLowerCase().includes('low') || a.msg.toLowerCase().includes('error') ? STATUS.bad
                    : a.msg.toLowerCase().includes('pending') || a.msg.toLowerCase().includes('update') ? STATUS.warn
                      : STATUS.good;
                  return (
                    <div key={`activity-${i}`} className="flex gap-3.5">
                      {/* timeline rail */}
                      <div className="flex flex-col items-center">
                        <span className="mt-1.5 shrink-0 rounded-full" style={{ width: 9, height: 9, background: color, boxShadow: `0 0 0 3px ${color}22` }} />
                        {i < arr.length - 1 && <span className="flex-1 my-1.5" style={{ width: 2, background: C.divider, borderRadius: 2 }} />}
                      </div>
                      <div className="flex-1 min-w-0 flex items-start justify-between gap-3 pb-4">
                        <p style={{ fontSize: 13, color: C.txtSecond, lineHeight: 1.5 }}>{a.msg}</p>
                        <p style={{ fontSize: 11, color: C.txtMuted, whiteSpace: 'nowrap', marginTop: 2 }}>{a.ts}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Common Illnesses" subtitle="From medical record keywords" icon={PieIcon}>
            {illnessTotal === 0 ? (
              <EmptyChart title="No illness data yet" hint="Illness distribution is built from medical record summaries." />
            ) : (
              <div>
                <div className="relative mx-auto" style={{ width: 160, height: 140 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={illnessPie} cx="50%" cy="50%" innerRadius={44} outerRadius={64}
                        dataKey="value" stroke={C.card} strokeWidth={2} isAnimationActive={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <p style={{ fontSize: 19, fontWeight: 800, color: C.txtPrimary, lineHeight: 1 }}>{illnessTotal}</p>
                    <p style={{ fontSize: 10.5, color: C.txtMuted }}>Total</p>
                  </div>
                </div>
                <ul className="space-y-2 mt-4">
                  {illnessData.map((d) => {
                    const pct = illnessTotal ? Math.round((d.count / illnessTotal) * 100) : 0;
                    return (
                      <li key={d.label} className="flex items-center gap-2.5">
                        <span className="rounded-full shrink-0" style={{ width: 9, height: 9, background: d.fill, opacity: d.count > 0 ? 1 : 0.35 }} />
                        <span className="truncate" style={{ fontSize: 12.5, color: d.count > 0 ? C.txtSecond : C.txtMuted, flex: 1 }}>{d.label}</span>
                        <span style={{ fontSize: 12, color: C.txtMuted, fontVariantNumeric: 'tabular-nums' }}>{d.count}</span>
                        <span style={{ fontSize: 12.5, fontWeight: 700, color: d.count > 0 ? C.txtPrimary : C.txtMuted, width: 38, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </SectionCard>
      </div>
      </div>

      <Modal isOpen={!!selectedPerson} title={`${selectedPerson?.type || ''} Profile`} onClose={() => setSelectedPerson(null)}>
        {selectedPerson && (() => {
          const person = selectedPerson.person;
          const details = selectedPerson.type === 'Student'
            ? [['Student ID', selectedPerson.person.studentId], ['Course', selectedPerson.person.course], ['Year Level', selectedPerson.person.yearLevel], ['Sex', selectedPerson.person.gender], ['Contact Number', selectedPerson.person.contactNumber], ['Medical Conditions', selectedPerson.person.medicalConditions || 'None recorded'], ['Status', selectedPerson.person.status]]
            : [['Staff ID', selectedPerson.person.staffId], ['College', selectedPerson.person.college || '—'], ['Role', selectedPerson.person.role], ['Contact', selectedPerson.person.contact], ['Medical History', selectedPerson.person.medicalHistory || 'None recorded']];
          return <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl bg-blue-50 p-4 dark:bg-slate-700">
              {person.photo ? (
                <img src={person.photo} alt={person.name} className="h-12 w-12 shrink-0 rounded-full object-cover" />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white"><UserRound size={22} /></div>
              )}
              <div><p className="text-black dark:text-white" style={{ fontSize: 16, fontWeight: 700 }}>{person.name}</p><p className="text-slate-500" style={{ fontSize: 12 }}>{selectedPerson.type}</p></div>
            </div>
            <dl className="divide-y divide-slate-100 dark:divide-slate-700">{details.map(([label, value]) => <div key={label} className="flex gap-4 py-2.5"><dt className="w-32 shrink-0 text-slate-400" style={{ fontSize: 12 }}>{label}</dt><dd className="text-black dark:text-slate-200" style={{ fontSize: 13, fontWeight: 500 }}>{value || '—'}</dd></div>)}</dl>
          </div>;
        })()}
      </Modal>
    </div>
  );
}
