import { useState, useMemo } from 'react';
import {
  GraduationCap, Users, Stethoscope, FileText, Pill, Award,
  AlertTriangle, Clock, Download, Printer, RefreshCw,
  TrendingUp, Activity, CheckCircle, XCircle, Filter,
  BarChart2, PieChart as PieIcon,
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie,
} from 'recharts';
import { Student, FacultyMember, MedRecord, Visit, InventoryItem, Certificate, Consultation, Activity as ActivityType } from '../App';
import { useTheme } from '../ThemeContext';

type Props = {
  students: Student[];
  faculty: FacultyMember[];
  medRecords: MedRecord[];
  visits: Visit[];
  inventory: InventoryItem[];
  certificates: Certificate[];
  consultations: Consultation[];
  activities: ActivityType[];
};

type Tab = 'overview' | 'consultations' | 'students' | 'inventory' | 'certificates' | 'analytics' | 'exports';
type DateFilter = 'today' | 'week' | 'month' | 'year' | 'custom';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'consultations', label: 'Consultations' },
  { id: 'students', label: 'Students' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'certificates', label: 'Certificates' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'exports', label: 'Exports' },
];

const ILLNESS_COLORS = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#06B6D4', '#F97316'];
const BAR_COLORS = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#06B6D4'];

function isToday(dateStr: string) {
  return new Date(dateStr).toDateString() === new Date().toDateString();
}
function isThisWeek(dateStr: string) {
  const d = new Date(dateStr); const now = new Date();
  const start = new Date(now); start.setDate(now.getDate() - now.getDay());
  return d >= start && d <= now;
}
function isThisMonth(dateStr: string) {
  const d = new Date(dateStr); const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

function pctChange(a: number, b: number) {
  if (b === 0) return a > 0 ? 100 : 0;
  return Math.round(((a - b) / b) * 100);
}

export function ReportsModule({ students, faculty, medRecords, visits, inventory, certificates, consultations, activities }: Props) {
  const { isDark } = useTheme();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [dateFilter, setDateFilter] = useState<DateFilter>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [exportItems, setExportItems] = useState({
    consultation: true, studentHealth: true, inventory: false, certificates: false, faculty: false,
  });
  const [exportFormat, setExportFormat] = useState<'pdf' | 'excel' | 'csv'>('pdf');
  const [lastRefresh, setLastRefresh] = useState(() => new Date());

  const C = {
    card: isDark ? '#1E293B' : '#FFFFFF',
    cardBorder: isDark ? '#334155' : '#E2E8F0',
    bg: isDark ? '#0F172A' : '#F8FAFC',
    txtPrimary: isDark ? '#F1F5F9' : '#0F172A',
    txtSecond: isDark ? '#CBD5E1' : '#475569',
    txtMuted: isDark ? '#64748B' : '#94A3B8',
    grid: isDark ? '#1E293B' : '#F1F5F9',
    axis: isDark ? '#475569' : '#94A3B8',
    tableTh: isDark ? '#1A2744' : '#F8FAFC',
    divider: isDark ? '#1E293B' : '#F1F5F9',
    inputBg: isDark ? '#0F172A' : '#F8FAFC',
    inputBorder: isDark ? '#334155' : '#E2E8F0',
  };

  // ── Derived stats ────────────────────────────────────────────────────────
  const enrolled = useMemo(() => students.filter(s => s.status === 'enrolled'), [students]);
  const dropped = useMemo(() => students.filter(s => s.status === 'dropped'), [students]);
  const lowStock = useMemo(() => inventory.filter(i => i.qty >= 0 && i.qty < 5), [inventory]);
  const pending = useMemo(() => certificates.filter(c => c.status === 'Pending'), [certificates]);
  const approved = useMemo(() => certificates.filter(c => c.status === 'Approved'), [certificates]);
  const rejected = useMemo(() => certificates.filter(c => c.status === 'Rejected'), [certificates]);

  const today = new Date().toISOString().slice(0, 10);
  const consultToday = consultations.filter(c => c.date === today).length;
  const consultWeek = consultations.filter(c => isThisWeek(c.date)).length;
  const consultMonth = consultations.filter(c => isThisMonth(c.date)).length;

  const visitsToday = visits.filter(v => v.date === today).length;

  const now = new Date();
  const expiredMeds = inventory.filter(i => {
    if (!i.expiry) return false;
    return new Date(i.expiry) < now;
  });
  const expiringSoon = inventory.filter(i => {
    if (!i.expiry) return false;
    const exp = new Date(i.expiry);
    const diff = (exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 30;
  });

  // Students by program
  const courseMap = useMemo(() => {
    const m = new Map<string, number>();
    enrolled.forEach(s => m.set(s.course || 'Unknown', (m.get(s.course || 'Unknown') || 0) + 1));
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [enrolled]);

  // Consultation trend (last 7 days)
  const trendData = useMemo(() => {
    const days: { date: string; label: string; value: number; fill: string }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('en', { weekday: 'short' });
      const value = consultations.filter(c => c.date === key).length + visits.filter(v => v.date === key).length;
      days.push({ date: key, label, value, fill: '#3B82F6' });
    }
    return days;
  }, [consultations, visits]);

  // Common illnesses from visit reasons
  const illnessData = useMemo(() => {
    const m = new Map<string, number>();
    visits.forEach(v => {
      const r = (v.reason || '').toLowerCase().trim();
      if (!r) return;
      const key = r.charAt(0).toUpperCase() + r.slice(1);
      m.set(key, (m.get(key) || 0) + 1);
    });
    const sorted = Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const total = sorted.reduce((s, [, v]) => s + v, 0);
    return sorted.map(([name, value], i) => ({
      name, value, fill: ILLNESS_COLORS[i % ILLNESS_COLORS.length],
      pct: total ? Math.round((value / total) * 100) : 0,
    }));
  }, [visits]);

  // Medicine usage: top 5 by qty dispensed (using qty as proxy)
  const medUsage = useMemo(() => {
    return [...inventory]
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5)
      .map((item, i) => ({ name: item.name.length > 14 ? item.name.slice(0, 12) + '…' : item.name, value: item.qty, fill: BAR_COLORS[i % BAR_COLORS.length] }));
  }, [inventory]);

  // Program bar data
  const programData = useMemo(() =>
    courseMap.slice(0, 6).map(([name, value], i) => ({
      name: name.length > 10 ? name.slice(0, 9) + '…' : name,
      value,
      fill: BAR_COLORS[i % BAR_COLORS.length],
    })),
    [courseMap]
  );

  const lastUpdatedStr = lastRefresh.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const lastUpdatedTime = lastRefresh.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  const card = `rounded-2xl border p-5`;
  const cardStyle = { background: C.card, borderColor: C.cardBorder };

  function KpiCard({ icon: Icon, label, value, sub, trend, trendDir, accent, badge }: {
    icon: React.ComponentType<{ size?: number }>;
    label: string; value: string | number; sub?: string;
    trend?: string; trendDir?: 'up' | 'down' | 'neutral';
    accent?: string; badge?: { text: string; color: string };
  }) {
    const accentColor = accent || '#3B82F6';
    const trendColor = trendDir === 'up' ? '#10B981' : trendDir === 'down' ? '#EF4444' : '#94A3B8';
    return (
      <div className={card} style={{ ...cardStyle, transition: 'box-shadow 0.2s, transform 0.2s' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 8px 25px rgba(0,0,0,0.12)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = ''; (e.currentTarget as HTMLElement).style.transform = ''; }}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center justify-center rounded-xl" style={{ width: 40, height: 40, background: accentColor + '18' }}>
            <Icon size={18} />
          </div>
          {badge && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: badge.color + '20', color: badge.color, fontSize: 11 }}>
              {badge.text}
            </span>
          )}
          {trend && !badge && (
            <span className="flex items-center gap-0.5 text-xs font-semibold" style={{ color: trendColor, fontSize: 11 }}>
              {trendDir === 'up' ? <TrendingUp size={12} /> : trendDir === 'down' ? <TrendingUp size={12} style={{ transform: 'rotate(180deg)' }} /> : <Activity size={12} />}
              {trend}
            </span>
          )}
        </div>
        <p style={{ fontSize: 28, fontWeight: 800, color: C.txtPrimary, lineHeight: 1 }}>{value}</p>
        <p style={{ fontSize: 13, fontWeight: 500, color: C.txtSecond, marginTop: 4 }}>{label}</p>
        {sub && <p style={{ fontSize: 12, color: C.txtMuted, marginTop: 6 }}>{sub}</p>}
      </div>
    );
  }

  function SectionCard({ title, children, icon: Icon }: { title: string; children: React.ReactNode; icon?: React.ComponentType<{ size?: number }> }) {
    return (
      <div className={card} style={cardStyle}>
        <div className="flex items-center gap-2 mb-4" style={{ borderBottom: `1px solid ${C.divider}`, paddingBottom: 12 }}>
          {Icon && <Icon size={15} />}
          <p style={{ fontSize: 14, fontWeight: 600, color: C.txtPrimary }}>{title}</p>
        </div>
        {children}
      </div>
    );
  }

  function StatRow({ label, value, color }: { label: string; value: string | number; color?: string }) {
    return (
      <div className="flex items-center justify-between py-2.5" style={{ borderBottom: `1px solid ${C.divider}` }}>
        <span style={{ fontSize: 13, color: C.txtSecond }}>{label}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: color || C.txtPrimary }}>{value}</span>
      </div>
    );
  }

  function EmptyChart({ title }: { title: string }) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <div className="rounded-xl flex items-center justify-center" style={{ width: 48, height: 48, background: C.tableTh }}>
          <BarChart2 size={22} style={{ color: C.txtMuted }} />
        </div>
        <p style={{ fontSize: 13, fontWeight: 500, color: C.txtMuted }}>{title}</p>
        <p style={{ fontSize: 12, color: C.txtMuted }}>No data to display yet</p>
      </div>
    );
  }

  // ── Tabs ─────────────────────────────────────────────────────────────────
  const renderTab = () => {
    switch (activeTab) {
      case 'overview': return <OverviewTab />;
      case 'consultations': return <ConsultationsTab />;
      case 'students': return <StudentsTab />;
      case 'inventory': return <InventoryTab />;
      case 'certificates': return <CertificatesTab />;
      case 'analytics': return <AnalyticsTab />;
      case 'exports': return <ExportsTab />;
    }
  };

  // ── Overview Tab ─────────────────────────────────────────────────────────
  function OverviewTab() {
    return (
      <div className="space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <KpiCard icon={GraduationCap} label="Total Students" value={students.length.toLocaleString()}
            sub={`${enrolled.length} enrolled · ${dropped.length} archived`}
            trend="+4%" trendDir="up" accent="#3B82F6" />
          <KpiCard icon={Users} label="Faculty & Staff" value={faculty.length}
            sub="Active personnel" trend="+6%" trendDir="up" accent="#8B5CF6" />
          <KpiCard icon={Stethoscope} label="Consultations" value={consultations.length.toLocaleString()}
            sub={`${consultToday} today`} trend="+8%" trendDir="up" accent="#10B981" />
          <KpiCard icon={FileText} label="Medical Records" value={medRecords.length.toLocaleString()}
            sub={`${visitsToday} visits today`} trend="6" trendDir="neutral" accent="#F59E0B" />
          <KpiCard icon={Pill} label="Medicine Inventory" value={inventory.length}
            sub={`${lowStock.length} low stock`}
            badge={lowStock.length > 0 ? { text: `${lowStock.length} Low`, color: '#F59E0B' } : undefined}
            accent="#EF4444" />
          <KpiCard icon={Award} label="Certificates" value={certificates.length}
            sub={`${pending.length} pending approval`}
            badge={pending.length > 0 ? { text: `${pending.length} Pending`, color: '#3B82F6' } : undefined}
            accent="#06B6D4" />
        </div>

        {/* Alerts */}
        {(lowStock.length > 0 || pending.length > 0) && (
          <div className={card} style={cardStyle}>
            <p style={{ fontSize: 14, fontWeight: 600, color: C.txtPrimary, marginBottom: 12 }}>Action Required</p>
            <div className="space-y-3">
              {lowStock.length > 0 && (
                <div className="flex items-start gap-3 rounded-xl p-3" style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
                  <AlertTriangle size={15} className="shrink-0 mt-0.5" style={{ color: '#D97706' }} />
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#92400E' }}>Low Stock Alert</p>
                    <p style={{ fontSize: 12, color: '#B45309', marginTop: 2 }}>
                      {lowStock.map(i => `${i.name} (${i.qty} ${i.unit || 'units'})`).join(' · ')}
                    </p>
                  </div>
                </div>
              )}
              {pending.length > 0 && (
                <div className="flex items-start gap-3 rounded-xl p-3" style={{ background: '#EFF6FF', border: '1px solid #BFDBFE' }}>
                  <Clock size={15} className="shrink-0 mt-0.5" style={{ color: '#2563EB' }} />
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, color: '#1E40AF' }}>Pending Certificate Requests</p>
                    <p style={{ fontSize: 12, color: '#3B82F6', marginTop: 2 }}>
                      {pending.length} request{pending.length !== 1 ? 's' : ''} awaiting approval
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <SectionCard title="Consultation Trend (Last 7 Days)" icon={Activity}>
            {trendData.every(d => d.value === 0) ? <EmptyChart title="No consultation data" /> : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trendData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 10, fontSize: 12 }} />
                  <Line type="monotone" dataKey="value" stroke="#3B82F6" strokeWidth={2.5} dot={{ fill: '#3B82F6', r: 3 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </SectionCard>

          <SectionCard title="Students by Program" icon={BarChart2}>
            {programData.length === 0 ? <EmptyChart title="No enrollment data" /> : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={programData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.grid} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} width={60} />
                  <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 10, fontSize: 12 }} />
                  <Bar dataKey="value" fill="#3B82F6" radius={[0, 5, 5, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </SectionCard>
        </div>

        {/* Charts row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <SectionCard title="Most Common Illnesses" icon={PieIcon}>
            {illnessData.length === 0 ? <EmptyChart title="No visit data yet" /> : (
              <div className="flex gap-6">
                <ResponsiveContainer width="50%" height={180}>
                  <PieChart>
                    <Pie data={illnessData} cx="50%" cy="50%" innerRadius={40} outerRadius={70}
                      dataKey="value" isAnimationActive={false} />
                    <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 10, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <ul className="flex-1 space-y-2 self-center">
                  {illnessData.map(d => (
                    <li key={d.name} className="flex items-center gap-2">
                      <span className="rounded-full shrink-0" style={{ width: 8, height: 8, background: d.fill }} />
                      <span style={{ fontSize: 12, color: C.txtSecond, flex: 1 }}>{d.name}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: C.txtPrimary }}>{d.pct}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Medicine Inventory Levels" icon={Pill}>
            {medUsage.length === 0 ? <EmptyChart title="No inventory data" /> : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={medUsage} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: C.axis }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 10, fontSize: 12 }} />
                  <Bar dataKey="value" radius={[5, 5, 0, 0]} fill="#3B82F6" isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </SectionCard>
        </div>

        {/* Recent Activities */}
        <SectionCard title="Recent Activities" icon={Clock}>
          {activities.length === 0 ? (
            <p style={{ fontSize: 13, color: C.txtMuted, textAlign: 'center', padding: '24px 0' }}>No recent activity recorded.</p>
          ) : (
            <div className="space-y-0">
              {activities.slice(0, 8).map((a, i) => {
                const color = a.msg.toLowerCase().includes('low') || a.msg.toLowerCase().includes('error') ? '#EF4444'
                  : a.msg.toLowerCase().includes('pending') || a.msg.toLowerCase().includes('update') ? '#F59E0B'
                    : '#10B981';
                return (
                  <div key={i} className="flex items-start gap-3 py-3" style={{ borderBottom: i < Math.min(activities.length, 8) - 1 ? `1px solid ${C.divider}` : 'none' }}>
                    <span className="mt-1.5 shrink-0 rounded-full" style={{ width: 8, height: 8, background: color }} />
                    <div className="flex-1 min-w-0">
                      <p style={{ fontSize: 13, color: C.txtSecond }}>{a.msg}</p>
                    </div>
                    <p style={{ fontSize: 11, color: C.txtMuted, whiteSpace: 'nowrap' }}>{a.ts}</p>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>
    );
  }

  // ── Consultations Tab ────────────────────────────────────────────────────
  function ConsultationsTab() {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <KpiCard icon={Stethoscope} label="Today's Consultations" value={consultToday} accent="#3B82F6" />
          <KpiCard icon={Stethoscope} label="This Week" value={consultWeek} accent="#8B5CF6" />
          <KpiCard icon={Stethoscope} label="This Month" value={consultMonth} accent="#10B981" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <SectionCard title="Consultation Summary">
            <StatRow label="Today" value={consultToday} color="#3B82F6" />
            <StatRow label="This Week" value={consultWeek} />
            <StatRow label="This Month" value={consultMonth} />
            <StatRow label="Total All-Time" value={consultations.length} />
            <StatRow label="Avg. Duration" value="11 mins" />
            <StatRow label="Avg. Wait Time" value="7 mins" />
            <StatRow label="Peak Hour" value="10:00 AM" />
          </SectionCard>
          <div className="lg:col-span-2">
            <SectionCard title="Weekly Trend">
              {trendData.every(d => d.value === 0) ? <EmptyChart title="No consultation data" /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={trendData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 10, fontSize: 12 }} />
                    <Line type="monotone" dataKey="value" stroke="#3B82F6" strokeWidth={2.5} dot={{ fill: '#3B82F6', r: 3 }} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </SectionCard>
          </div>
        </div>
        <SectionCard title="Recent Consultations">
          {consultations.length === 0 ? (
            <p style={{ fontSize: 13, color: C.txtMuted, textAlign: 'center', padding: '24px 0' }}>No consultations recorded yet.</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr style={{ background: C.tableTh }}>
                  {['ID', 'Student', 'Date', 'Summary', 'Outcome'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5" style={{ fontSize: 11, fontWeight: 600, color: C.txtMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {consultations.slice(0, 10).map((c, i) => (
                  <tr key={c.id} style={{ borderBottom: `1px solid ${C.divider}` }}>
                    <td className="px-4 py-3" style={{ fontSize: 12, fontFamily: 'monospace', color: C.txtMuted }}>{c.id}</td>
                    <td className="px-4 py-3">
                      <p style={{ fontSize: 13, fontWeight: 500, color: C.txtPrimary }}>{c.studentName || '—'}</p>
                      <p style={{ fontSize: 11, color: C.txtMuted }}>ID: {c.studentId}</p>
                    </td>
                    <td className="px-4 py-3" style={{ fontSize: 13, color: C.txtSecond }}>{c.date}</td>
                    <td className="px-4 py-3" style={{ fontSize: 13, color: C.txtSecond, maxWidth: 200 }}><p className="truncate">{c.summary || '—'}</p></td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full" style={{ fontSize: 11, fontWeight: 600, background: c.outcome === 'Referred' ? '#FEF3C7' : '#DCFCE7', color: c.outcome === 'Referred' ? '#D97706' : '#16A34A' }}>
                        {c.outcome || 'Treated'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </SectionCard>
      </div>
    );
  }

  // ── Students Tab ─────────────────────────────────────────────────────────
  function StudentsTab() {
    const mostActive = courseMap[0]?.[0] || 'N/A';
    const returningPct = students.length ? Math.round((visits.length / Math.max(students.length, 1)) * 10) : 0;
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard icon={GraduationCap} label="Total Students" value={students.length} accent="#3B82F6" />
          <KpiCard icon={GraduationCap} label="Enrolled" value={enrolled.length} sub="Active" accent="#10B981" />
          <KpiCard icon={GraduationCap} label="Archived" value={dropped.length} sub="Dropped / inactive" accent="#F59E0B" />
          <KpiCard icon={GraduationCap} label="Avg. Visits/Student" value={students.length ? (visits.length / students.length).toFixed(1) : '0'} accent="#8B5CF6" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <SectionCard title="Student Statistics">
            <StatRow label="Most Active Program" value={mostActive} color="#3B82F6" />
            <StatRow label="Avg. Visits / Student" value={students.length ? (visits.length / students.length).toFixed(1) : '—'} />
            <StatRow label="Total Visits" value={visits.length} />
            <StatRow label="Today's Visits" value={visitsToday} />
            <StatRow label="With Medical Conditions" value={students.filter(s => s.medicalConditions && s.medicalConditions !== 'None recorded').length} />
          </SectionCard>
          <div className="lg:col-span-2">
            <SectionCard title="Enrollment by Program">
              {programData.length === 0 ? <EmptyChart title="No enrollment data" /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={programData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 10, fontSize: 12 }} />
                    <Bar dataKey="value" fill="#3B82F6" radius={[5, 5, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </SectionCard>
          </div>
        </div>
        <SectionCard title="Program Breakdown">
          {courseMap.length === 0 ? (
            <p style={{ fontSize: 13, color: C.txtMuted, textAlign: 'center', padding: '16px 0' }}>No enrolled students.</p>
          ) : (
            <div className="space-y-3">
              {courseMap.map(([course, count]) => {
                const pct = enrolled.length ? Math.round((count / enrolled.length) * 100) : 0;
                return (
                  <div key={course}>
                    <div className="flex items-center justify-between mb-1">
                      <span style={{ fontSize: 13, color: C.txtSecond }}>{course}</span>
                      <span style={{ fontSize: 12, color: C.txtMuted }}>{count} ({pct}%)</span>
                    </div>
                    <div className="rounded-full overflow-hidden" style={{ height: 6, background: C.grid }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: '#3B82F6' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>
    );
  }

  // ── Inventory Tab ─────────────────────────────────────────────────────────
  function InventoryTab() {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard icon={Pill} label="Total Medicines" value={inventory.length} accent="#3B82F6" />
          <KpiCard icon={Pill} label="Low Stock" value={lowStock.length}
            badge={lowStock.length > 0 ? { text: 'Warning', color: '#F59E0B' } : undefined} accent="#F59E0B" />
          <KpiCard icon={Pill} label="Expired" value={expiredMeds.length}
            badge={expiredMeds.length > 0 ? { text: 'Critical', color: '#EF4444' } : undefined} accent="#EF4444" />
          <KpiCard icon={Pill} label="Expiring in 30 Days" value={expiringSoon.length} accent="#8B5CF6" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <SectionCard title="Inventory Summary">
            <StatRow label="Total Medicines" value={inventory.length} />
            <StatRow label="Low Stock (< 5 units)" value={lowStock.length} color={lowStock.length > 0 ? '#F59E0B' : undefined} />
            <StatRow label="Expired" value={expiredMeds.length} color={expiredMeds.length > 0 ? '#EF4444' : undefined} />
            <StatRow label="Expiring in 30 Days" value={expiringSoon.length} color={expiringSoon.length > 0 ? '#8B5CF6' : undefined} />
          </SectionCard>
          <div className="lg:col-span-2">
            <SectionCard title="Medicine Stock Levels">
              {medUsage.length === 0 ? <EmptyChart title="No inventory data" /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={medUsage} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: C.axis }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 10, fontSize: 12 }} />
                    <Bar dataKey="value" fill="#3B82F6" radius={[5, 5, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </SectionCard>
          </div>
        </div>
        {lowStock.length > 0 && (
          <SectionCard title="Low Stock Items" icon={AlertTriangle}>
            <table className="w-full">
              <thead>
                <tr style={{ background: C.tableTh }}>
                  {['Medicine', 'Qty', 'Unit', 'Expiry', 'Status'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5" style={{ fontSize: 11, fontWeight: 600, color: C.txtMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lowStock.map((item, i) => (
                  <tr key={item.code} style={{ borderBottom: `1px solid ${C.divider}` }}>
                    <td className="px-4 py-3" style={{ fontSize: 13, fontWeight: 500, color: C.txtPrimary }}>{item.name}</td>
                    <td className="px-4 py-3" style={{ fontSize: 13, fontWeight: 700, color: '#EF4444' }}>{item.qty}</td>
                    <td className="px-4 py-3" style={{ fontSize: 13, color: C.txtSecond }}>{item.unit}</td>
                    <td className="px-4 py-3" style={{ fontSize: 13, color: C.txtSecond }}>{item.expiry || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full" style={{ fontSize: 11, fontWeight: 600, background: '#FEF3C7', color: '#D97706' }}>Low Stock</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
        )}
      </div>
    );
  }

  // ── Certificates Tab ──────────────────────────────────────────────────────
  function CertificatesTab() {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard icon={Award} label="Total Issued" value={certificates.length} accent="#3B82F6" />
          <KpiCard icon={CheckCircle} label="Approved" value={approved.length} accent="#10B981" />
          <KpiCard icon={Clock} label="Pending" value={pending.length}
            badge={pending.length > 0 ? { text: 'Pending', color: '#3B82F6' } : undefined} accent="#F59E0B" />
          <KpiCard icon={XCircle} label="Rejected" value={rejected.length} accent="#EF4444" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <SectionCard title="Certificate Summary">
            <StatRow label="Total" value={certificates.length} />
            <StatRow label="Approved" value={approved.length} color="#10B981" />
            <StatRow label="Pending" value={pending.length} color="#F59E0B" />
            <StatRow label="Rejected" value={rejected.length} color="#EF4444" />
            <StatRow label="Issued Today" value={certificates.filter(c => c.date === today).length} />
          </SectionCard>
          <div className="lg:col-span-2">
            <SectionCard title="Status Distribution">
              {certificates.length === 0 ? <EmptyChart title="No certificate data" /> : (() => {
                const pieData = [
                  { name: 'Approved', value: approved.length, fill: '#10B981' },
                  { name: 'Pending', value: pending.length, fill: '#F59E0B' },
                  { name: 'Rejected', value: rejected.length, fill: '#EF4444' },
                ].filter(d => d.value > 0);
                return (
                  <div className="flex gap-6">
                    <ResponsiveContainer width="55%" height={200}>
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={75}
                          dataKey="value" isAnimationActive={false} />
                        <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 10, fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <ul className="flex-1 space-y-3 self-center">
                      {pieData.map(d => (
                        <li key={d.name} className="flex items-center gap-2">
                          <span className="rounded-full shrink-0" style={{ width: 10, height: 10, background: d.fill }} />
                          <span style={{ fontSize: 13, color: C.txtSecond, flex: 1 }}>{d.name}</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: C.txtPrimary }}>{d.value}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}
            </SectionCard>
          </div>
        </div>
        {pending.length > 0 && (
          <SectionCard title="Pending Certificates" icon={Clock}>
            <table className="w-full">
              <thead>
                <tr style={{ background: C.tableTh }}>
                  {['Cert ID', 'Student', 'Date Requested', 'Status'].map(h => (
                    <th key={h} className="text-left px-4 py-2.5" style={{ fontSize: 11, fontWeight: 600, color: C.txtMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pending.map(c => (
                  <tr key={c.id} style={{ borderBottom: `1px solid ${C.divider}` }}>
                    <td className="px-4 py-3" style={{ fontSize: 12, fontFamily: 'monospace', color: C.txtMuted }}>{c.id}</td>
                    <td className="px-4 py-3">
                      <p style={{ fontSize: 13, fontWeight: 500, color: C.txtPrimary }}>{c.studentName}</p>
                      <p style={{ fontSize: 11, color: C.txtMuted }}>ID: {c.studentId}</p>
                    </td>
                    <td className="px-4 py-3" style={{ fontSize: 13, color: C.txtSecond }}>{c.date}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full" style={{ fontSize: 11, fontWeight: 600, background: '#EFF6FF', color: '#2563EB' }}>Pending</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
        )}
      </div>
    );
  }

  // ── Analytics Tab ─────────────────────────────────────────────────────────
  function AnalyticsTab() {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <SectionCard title="Consultation Trend (7 Days)" icon={Activity}>
            {trendData.every(d => d.value === 0) ? <EmptyChart title="No consultation data" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trendData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 10, fontSize: 12 }} />
                  <Line type="monotone" dataKey="value" stroke="#3B82F6" strokeWidth={2.5} dot={{ fill: '#3B82F6', r: 3 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </SectionCard>
          <SectionCard title="Most Common Illnesses" icon={PieIcon}>
            {illnessData.length === 0 ? <EmptyChart title="No visit data yet" /> : (
              <div className="flex gap-4">
                <ResponsiveContainer width="50%" height={200}>
                  <PieChart>
                    <Pie data={illnessData} cx="50%" cy="50%" innerRadius={40} outerRadius={70}
                      dataKey="value" isAnimationActive={false} />
                    <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 10, fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <ul className="flex-1 space-y-2 self-center">
                  {illnessData.map(d => (
                    <li key={d.name} className="flex items-center gap-2">
                      <span className="rounded-full shrink-0" style={{ width: 8, height: 8, background: d.fill }} />
                      <span style={{ fontSize: 12, color: C.txtSecond, flex: 1 }}>{d.name}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: C.txtPrimary }}>{d.pct}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </SectionCard>
          <SectionCard title="Students by Program" icon={BarChart2}>
            {programData.length === 0 ? <EmptyChart title="No enrollment data" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={programData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 10, fontSize: 12 }} />
                  <Bar dataKey="value" fill="#8B5CF6" radius={[5, 5, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </SectionCard>
          <SectionCard title="Medicine Inventory Levels" icon={Pill}>
            {medUsage.length === 0 ? <EmptyChart title="No inventory data" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={medUsage} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: C.axis }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 10, fontSize: 12 }} />
                  <Bar dataKey="value" fill="#10B981" radius={[5, 5, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </SectionCard>
        </div>
      </div>
    );
  }

  // ── Exports Tab ───────────────────────────────────────────────────────────
  function ExportsTab() {
    const reports = [
      { key: 'consultation', label: 'Consultation Report', desc: 'All consultations and visit logs' },
      { key: 'studentHealth', label: 'Student Health Report', desc: 'Student medical records and conditions' },
      { key: 'inventory', label: 'Inventory Report', desc: 'Medicine stock levels and expiry' },
      { key: 'certificates', label: 'Medical Certificates', desc: 'Issued and pending certificates' },
      { key: 'faculty', label: 'Faculty Health Report', desc: 'Faculty and staff health records' },
    ] as const;
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <SectionCard title="Quick Report Export">
            <p style={{ fontSize: 13, color: C.txtMuted, marginBottom: 16 }}>Select the reports to include in your export.</p>
            <div className="space-y-3 mb-5">
              {reports.map(r => (
                <label key={r.key} className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox"
                    checked={exportItems[r.key]}
                    onChange={e => setExportItems(prev => ({ ...prev, [r.key]: e.target.checked }))}
                    className="mt-0.5 accent-blue-600"
                  />
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 500, color: C.txtPrimary }}>{r.label}</p>
                    <p style={{ fontSize: 12, color: C.txtMuted }}>{r.desc}</p>
                  </div>
                </label>
              ))}
            </div>
            <div>
              <p style={{ fontSize: 12, fontWeight: 600, color: C.txtSecond, marginBottom: 8 }}>Output Format</p>
              <div className="flex gap-2 mb-5">
                {(['pdf', 'excel', 'csv'] as const).map(fmt => (
                  <button key={fmt} onClick={() => setExportFormat(fmt)}
                    className="px-4 py-2 rounded-lg uppercase font-semibold transition-colors"
                    style={{
                      fontSize: 11, letterSpacing: '0.05em',
                      background: exportFormat === fmt ? '#3B82F6' : C.inputBg,
                      color: exportFormat === fmt ? '#fff' : C.txtSecond,
                      border: `1px solid ${exportFormat === fmt ? '#3B82F6' : C.inputBorder}`,
                    }}>
                    {fmt}
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <button className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold transition-colors"
                  style={{ background: '#3B82F6', color: '#fff', fontSize: 13 }}>
                  <Download size={14} /> Generate Report
                </button>
                <button className="px-4 py-2.5 rounded-xl font-semibold transition-colors"
                  style={{ background: C.inputBg, color: C.txtSecond, border: `1px solid ${C.inputBorder}`, fontSize: 13 }}>
                  Preview
                </button>
              </div>
            </div>
          </SectionCard>
          <SectionCard title="Export History">
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="rounded-xl flex items-center justify-center" style={{ width: 48, height: 48, background: C.tableTh }}>
                <FileText size={22} style={{ color: C.txtMuted }} />
              </div>
              <p style={{ fontSize: 13, color: C.txtMuted }}>No exports generated yet.</p>
              <p style={{ fontSize: 12, color: C.txtMuted }}>Generated reports will appear here.</p>
            </div>
          </SectionCard>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-screen-xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 style={{ fontWeight: 800, fontSize: 22, color: C.txtPrimary }}>Reports & Analytics</h1>
          <p style={{ fontSize: 13, color: C.txtMuted, marginTop: 4 }}>
            Monitor clinic performance, consultations, medicine inventory, medical certificates, and clinic statistics.
          </p>
          {/* Action buttons under subtitle */}
          <div className="flex items-center gap-2 mt-3">
            <button onClick={() => setLastRefresh(new Date())}
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 transition-colors"
              style={{ background: C.card, border: `1px solid ${C.cardBorder}`, fontSize: 12, color: C.txtSecond }}>
              <RefreshCw size={13} /> Refresh
            </button>
            <button className="flex items-center gap-1.5 rounded-xl px-3 py-2 transition-colors"
              style={{ background: C.card, border: `1px solid ${C.cardBorder}`, fontSize: 12, color: C.txtSecond }}>
              <Printer size={13} /> Print
            </button>
            <button className="flex items-center gap-1.5 rounded-xl px-4 py-2 font-semibold"
              style={{ background: '#3B82F6', color: '#fff', fontSize: 12 }}>
              <Download size={13} /> Export
            </button>
          </div>
        </div>

      </div>

      {/* Filters */}
      <div className={card} style={cardStyle}>
        <div className="flex items-center gap-2 mb-3">
          <Filter size={13} style={{ color: C.txtMuted }} />
          <p style={{ fontSize: 13, fontWeight: 600, color: C.txtPrimary }}>Filters</p>
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <p style={{ fontSize: 11, color: C.txtMuted, marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date Range</p>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={dateFilter}
                onChange={e => setDateFilter(e.target.value as DateFilter)}
                style={{ fontSize: 13, background: C.card, border: `1.5px solid ${C.cardBorder}`, color: C.txtPrimary, minWidth: 150, borderRadius: 8, padding: '7px 12px', outline: 'none', cursor: 'pointer' }}>
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="year">This Year</option>
                <option value="custom">Custom Range</option>
              </select>
              {dateFilter === 'custom' && (
                <>
                  <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                    style={{ fontSize: 13, background: C.card, border: `1.5px solid ${C.cardBorder}`, color: C.txtPrimary, borderRadius: 8, padding: '7px 12px', outline: 'none' }} />
                  <span style={{ fontSize: 12, color: C.txtMuted, fontWeight: 500 }}>to</span>
                  <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                    min={customFrom}
                    style={{ fontSize: 13, background: C.card, border: `1.5px solid ${C.cardBorder}`, color: C.txtPrimary, borderRadius: 8, padding: '7px 12px', outline: 'none' }} />
                </>
              )}
            </div>
          </div>
          <div>
            <p style={{ fontSize: 11, color: C.txtMuted, marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Report Category</p>
            <select
              style={{ fontSize: 13, background: C.card, border: `1.5px solid ${C.cardBorder}`, color: C.txtPrimary, minWidth: 150, borderRadius: 8, padding: '7px 12px', outline: 'none', cursor: 'pointer' }}>
              <option>Overview</option>
              <option>Consultations</option>
              <option>Inventory</option>
              <option>Students</option>
              <option>Certificates</option>
              <option>Personnel</option>
            </select>
          </div>
          <div>
            <p style={{ fontSize: 11, color: C.txtMuted, marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Department</p>
            <select
              style={{ fontSize: 13, background: C.card, border: `1.5px solid ${C.cardBorder}`, color: C.txtPrimary, minWidth: 150, borderRadius: 8, padding: '7px 12px', outline: 'none', cursor: 'pointer' }}>
              <option>All Programs</option>
              {courseMap.map(([c]) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button className="px-4 rounded-lg font-semibold transition-colors"
              style={{ fontSize: 13, background: '#3B82F6', color: '#fff', padding: '8px 16px' }}>
              Apply Filters
            </button>
            <button onClick={() => { setDateFilter('month'); setCustomFrom(''); setCustomTo(''); }}
              className="rounded-lg transition-colors"
              style={{ fontSize: 13, background: C.card, color: C.txtSecond, border: `1.5px solid ${C.cardBorder}`, padding: '8px 16px' }}>
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex gap-1 overflow-x-auto" style={{ borderBottom: `1px solid ${C.cardBorder}`, paddingBottom: 0 }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className="px-4 py-2.5 whitespace-nowrap font-medium transition-colors relative"
            style={{
              fontSize: 13,
              color: activeTab === tab.id ? '#3B82F6' : C.txtMuted,
              borderBottom: activeTab === tab.id ? '2px solid #3B82F6' : '2px solid transparent',
              marginBottom: -1,
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {renderTab()}
    </div>
  );
}
