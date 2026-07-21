import { useState, useEffect } from 'react';
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
  Bell,
  Search,
  X,
  UserRound,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
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
  InventoryItem,
  Activity as ActivityType,
  Page,
  AdminProfile,
} from '../App';
import { Role, ROLE_LABELS, ROLE_DEFAULT_NAMES, canAccess } from '../auth';
import { useTheme } from '../ThemeContext';
import { Modal } from './Modal';

const PIE_COLORS = ['#3B82F6', '#06B6D4', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444'];

const ILLNESS_META: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  fever:    { label: 'Fever',     bg: '#FEF2F2', text: '#DC2626', dot: '#EF4444' },
  cough:    { label: 'Cough',     bg: '#FFF7ED', text: '#C2410C', dot: '#F97316' },
  headache: { label: 'Headache',  bg: '#FFFBEB', text: '#B45309', dot: '#F59E0B' },
  allergy:  { label: 'Allergy',   bg: '#F0FDF4', text: '#15803D', dot: '#22C55E' },
  asthma:   { label: 'Asthma',    bg: '#EFF6FF', text: '#1D4ED8', dot: '#3B82F6' },
  flu:      { label: 'Flu',       bg: '#F5F3FF', text: '#6D28D9', dot: '#8B5CF6' },
};

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function EmptyChart({ icon: Icon, title, subtitle, iconBg = '#F1F5F9', textColor = '#94A3B8' }: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  subtitle: string;
  iconBg?: string;
  textColor?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center" style={{ height: 180 }}>
      <div
        className="flex items-center justify-center rounded-full mb-3"
        style={{ width: 48, height: 48, background: iconBg }}
      >
        <Icon size={20} className="text-slate-300" />
      </div>
      <p style={{ fontSize: 13, fontWeight: 600, color: textColor }}>{title}</p>
      <p style={{ fontSize: 11, color: '#CBD5E1', marginTop: 4, textAlign: 'center', maxWidth: 180 }}>
        {subtitle}
      </p>
    </div>
  );
}

type Props = {
  students: Student[];
  faculty: FacultyMember[];
  consultations: Consultation[];
  medRecords: MedRecord[];
  inventory: InventoryItem[];
  activities: ActivityType[];
  onNavigate: (p: Page) => void;
  adminProfile: AdminProfile;
  role: Role;
};

type QuickResult = { type: 'Student'; person: Student } | { type: 'Faculty & Staff'; person: FacultyMember };

