import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  GraduationCap, Users, Stethoscope, FileText, Pill, Award,
  AlertTriangle, Clock, Download, Printer, RefreshCw,
  TrendingUp, Activity, CheckCircle, XCircle,
  BarChart2, PieChart as PieIcon, LayoutDashboard, CalendarDays,
  X, Filter,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie,
  AreaChart, Area,
} from 'recharts';
import { Student, FacultyMember, MedRecord, MedForm, InventoryItem, Certificate, Consultation, Activity as ActivityType } from '../App';
import { useTheme } from '../ThemeContext';
import { Role, canExportReports, currentUsername } from '../auth';
import { isoDate } from '../store';
import { useColleges, EMPLOYMENT_CATEGORIES, officesInUse } from '../colleges';
import {
  toCsv, toXlsx, toPrintHtml, printHtml, downloadBlob, reportFilename,
  type ReportTable, type ReportMeta,
} from '../reportExport';

type Props = {
  students: Student[];
  faculty: FacultyMember[];
  medRecords: MedRecord[];
  medForms: MedForm[];
  inventory: InventoryItem[];
  certificates: Certificate[];
  consultations: Consultation[];
  activities: ActivityType[];
  role: Role;
};

type Tab = 'overview' | 'consultations' | 'inventory' | 'certificates';
type DateFilter = 'today' | 'week' | 'month' | 'year' | 'custom';

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'consultations', label: 'Consultations', icon: Stethoscope },
  { id: 'inventory', label: 'Inventory', icon: Pill },
  { id: 'certificates', label: 'Certificates', icon: Award },
];

function isThisWeek(dateStr: string) {
  const d = new Date(dateStr); const now = new Date();
  const start = new Date(now); start.setDate(now.getDate() - now.getDay());
  return d >= start && d <= now;
}
function isThisMonth(dateStr: string) {
  const d = new Date(dateStr); const now = new Date();
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}
function isLastMonth(dateStr: string) {
  const d = new Date(dateStr); const p = new Date();
  p.setMonth(p.getMonth() - 1);
  return d.getMonth() === p.getMonth() && d.getFullYear() === p.getFullYear();
}

function pctChange(a: number, b: number) {
  if (b === 0) return a > 0 ? 100 : 0;
  return Math.round(((a - b) / b) * 100);
}