export function Dashboard({
  students, faculty, consultations, medRecords, inventory, activities, onNavigate, adminProfile, role,
}: Props) {
  const { isDark } = useTheme();

  const displayName = role === 'admin'
    ? (adminProfile.name || ROLE_DEFAULT_NAMES.admin)
    : ROLE_DEFAULT_NAMES[role];
  const roleLabel = ROLE_LABELS[role];

  const C = {
    card:       isDark ? '#1E293B' : '#FFFFFF',
    cardBorder: isDark ? '#334155' : '#E2E8F0',
    cardShadow: isDark ? '0 1px 4px rgba(0,0,0,0.4)' : '0 1px 4px rgba(0,0,0,0.06)',
    txtPrimary: isDark ? '#F1F5F9' : '#0F172A',
    txtSecond:  isDark ? '#CBD5E1' : '#475569',
    txtMuted:   isDark ? '#64748B' : '#94A3B8',
    divider:    isDark ? '#334155' : '#E2E8F0',
    subtle:     isDark ? '#0F172A' : '#F8FAFC',
    subtleBorder: isDark ? '#1E293B' : '#E2E8F0',
    activityDot: isDark ? '#3B82F6' : '#3B82F6',
    tableTh:    isDark ? '#1A2744' : '#F8FAFC',
    chipHoverBg: isDark ? 'rgba(255,255,255,0.05)' : '#F1F5F9',
    axisColor:  isDark ? '#475569' : '#94A3B8',
    gridColor:  isDark ? '#1E293B' : '#F8FAFC',
  };

  const tooltipStyle = {
    fontSize: 12,
    borderRadius: 10,
    border: `1px solid ${C.cardBorder}`,
    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
    background: C.card,
    color: C.txtPrimary,
  };
  const axisStyle = { fontSize: 11, fill: C.axisColor };

  const enrolledCount = students.filter((s) => s.status === 'enrolled').length;

  // Monthly consultations
  const monthlyMap = new Map<string, number>();
  consultations.forEach((c) => {
    const d = new Date(c.date);
    if (!isNaN(d.getTime())) {
      const key = d.toLocaleString(undefined, { month: 'short', year: '2-digit' });
      monthlyMap.set(key, (monthlyMap.get(key) || 0) + 1);
    }
  });
  const monthlyData = Array.from(monthlyMap.entries()).slice(-6).map(([name, value]) => ({ name, value }));
  const hasMonthlyData = monthlyData.some((d) => d.value > 0);

  // Department breakdown
  const deptMap = new Map<string, number>();
  students.filter((s) => s.status === 'enrolled').forEach((s) => {
    const k = s.course || 'Unknown';
    deptMap.set(k, (deptMap.get(k) || 0) + 1);
  });
  const deptData = Array.from(deptMap.entries()).slice(0, 6).map(([name, value], i) => ({
    name,
    value,
    fill: PIE_COLORS[i % PIE_COLORS.length],
  }));
  const hasDeptData = deptData.some((d) => d.value > 0);

  // Illness chips
  const illnessData = Object.entries(ILLNESS_META).map(([keyword, meta]) => ({
    ...meta,
    count: medRecords.filter((r) => r.summary.toLowerCase().includes(keyword)).length,
  }));

  // Illness pie — embed fill in data so no <Cell> children are needed
  const illnessPie = illnessData
    .filter((x) => x.count > 0)
    .map((x) => ({ name: x.label, value: x.count, fill: x.dot }));

  // Low stock alert
  const lowStock = inventory.filter((i) => i.qty >= 0 && i.qty < 5);

  const statCards = [
    { label: 'Enrolled Students', value: enrolledCount, icon: GraduationCap, iconBg: '#EFF6FF', iconColor: '#2563EB', sub: `${students.length} total records` },
    { label: 'Faculty & Staff', value: faculty.length, icon: Users, iconBg: '#F0FDF4', iconColor: '#16A34A', sub: 'Active personnel' },
    { label: 'Consultations', value: consultations.length, icon: Stethoscope, iconBg: '#F5F3FF', iconColor: '#7C3AED', sub: 'Total logged' },
    { label: 'Medical Forms', value: medRecords.length, icon: FileText, iconBg: '#FFF7ED', iconColor: '#C2410C', sub: `${medRecords.filter((r) => r.status === 'Pending').length} pending` },
  ];

  const quickActions = [
    { label: 'Add Student', desc: 'Register a new student', icon: UserPlus, page: 'students' as Page, iconBg: '#EFF6FF', iconColor: '#2563EB' },
    { label: 'New Consultation', desc: 'Log a consultation', icon: Stethoscope, page: 'consultations' as Page, iconBg: '#F5F3FF', iconColor: '#7C3AED' },
    { label: 'Add Medicine', desc: 'Update inventory', icon: Pill, page: 'inventory' as Page, iconBg: '#FFFBEB', iconColor: '#B45309' },
    { label: 'Generate Report', desc: 'View statistics', icon: BarChart2, page: 'reports' as Page, iconBg: '#F0FDF4', iconColor: '#16A34A' },
  ].filter((a) => canAccess(role, a.page));

  const [now, setNow] = useState(() => new Date());
  const [quickSearch, setQuickSearch] = useState('');
  const [selectedPerson, setSelectedPerson] = useState<QuickResult | null>(null);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const dateStr = now.toLocaleDateString(undefined, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const timeStr = now.toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const quickQuery = quickSearch.trim().toLowerCase();
  const quickResults: QuickResult[] = quickQuery ? [
    ...students.filter((s) => [s.name, s.studentId, s.course, s.yearLevel].join(' ').toLowerCase().includes(quickQuery)).map((person) => ({ type: 'Student' as const, person })),
    ...faculty.filter((f) => [f.name, f.staffId, f.college, f.role].join(' ').toLowerCase().includes(quickQuery)).map((person) => ({ type: 'Faculty & Staff' as const, person })),
  ].slice(0, 8) : [];

  return (
    <div style={{ maxWidth: 1200 }}>
      {/* ── Header (sticky holder — stays on top while the dashboard scrolls) ── */}
      <div
        className="flex items-start gap-4"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 30,
          background: C.subtle,
          // bleed over <main>'s p-6 (24px) so the bar sits flush at the very top,
          // spans full width, and covers content scrolling beneath
          margin: '-24px -24px 20px',
          padding: '14px 24px 14px',
          borderBottom: `1px solid ${C.cardBorder}`,
        }}
      >
        <div className="shrink-0">
          <h1 style={{ fontSize: 26, fontWeight: 800, color: C.txtPrimary, lineHeight: 1.2 }}>
            Dashboard
          </h1>
        </div>

        {/* Right: alerts + admin bar */}
        <div className="flex flex-1 items-center gap-3 justify-end">
          {lowStock.length > 0 && (
            <div
              className="flex items-center gap-2"
              style={{
                background: '#FFF7ED',
                border: '1px solid #FED7AA',
                borderRadius: 10,
                padding: '8px 14px',
              }}
            >
              <AlertCircle size={14} style={{ color: '#C2410C' }} />
              <p style={{ fontSize: 12, color: '#C2410C', fontWeight: 600 }}>
                {lowStock.length} low stock item{lowStock.length !== 1 ? 's' : ''}
              </p>
            </div>
          )}

          {/* Quick search — grows to fill the header gap, beside the date */}
          <div className="relative flex-1 min-w-[200px]" style={{ maxWidth: 560 }}>
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={quickSearch}
              onChange={(e) => setQuickSearch(e.target.value)}
              placeholder="Quick search..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-8 text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              style={{ fontSize: 13 }}
            />
            {quickSearch && <button onClick={() => setQuickSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600" aria-label="Clear search"><X size={16} /></button>}
            {quickResults.length > 0 && (
              <div className="absolute left-0 right-0 z-20 mt-2 w-full overflow-hidden rounded-xl border border-blue-100 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-800" style={{ minWidth: 280 }}>
                {quickResults.map((result) => {
                  const person = result.person;
                  return (
                    <button key={result.type === 'Student' ? result.person.studentId : result.person.staffId} onClick={() => { setSelectedPerson(result); setQuickSearch(''); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-blue-50 dark:hover:bg-slate-700">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600"><UserRound size={17} /></div>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-slate-800 dark:text-slate-100" style={{ fontSize: 13, fontWeight: 600 }}>{person.name}</span>
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
              background: C.subtle,
              border: `1px solid ${C.cardBorder}`,
              borderRadius: 20,
              padding: '6px 14px',
            }}
          >
            <span style={{ fontSize: 12, color: C.txtMuted, fontWeight: 500 }}>{dateStr}</span>
            <span style={{ width: 1, height: 12, background: C.txtMuted, opacity: 0.3, display: 'inline-block' }} />
            <span style={{ fontSize: 13, color: C.txtPrimary, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em' }}>{timeStr}</span>
          </div>

          {/* Bell */}
          <button
            className="flex items-center justify-center"
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: C.subtle,
              border: '1px solid #E2E8F0',
              color: C.txtMuted,
              cursor: 'pointer',
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

          {/* Admin avatar */}
          <div className="flex items-center gap-2">
            {role === 'admin' && adminProfile.photo ? (
              <img
                src={adminProfile.photo}
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
                  background: 'linear-gradient(135deg, #3B82F6, #1D4ED8)',
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

      {/* ── Greeting (scrolls with the content, separate from the fixed header) ── */}
      <div style={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 14, boxShadow: C.cardShadow, padding: '18px 22px', marginBottom: 24 }}>
        <p style={{ fontSize: 18, fontWeight: 700, color: C.txtPrimary, lineHeight: 1.2 }}>
          {getGreeting()}, {displayName}
        </p>
        <p style={{ fontSize: 13, color: C.txtMuted, marginTop: 5 }}>
          Here's what's happening at the clinic today.
        </p>
      </div>

      {/* ── Stat cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 }}>
        {statCards.map(({ label, value, icon: Icon, iconBg, iconColor, sub }) => (
          <div
            key={label}
            style={{
              background: C.card,
              borderRadius: 14,
              padding: '20px 20px 18px',
              border: '1px solid #E2E8F0',
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div className="flex items-center justify-between">
              <div
                className="flex items-center justify-center rounded-xl"
                style={{ width: 44, height: 44, background: iconBg }}
              >
                <Icon size={20} style={{ color: iconColor }} />
              </div>
              <TrendingUp size={14} style={{ color: '#CBD5E1' }} />
            </div>
            <div>
              <p style={{ fontSize: 30, fontWeight: 800, color: C.txtPrimary, lineHeight: 1 }}>{value}</p>
              <p style={{ fontSize: 13, fontWeight: 600, color: C.txtSecond, marginTop: 4 }}>{label}</p>
              <p style={{ fontSize: 11, color: C.txtMuted, marginTop: 2 }}>{sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Quick actions ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 24 }}>
        {quickActions.map(({ label, desc, icon: Icon, page, iconBg, iconColor }) => (
          <button
            key={page}
            onClick={() => onNavigate(page)}
            className="text-left transition-all"
            style={{
              background: C.card,
              border: '1px solid #E2E8F0',
              borderRadius: 14,
              padding: '14px 16px',
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)';
              (e.currentTarget as HTMLElement).style.boxShadow = isDark ? '0 4px 16px rgba(0,0,0,0.4)' : '0 4px 16px rgba(0,0,0,0.1)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
              (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
            }}
          >
            <div
              className="flex items-center justify-center rounded-lg mb-3"
              style={{ width: 36, height: 36, background: iconBg }}
            >
              <Icon size={16} style={{ color: iconColor }} />
            </div>
            <p style={{ fontSize: 13, fontWeight: 700, color: C.txtPrimary, lineHeight: 1.2 }}>{label}</p>
            <p style={{ fontSize: 11, color: C.txtMuted, marginTop: 3 }}>{desc}</p>
          </button>
        ))}
      </div>

      {/* ── Charts row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        {/* Monthly consultations */}
        <div
          style={{
            background: C.card,
            borderRadius: 14,
            padding: '20px 20px 16px',
            border: `1px solid ${C.cardBorder}`,
            boxShadow: C.cardShadow,
          }}
        >
          <p style={{ fontSize: 14, fontWeight: 700, color: C.txtPrimary }}>Monthly Consultations</p>
          <p style={{ fontSize: 11, color: C.txtMuted, marginTop: 2, marginBottom: 16 }}>Volume by month</p>
          {hasMonthlyData ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.gridColor} />
                <XAxis dataKey="name" tick={axisStyle} axisLine={false} tickLine={false} />
                <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#3B82F6"
                  strokeWidth={2.5}
                  dot={{ fill: '#3B82F6', r: 4, strokeWidth: 2, stroke: '#fff' }}
                  activeDot={{ r: 6 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart
              icon={Stethoscope}
              title="No consultations yet"
              subtitle="New consultation data will appear here once recorded"
              iconBg={C.tableTh}
              textColor={C.txtMuted}
            />
          )}
        </div>

        {/* Students per program */}
        <div
          style={{
            background: C.card,
            borderRadius: 14,
            padding: '20px 20px 16px',
            border: `1px solid ${C.cardBorder}`,
            boxShadow: C.cardShadow,
          }}
        >
          <p style={{ fontSize: 14, fontWeight: 700, color: C.txtPrimary }}>Students per Program</p>
          <p style={{ fontSize: 11, color: C.txtMuted, marginTop: 2, marginBottom: 16 }}>
            Enrolled students by course
          </p>
          {hasDeptData ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={deptData} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.gridColor} />
                <XAxis dataKey="name" tick={{ ...axisStyle, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={axisStyle} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="value" fill="#3B82F6" radius={[6, 6, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart
              icon={GraduationCap}
              title="No enrollment data"
              subtitle="Add students to see program breakdowns"
              iconBg={C.tableTh}
              textColor={C.txtMuted}
            />
          )}
        </div>
      </div>

      {/* ── Bottom row: Activities + Illness ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 16 }}>
        {/* Recent activities */}
        <div
          style={{
            background: C.card,
            borderRadius: 14,
            padding: '20px 20px',
            border: `1px solid ${C.cardBorder}`,
            boxShadow: C.cardShadow,
          }}
        >
          <p style={{ fontSize: 14, fontWeight: 700, color: C.txtPrimary, marginBottom: 4 }}>
            Recent Activities
          </p>
          <p style={{ fontSize: 11, color: C.txtMuted, marginBottom: 16 }}>
            Latest actions in the clinic system
          </p>
          {activities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8">
              <div
                className="flex items-center justify-center rounded-full mb-3"
                style={{ width: 40, height: 40, background: '#F8FAFC' }}
              >
                <FileText size={18} className="text-slate-300" />
              </div>
              <p style={{ fontSize: 13, color: '#CBD5E1', fontWeight: 500 }}>No recent activities</p>
            </div>
          ) : (
            <ul style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {activities.slice(0, 7).map((a, i) => (
                <li key={`activity-${i}`} className="flex items-start gap-3">
                  <div
                    className="shrink-0 rounded-full"
                    style={{ width: 8, height: 8, background: '#3B82F6', marginTop: 5 }}
                  />
                  <div className="flex-1 min-w-0">
                    <p style={{ fontSize: 13, color: C.txtSecond, lineHeight: 1.4 }}>{a.msg}</p>
                    <p style={{ fontSize: 11, color: C.txtMuted, marginTop: 2 }}>{a.ts}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Common illnesses */}
        <div
          style={{
            background: C.card,
            borderRadius: 14,
            padding: '20px',
            border: `1px solid ${C.cardBorder}`,
            boxShadow: C.cardShadow,
          }}
        >
          <p style={{ fontSize: 14, fontWeight: 700, color: C.txtPrimary, marginBottom: 4 }}>
            Common Illnesses
          </p>
          <p style={{ fontSize: 11, color: C.txtMuted, marginBottom: 16 }}>
            From medical record keywords
          </p>

          {/* Mini donut if any data */}
          {illnessPie.length > 0 && (
            <div style={{ height: 130, marginBottom: 16 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={illnessPie}
                    cx="50%"
                    cy="50%"
                    outerRadius={52}
                    innerRadius={28}
                    dataKey="value"
                    paddingAngle={3}
                    isAnimationActive={false}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Illness chips */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {illnessData.map((item, i) => (
              <div
                key={`illness-chip-${i}`}
                className="flex items-center justify-between rounded-xl px-3 py-2.5"
                style={{ background: item.bg }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="rounded-full shrink-0"
                    style={{ width: 8, height: 8, background: item.dot }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 500, color: item.text }}>{item.label}</span>
                </div>
                <span
                  className="rounded-full px-2 py-0.5"
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: item.text,
                    background: item.count > 0 ? `${item.dot}22` : 'transparent',
                    minWidth: 20,
                    textAlign: 'center',
                  }}
                >
                  {item.count}
                </span>
              </div>
            ))}
          </div>
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
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white"><UserRound size={22} /></div>
              <div><p className="text-slate-900 dark:text-white" style={{ fontSize: 16, fontWeight: 700 }}>{person.name}</p><p className="text-slate-500" style={{ fontSize: 12 }}>{selectedPerson.type}</p></div>
            </div>
            <dl className="divide-y divide-slate-100 dark:divide-slate-700">{details.map(([label, value]) => <div key={label} className="flex gap-4 py-2.5"><dt className="w-32 shrink-0 text-slate-400" style={{ fontSize: 12 }}>{label}</dt><dd className="text-slate-700 dark:text-slate-200" style={{ fontSize: 13, fontWeight: 500 }}>{value || '—'}</dd></div>)}</dl>
          </div>;
        })()}
      </Modal>
    </div>
  );
}