export function ReportsModule({ students, faculty, inventory, certificates, consultations, role }: Props) {
  const { isDark } = useTheme();
  // Staff read the numbers only. Everything that takes a copy of the records
  // out of the system — export, generate, print — is hidden from them; the
  // filters and tabs stay, since changing what you look at is still looking.
  const canExport = canExportReports(role);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [dateFilter, setDateFilter] = useState<DateFilter>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [exportItems, setExportItems] = useState({
    consultation: true, studentHealth: true, inventory: false, certificates: false, faculty: false,
  });
  const [exportFormat, setExportFormat] = useState<'pdf' | 'excel' | 'csv'>('pdf');
  const [showExport, setShowExport] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(() => new Date());
  const [trendView, setTrendView] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('monthly');
  const [diagRange, setDiagRange] = useState<'month' | 'all'>('month');
  const [deptFilter, setDeptFilter] = useState('all');
  const [programFilter, setProgramFilter] = useState('all');
  const [previewTables, setPreviewTables] = useState<ReportTable[] | null>(null);
  const [exportError, setExportError] = useState('');

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
    divider: isDark ? '#131D4D' : '#EDF0F9',
    inputBg: isDark ? '#0D1230' : '#FFFFFF',
    inputBorder: isDark ? '#1B2A6E' : '#DEE3F5',
    hover: isDark ? '#131D4D' : '#F7F9FD',
  };

  // Series color for single-series charts
  // (validated for contrast against the actual card surfaces)
  const SERIES = isDark ? '#6C7FC8' : '#37479A';
  const STATUS = {
    good: isDark ? '#2FA84F' : '#0CA30C',
    warn: isDark ? '#E3B10D' : '#C2950A',
    bad: isDark ? '#EF6B6B' : '#D03B3B',
  };
  const PRIMARY_BTN = isDark ? '#6C7FC8' : '#37479A';

  // Semantic accent colors for the overview dashboard (light / dark steps)
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

  // ── Who the report is about ───────────────────────────────────────────────
  // The Department and Program filters. Where the date filter answers "when",
  // these answer "whose", so they apply to every person-shaped figure on the
  // page — including the Today / This Week cards and the trend charts, which
  // the date filter deliberately leaves alone. "Today's consultations, CTECH
  // only" is a coherent question in a way that "Today, but for last month" is
  // not.
  //
  // Department covers both populations, from opposite directions:
  //   · a student belongs to a college through their course;
  //   · a faculty member has a college of their own, and an employment
  //     category (Teaching / Non-teaching / Agency). Either can be picked, so
  //     the dropdown offers colleges and staff categories as two groups.
  // Program is a student attribute — a faculty member is not enrolled in one —
  // so choosing a program takes faculty out of scope entirely.

  const collegesList = useColleges();

  /** course code → the college that owns it. */
  const collegeOfCourse = useMemo(() => {
    const m = new Map<string, string>();
    collegesList.forEach(col => col.courses.forEach(course => m.set(course, col.name)));
    return m;
  }, [collegesList]);

  /**
   * The staff categories to offer.
   *
   * The clinic's own list comes first, so the group is there from the start
   * rather than appearing only once somebody has been classified — deriving it
   * purely from the data meant it was invisible on a roster where nobody had a
   * category yet, which is exactly the state a new install is in. Any extra
   * value already on a record (a CSV import with its own wording) is added
   * after it, so nothing on file becomes unfilterable.
   */
  const staffCategories = useMemo(() => {
    const extras = new Set<string>();
    faculty.forEach(f => {
      if (f.employmentCategory && !EMPLOYMENT_CATEGORIES.includes(f.employmentCategory)) {
        extras.add(f.employmentCategory);
      }
    });
    return [...EMPLOYMENT_CATEGORIES, ...Array.from(extras).sort()];
  }, [faculty]);

  /** True when no staff member carries a category yet — used to explain an empty result. */
  const noFacultyClassified = useMemo(
    () => faculty.length > 0 && faculty.every(f => !f.employmentCategory),
    [faculty],
  );

  /**
   * Offices on the roster. For everyone outside a college — registrar, guidance,
   * accounting, the clinic itself — the office *is* the department, so it has to
   * be selectable here or those staff can never be reported on by department.
   */
  const officeOptions = useMemo(() => officesInUse(faculty), [faculty]);

  /** Programs offered by the chosen department, or all of them. */
  const programOptions = useMemo(() => {
    if (deptFilter === 'all') return collegesList.flatMap(c => c.courses);
    return collegesList.find(c => c.name === deptFilter)?.courses ?? [];
  }, [collegesList, deptFilter]);

  // Picking a department can leave the chosen program stranded outside it
  // (CTECH + BEED selects nobody, and looks broken rather than empty).
  useEffect(() => {
    if (programFilter !== 'all' && !programOptions.includes(programFilter)) setProgramFilter('all');
  }, [programOptions, programFilter]);

  const studentById = useMemo(() => new Map(students.map(s => [s.studentId, s])), [students]);
  const facultyById = useMemo(() => new Map(faculty.map(f => [f.staffId, f])), [faculty]);
  const personFilterOff = deptFilter === 'all' && programFilter === 'all';

  const studentInScope = useCallback((s: Student) => {
    if (programFilter !== 'all' && s.course !== programFilter) return false;
    if (deptFilter !== 'all' && collegeOfCourse.get(s.course) !== deptFilter) return false;
    return true;
  }, [deptFilter, programFilter, collegeOfCourse]);

  const facultyInScope = useCallback((f: FacultyMember) => {
    if (programFilter !== 'all') return false; // nobody teaches *in* a program
    if (deptFilter === 'all') return true;
    // Three ways a staff member can belong to the selected department: the
    // college they teach under, the office they work in, or their employment
    // classification. All three are offered in the dropdown.
    return f.college === deptFilter || f.office === deptFilter || f.employmentCategory === deptFilter;
  }, [deptFilter, programFilter]);

  /**
   * A consultation belongs to whoever it was logged against.
   *
   * A walk-in with no record on file cannot be placed in a department at all,
   * so it drops out of a narrowed view rather than being counted under every
   * one of them. With no filter active nothing is resolved and everything
   * counts, which keeps the common case free.
   */
  const consultInScope = useCallback((c: Consultation) => {
    if (personFilterOff) return true;
    if (c.personType === 'faculty') {
      const f = facultyById.get(c.studentId);
      return f ? facultyInScope(f) : false;
    }
    const s = studentById.get(c.studentId);
    return s ? studentInScope(s) : false;
  }, [personFilterOff, facultyById, studentById, facultyInScope, studentInScope]);

  const certInScope = useCallback((c: Certificate) => {
    if (personFilterOff) return true;
    const s = studentById.get(c.studentId);
    return s ? studentInScope(s) : false;
  }, [personFilterOff, studentById, studentInScope]);

  const scopedStudents = useMemo(() => students.filter(studentInScope), [students, studentInScope]);
  const scopedFaculty = useMemo(() => faculty.filter(facultyInScope), [faculty, facultyInScope]);
  const scopedConsultations = useMemo(() => consultations.filter(consultInScope), [consultations, consultInScope]);
  const scopedCerts = useMemo(() => certificates.filter(certInScope), [certificates, certInScope]);

  /** What the two filters currently say, for labels and export headers. */
  const scopeLabel = useMemo(() => {
    const parts: string[] = [];
    if (deptFilter !== 'all') parts.push(deptFilter);
    if (programFilter !== 'all') parts.push(programFilter);
    return parts.length ? parts.join(' · ') : 'All departments';
  }, [deptFilter, programFilter]);

  // ── The reporting period ──────────────────────────────────────────────────
  // Set by the Date filter above the tabs, and applied to everything that
  // counts events. Declared here, above the stats, because they read it.

  const dateRange = useMemo(() => {
    const iso = isoDate;
    const t = new Date();
    const today = new Date(t.getFullYear(), t.getMonth(), t.getDate());

    switch (dateFilter) {
      case 'today':
        return { from: iso(today), to: iso(today), label: 'Today' };
      case 'week': {
        const start = new Date(today);
        start.setDate(today.getDate() - today.getDay());
        return { from: iso(start), to: iso(today), label: 'This Week' };
      }
      case 'year':
        return { from: iso(new Date(today.getFullYear(), 0, 1)), to: iso(today), label: `Year ${today.getFullYear()}` };
      case 'custom': {
        // Either end may be left blank, which reads as open-ended rather than
        // as an empty range — a report "up to 30 June" is a normal request.
        const from = customFrom || '';
        const to = customTo || '';
        const label = from && to ? `${from} to ${to}` : from ? `From ${from}` : to ? `Up to ${to}` : 'All dates';
        return { from, to, label };
      }
      case 'month':
      default:
        return { from: iso(new Date(today.getFullYear(), today.getMonth(), 1)), to: iso(today), label: 'This Month' };
    }
  }, [dateFilter, customFrom, customTo]);

  /** Dates are stored as YYYY-MM-DD, so a string compare is a date compare. */
  const inRange = useCallback((date: string) => {
    if (!date) return false;
    const d = date.slice(0, 10);
    if (dateRange.from && d < dateRange.from) return false;
    if (dateRange.to && d > dateRange.to) return false;
    return true;
  }, [dateRange]);

  // The records that fall inside the period. Everything that counts *events*
  // is derived from these rather than from the full lists.
  //
  // What is NOT narrowed, and why:
  //   · the roster and the stock list describe how things stand right now, so a
  //     date range would only empty them — a student does not stop being
  //     enrolled because you asked about last week;
  //   · the Today / This Week / This Month cards and the trend and diagnosis
  //     charts carry their own stated window, and filtering those would make
  //     their own labels lie;
  //   · pending certificates are a work queue, not a statistic. Narrowing it
  //     would hide the oldest requests — exactly the ones needing attention.
  const periodConsults = useMemo(() => scopedConsultations.filter(c => inRange(c.date)), [scopedConsultations, inRange]);
  const periodCerts = useMemo(() => scopedCerts.filter(c => inRange(c.date)), [scopedCerts, inRange]);

  // ── Derived stats ────────────────────────────────────────────────────────
  // "Active population" means currently enrolled. Graduates and dropped
  // students are excluded from these counts but never from the data itself —
  // their consultations still appear in the historical, per-school-year figures
  // below, which is the whole reason the records are retained.
  const enrolled = useMemo(() => scopedStudents.filter(s => s.status === 'enrolled'), [scopedStudents]);
  const alumni = useMemo(() => scopedStudents.filter(s => s.status === 'graduated'), [scopedStudents]);
  const lowStock = useMemo(() => inventory.filter(i => i.qty >= 0 && i.qty < 5), [inventory]);
  // Pending is a work queue rather than a statistic, so it is deliberately NOT
  // narrowed to the period: the requests most needing attention are the oldest
  // ones, and a date filter would be exactly what hid them.
  const pending = useMemo(() => scopedCerts.filter(c => c.status === 'Pending'), [scopedCerts]);
  // Approved and rejected are throughput — how many were dealt with in the
  // period — so these do follow the filter.
  const approved = useMemo(() => periodCerts.filter(c => c.status === 'Approved'), [periodCerts]);
  const rejected = useMemo(() => periodCerts.filter(c => c.status === 'Rejected'), [periodCerts]);

  const today = isoDate();
  const consultToday = scopedConsultations.filter(c => c.date === today).length;
  const consultWeek = scopedConsultations.filter(c => isThisWeek(c.date)).length;
  const consultMonth = scopedConsultations.filter(c => isThisMonth(c.date)).length;
  const consultLastMonth = scopedConsultations.filter(c => isLastMonth(c.date)).length;
  const consultTrendPct = pctChange(consultMonth, consultLastMonth);

  // Unique patients served in the period, split by person type
  const served = useMemo(() => {
    const stu = new Set<string>(); const fac = new Set<string>();
    periodConsults.forEach(c => {
      const key = c.studentId || c.studentName || c.id;
      if (c.personType === 'faculty') fac.add(key); else stu.add(key);
    });
    return { students: stu.size, faculty: fac.size, total: stu.size + fac.size };
  }, [periodConsults]);

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
    const days: { date: string; label: string; value: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = isoDate(d);
      const label = d.toLocaleDateString('en', { weekday: 'short' });
      const value = scopedConsultations.filter(c => c.date === key).length;
      days.push({ date: key, label, value });
    }
    return days;
  }, [scopedConsultations]);

  // Consultations by department in the period (faculty grouped together)
  const deptData = useMemo(() => {
    const byId = new Map(students.map(s => [s.studentId, s.course]));
    const m = new Map<string, number>();
    periodConsults.forEach(c => {
      let dept = c.personType === 'faculty'
        ? 'Faculty & Staff'
        : (byId.get(c.studentId) || c.courseOrOffice || 'Other').trim();
      if (!dept) dept = 'Other';
      m.set(dept, (m.get(dept) || 0) + 1);
    });
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6)
      .map(([name, value]) => ({ name, value }));
  }, [periodConsults, students]);

  // Medicine stock levels: top 5 by qty
  const medUsage = useMemo(() => {
    return [...inventory]
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5)
      .map(item => ({ name: item.name.length > 14 ? item.name.slice(0, 12) + '…' : item.name, value: item.qty }));
  }, [inventory]);

  // Consultations over time — daily / weekly / monthly / yearly buckets
  const trendSeries = useMemo(() => {
    const out: { label: string; value: number }[] = [];
    const nowD = new Date();
    const count = (from: Date, to: Date) => scopedConsultations.filter(c => {
      const d = new Date(c.date);
      return d >= from && d < to;
    }).length;
    if (trendView === 'daily') {
      for (let i = 13; i >= 0; i--) {
        const d = new Date(nowD); d.setDate(nowD.getDate() - i);
        const key = isoDate(d);
        out.push({
          label: d.toLocaleDateString('en', { month: 'short', day: 'numeric' }),
          value: scopedConsultations.filter(c => c.date === key).length,
        });
      }
    } else if (trendView === 'weekly') {
      const start = new Date(nowD); start.setHours(0, 0, 0, 0);
      start.setDate(start.getDate() - start.getDay());
      for (let w = 7; w >= 0; w--) {
        const s = new Date(start); s.setDate(start.getDate() - w * 7);
        const e = new Date(s); e.setDate(s.getDate() + 7);
        out.push({ label: s.toLocaleDateString('en', { month: 'short', day: 'numeric' }), value: count(s, e) });
      }
    } else if (trendView === 'monthly') {
      for (let i = 11; i >= 0; i--) {
        const s = new Date(nowD.getFullYear(), nowD.getMonth() - i, 1);
        const e = new Date(s.getFullYear(), s.getMonth() + 1, 1);
        out.push({ label: s.toLocaleDateString('en', { month: 'short' }), value: count(s, e) });
      }
    } else {
      for (let i = 4; i >= 0; i--) {
        const y = nowD.getFullYear() - i;
        out.push({ label: String(y), value: count(new Date(y, 0, 1), new Date(y + 1, 0, 1)) });
      }
    }
    return out;
  }, [scopedConsultations, trendView]);

  // Inventory health: expired → low stock → near expiry → healthy
  const invHealth = useMemo(() => {
    const t = new Date();
    let healthy = 0, low = 0, expired = 0, near = 0;
    inventory.forEach(i => {
      const exp = i.expiry ? new Date(i.expiry) : null;
      const daysLeft = exp ? (exp.getTime() - t.getTime()) / 86400000 : Infinity;
      if (exp && exp < t) expired++;
      else if (i.qty < 5) low++;
      else if (daysLeft <= 30) near++;
      else healthy++;
    });
    return { healthy, low, expired, near };
  }, [inventory]);

  // Top diagnoses from consultation reasons (this month or all time)
  const diagData = useMemo(() => {
    const src = diagRange === 'month' ? scopedConsultations.filter(c => isThisMonth(c.date)) : scopedConsultations;
    const m = new Map<string, number>();
    src.forEach(c => {
      const r = (c.reason || '').toLowerCase().trim();
      if (!r) return;
      const key = r.charAt(0).toUpperCase() + r.slice(1);
      m.set(key, (m.get(key) || 0) + 1);
    });
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([name, value]) => ({ name, value }));
  }, [scopedConsultations, diagRange]);

  // Program bar data
  const programData = useMemo(() =>
    courseMap.slice(0, 6).map(([name, value]) => ({
      name: name.length > 10 ? name.slice(0, 9) + '…' : name,
      value,
    })),
    [courseMap]
  );

  const lastUpdatedStr = lastRefresh.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const lastUpdatedTime = lastRefresh.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  const card = `rounded-2xl border`;
  const cardStyle = { background: C.card, borderColor: C.cardBorder, boxShadow: isDark ? 'none' : '0 1px 3px rgba(13,18,48,0.04)' };

  const filterCtl: React.CSSProperties = {
    fontSize: 12, background: C.inputBg, border: `1px solid ${C.inputBorder}`,
    color: C.txtPrimary, borderRadius: 8, padding: '6px 10px', outline: 'none',
  };

  const miniSelect: React.CSSProperties = {
    fontSize: 11.5, fontWeight: 500, background: C.inputBg, border: `1px solid ${C.inputBorder}`,
    color: C.txtSecond, borderRadius: 8, padding: '4px 8px', outline: 'none', cursor: 'pointer',
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11, color: C.txtMuted, marginBottom: 6, fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.06em',
  };

  // ── Shared building blocks ───────────────────────────────────────────────
  function KpiCard({ icon: Icon, label, value, sub, trend, trendDir, accent, badge }: {
    icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
    label: string; value: string | number; sub?: string;
    trend?: string; trendDir?: 'up' | 'down' | 'neutral';
    accent?: string; badge?: { text: string; color: string };
  }) {
    const accentColor = accent || SERIES;
    const trendColor = trendDir === 'up' ? STATUS.good : trendDir === 'down' ? STATUS.bad : C.txtMuted;
    return (
      <div className={`${card} p-5`} style={{ ...cardStyle, transition: 'box-shadow 0.2s, transform 0.2s' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 10px 28px rgba(13,18,48,0.12)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = (cardStyle.boxShadow as string) || ''; (e.currentTarget as HTMLElement).style.transform = ''; }}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center justify-center rounded-xl shrink-0" style={{ width: 42, height: 42, background: accentColor + '16' }}>
            <Icon size={19} style={{ color: accentColor }} />
          </div>
          {badge && (
            <span className="font-semibold px-2.5 py-1 rounded-full" style={{ background: badge.color + '1C', color: badge.color, fontSize: 11 }}>
              {badge.text}
            </span>
          )}
          {trend && !badge && (
            <span className="flex items-center gap-1 font-semibold px-2 py-1 rounded-full" style={{ color: trendColor, background: trendColor + '14', fontSize: 11 }}>
              {trendDir === 'up' ? <TrendingUp size={12} /> : trendDir === 'down' ? <TrendingUp size={12} style={{ transform: 'scaleY(-1)' }} /> : <Activity size={12} />}
              {trend}
            </span>
          )}
        </div>
        <p style={{ fontSize: 28, fontWeight: 800, color: C.txtPrimary, lineHeight: 1.05, letterSpacing: '-0.02em' }}>{value}</p>
        <p style={{ fontSize: 13, fontWeight: 600, color: C.txtSecond, marginTop: 6 }}>{label}</p>
        {sub && <p style={{ fontSize: 12, color: C.txtMuted, marginTop: 4 }}>{sub}</p>}
      </div>
    );
  }

  function OverviewKpi({ icon: Icon, accent, title, value, badge, deltaPct, note, rows }: {
    icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
    accent: string; title: string; value: string | number;
    badge?: { text: string; color: string };
    deltaPct?: number; note?: string;
    rows?: { color: string; text: string }[];
  }) {
    return (
      <div className={`${card} p-4`} style={{ ...cardStyle, transition: 'box-shadow 0.2s, transform 0.2s' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 10px 28px rgba(13,18,48,0.12)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = (cardStyle.boxShadow as string) || ''; (e.currentTarget as HTMLElement).style.transform = ''; }}>
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
        {deltaPct !== undefined && (
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            <span className="flex items-center gap-1 font-semibold px-1.5 py-0.5 rounded-full"
              style={{ fontSize: 10.5, color: deltaPct >= 0 ? STATUS.good : STATUS.bad, background: (deltaPct >= 0 ? STATUS.good : STATUS.bad) + '14' }}>
              <TrendingUp size={11} style={deltaPct < 0 ? { transform: 'scaleY(-1)' } : undefined} />
              {Math.abs(deltaPct)}%
            </span>
            <span style={{ fontSize: 11, color: C.txtMuted }}>vs last month</span>
          </div>
        )}
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

  // Horizontal HTML bar list — single hue, values in ink (not series color)
  function HBarList({ data, color, labelWidth = 130 }: {
    data: { name: string; value: number }[]; color: string; labelWidth?: number;
  }) {
    const max = Math.max(...data.map(d => d.value), 1);
    return (
      <div className="space-y-3">
        {data.map(d => (
          <div key={d.name} className="flex items-center gap-3">
            <span className="truncate shrink-0" title={d.name}
              style={{ width: labelWidth, fontSize: 12.5, color: C.txtSecond, textAlign: 'right' }}>
              {d.name}
            </span>
            <div className="flex-1 rounded-full overflow-hidden" style={{ height: 10, background: color + '14' }}>
              <div className="h-full rounded-full" style={{ width: `${Math.max((d.value / max) * 100, 2)}%`, background: color, transition: 'width 0.4s ease' }} />
            </div>
            <span className="shrink-0" style={{ width: 34, textAlign: 'right', fontSize: 13, fontWeight: 700, color: C.txtPrimary, fontVariantNumeric: 'tabular-nums' }}>
              {d.value}
            </span>
          </div>
        ))}
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

  function StatRow({ label, value, color }: { label: string; value: string | number; color?: string }) {
    return (
      <div className="flex items-center justify-between py-2.5" style={{ borderBottom: `1px solid ${C.divider}` }}>
        <span style={{ fontSize: 13, color: C.txtSecond }}>{label}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: color || C.txtPrimary, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      </div>
    );
  }

  function StatusChip({ text, color }: { text: string; color: string }) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full" style={{ fontSize: 11, fontWeight: 600, background: color + '18', color }}>
        <span className="rounded-full" style={{ width: 6, height: 6, background: color }} />
        {text}
      </span>
    );
  }

  function EmptyChart({ title, hint }: { title: string; hint?: string }) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
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

  function ReportTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
    return (
      <div className="overflow-x-auto rounded-xl" style={{ border: `1px solid ${C.divider}` }}>
        <table className="w-full" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: C.tableTh }}>
              {headers.map(h => (
                <th key={h} className="text-left px-4 py-3" style={{ fontSize: 11, fontWeight: 600, color: C.txtMuted, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    );
  }

  function Tr({ children }: { children: React.ReactNode }) {
    return (
      <tr style={{ borderTop: `1px solid ${C.divider}`, transition: 'background 0.15s' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = C.hover; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; }}>
        {children}
      </tr>
    );
  }

  // ── Shared charts ────────────────────────────────────────────────────────
  function TrendChart({ height = 220 }: { height?: number }) {
    if (trendData.every(d => d.value === 0)) {
      return <EmptyChart title="No consultation data" hint="Start recording consultations to generate the weekly trend." />;
    }
    return (
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={trendData} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
          <CartesianGrid stroke={C.grid} strokeWidth={1} vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} dy={6} />
          <YAxis tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: C.txtMuted, fontSize: 11 }} formatter={(v: number) => [v, 'Consultations']} />
          <Area type="monotone" dataKey="value" stroke={SERIES} strokeWidth={2}
            fill={SERIES} fillOpacity={0.09}
            dot={{ r: 3.5, fill: SERIES, stroke: C.card, strokeWidth: 2 }}
            activeDot={{ r: 5, fill: SERIES, stroke: C.card, strokeWidth: 2 }}
            isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    );
  }

  function ProgramChart({ height = 220, horizontal = false }: { height?: number; horizontal?: boolean }) {
    if (programData.length === 0) {
      return <EmptyChart title="No enrollment data" hint="Enroll students to see the distribution by program." />;
    }
    if (horizontal) {
      return (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={programData} layout="vertical" margin={{ top: 0, right: 28, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={C.grid} strokeWidth={1} horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} allowDecimals={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} width={72} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: C.hover }} formatter={(v: number) => [v, 'Students']} />
            <Bar dataKey="value" fill={SERIES} radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      );
    }
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={programData} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
          <CartesianGrid stroke={C.grid} strokeWidth={1} vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} dy={6} />
          <YAxis tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: C.hover }} formatter={(v: number) => [v, 'Students']} />
          <Bar dataKey="value" fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  function MedicineChart({ height = 220 }: { height?: number }) {
    if (medUsage.length === 0) {
      return <EmptyChart title="No inventory data" hint="Add medicines to the inventory to see stock levels." />;
    }
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={medUsage} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
          <CartesianGrid stroke={C.grid} strokeWidth={1} vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 10, fill: C.axis }} axisLine={false} tickLine={false} dy={6} />
          <YAxis tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: C.hover }} formatter={(v: number) => [v, 'In stock']} />
          <Bar dataKey="value" fill={SERIES} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  // ── Tabs ─────────────────────────────────────────────────────────────────
  const renderTab = () => {
    switch (activeTab) {
      case 'overview': return <OverviewTab />;
      case 'consultations': return <ConsultationsTab />;
      case 'inventory': return <InventoryTab />;
      case 'certificates': return <CertificatesTab />;
    }
  };

  // ── Overview Tab ─────────────────────────────────────────────────────────
  function OverviewTab() {
    return (
      <div className="space-y-5">
        {/* KPI Cards — 4 only: consultations, patients, inventory, certificates */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          <OverviewKpi icon={Stethoscope} accent={ACCENT.blue} title="Consultations"
            value={periodConsults.length.toLocaleString()}
            deltaPct={consultTrendPct}
            note={`${dateRange.label} · ${scopedConsultations.length.toLocaleString()} all-time`} />
          <OverviewKpi icon={Users} accent={ACCENT.green} title="Patients Served"
            value={served.total.toLocaleString()}
            rows={[
              { color: ACCENT.blue, text: `${served.students} Students` },
              { color: ACCENT.green, text: `${served.faculty} Faculty` },
            ]} />
          <OverviewKpi icon={Pill}
            accent={lowStock.length > 0 || expiredMeds.length > 0 ? ACCENT.orange : ACCENT.green}
            title="Inventory Status"
            value={inventory.length}
            badge={expiredMeds.length > 0 ? { text: 'Critical', color: ACCENT.red }
              : lowStock.length > 0 ? { text: 'Warning', color: ACCENT.orange } : undefined}
            rows={[
              { color: ACCENT.green, text: `${invHealth.healthy} Healthy Stock` },
              { color: ACCENT.orange, text: `${invHealth.low} Low Stock` },
              { color: ACCENT.red, text: `${invHealth.expired} Expired` },
            ]} />
          <OverviewKpi icon={Award}
            accent={pending.length > 0 ? ACCENT.orange : ACCENT.blue}
            title="Certificates Issued"
            value={approved.length}
            badge={pending.length > 0 ? { text: 'Needs Action', color: ACCENT.orange } : undefined}
            rows={[
              // Pending is the standing queue, not a figure for this period —
              // hence "all", so the two numbers are not read as one total.
              { color: ACCENT.orange, text: `${pending.length} Pending (all)` },
              { color: C.txtMuted, text: `${periodCerts.length} Requests · ${dateRange.label}` },
            ]} />
        </div>

        {/* Consultation Trend — one large chart */}
        <SectionCard title="Consultations Over Time" subtitle="Consultation volume trend" icon={Activity}
          action={
            <select value={trendView} onChange={e => setTrendView(e.target.value as typeof trendView)} style={miniSelect}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          }>
          {trendSeries.every(d => d.value === 0)
            ? <EmptyChart title="No consultation data" hint="Start recording consultations to see the trend." />
            : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={trendSeries} margin={{ top: 8, right: 12, left: -14, bottom: 0 }}>
                  <CartesianGrid stroke={C.grid} strokeWidth={1} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} dy={6} />
                  <YAxis tick={{ fontSize: 11, fill: C.axis }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v, 'Consultations']} />
                  <Area type="monotone" dataKey="value" stroke={SERIES} strokeWidth={2}
                    fill={SERIES} fillOpacity={0.1}
                    dot={{ r: 3, fill: SERIES, stroke: C.card, strokeWidth: 2 }}
                    activeDot={{ r: 5, fill: SERIES, stroke: C.card, strokeWidth: 2 }}
                    isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
        </SectionCard>

        {/* Top Diagnoses | Medicine Inventory */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <SectionCard title="Top Diagnoses" subtitle="Most common consultation reasons" icon={BarChart2}
            action={
              <select value={diagRange} onChange={e => setDiagRange(e.target.value as 'month' | 'all')} style={miniSelect}>
                <option value="month">This Month</option>
                <option value="all">All Time</option>
              </select>
            }>
            {diagData.length === 0
              ? <EmptyChart title="No diagnosis data" hint="Consultation reasons will be ranked here." />
              : <HBarList data={diagData} color={ACCENT.blue} />}
          </SectionCard>

          <SectionCard title="Medicine Inventory" subtitle="Stock health at a glance" icon={PieIcon}>
            {inventory.length === 0 ? <EmptyChart title="No inventory data" /> : (() => {
              const dist = [
                { name: 'Healthy Stock', value: invHealth.healthy, fill: ACCENT.green },
                { name: 'Near Expiry', value: invHealth.near, fill: ACCENT.amber },
                { name: 'Low Stock', value: invHealth.low, fill: ACCENT.orange },
                { name: 'Expired', value: invHealth.expired, fill: ACCENT.red },
              ];
              const shown = dist.filter(d => d.value > 0);
              return (
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <div className="relative shrink-0" style={{ width: 170, height: 170 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={shown} cx="50%" cy="50%" innerRadius={52} outerRadius={78}
                          dataKey="value" stroke={C.card} strokeWidth={2} isAnimationActive={false} />
                        <Tooltip contentStyle={tooltipStyle} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <p style={{ fontSize: 22, fontWeight: 800, color: C.txtPrimary, lineHeight: 1 }}>{inventory.length}</p>
                      <p style={{ fontSize: 11, color: C.txtMuted }}>Medicines</p>
                    </div>
                  </div>
                  <ul className="flex-1 w-full space-y-2.5">
                    {dist.map(d => (
                      <li key={d.name} className="flex items-center gap-2.5">
                        <span className="rounded-full shrink-0" style={{ width: 9, height: 9, background: d.fill }} />
                        <span style={{ fontSize: 13, color: C.txtSecond, flex: 1 }}>{d.name}</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: C.txtPrimary, fontVariantNumeric: 'tabular-nums' }}>{d.value}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}
          </SectionCard>
        </div>

        {/* Department Comparison */}
        <SectionCard title="Consultations by Department" subtitle="Where consultations come from" icon={GraduationCap}>
          {deptData.length === 0
            ? <EmptyChart title="No consultation data" hint="Departments will be compared once consultations are recorded." />
            : <HBarList data={deptData} color={ACCENT.blue} labelWidth={150} />}
        </SectionCard>

        {/* Clinic Alerts */}
        <SectionCard title="Clinic Alerts" subtitle="What needs attention" icon={AlertTriangle}>
          {(() => {
            const alerts: { level: 'critical' | 'warn' | 'ok' | 'info'; text: string }[] = [
              expiredMeds.length > 0
                ? { level: 'critical', text: `${expiredMeds.length} medicine${expiredMeds.length !== 1 ? 's are' : ' is'} expired — remove from stock` }
                : { level: 'ok', text: 'No expired medicines in stock' },
              lowStock.length > 0
                ? { level: 'warn', text: `${lowStock.length} medicine${lowStock.length !== 1 ? 's are' : ' is'} low on stock` }
                : { level: 'ok', text: 'All medicines are sufficiently stocked' },
              expiringSoon.length > 0
                ? { level: 'warn', text: `${expiringSoon.length} medicine${expiringSoon.length !== 1 ? 's' : ''} expire within 30 days` }
                : { level: 'ok', text: 'No medicines expiring this month' },
              pending.length > 0
                ? { level: 'warn', text: `${pending.length} certificate${pending.length !== 1 ? 's' : ''} pending approval` }
                : { level: 'ok', text: 'No pending certificates' },
              consultToday > 0
                ? { level: 'info', text: `${consultToday} consultation${consultToday !== 1 ? 's' : ''} recorded today` }
                : { level: 'ok', text: 'Clinic has no consultations today' },
            ];
            const conf = {
              critical: { color: ACCENT.red, icon: XCircle },
              warn: { color: ACCENT.orange, icon: AlertTriangle },
              ok: { color: ACCENT.green, icon: CheckCircle },
              info: { color: ACCENT.blue, icon: Activity },
            } as const;
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {alerts.map(a => {
                  const { color, icon: Icon } = conf[a.level];
                  return (
                    <div key={a.text} className="flex items-center gap-3 rounded-xl px-3.5 py-3"
                      style={{ background: color + '0E', border: `1px solid ${color}30` }}>
                      <Icon size={16} style={{ color }} className="shrink-0" />
                      <p style={{ fontSize: 13, color: C.txtSecond, fontWeight: 500 }}>{a.text}</p>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </SectionCard>

        {/* Recent Generated Reports — compact list. This card is nothing but an
            export launcher, so it is left out entirely for a read-only role
            rather than shown with dead buttons. */}
        {canExport && (
        <SectionCard title="Recent Reports" subtitle="Standard reports available for export" icon={FileText}
          action={
            <button onClick={() => setShowExport(true)}
              className="font-semibold transition-opacity hover:opacity-80"
              style={{ fontSize: 12.5, color: SERIES }}>
              Export →
            </button>
          }>
          <div>
            {[
              { name: 'Monthly Consultation Report', cat: 'Consultations', icon: Stethoscope },
              { name: 'Inventory Report', cat: 'Inventory', icon: Pill },
              { name: 'Medicine Usage Report', cat: 'Inventory', icon: Pill },
              { name: 'Certificate Summary', cat: 'Certificates', icon: Award },
            ].map((r, i, arr) => (
              <div key={r.name} className="flex items-center gap-3 py-2.5"
                style={{ borderBottom: i < arr.length - 1 ? `1px solid ${C.divider}` : 'none' }}>
                <span className="flex items-center justify-center rounded-lg shrink-0" style={{ width: 30, height: 30, background: SERIES + '12' }}>
                  <r.icon size={14} style={{ color: SERIES }} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="truncate" style={{ fontSize: 13, fontWeight: 600, color: C.txtPrimary }}>{r.name}</p>
                  <p style={{ fontSize: 11.5, color: C.txtMuted }}>{r.cat}</p>
                </div>
                <button onClick={() => setShowExport(true)}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-semibold transition-opacity hover:opacity-80"
                  style={{ fontSize: 12, color: SERIES, border: `1px solid ${C.inputBorder}` }}>
                  <Download size={12} /> Generate
                </button>
              </div>
            ))}
          </div>
        </SectionCard>
        )}
      </div>
    );
  }

  // ── Consultations Tab ────────────────────────────────────────────────────
  function ConsultationsTab() {
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <KpiCard icon={Stethoscope} label="Today's Consultations" value={consultToday} sub={lastUpdatedStr} accent={SERIES} />
          <KpiCard icon={CalendarDays} label="This Week" value={consultWeek} sub="Since Sunday" accent={isDark ? '#8595D3' : '#4C5CAE'} />
          <KpiCard icon={Activity} label="This Month" value={consultMonth}
            trend={`${consultTrendPct >= 0 ? '+' : ''}${consultTrendPct}%`}
            trendDir={consultTrendPct > 0 ? 'up' : consultTrendPct < 0 ? 'down' : 'neutral'}
            sub="vs last month" accent={SERIES} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <SectionCard title="Consultation Summary" icon={Stethoscope}>
            {/* These three carry their own fixed windows and stay put; the
                selected-period row below is the one the filter drives. */}
            <StatRow label="Today" value={consultToday} color={SERIES} />
            <StatRow label="This Week" value={consultWeek} />
            <StatRow label="This Month" value={consultMonth} />
            <StatRow label={`Selected period (${dateRange.label})`} value={periodConsults.length} color={SERIES} />
            <StatRow label="Total All-Time" value={scopedConsultations.length} />
            <StatRow label="Avg. Duration" value="11 mins" />
            <StatRow label="Avg. Wait Time" value="7 mins" />
            <StatRow label="Peak Hour" value="10:00 AM" />
          </SectionCard>
          <div className="lg:col-span-2">
            <SectionCard title="Weekly Trend" subtitle="Daily consultations, last 7 days" icon={Activity}>
              <TrendChart height={252} />
            </SectionCard>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <SectionCard title="Student Statistics" icon={GraduationCap}>
            <StatRow label="Most Active Program" value={courseMap[0]?.[0] || 'N/A'} color={SERIES} />
            <StatRow label="Enrolled Students" value={enrolled.length} />
            {/* Active-population figures count the enrolled only. Dividing by
                every row on file would dilute the average with alumni who left
                years ago and stopped generating visits. */}
            <StatRow label={`Avg. Consultations / Student (${dateRange.label})`} value={enrolled.length ? (periodConsults.length / enrolled.length).toFixed(1) : '—'} />
            <StatRow label="With Medical Conditions" value={enrolled.filter(s => s.medicalConditions && s.medicalConditions !== 'None recorded').length} />
            <StatRow label="Alumni Records Retained" value={alumni.length} />
          </SectionCard>
          <div className="lg:col-span-2">
            <SectionCard title="Enrollment by Program" subtitle="Enrolled students per academic program" icon={BarChart2}>
              <ProgramChart height={220} horizontal />
            </SectionCard>
          </div>
        </div>
        <SectionCard title="Recent Consultations" subtitle="Latest 10 visit records" icon={FileText}>
          {scopedConsultations.length === 0 ? (
            <p style={{ fontSize: 13, color: C.txtMuted, textAlign: 'center', padding: '24px 0' }}>No consultations recorded yet.</p>
          ) : (
            <ReportTable headers={['ID', 'Student', 'Date', 'Summary', 'Outcome']}>
              {scopedConsultations.slice(0, 10).map(c => (
                <Tr key={c.id}>
                  <td className="px-4 py-3" style={{ fontSize: 12, fontFamily: 'monospace', color: C.txtMuted }}>{c.id}</td>
                  <td className="px-4 py-3">
                    <p style={{ fontSize: 13, fontWeight: 600, color: C.txtPrimary }}>{c.studentName || '—'}</p>
                    <p style={{ fontSize: 11, color: C.txtMuted, marginTop: 1 }}>ID: {c.studentId}</p>
                  </td>
                  <td className="px-4 py-3" style={{ fontSize: 13, color: C.txtSecond, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{c.date}</td>
                  <td className="px-4 py-3" style={{ fontSize: 13, color: C.txtSecond, maxWidth: 220 }}><p className="truncate">{c.summary || '—'}</p></td>
                  <td className="px-4 py-3">
                    <StatusChip text={c.outcome || 'Treated'} color={c.outcome === 'Referred' ? STATUS.warn : STATUS.good} />
                  </td>
                </Tr>
              ))}
            </ReportTable>
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
          <KpiCard icon={Pill} label="Total Medicines" value={inventory.length} sub="Tracked items" accent={SERIES} />
          <KpiCard icon={AlertTriangle} label="Low Stock" value={lowStock.length} sub="Below 5 units"
            badge={lowStock.length > 0 ? { text: 'Warning', color: STATUS.warn } : undefined} accent={STATUS.warn} />
          <KpiCard icon={XCircle} label="Expired" value={expiredMeds.length} sub="Remove from stock"
            badge={expiredMeds.length > 0 ? { text: 'Critical', color: STATUS.bad } : undefined} accent={STATUS.bad} />
          <KpiCard icon={Clock} label="Expiring Soon" value={expiringSoon.length} sub="Within 30 days" accent={isDark ? '#8595D3' : '#4C5CAE'} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <SectionCard title="Inventory Summary" icon={Pill}>
            <StatRow label="Total Medicines" value={inventory.length} />
            <StatRow label="Low Stock (< 5 units)" value={lowStock.length} color={lowStock.length > 0 ? STATUS.warn : undefined} />
            <StatRow label="Expired" value={expiredMeds.length} color={expiredMeds.length > 0 ? STATUS.bad : undefined} />
            <StatRow label="Expiring in 30 Days" value={expiringSoon.length} color={expiringSoon.length > 0 ? STATUS.warn : undefined} />
          </SectionCard>
          <div className="lg:col-span-2">
            <SectionCard title="Medicine Stock Levels" subtitle="Top 5 medicines by stock on hand" icon={BarChart2}>
              <MedicineChart height={252} />
            </SectionCard>
          </div>
        </div>
        {lowStock.length > 0 && (
          <SectionCard title="Low Stock Items" subtitle="Medicines that need replenishment" icon={AlertTriangle}>
            <ReportTable headers={['Medicine', 'Qty', 'Unit', 'Expiry', 'Status']}>
              {lowStock.map(item => (
                <Tr key={item.code}>
                  <td className="px-4 py-3" style={{ fontSize: 13, fontWeight: 600, color: C.txtPrimary }}>{item.name}</td>
                  <td className="px-4 py-3" style={{ fontSize: 13, fontWeight: 700, color: STATUS.bad, fontVariantNumeric: 'tabular-nums' }}>{item.qty}</td>
                  <td className="px-4 py-3" style={{ fontSize: 13, color: C.txtSecond }}>{item.unit}</td>
                  <td className="px-4 py-3" style={{ fontSize: 13, color: C.txtSecond, fontVariantNumeric: 'tabular-nums' }}>{item.expiry || '—'}</td>
                  <td className="px-4 py-3"><StatusChip text="Low Stock" color={STATUS.warn} /></td>
                </Tr>
              ))}
            </ReportTable>
          </SectionCard>
        )}
      </div>
    );
  }

  // ── Certificates Tab ──────────────────────────────────────────────────────
  function CertificatesTab() {
    // The chart breaks down one set of records, so every slice is drawn from
    // the same period — mixing the standing pending queue in here would make
    // the slices add up to more than the requests they came from.
    const periodPending = periodCerts.filter(c => c.status === 'Pending');
    const certStatusData = [
      { name: 'Approved', value: approved.length, fill: STATUS.good },
      { name: 'Pending', value: periodPending.length, fill: STATUS.warn },
      { name: 'Rejected', value: rejected.length, fill: STATUS.bad },
    ].filter(d => d.value > 0);
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard icon={Award} label="Requests" value={periodCerts.length} sub={dateRange.label} accent={SERIES} />
          <KpiCard icon={CheckCircle} label="Approved" value={approved.length} sub={dateRange.label} accent={STATUS.good} />
          {/* The one card that ignores the filter, and says so: an unreviewed
              request from last month is still waiting today. */}
          <KpiCard icon={Clock} label="Pending" value={pending.length} sub="Awaiting review · all dates"
            badge={pending.length > 0 ? { text: 'Needs Action', color: STATUS.warn } : undefined} accent={STATUS.warn} />
          <KpiCard icon={XCircle} label="Rejected" value={rejected.length} sub={dateRange.label} accent={STATUS.bad} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <SectionCard title="Certificate Summary" icon={Award}>
            <StatRow label={`Requests (${dateRange.label})`} value={periodCerts.length} />
            <StatRow label="Approved" value={approved.length} color={STATUS.good} />
            <StatRow label="Rejected" value={rejected.length} color={STATUS.bad} />
            <StatRow label="Pending (all dates)" value={pending.length} color={STATUS.warn} />
            <StatRow label="Issued Today" value={scopedCerts.filter(c => c.date === today).length} />
            <StatRow label="Total All-Time" value={scopedCerts.length} />
          </SectionCard>
          <div className="lg:col-span-2">
            <SectionCard title="Status Distribution" subtitle="Certificate requests by current status" icon={PieIcon}>
              {scopedCerts.length === 0 ? <EmptyChart title="No certificate data" hint="Issued certificates will be summarized here." /> : (
                <div className="flex flex-col sm:flex-row gap-6 items-center">
                  <div style={{ width: '100%', maxWidth: 220, minWidth: 170 }}>
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie data={certStatusData} cx="50%" cy="50%" innerRadius={48} outerRadius={78}
                          dataKey="value" stroke={C.card} strokeWidth={2} isAnimationActive={false} />
                        <Tooltip contentStyle={tooltipStyle} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="flex-1 w-full space-y-3 self-center">
                    {certStatusData.map(d => {
                      const pct = scopedCerts.length ? Math.round((d.value / scopedCerts.length) * 100) : 0;
                      return (
                        <li key={d.name} className="flex items-center gap-2.5">
                          <span className="rounded-full shrink-0" style={{ width: 10, height: 10, background: d.fill }} />
                          <span style={{ fontSize: 13, color: C.txtSecond, flex: 1 }}>{d.name}</span>
                          <span style={{ fontSize: 12, color: C.txtMuted, fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: C.txtPrimary, width: 32, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{d.value}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </SectionCard>
          </div>
        </div>
        {pending.length > 0 && (
          <SectionCard title="Pending Certificates" subtitle="Requests awaiting approval" icon={Clock}>
            <ReportTable headers={['Cert ID', 'Student', 'Date Requested', 'Status']}>
              {pending.map(c => (
                <Tr key={c.id}>
                  <td className="px-4 py-3" style={{ fontSize: 12, fontFamily: 'monospace', color: C.txtMuted }}>{c.id}</td>
                  <td className="px-4 py-3">
                    <p style={{ fontSize: 13, fontWeight: 600, color: C.txtPrimary }}>{c.studentName}</p>
                    <p style={{ fontSize: 11, color: C.txtMuted, marginTop: 1 }}>ID: {c.studentId}</p>
                  </td>
                  <td className="px-4 py-3" style={{ fontSize: 13, color: C.txtSecond, fontVariantNumeric: 'tabular-nums' }}>{c.date}</td>
                  <td className="px-4 py-3"><StatusChip text="Pending" color={STATUS.warn} /></td>
                </Tr>
              ))}
            </ReportTable>
          </SectionCard>
        )}
      </div>
    );
  }

  // ── Export ────────────────────────────────────────────────────────────────
  // The dialog has offered CSV, Excel and PDF since before any of them did
  // anything; these are the pieces that were missing behind it.

  /**
   * Turn the selected tick-boxes into the tables that get written out.
   *
   * Dated records (consultations, certificates) are limited to the chosen
   * period. A roster or a stock list is a snapshot of how things stand now, so
   * narrowing those by date would just empty them.
   */
  const buildReportTables = useCallback((): ReportTable[] => {
    const tables: ReportTable[] = [];
    const dash = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));

    if (exportItems.consultation) {
      const rows = scopedConsultations
        .filter((c) => inRange(c.date))
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .map((c) => [
          dash(c.date), dash(c.time), dash(c.studentId), dash(c.studentName),
          c.personType === 'faculty' ? 'Faculty' : 'Student',
          dash(c.age), dash(c.sex), dash(c.courseOrOffice), dash(c.purpose),
          dash(c.chiefComplaint), dash(c.assessment), dash(c.management),
          dash(c.bp), dash(c.temp), dash(c.pr), dash(c.rr), dash(c.o2sat),
          dash(c.consultStatus || 'Pending'), dash(c.recordedBy), dash(c.confirmedBy),
        ]);
      tables.push({
        title: 'Consultations',
        columns: ['Date', 'Time', 'ID', 'Name', 'Type', 'Age', 'Sex', 'Course/Office', 'Purpose',
          'Chief Complaint', 'Assessment', 'Management', 'BP', 'Temp', 'PR', 'RR', 'O2 Sat',
          'Status', 'Recorded By', 'Confirmed By'],
        rows,
      });
    }

    if (exportItems.studentHealth) {
      tables.push({
        title: 'Student Health',
        columns: ['Student ID', 'Name', 'Course', 'Year', 'Sex', 'Status', 'Blood Type',
          'Allergies', 'Medical Conditions', 'Current Medications', 'Contact', 'Guardian', 'Guardian Contact'],
        rows: scopedStudents.map((s) => [
          dash(s.studentId), dash(s.name), dash(s.course), dash(s.yearLevel), dash(s.gender),
          dash(s.status), dash(s.bloodType), dash(s.allergies), dash(s.medicalConditions),
          dash(s.currentMedications), dash(s.contactNumber), dash(s.guardianName), dash(s.guardianContact),
        ]),
      });
    }

    if (exportItems.inventory) {
      tables.push({
        title: 'Inventory',
        columns: ['Code', 'Item', 'Category', 'Quantity', 'Unit', 'Expiry', 'Status'],
        rows: inventory.map((i) => {
          const expired = i.expiry ? new Date(i.expiry) < new Date() : false;
          const status = i.archived ? 'Archived' : expired ? 'Expired' : i.qty <= 0 ? 'Out of stock' : i.qty < 5 ? 'Low stock' : 'OK';
          // Quantity stays a number so the column can be totalled in Excel.
          return [dash(i.code), dash(i.name), dash(i.category), Number(i.qty ?? 0), dash(i.unit), dash(i.expiry), status];
        }),
      });
    }

    if (exportItems.certificates) {
      tables.push({
        title: 'Medical Certificates',
        columns: ['Request ID', 'Student ID', 'Student Name', 'Date', 'Status'],
        rows: scopedCerts
          .filter((c) => inRange(c.date))
          .map((c) => [dash(c.id), dash(c.studentId), dash(c.studentName), dash(c.date), dash(c.status)]),
      });
    }

    if (exportItems.faculty) {
      tables.push({
        title: 'Faculty Health',
        columns: ['Staff ID', 'Name', 'College', 'Designation', 'Employment', 'Contact', 'Blood Type', 'Medical History'],
        rows: scopedFaculty.map((f) => [
          dash(f.staffId), dash(f.name), dash(f.college), dash(f.role),
          [f.employmentCategory, f.employmentType].filter(Boolean).join(' — ') || '—',
          dash(f.contact), dash(f.bloodType), dash(f.medicalHistory),
        ]),
      });
    }

    return tables;
  }, [exportItems, scopedConsultations, scopedStudents, inventory, scopedCerts, scopedFaculty, inRange]);

  // The period line carries the scope too. A spreadsheet of "CTECH only" that
  // says nothing about it gets read as the whole clinic by whoever opens it next.
  const exportMeta = useCallback((): ReportMeta => ({
    period: personFilterOff ? dateRange.label : `${dateRange.label} · ${scopeLabel}`,
    generatedAt: new Date(),
    generatedBy: currentUsername() || 'Clinix',
  }), [dateRange, personFilterOff, scopeLabel]);

  function handleGenerate() {
    const tables = buildReportTables();
    if (!tables.length) {
      setExportError('Choose at least one report to include.');
      return;
    }
    setExportError('');
    const meta = exportMeta();

    if (exportFormat === 'csv') {
      downloadBlob(
        new Blob([toCsv(tables, meta)], { type: 'text/csv;charset=utf-8' }),
        reportFilename('csv', meta.generatedAt),
      );
    } else if (exportFormat === 'excel') {
      downloadBlob(toXlsx(tables, meta), reportFilename('xlsx', meta.generatedAt));
    } else {
      // The browser's print dialog writes the PDF — "Destination: Save as PDF".
      printHtml(toPrintHtml(tables, meta));
    }
    setShowExport(false);
  }

  function handlePreview() {
    const tables = buildReportTables();
    if (!tables.length) {
      setExportError('Choose at least one report to preview.');
      return;
    }
    setExportError('');
    setPreviewTables(tables);
    setShowExport(false);
  }

  // ── Preview Modal ─────────────────────────────────────────────────────────
  // The same tables the export writes, on screen first. Long tables are capped
  // so opening a preview of ten thousand consultations cannot lock the browser
  // up; the export itself is never truncated.
  const PREVIEW_ROW_LIMIT = 50;

  function PreviewModal({ tables }: { tables: ReportTable[] }) {
    const meta = { period: dateRange.label, generatedBy: currentUsername() || 'Clinix' };
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(13,18,48,0.55)' }}
        onClick={() => setPreviewTables(null)}>
        <div className={`${card} w-full max-w-5xl max-h-[90vh] flex flex-col`}
          style={{ ...cardStyle, boxShadow: '0 24px 64px rgba(13,18,48,0.35)' }}
          onClick={e => e.stopPropagation()}>

          <div className="flex items-center justify-between gap-3 p-5 shrink-0" style={{ borderBottom: `1px solid ${C.divider}` }}>
            <div>
              <p style={{ fontSize: 15, fontWeight: 700, color: C.txtPrimary }}>Report Preview</p>
              <p style={{ fontSize: 12, color: C.txtMuted, marginTop: 2 }}>
                {meta.period} · {tables.length} section{tables.length !== 1 ? 's' : ''} · by {meta.generatedBy}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => { setPreviewTables(null); setShowExport(true); }}
                className="px-4 py-2 rounded-xl font-semibold transition-colors"
                style={{ background: 'transparent', color: C.txtSecond, border: `1px solid ${C.inputBorder}`, fontSize: 12.5 }}>
                Back to options
              </button>
              <button onClick={() => { setPreviewTables(null); handleGenerate(); }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold transition-opacity hover:opacity-90"
                style={{ background: PRIMARY_BTN, color: '#fff', fontSize: 12.5 }}>
                <Download size={13} /> Export
              </button>
              <button onClick={() => setPreviewTables(null)} title="Close"
                className="flex items-center justify-center rounded-lg transition-colors"
                style={{ width: 30, height: 30, color: C.txtMuted, border: `1px solid ${C.inputBorder}` }}>
                <X size={14} />
              </button>
            </div>
          </div>

          <div className="overflow-y-auto p-5 space-y-6">
            {tables.map(t => (
              <div key={t.title}>
                <p style={{ fontSize: 13, fontWeight: 700, color: C.txtPrimary, marginBottom: 8 }}>
                  {t.title}
                  <span style={{ fontSize: 12, fontWeight: 500, color: C.txtMuted, marginLeft: 8 }}>
                    {t.rows.length} row{t.rows.length !== 1 ? 's' : ''}
                  </span>
                </p>
                {t.rows.length === 0 ? (
                  <p style={{ fontSize: 12, color: C.txtMuted, fontStyle: 'italic' }}>No records for this period.</p>
                ) : (
                  <>
                    {/* The table scrolls inside its own box — these reports are
                        wide, and the page itself must not scroll sideways. */}
                    <div className="overflow-x-auto rounded-xl" style={{ border: `1px solid ${C.cardBorder}` }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
                        <thead>
                          <tr style={{ background: C.tableTh }}>
                            {t.columns.map(col => (
                              <th key={col} style={{ textAlign: 'left', padding: '7px 10px', color: C.txtSecond, fontWeight: 600, whiteSpace: 'nowrap' }}>{col}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {t.rows.slice(0, PREVIEW_ROW_LIMIT).map((row, ri) => (
                            <tr key={ri} style={{ borderTop: `1px solid ${C.divider}` }}>
                              {row.map((cell, ci) => (
                                <td key={ci} style={{ padding: '6px 10px', color: C.txtMuted, whiteSpace: 'nowrap', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>{String(cell)}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {t.rows.length > PREVIEW_ROW_LIMIT && (
                      <p style={{ fontSize: 11.5, color: C.txtMuted, marginTop: 6 }}>
                        Showing the first {PREVIEW_ROW_LIMIT} of {t.rows.length} rows. The exported file contains all of them.
                      </p>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Export Modal ──────────────────────────────────────────────────────────
  function ExportModal() {
    const reports = [
      { key: 'consultation', label: 'Consultation Report', desc: 'All consultations and visit logs', icon: Stethoscope },
      { key: 'studentHealth', label: 'Student Health Report', desc: 'Student medical records and conditions', icon: GraduationCap },
      { key: 'inventory', label: 'Inventory Report', desc: 'Medicine stock levels and expiry', icon: Pill },
      { key: 'certificates', label: 'Medical Certificates', desc: 'Issued and pending certificates', icon: Award },
      { key: 'faculty', label: 'Faculty Health Report', desc: 'Faculty and staff health records', icon: Users },
    ] as const;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(13,18,48,0.55)' }}
        onClick={() => setShowExport(false)}>
        <div className={`${card} w-full max-w-md max-h-[90vh] overflow-y-auto p-5`}
          style={{ ...cardStyle, boxShadow: '0 24px 64px rgba(13,18,48,0.35)' }}
          onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between gap-3 mb-4" style={{ borderBottom: `1px solid ${C.divider}`, paddingBottom: 14 }}>
            <div className="flex items-center gap-2.5">
              <span className="flex items-center justify-center rounded-lg shrink-0" style={{ width: 28, height: 28, background: SERIES + '14' }}>
                <Download size={14} style={{ color: SERIES }} />
              </span>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: C.txtPrimary }}>Export Reports</p>
                <p style={{ fontSize: 12, color: C.txtMuted, marginTop: 1 }}>Select the reports to include</p>
              </div>
            </div>
            <button onClick={() => setShowExport(false)} title="Close"
              className="flex items-center justify-center rounded-lg transition-colors"
              style={{ width: 28, height: 28, color: C.txtMuted, border: `1px solid ${C.inputBorder}` }}>
              <X size={14} />
            </button>
          </div>
          <div className="space-y-2.5 mb-5">
            {reports.map(r => {
              const checked = exportItems[r.key];
              return (
                <label key={r.key} className="flex items-center gap-3 cursor-pointer rounded-xl p-3 transition-colors"
                  style={{
                    border: `1px solid ${checked ? SERIES : C.inputBorder}`,
                    background: checked ? SERIES + '0C' : 'transparent',
                  }}>
                  <input type="checkbox"
                    checked={checked}
                    onChange={e => setExportItems(prev => ({ ...prev, [r.key]: e.target.checked }))}
                    className="shrink-0"
                    style={{ accentColor: SERIES, width: 15, height: 15 }}
                  />
                  <span className="flex items-center justify-center rounded-lg shrink-0" style={{ width: 32, height: 32, background: SERIES + '12' }}>
                    <r.icon size={15} style={{ color: SERIES }} />
                  </span>
                  <div className="min-w-0">
                    <p style={{ fontSize: 13, fontWeight: 600, color: C.txtPrimary }}>{r.label}</p>
                    <p className="truncate" style={{ fontSize: 12, color: C.txtMuted }}>{r.desc}</p>
                  </div>
                </label>
              );
            })}
          </div>
          <p style={labelStyle}>Output Format</p>
          <div className="inline-flex rounded-xl p-1 mb-5" style={{ background: isDark ? '#0D1230' : '#EEF1FA' }}>
            {(['pdf', 'excel', 'csv'] as const).map(fmt => (
              <button key={fmt} onClick={() => setExportFormat(fmt)}
                className="px-5 py-2 rounded-lg uppercase font-semibold transition-colors"
                style={{
                  fontSize: 11, letterSpacing: '0.06em',
                  background: exportFormat === fmt ? C.card : 'transparent',
                  color: exportFormat === fmt ? SERIES : C.txtMuted,
                  boxShadow: exportFormat === fmt ? '0 1px 4px rgba(13,18,48,0.12)' : 'none',
                }}>
                {fmt}
              </button>
            ))}
          </div>
          {/* What the chosen format will actually produce, so nobody presses
              Generate expecting a file and gets a print dialog. */}
          <p style={{ fontSize: 11.5, color: C.txtMuted, marginBottom: 12, lineHeight: 1.5 }}>
            {exportFormat === 'pdf'
              ? 'Opens your print dialog — choose "Save as PDF" as the destination.'
              : exportFormat === 'excel'
                ? 'Downloads an .xlsx workbook with one sheet per report.'
                : 'Downloads a .csv file, one section per report.'}
            {' '}Covers: <strong style={{ color: C.txtSecond }}>{dateRange.label}</strong>.
          </p>

          {exportError && (
            <p style={{ fontSize: 12, color: STATUS.bad, marginBottom: 10 }}>{exportError}</p>
          )}

          <div className="flex gap-3">
            <button onClick={handleGenerate}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold transition-opacity hover:opacity-90"
              style={{ background: PRIMARY_BTN, color: '#fff', fontSize: 13 }}>
              <Download size={14} /> Generate Report
            </button>
            <button onClick={handlePreview}
              className="px-5 py-2.5 rounded-xl font-semibold transition-colors"
              style={{ background: 'transparent', color: C.txtSecond, border: `1px solid ${C.inputBorder}`, fontSize: 13 }}>
              Preview
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-screen-xl">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 style={{ fontWeight: 800, fontSize: 22, color: C.txtPrimary, letterSpacing: '-0.01em' }}>Reports & Analytics</h1>
          <p style={{ fontSize: 13, color: C.txtMuted, marginTop: 4, maxWidth: 520, lineHeight: 1.5 }}>
            Monitor clinic performance across consultations, inventory, certificates and student records.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="text-right hidden sm:block">
            <p className="flex items-center justify-end gap-1.5" style={{ fontSize: 11, fontWeight: 600, color: C.txtMuted }}>
              <Clock size={12} /> Last Updated
            </p>
            <p style={{ fontSize: 12.5, fontWeight: 600, color: C.txtPrimary, marginTop: 2 }}>
              {lastUpdatedStr} · {lastUpdatedTime}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setLastRefresh(new Date())} title="Refresh data"
              className="flex items-center gap-1.5 rounded-xl px-3 py-2 transition-colors"
              style={{ background: C.card, border: `1px solid ${C.cardBorder}`, fontSize: 12, fontWeight: 600, color: C.txtSecond }}>
              <RefreshCw size={13} /> Refresh
            </button>
            {canExport && (
              <>
                <button onClick={() => window.print()} title="Print this report"
                  className="flex items-center gap-1.5 rounded-xl px-3 py-2 transition-colors"
                  style={{ background: C.card, border: `1px solid ${C.cardBorder}`, fontSize: 12, fontWeight: 600, color: C.txtSecond }}>
                  <Printer size={13} /> Print
                </button>
                <button onClick={() => { setExportError(''); setShowExport(true); }} title="Export reports"
                  className="flex items-center gap-1.5 rounded-xl px-4 py-2 font-semibold transition-opacity hover:opacity-90"
                  style={{ background: PRIMARY_BTN, color: '#fff', fontSize: 12 }}>
                  <Download size={13} /> Export
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Navigation Tabs + Filters (same row) */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2" style={{ borderBottom: `1px solid ${C.cardBorder}` }}>
        <div className="flex flex-wrap gap-1">
          {TABS.map(tab => {
            const active = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className="flex items-center gap-1.5 px-4 py-2.5 whitespace-nowrap font-semibold transition-colors"
                style={{
                  fontSize: 13,
                  color: active ? SERIES : C.txtMuted,
                  borderBottom: active ? `2px solid ${SERIES}` : '2px solid transparent',
                }}>
                <tab.icon size={14} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Filters — inline label + select pairs, same style as Students/Faculty modules */}
        <div className="flex flex-wrap items-center gap-3 pb-2">
          <label className="flex items-center gap-2" style={{ fontSize: 12, fontWeight: 600, color: C.txtMuted }}>
            <Filter size={14} />
            Date
            <select
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value as DateFilter)}
              style={filterCtl}>
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="year">This Year</option>
              <option value="custom">Custom Range</option>
            </select>
          </label>
          {dateFilter === 'custom' && (
            <div className="flex items-center gap-2">
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={filterCtl} />
              <span style={{ fontSize: 12, color: C.txtMuted, fontWeight: 500 }}>to</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} min={customFrom} style={filterCtl} />
            </div>
          )}
          <label className="flex items-center gap-2" style={{ fontSize: 12, fontWeight: 600, color: C.txtMuted }}>
            Department
            {/* Two groups because a department means a different thing on each
                side of the roster: students belong to a college, staff also
                have an employment category. Both narrow the same page. */}
            <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)} style={filterCtl}>
              <option value="all">All Departments</option>
              {collegesList.length > 0 && (
                <optgroup label="Colleges (students & faculty)">
                  {collegesList.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                </optgroup>
              )}
              {officeOptions.length > 0 && (
                <optgroup label="Offices (faculty & staff)">
                  {officeOptions.map(o => <option key={o} value={o}>{o}</option>)}
                </optgroup>
              )}
              <optgroup label="Faculty & Staff category">
                {staffCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </optgroup>
            </select>
          </label>
          <label className="flex items-center gap-2" style={{ fontSize: 12, fontWeight: 600, color: C.txtMuted }}>
            Program
            {/* Students only — a faculty member is not enrolled in a program,
                so choosing one takes them out of the figures entirely. */}
            <select value={programFilter} onChange={e => setProgramFilter(e.target.value)} style={filterCtl}>
              <option value="all">All Programs</option>
              {programOptions.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          {(dateFilter !== 'month' || customFrom || customTo || !personFilterOff) && (
            <button onClick={() => {
              setDateFilter('month'); setCustomFrom(''); setCustomTo('');
              setDeptFilter('all'); setProgramFilter('all');
            }}
              className="transition-opacity hover:opacity-80"
              style={{ fontSize: 12, fontWeight: 600, color: SERIES }}>
              Clear
            </button>
          )}
        </div>
      </div>

      {/* What the period does and does not cover. Without this, a filter that
          moves the consultation figures but leaves the roster and the stock
          counts alone reads as half-broken rather than as intended. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl px-3.5 py-2.5"
        style={{ background: C.tableTh, border: `1px solid ${C.cardBorder}` }}>
        <CalendarDays size={13} style={{ color: SERIES }} />
        <span style={{ fontSize: 12, color: C.txtSecond, fontWeight: 600 }}>
          Showing {dateRange.label}{personFilterOff ? '' : ` · ${scopeLabel}`}
        </span>
        <span style={{ fontSize: 12, color: C.txtMuted, lineHeight: 1.5 }}>
          — consultations and certificates are counted within this period.
          {personFilterOff
            ? ' Student roster and medicine stock are current figures and do not change with it.'
            : programFilter !== 'all'
              ? ' Department and Program narrow every figure about people; a program has no faculty in it, so Faculty & Staff are excluded. Medicine stock is clinic-wide and never narrows.'
              : ' Department narrows every figure about people, on both the student and the staff side. Medicine stock is clinic-wide and never narrows.'}
        </span>
        {/* A category that matches nobody looks like a broken filter unless the
            reason is stated. It is not broken — the roster simply has not been
            classified yet, which is the normal state right after these fields
            started being stored. */}
        {noFacultyClassified && EMPLOYMENT_CATEGORIES.includes(deptFilter) && (
          <span className="w-full" style={{ fontSize: 12, color: STATUS.warn, lineHeight: 1.5 }}>
            No staff member has an employment category on record yet, so this selection
            matches nobody. Set it per person in Faculty &amp; Staff, or bring it in with
            the CSV import.
          </span>
        )}
      </div>

      {/* Tab Content */}
      {renderTab()}

      {/* Export Modal — the role check is repeated here so no leftover state
          can put the dialog on screen for someone who cannot export. */}
      {showExport && canExport && <ExportModal />}
      {previewTables && canExport && <PreviewModal tables={previewTables} />}
    </div>
  );
}
