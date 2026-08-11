import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Plus, Search, Pencil, Archive, Upload, CheckCircle2, Camera, User, Download, Printer, Filter, X, Lock,
  ArrowLeft, Phone, Mail, CalendarDays, BookOpen, HeartPulse, Users, Home, MapPin, Building2,
  ChevronDown, ChevronUp, IdCard, Layers, CircleDot, Droplet, Scale, FolderOpen, Ruler, Activity,
  ClipboardList, PhoneCall, Clock, Stethoscope, CalendarClock, MinusCircle, AlertCircle,
  GraduationCap,
} from 'lucide-react';
import { Student, StudentStatus, Consultation, normalizeStudent, STUDENT_STATUSES } from '../App';
import { Modal } from './Modal';
import { PersonDocuments, ProfileDocuments, usePersonDocuments } from './PersonDocuments';
import { useColleges, YEAR_OPTIONS } from '../colleges';
import { canSeeConfidential } from '../auth';
import { confirmDialog } from './ConfirmDialog';
import { PhotoCapture, cameraAvailable, cameraUnavailableReason } from './PhotoCapture';
import { API_URL, apiFetch } from '../api';
import { parseCsvLine, normalizeCsvHeader } from '../masterlist';


type Props = {
  students: Student[];
  setStudents: React.Dispatch<React.SetStateAction<Student[]>>;
  globalSearch: string;
  showToast: (m: string) => void;
  addActivity: (m: string) => void;
  /** Student ID whose full profile should open on mount (e.g. from Dashboard search) */
  openProfileId?: string | null;
  onProfileOpened?: () => void;
  /** Consultation history — drives Last Visit and the Medical Summary panel. */
  consultations?: Consultation[];
  /** "View Full History" on the Medical Summary panel. */
  onViewHistory?: () => void;
};

type TabId = 'list' | 'form' | 'import';
type SortOrder = 'name-asc' | 'name-desc' | 'id-asc' | 'id-desc';

/** Which slice of the roster the list is showing. Same page, same table. */
type StatusView = StudentStatus | 'all';

const STATUS_VIEWS: { id: StatusView; label: string }[] = [
  { id: 'enrolled', label: 'Enrolled' },
  // "Alumni Records", not "Archive" — these are not discarded records, they are
  // retained ones, and the wording is what tells staff it is safe to look here.
  { id: 'graduated', label: 'Alumni Records' },
  { id: 'dropped', label: 'Dropped' },
  { id: 'all', label: 'All' },
];

const defaultForm = {
  studentId: '',
  lastName: '',
  firstName: '',
  middleInitial: '',
  course: '',
  yearLevel: '',
  gender: '',
  contactNumber: '',
  email: '',
  medicalConditions: '',
  status: 'enrolled' as StudentStatus,
  dateGraduated: '',
  photo: '',
  birthdate: '',
  bloodType: '',
  schoolYear: '',
  homeAddress: '',
  presentAddress: '',
  guardianName: '',
  guardianRelationship: '',
  guardianContact: '',
  confidentialNotes: '',
  allergies: '',
  currentMedications: '',
  medicalOthers: '',
  height: '',
  weight: '',
  currentProvince: '',
  currentCity: '',
  currentBarangay: '',
  currentPurok: '',
  currentZip: '',
  homeProvince: '',
  homeCity: '',
  homeBarangay: '',
  homePurok: '',
  homeZip: '',
  isBoarding: false,
  boardingHouseName: '',
  boardingHouseAddress: '',
  landlordName: '',
  landlordContact: '',
};

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

// Height in cm, weight in kg — BMI is derived, never stored.
function computeBmi(heightCm?: string, weightKg?: string): { value: string; category: string } | null {
  const h = parseFloat(heightCm || '');
  const w = parseFloat(weightKg || '');
  if (!h || !w || h <= 0 || w <= 0) return null;
  const m = h / 100;
  const bmi = w / (m * m);
  const category = bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : bmi < 30 ? 'Overweight' : 'Obese';
  return { value: bmi.toFixed(1), category };
}

function avatarInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0])
    .join('')
    .toUpperCase();
}

function StudentAvatar({
  photo,
  name,
  size = 'md',
}: {
  photo?: string;
  name: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const dims = size === 'sm' ? 'w-8 h-8' : size === 'md' ? 'w-10 h-10' : 'w-20 h-20';
  const textSize = size === 'sm' ? 11 : size === 'md' ? 13 : 22;
  if (photo) {
    return (
      <img
        src={photo}
        alt={name}
        className={`${dims} rounded-full object-cover shrink-0 border-2 border-white shadow-sm`}
      />
    );
  }
  return (
    <div
      className={`${dims} rounded-full bg-blue-100 text-blue-700 flex items-center justify-center shrink-0`}
      style={{ fontSize: textSize, fontWeight: 700 }}
    >
      {avatarInitials(name) || <User size={textSize} />}
    </div>
  );
}

const STATUS_LABELS: Record<StudentStatus, string> = {
  enrolled: 'Enrolled',
  graduated: 'Graduated',
  dropped: 'Dropped',
};

const STATUS_TONES: Record<StudentStatus, { fg: string; bg: string }> = {
  enrolled: { fg: '#16A34A', bg: '#ECFDF5' },
  graduated: { fg: '#0E7490', bg: '#ECFEFF' },
  dropped: { fg: '#B45309', bg: '#FFFBEB' },
};

function StatusBadge({ status }: { status: StudentStatus }) {
  // Graduated is deliberately not a warning colour — it is an achievement and a
  // legitimate record, not an archive or a problem to fix.
  const styles: Record<StudentStatus, string> = {
    enrolled: 'bg-blue-100 text-blue-700',
    graduated: 'bg-emerald-100 text-emerald-700',
    dropped: 'bg-yellow-100 text-yellow-700',
  };
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-full ${styles[status] || styles.dropped}`}
      style={{ fontSize: 11, fontWeight: 500 }}
    >
      {STATUS_LABELS[status] || status}
    </span>
  );
}

/**
 * A parsed CSV row, held as both the raw cells the file supplied and the fully
 * normalised student built from them. Updates need the raw keys to know which
 * fields the file was actually speaking about; inserts need the normalised one.
 */
type PendingCsvRow = { raw: Record<string, unknown>; student: Student };

function normalizeCourseName(course: string | undefined) {
  // A merged CSV update may legitimately carry no course at all, in which case
  // there is nothing to normalise and nothing to send.
  if (course === undefined) return undefined;
  const key = course.trim().toUpperCase().replace(/\s+/g, '-');
  return ({
    'BSIT-ELECT-TECH': 'BSIT-ELECT',
    'BSED-MATH': 'BSED-MATH',
    'BSED-ENGLISH': 'BSED-ENGLISH',
  } as Record<string, string>)[key] || key;
}

function parseCsv(text: string): Record<string, unknown>[] {
  const HEADER_MAP: Record<string, string> = {
    studentid: 'studentId', id: 'studentId', name: 'name', course: 'course',
    yearlevel: 'yearLevel', year: 'yearLevel', gender: 'gender', sex: 'gender',
    contactnumber: 'contactNumber', contact: 'contactNumber',
    email: 'email', emailaddress: 'email',
    medicalconditions: 'medicalConditions', conditions: 'medicalConditions',
    lastname: 'lastName', surname: 'lastName',
    firstname: 'firstName', fullname: 'name',
    middleinitial: 'middleInitial', mi: 'middleInitial',
    status: 'status', enrollmentstatus: 'status', enrolmentstatus: 'status',
    birthdate: 'birthdate', birthday: 'birthdate', dob: 'birthdate',
    bloodtype: 'bloodType',
    schoolyear: 'schoolYear',
    guardianname: 'guardianName', parentname: 'guardianName',
    guardianrelationship: 'guardianRelationship', relationship: 'guardianRelationship',
    guardiancontact: 'guardianContact', parentcontact: 'guardianContact',
    homeaddress: 'homeAddress',
    presentaddress: 'presentAddress',
    allergies: 'allergies',
    currentmedications: 'currentMedications', medications: 'currentMedications',
    medicalothers: 'medicalOthers', others: 'medicalOthers',
    height: 'height', heightcm: 'height',
    weight: 'weight', weightkg: 'weight',
    currentprovince: 'currentProvince', currentcity: 'currentCity', currentmunicipalitycity: 'currentCity',
    currentbarangay: 'currentBarangay', currentpurok: 'currentPurok', currentpurokstreet: 'currentPurok', currentzip: 'currentZip', currentzipcode: 'currentZip',
    homeprovince: 'homeProvince', homecity: 'homeCity', homemunicipalitycity: 'homeCity',
    homebarangay: 'homeBarangay', homepurok: 'homePurok', homepurokstreet: 'homePurok', homezip: 'homeZip', homezipcode: 'homeZip',
    isboarding: 'isBoarding', boardinghousename: 'boardingHouseName', boardinghouseaddress: 'boardingHouseAddress',
    landlordname: 'landlordName', landlordcontact: 'landlordContact', landlordcontactnumber: 'landlordContact',
  };
  const lines = text.replace(/^﻿/, '').replace(/\r/g, '').split('\n').filter((l) => l.trim());
  if (!lines.length) return [];
  const headers = parseCsvLine(lines.shift()!).map(normalizeCsvHeader);
  return lines.map((line) => {
    const vals = parseCsvLine(line);
    const rec: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      const key = HEADER_MAP[h];
      const value = (vals[idx] ?? '').trim();
      // Only columns the file actually filled in are recorded. A blank cell is
      // "the registrar had nothing to say about this", not "erase what the
      // clinic has" — see how the import merges over an existing student.
      if (key && value) rec[key] = value;
    });
    return rec;
  });
}

// Downscales + re-encodes the photo client-side so the stored data URL stays well under
// MySQL's max_allowed_packet, regardless of how large the original upload was.
function readFileAsCompressedDataUrl(file: File, maxDim = 480, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas is not supported in this browser')); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image file')); };
    img.src = url;
  });
}

function csvCell(value: string) {
  return `"${String(value || '').replace(/"/g, '""')}"`;
}

function htmlCell(value: string) {
  return String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
}

async function saveStudentApi(student: Student, editingId?: string | null) {
  const res = await apiFetch(`${API_URL}/students${editingId ? `/${editingId}` : ''}`, {
    method: editingId ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...student, course: normalizeCourseName(student.course) }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || 'API request failed');
  }
}

// ─── Student Profile page ───────────────────────────────────────────────────
// Presentational building blocks. Kept at module scope so React keeps their
// instances alive between renders (no remount on every keystroke elsewhere).

type LucideIcon = React.ComponentType<{ size?: number; className?: string; strokeWidth?: number; style?: React.CSSProperties }>;

type ProfileFieldSpec = {
  label: string;
  value?: string;
  icon?: LucideIcon;
  /** Small pill rendered right after the value (e.g. the BMI category). */
  chip?: { text: string; bg: string; fg: string };
  /** Admin-only field — masked for other roles. */
  conf?: boolean;
};

function NotProvided() {
  return (
    <span
      className="ml-1.5 inline-flex items-center rounded-md bg-slate-100 px-1.5 py-px text-slate-400 dark:bg-slate-700 dark:text-slate-400"
      style={{ fontSize: 10, fontWeight: 500 }}
    >
      Not Provided
    </span>
  );
}

/** Grid of label/value pairs with hairline rules between rows and columns. */
const GRID_COLS: Record<1 | 2 | 3, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-3',
};

function ProfileFieldGrid({ items, cols, isAdmin }: { items: ProfileFieldSpec[]; cols: 1 | 2 | 3; isAdmin: boolean }) {
  const rowCount = Math.ceil(items.length / cols);
  const rule = 'border-blue-50 dark:border-slate-700/60';
  return (
    <div className={`grid ${GRID_COLS[cols]}`}>
      {items.map((f, i) => {
        const lastRow = Math.floor(i / cols) === rowCount - 1;
        const lastCol = i % cols === cols - 1 || i === items.length - 1;
        const Icon = f.icon;
        const masked = f.conf && !isAdmin;
        return (
          <div
            key={f.label}
            className={[
              'px-3 py-2.5',
              rule,
              lastRow ? '' : 'border-b',
              lastCol ? '' : 'sm:border-r',
            ].join(' ')}
          >
            <p className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400" style={{ fontSize: 11.5 }}>
              {masked ? <Lock size={10} className="shrink-0" /> : Icon ? <Icon size={11} className="shrink-0 text-slate-400" /> : null}
              {f.label}
            </p>
            {masked ? (
              <p className="mt-1 italic text-slate-400" style={{ fontSize: 12 }}>Admin only</p>
            ) : (
              <p className="mt-1 flex flex-wrap items-center text-black dark:text-slate-100" style={{ fontSize: 13.5, fontWeight: 600 }}>
                {f.value ? f.value : <span className="text-slate-300 dark:text-slate-500">—</span>}
                {f.chip ? (
                  <span
                    className="ml-1.5 inline-flex items-center rounded-md px-1.5 py-px"
                    style={{ fontSize: 10, fontWeight: 600, background: f.chip.bg, color: f.chip.fg }}
                  >
                    {f.chip.text}
                  </span>
                ) : f.value ? null : (
                  <NotProvided />
                )}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Collapsible white card with a tinted icon chip in the header. */
function ProfileSection({
  icon: Icon,
  title,
  tone = 'blue',
  children,
}: {
  icon: LucideIcon;
  title: string;
  tone?: 'blue' | 'red';
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const chip = tone === 'red' ? { bg: '#FEF2F2', fg: '#DC2626' } : { bg: '#EFF6FF', fg: '#2563EB' };
  return (
    <div className="rounded-2xl border border-blue-100 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2.5 text-left"
        aria-expanded={open}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg dark:bg-slate-700/60" style={{ background: chip.bg }}>
          <Icon size={15} style={{ color: chip.fg }} />
        </span>
        <span
          className={`min-w-0 flex-1 truncate ${tone === 'red' ? 'text-[#DC2626] dark:text-red-300' : 'text-blue-900 dark:text-white'}`}
          style={{ fontSize: 14.5, fontWeight: 700 }}
        >
          {title}
        </span>
        {open ? <ChevronUp size={15} className="shrink-0 text-slate-400" /> : <ChevronDown size={15} className="shrink-0 text-slate-400" />}
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

/** Tinted statistic tile (Blood Type / BMI / Total Records / Last Visit). */
function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  chip,
  valueSize = 20,
  bg,
  border,
  fg,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  chip?: { text: string; bg: string; fg: string };
  valueSize?: number;
  bg: string;
  border: string;
  fg: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border p-3.5 dark:bg-slate-800" style={{ background: bg, borderColor: border }}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm dark:bg-slate-700">
        <Icon size={18} style={{ color: fg }} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-slate-500 dark:text-slate-400" style={{ fontSize: 11.5 }}>{label}</p>
        <p className="truncate text-black dark:text-slate-100" style={{ fontSize: valueSize, fontWeight: 700, lineHeight: 1.25 }}>
          {value}
        </p>
        {chip ? (
          <span
            className="mt-0.5 inline-flex items-center rounded-md px-1.5 py-px"
            style={{ fontSize: 10, fontWeight: 600, background: chip.bg, color: chip.fg }}
          >
            {chip.text}
          </span>
        ) : (
          <p className="truncate text-slate-500 dark:text-slate-400" style={{ fontSize: 11.5 }}>{sub || '—'}</p>
        )}
      </div>
    </div>
  );
}

/** Ring gauge used by the Profile Completion card. */
function CompletionRing({ percent }: { percent: number }) {
  const r = 27;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: 68, height: 68 }}>
      <svg width="68" height="68" viewBox="0 0 68 68" aria-hidden="true">
        <circle cx="34" cy="34" r={r} fill="none" stroke="#DBEAFE" strokeWidth="7" />
        <circle
          cx="34" cy="34" r={r} fill="none" stroke="#2563EB" strokeWidth="7" strokeLinecap="round"
          strokeDasharray={`${(c * percent) / 100} ${c}`}
          transform="rotate(-90 34 34)"
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-[#2563EB] dark:text-blue-300"
        style={{ fontSize: 14.5, fontWeight: 700 }}
      >
        {percent}%
      </span>
    </div>
  );
}

/** Faint campus crest behind the right edge of the hero card. */
function CrestWatermark() {
  const leaves = Array.from({ length: 7 }, (_, i) => {
    const ang = Math.PI * (0.60 + (i / 6) * 0.66);
    const cx = 100 + Math.cos(ang) * 76;
    const cy = 104 + Math.sin(ang) * 76;
    return { cx, cy, rot: (ang * 180) / Math.PI + 90 };
  });
  return (
    <svg
      className="pointer-events-none absolute right-4 top-1/2 hidden -translate-y-1/2 lg:block"
      width="235" height="235" viewBox="0 0 200 200" fill="none" aria-hidden="true"
      style={{ opacity: 0.08 }}
    >
      <g stroke="#1B2A6E" strokeWidth="3" fill="none" strokeLinecap="round">
        <path d="M63 48c-19 17-28 42-26 68 2 25 13 45 29 59" />
        <path d="M137 48c19 17 28 42 26 68-2 25-13 45-29 59" />
      </g>
      <g fill="#1B2A6E">
        {leaves.map((l, i) => (
          <ellipse key={`l${i}`} cx={l.cx} cy={l.cy} rx="9" ry="4.2" transform={`rotate(${l.rot} ${l.cx} ${l.cy})`} />
        ))}
        {leaves.map((l, i) => (
          <ellipse key={`r${i}`} cx={200 - l.cx} cy={l.cy} rx="9" ry="4.2" transform={`rotate(${-l.rot} ${200 - l.cx} ${l.cy})`} />
        ))}
        <path d="M100 30l2.6 5.6L108 38l-5.4 2.4L100 46l-2.6-5.6L92 38l5.4-2.4z" />
        <path d="M78 40l2 4.3 4.2 1.7-4.2 1.9L78 52l-2-4.1-4.2-1.9 4.2-1.7z" />
        <path d="M122 40l2 4.3 4.2 1.7-4.2 1.9-2 4.1-2-4.1-4.2-1.9 4.2-1.7z" />
      </g>
      <path d="M100 52l52 19v40c0 32-21 53-52 64-31-11-52-32-52-64V71z" stroke="#1B2A6E" strokeWidth="4.5" fill="none" />
      <path d="M100 84v46M77 107h46" stroke="#1B2A6E" strokeWidth="10" strokeLinecap="round" />
    </svg>
  );
}

/** One hero meta tile — icon chip plus label/value. */
function HeroMeta({ icon: Icon, label, value, tone = '#2563EB', bg = '#EFF6FF' }: {
  icon: LucideIcon; label: string; value: string; tone?: string; bg?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg dark:bg-slate-700/60" style={{ background: bg }}>
        <Icon size={15} style={{ color: tone }} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-slate-500 dark:text-slate-400" style={{ fontSize: 11.5, lineHeight: 1.4 }}>{label}</p>
        <p className="truncate text-black dark:text-slate-100" style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.4 }}>{value}</p>
      </div>
    </div>
  );
}

function HeroDivider() {
  return <span className="hidden h-9 w-px shrink-0 bg-blue-100 dark:bg-slate-700 sm:block" />;
}

function formatShortDate(raw?: string) {
  if (!raw) return '';
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? raw : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function StudentProfileView({
  student, consultations, isAdmin, showToast, onBack, onEdit, onViewHistory,
}: {
  student: Student;
  consultations: Consultation[];
  isAdmin: boolean;
  showToast: (m: string) => void;
  onBack: () => void;
  onEdit: (s: Student) => void;
  onViewHistory?: () => void;
}) {
  const p = student;
  const { docs, loading: docsLoading, error: docsError, refresh: refreshDocs } = usePersonDocuments('student', p.studentId);

  const age = useMemo(() => {
    if (!p.birthdate) return '';
    const b = new Date(p.birthdate);
    if (Number.isNaN(b.getTime())) return '';
    const now = new Date();
    let a = now.getFullYear() - b.getFullYear();
    const m = now.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
    return a >= 0 ? String(a) : '';
  }, [p.birthdate]);

  const bmi = computeBmi(p.height, p.weight);
  const bmiChip = bmi
    ? bmi.category === 'Normal'
      ? { text: 'Normal', bg: '#DCFCE7', fg: '#15803D' }
      : { text: bmi.category, bg: '#FEF3C7', fg: '#B45309' }
    : undefined;

  // Latest consultation drives Last Visit / Medical Summary
  const lastVisit = useMemo(() => {
    const mine = consultations
      .filter((c) => c.studentId === p.studentId)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    return mine[0];
  }, [consultations, p.studentId]);

  // Profile completeness — the checklist mirrors what staff are asked to fill in
  const checklist = useMemo(() => ({
    'Personal Information': Boolean(p.gender && p.bloodType),
    'Residence Information': Boolean(p.presentAddress || p.homeAddress),
    'Guardian Information': Boolean(p.guardianName && p.guardianContact),
    Height: Boolean(p.height),
    Weight: Boolean(p.weight),
    'Date of Birth': Boolean(p.birthdate),
  }), [p]);

  const percent = useMemo(() => {
    const tracked = [
      p.studentId, p.name, p.course, p.yearLevel, p.gender, p.contactNumber, p.email, p.photo,
      p.birthdate, p.bloodType, p.schoolYear, p.height, p.weight, p.presentAddress, p.homeAddress,
      p.guardianName, p.guardianRelationship, p.guardianContact, p.allergies,
    ];
    const filled = tracked.filter((v) => String(v || '').trim()).length;
    return Math.round((filled / tracked.length) * 100);
  }, [p]);

  const headline = percent >= 100 ? 'All set!' : percent >= 60 ? 'Almost there!' : 'Needs attention';
  const bloodSign = p.bloodType.endsWith('+') ? 'Positive' : p.bloodType.endsWith('-') ? 'Negative' : '';
  const verified = p.status === 'enrolled';
  // An alumnus is not "unverified" — they completed the program. The badge says
  // which of the two it is rather than lumping every non-enrolled record together.
  const standing = p.status === 'graduated'
    ? { label: 'Alumnus', ...STATUS_TONES.graduated }
    : verified
      ? { label: 'Verified Student', fg: '#15803D', bg: '#ECFDF5' }
      : { label: 'Dropped', ...STATUS_TONES.dropped };

  const summaryLeft = [
    { label: 'Allergies', value: p.allergies || 'None known', alert: Boolean(p.allergies) },
    { label: 'Maintenance Medicines', value: p.currentMedications || 'None', alert: Boolean(p.currentMedications) },
    { label: 'Medical Conditions', value: p.medicalConditions || 'None', alert: Boolean(p.medicalConditions) },
  ];
  const summaryRight = [
    { icon: Clock, label: 'Last Consultation', value: lastVisit ? formatShortDate(lastVisit.date) : 'No records', ok: Boolean(lastVisit) },
    { icon: Stethoscope, label: 'Latest Diagnosis', value: lastVisit?.outcome || lastVisit?.summary || 'None recorded', ok: Boolean(lastVisit) },
    { icon: CalendarClock, label: 'Next Follow-up', value: 'No follow-up', ok: false },
  ];

  return (
    <div className="space-y-4">
      {/* ── Page header ── */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-100 bg-white text-slate-600 transition-colors hover:bg-blue-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          title="Back to Students"
          aria-label="Back to Students"
        >
          <ArrowLeft size={17} />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-black dark:text-white" style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-0.01em' }}>
            Student Profile
          </h1>
          <p className="truncate text-slate-500 dark:text-slate-400" style={{ fontSize: 12.5 }}>
            View and manage student information
          </p>
        </div>
      </div>

      {/* ── Hero card ── */}
      <div className="relative overflow-hidden rounded-2xl border border-blue-100 bg-white p-6 dark:border-slate-700 dark:bg-slate-800">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 lg:block"
          style={{ background: 'linear-gradient(90deg, rgba(238,241,250,0) 0%, rgba(238,241,250,0.75) 100%)' }}
        />
        <CrestWatermark />

        <div className="relative flex flex-col gap-6 sm:flex-row">
          {/* Photo + verification */}
          <div className="flex shrink-0 flex-col items-center gap-2.5">
            <div className="relative">
              {p.photo ? (
                <img
                  src={p.photo}
                  alt={p.name}
                  className="h-[152px] w-[148px] rounded-xl object-cover shadow-md ring-4 ring-white dark:ring-slate-700"
                />
              ) : (
                <div
                  className="flex h-[152px] w-[148px] items-center justify-center rounded-xl bg-blue-100 shadow-md ring-4 ring-white dark:ring-slate-700"
                  style={{ fontSize: 34, fontWeight: 700, color: '#37479A' }}
                >
                  {avatarInitials(p.name) || <User size={38} className="text-blue-400" />}
                </div>
              )}
              <button
                onClick={() => onEdit(p)}
                className="absolute bottom-2.5 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-white/95 px-3 py-1 text-[#37479A] shadow-md transition-colors hover:bg-blue-50"
                style={{ fontSize: 11, fontWeight: 600 }}
                title="Change photo"
              >
                <Camera size={11} />
                Change Photo
              </button>
            </div>
            <span
              className="flex w-full items-center justify-center gap-1.5 rounded-full border px-3 py-1"
              style={{
                background: standing.bg,
                borderColor: standing.fg,
                color: standing.fg,
                fontSize: 11.5,
                fontWeight: 600,
              }}
            >
              {p.status === 'graduated' ? <GraduationCap size={12} /> : <CheckCircle2 size={12} />}
              {standing.label}
            </span>
          </div>

          {/* Identity */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-black dark:text-white" style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
                  {p.name}
                </p>
                <p className="mt-2 flex items-center gap-1.5 text-[#2563EB] dark:text-blue-300" style={{ fontSize: 13, fontWeight: 500 }}>
                  <IdCard size={15} />
                  Student ID: {p.studentId}
                </p>
              </div>

              <button
                onClick={() => onEdit(p)}
                className="flex shrink-0 items-center gap-2 rounded-lg border border-blue-200 bg-white px-4 py-2 text-[#2563EB] transition-colors hover:bg-blue-50 dark:border-slate-600 dark:bg-slate-800 dark:text-blue-300 dark:hover:bg-slate-700"
                style={{ fontSize: 13, fontWeight: 600 }}
              >
                <Pencil size={14} />
                Edit Profile
              </button>
            </div>

            {/* Meta row 1 */}
            <div className="mt-7 flex flex-wrap items-center gap-x-7 gap-y-3">
              <HeroMeta icon={BookOpen} label="Course" value={[p.course, p.yearLevel].filter(Boolean).join(' - ') || '—'} />
              <HeroDivider />
              <HeroMeta icon={Layers} label="Year Level" value={p.yearLevel || '—'} tone="#4F46E5" bg="#EEF2FF" />
              <HeroDivider />
              <HeroMeta
                icon={p.status === 'graduated' ? GraduationCap : CircleDot}
                label="Status"
                value={
                  p.status === 'graduated' && p.dateGraduated
                    ? `Graduated · ${formatShortDate(p.dateGraduated)}`
                    : STATUS_LABELS[p.status]
                }
                tone={STATUS_TONES[p.status].fg}
                bg={STATUS_TONES[p.status].bg}
              />
            </div>

            {/* Meta row 2 */}
            <div className="mt-6 flex flex-wrap items-center gap-x-7 gap-y-3">
              <HeroMeta icon={Phone} label="Contact Number" value={p.contactNumber || '—'} />
              <HeroDivider />
              <HeroMeta icon={Mail} label="Email Address" value={p.email || '—'} />
              <HeroDivider />
              <HeroMeta icon={CalendarDays} label="Date Enrolled" value={p.schoolYear ? `SY ${p.schoolYear}` : '—'} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Body: details (2fr) + side panels (1fr) ── */}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {/* Statistics */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              icon={Droplet} label="Blood Type" value={p.bloodType || '—'} sub={bloodSign || 'Not recorded'}
              bg="#FEF2F2" border="#FEE2E2" fg="#EF4444"
            />
            <StatTile
              icon={Scale} label="BMI" value={bmi ? bmi.value : '—'} chip={bmiChip} sub="Not recorded"
              bg="#F0FDF4" border="#DCFCE7" fg="#16A34A"
            />
            <StatTile
              icon={FolderOpen} label="Total Records" value={docsLoading ? '…' : String(docs.length)} sub="Files"
              bg="#F5F3FF" border="#EDE9FE" fg="#7C3AED"
            />
            <StatTile
              icon={CalendarDays} label="Last Visit" value={lastVisit ? formatShortDate(lastVisit.date) : '—'}
              sub={lastVisit?.time || 'No visits yet'} valueSize={16}
              bg="#FFFBEB" border="#FEF3C7" fg="#D97706"
            />
          </div>

          {/* Detail sections — two stacks so cards pack upward */}
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
            <div className="space-y-4">
              <ProfileSection icon={User} title="Personal Information">
                <ProfileFieldGrid
                  cols={3}
                  isAdmin={isAdmin}
                  items={[
                    { label: 'Sex', value: p.gender, icon: User },
                    { label: 'Date of Birth', value: p.birthdate, icon: CalendarDays },
                    { label: 'Age', value: age },
                    { label: 'Blood Type', value: p.bloodType, icon: Droplet },
                    { label: 'Height', value: p.height ? `${p.height} cm` : '', icon: Ruler },
                    { label: 'Weight', value: p.weight ? `${p.weight} kg` : '', icon: Scale },
                    { label: 'BMI', value: bmi?.value, icon: Activity, chip: bmiChip },
                  ]}
                />
              </ProfileSection>

              <ProfileSection icon={Users} title="Guardian / Parent Information">
                <ProfileFieldGrid
                  cols={3}
                  isAdmin={isAdmin}
                  items={[
                    { label: 'Name', value: p.guardianName, icon: User, conf: true },
                    { label: 'Relationship', value: p.guardianRelationship, conf: true },
                    { label: 'Contact Number', value: p.guardianContact, conf: true },
                  ]}
                />
              </ProfileSection>

              <ProfileSection icon={HeartPulse} title="Medical Information" tone="red">
                <ProfileFieldGrid
                  cols={2}
                  isAdmin={isAdmin}
                  items={[
                    { label: 'Allergies', value: p.allergies },
                    { label: 'Medical Conditions', value: p.medicalConditions },
                    { label: 'Current Medications', value: p.currentMedications },
                    { label: 'Others', value: p.medicalOthers },
                  ]}
                />
              </ProfileSection>
            </div>

            <div className="space-y-4">
              <ProfileSection icon={MapPin} title="Residence Information">
                <ProfileFieldGrid
                  cols={1}
                  isAdmin={isAdmin}
                  items={[
                    { label: 'Current Address', value: p.presentAddress, icon: Building2, conf: true },
                    { label: 'Permanent / Home Address', value: p.homeAddress, icon: ClipboardList, conf: true },
                  ]}
                />
              </ProfileSection>

              <ProfileSection icon={Home} title="Boarding House Information">
                <ProfileFieldGrid
                  cols={2}
                  isAdmin={isAdmin}
                  items={[
                    { label: 'Boarding House Name', value: p.boardingHouseName, icon: Building2, conf: true },
                    { label: 'Boarding House Address', value: p.boardingHouseAddress, icon: MapPin, conf: true },
                    { label: 'Landlord / Landlady', value: p.landlordName, icon: User, conf: true },
                    { label: 'Landlord Contact Number', value: p.landlordContact, icon: Phone, conf: true },
                  ]}
                />
              </ProfileSection>

              <ProfileSection icon={PhoneCall} title="Emergency Contact" tone="red">
                <ProfileFieldGrid
                  cols={3}
                  isAdmin={isAdmin}
                  items={[
                    { label: 'Name', value: p.guardianName, icon: User, conf: true },
                    { label: 'Relationship', value: p.guardianRelationship, conf: true },
                    { label: 'Contact Number', value: p.guardianContact, conf: true },
                  ]}
                />
              </ProfileSection>
            </div>
          </div>

          {isAdmin && (
            <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-900/40 dark:bg-yellow-900/10">
              <p className="mb-1 flex items-center gap-1.5 text-yellow-700 dark:text-yellow-300" style={{ fontSize: 12, fontWeight: 600 }}>
                <Lock size={12} /> Confidential Notes (admin only)
              </p>
              <p className="text-black dark:text-slate-200" style={{ fontSize: 13 }}>
                {p.confidentialNotes || 'None recorded'}
              </p>
            </div>
          )}
        </div>

        {/* ── Side panels ── */}
        <div className="space-y-4">
          <ProfileDocuments
            ownerType="student"
            ownerId={p.studentId}
            docs={docs}
            loading={docsLoading}
            error={docsError}
            refresh={refreshDocs}
            showToast={showToast}
          />

          {/* Profile completion */}
          <div className="rounded-2xl border border-blue-100 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <div className="flex items-center gap-4">
              <CompletionRing percent={percent} />
              <div className="min-w-0">
                <p className="text-blue-900 dark:text-white" style={{ fontSize: 14.5, fontWeight: 700 }}>Profile Completion</p>
                <p className="text-black dark:text-slate-100" style={{ fontSize: 12, fontWeight: 600 }}>{headline}</p>
                <p className="text-slate-500 dark:text-slate-400" style={{ fontSize: 11.5, lineHeight: 1.45 }}>
                  Complete the missing information to keep student records up to date.
                </p>
              </div>
            </div>

            <div className="mt-3.5 flex items-start gap-8">
              <ul className="shrink-0 space-y-1.5">
                {(['Personal Information', 'Residence Information'] as const).map((k) => (
                  <ChecklistRow key={k} label={k} done={checklist[k]} />
                ))}
              </ul>
              <ul className="shrink-0 space-y-1.5">
                {(['Height', 'Weight', 'Guardian Information', 'Date of Birth'] as const).map((k) => (
                  <ChecklistRow key={k} label={k} done={checklist[k]} />
                ))}
              </ul>
            </div>
          </div>

          {/* Medical summary */}
          <div className="rounded-2xl border border-blue-100 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg dark:bg-slate-700/60" style={{ background: '#FEF2F2' }}>
                <HeartPulse size={15} style={{ color: '#DC2626' }} />
              </span>
              <p className="min-w-0 flex-1 truncate text-blue-900 dark:text-white" style={{ fontSize: 14.5, fontWeight: 700 }}>
                Medical Summary
              </p>
              <button
                type="button"
                onClick={onViewHistory}
                className="shrink-0 text-[#2563EB] transition-colors hover:text-blue-800 dark:text-blue-300"
                style={{ fontSize: 12, fontWeight: 600 }}
              >
                View Full History
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:divide-x sm:divide-blue-50 sm:dark:divide-slate-700">
              <ul className="space-y-2 sm:pr-3">
                {summaryLeft.map((s) => (
                  <li key={s.label} className="flex items-start gap-2">
                    {s.alert
                      ? <AlertCircle size={13} className="mt-0.5 shrink-0 text-[#F59E0B]" />
                      : <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-[#16A34A]" />}
                    <div className="min-w-0">
                      <p className="truncate text-black dark:text-slate-100" style={{ fontSize: 11.5, fontWeight: 600 }}>{s.label}</p>
                      <p className="truncate text-slate-500 dark:text-slate-400" style={{ fontSize: 11.5 }}>{s.value}</p>
                    </div>
                  </li>
                ))}
              </ul>

              <ul className="space-y-2 sm:pl-3">
                {summaryRight.map(({ icon: Icon, label, value, ok }) => (
                  <li key={label} className="flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-50 dark:bg-slate-700/60">
                      <Icon size={12} style={{ color: '#2563EB' }} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-black dark:text-slate-100" style={{ fontSize: 11.5, fontWeight: 600 }}>{label}</p>
                      <p className="truncate text-slate-500 dark:text-slate-400" style={{ fontSize: 11.5 }}>{value}</p>
                    </div>
                    {ok
                      ? <CheckCircle2 size={13} className="shrink-0 text-[#16A34A]" />
                      : <MinusCircle size={13} className="shrink-0 text-slate-300" />}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="flex items-center justify-center gap-2 pt-1 text-slate-400" style={{ fontSize: 11.5 }}>
        <span>© {new Date().getFullYear()} Clinix – BISU Calape Campus Clinic Management System</span>
        <Activity size={12} />
      </div>
    </div>
  );
}

function ChecklistRow({ label, done }: { label: string; done: boolean }) {
  return (
    <li className="flex items-center gap-1.5 pr-3">
      {done
        ? <CheckCircle2 size={12} className="shrink-0 text-[#16A34A]" />
        : <AlertCircle size={12} className="shrink-0 text-[#F59E0B]" />}
      <span className="whitespace-nowrap text-slate-600 dark:text-slate-300" style={{ fontSize: 11 }}>{label}</span>
    </li>
  );
}

export function StudentsModule({ students, setStudents, globalSearch, showToast, addActivity, openProfileId, onProfileOpened, consultations = [], onViewHistory }: Props) {
  const colleges = useColleges();
  const isAdmin = canSeeConfidential();
  const [tab, setTab] = useState<TabId>('list');
  const [localSearch, setLocalSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewStudent, setViewStudent] = useState<Student | null>(null);

  // Open the full profile when another module (e.g. Dashboard search) requests it
  useEffect(() => {
    if (!openProfileId) return;
    const target = students.find((s) => s.studentId === openProfileId);
    if (target) {
      setViewStudent(target);
      onProfileOpened?.();
    }
  }, [openProfileId, students, onProfileOpened]);
  const [showFormModal, setShowFormModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [pendingCsv, setPendingCsv] = useState<PendingCsvRow[]>([]);
  const [csvFileName, setCsvFileName] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('name-asc');
  const [courseFilter, setCourseFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusView>('enrolled');
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  const query = (localSearch || globalSearch).trim().toLowerCase();

  const matchesQuery = (s: Student) =>
    [s.studentId, s.name, s.lastName, s.firstName, s.middleInitial, s.course, s.yearLevel, s.gender, s.contactNumber, s.medicalConditions]
      .join(' ')
      .toLowerCase()
      .includes(query);

  const statusCounts = useMemo(() => {
    const counts: Record<StatusView, number> = { enrolled: 0, graduated: 0, dropped: 0, all: students.length };
    students.forEach((s) => { counts[s.status]++; });
    return counts;
  }, [students]);

  const visible = useMemo(
    () =>
      students.filter(
        (s) =>
          (statusFilter === 'all' || s.status === statusFilter) &&
          (!courseFilter || normalizeCourseName(s.course) === courseFilter) &&
          (!yearFilter || s.yearLevel === yearFilter) &&
          matchesQuery(s),
      ).sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [students, query, courseFilter, yearFilter, statusFilter],
  );

  // The type-ahead deliberately ignores the status tabs. A graduate walking in
  // for a copy of their record for employment or a board exam has to be findable
  // without first knowing to switch to the Alumni view.
  const searchMatches = useMemo(
    () => (query ? students.filter(matchesQuery).slice(0, 6) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [students, query],
  );

  function openAdd(prefill: Partial<typeof defaultForm> = {}) {
    setForm({ ...defaultForm, ...prefill });
    setEditingId(null);
    setShowFormModal(true);
  }

  function openEdit(s: Student) {
    setForm({
      studentId: s.studentId,
      lastName: s.lastName,
      firstName: s.firstName,
      middleInitial: s.middleInitial,
      course: s.course,
      yearLevel: s.yearLevel,
      gender: s.gender,
      contactNumber: s.contactNumber,
      email: s.email || '',
      medicalConditions: s.medicalConditions,
      status: s.status,
      dateGraduated: s.dateGraduated || '',
      photo: s.photo || '',
      birthdate: s.birthdate || '',
      bloodType: s.bloodType || '',
      schoolYear: s.schoolYear || '',
      homeAddress: s.homeAddress || '',
      presentAddress: s.presentAddress || '',
      guardianName: s.guardianName || '',
      guardianRelationship: s.guardianRelationship || '',
      guardianContact: s.guardianContact || '',
      confidentialNotes: s.confidentialNotes || '',
      allergies: s.allergies || '',
      currentMedications: s.currentMedications || '',
      medicalOthers: s.medicalOthers || '',
      height: s.height || '',
      weight: s.weight || '',
      currentProvince: s.currentProvince || '',
      currentCity: s.currentCity || '',
      currentBarangay: s.currentBarangay || '',
      currentPurok: s.currentPurok || '',
      currentZip: s.currentZip || '',
      homeProvince: s.homeProvince || '',
      homeCity: s.homeCity || '',
      homeBarangay: s.homeBarangay || '',
      homePurok: s.homePurok || '',
      homeZip: s.homeZip || '',
      isBoarding: s.isBoarding || false,
      boardingHouseName: s.boardingHouseName === 'N/A' ? '' : (s.boardingHouseName || ''),
      boardingHouseAddress: s.boardingHouseAddress === 'N/A' ? '' : (s.boardingHouseAddress || ''),
      landlordName: s.landlordName === 'N/A' ? '' : (s.landlordName || ''),
      landlordContact: s.landlordContact === 'N/A' ? '' : (s.landlordContact || ''),
    });
    setEditingId(s.studentId);
    setShowFormModal(true);
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { showToast('Profile image must be under 8 MB'); return; }
    let dataUrl: string;
    try {
      dataUrl = await readFileAsCompressedDataUrl(file);
    } catch {
      showToast('Could not process that image');
      return;
    }
    setForm((f) => ({ ...f, photo: dataUrl }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.isBoarding && (!form.boardingHouseName.trim() || !form.boardingHouseAddress.trim() || !form.landlordName.trim() || !form.landlordContact.trim())) {
      showToast('Boarding house information is required because the student is staying in a boarding house / dormitory / apartment.');
      return;
    }
    // Living with family → boarding house details are recorded as "N/A"
    const boarding = form.isBoarding
      ? {
          boardingHouseName: form.boardingHouseName.trim(),
          boardingHouseAddress: form.boardingHouseAddress.trim(),
          landlordName: form.landlordName.trim(),
          landlordContact: form.landlordContact.trim(),
        }
      : { boardingHouseName: 'N/A', boardingHouseAddress: 'N/A', landlordName: 'N/A', landlordContact: 'N/A' };
    // Marking someone graduated without saying when leaves every per-school-year
    // report unable to place them, so the date is required rather than assumed.
    if (form.status === 'graduated' && !form.dateGraduated) {
      showToast('Enter the date graduated');
      return;
    }
    const record = normalizeStudent({ ...form, ...boarding } as Record<string, unknown>);
    if (!record.studentId || !record.lastName || !record.firstName) {
      showToast('Student ID, first name, and last name are required');
      return;
    }
    if (!/^\d{6}$/.test(record.studentId)) {
      showToast('Student ID must be exactly 6 digits');
      return;
    }
    if (record.contactNumber && !/^\d{1,12}$/.test(record.contactNumber)) {
      showToast('Contact number must be 12 digits or less');
      return;
    }
    if (editingId) {
      try {
        await saveStudentApi(record, editingId);
      } catch (error) {
        showToast(`${error instanceof Error ? error.message : 'API error'}. Student was not saved.`);
        return;
      }
      setStudents((prev) =>
        prev.map((s) =>
          s.studentId === editingId
            // The audit columns are written by the server, so the form has
            // nothing truthful to put there — keep what we already had rather
            // than blanking it until the next reload.
            ? { ...s, ...record, statusUpdatedAt: s.statusUpdatedAt, statusUpdatedBy: s.statusUpdatedBy }
            : s
        ),
      );
      showToast(`${record.name} updated`);
      addActivity(`Student updated: ${record.name}`);
    } else {
      if (students.find((s) => s.studentId === record.studentId)) {
        showToast('Student ID already exists');
        return;
      }
      try {
        await saveStudentApi(record);
      } catch (error) {
        showToast(`${error instanceof Error ? error.message : 'API error'}. Student was not saved.`);
        return;
      }
      setStudents((prev) => [...prev, record]);
      showToast(`${record.name} added`);
      addActivity(`Student added: ${record.name}`);
    }
    setForm(defaultForm);
    setEditingId(null);
    setShowFormModal(false);
    setTab('list');
  }

  async function handleArchive(s: Student) {
    if (!(await confirmDialog({
      title: `Mark ${s.name} as dropped?`,
      message: 'The record itself is kept — nothing is deleted and the medical history stays searchable. Only the status changes, and it moves out of the Enrolled view.',
      confirmLabel: 'Mark as dropped',
    }))) return;
    const archived = { ...s, status: 'dropped' as const };
    try {
      await saveStudentApi(archived, s.studentId);
    } catch (error) {
      showToast(`${error instanceof Error ? error.message : 'API error'}. Student was not archived.`);
      return;
    }
    setStudents((prev) =>
      prev.map((x) => (x.studentId === s.studentId ? archived : x)),
    );
    showToast(`${s.name} archived`);
    addActivity(`Student archived: ${s.name}`);
  }

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const records = parseCsv(String(reader.result || ''))
        // The raw record is kept alongside the normalised one: normalising fills
        // every unmentioned field with '', and only the raw keys say which of
        // those the file actually supplied.
        .map((raw) => ({ raw, student: normalizeStudent(raw) }))
        .filter((r) => r.student.studentId && r.student.name);
      setPendingCsv(records);
    };
    reader.readAsText(file);
  }

  /**
   * What to send for one CSV row.
   *
   * A brand new student is written whole. An existing one is *merged*: only the
   * columns the file carried are sent, so importing a roster that lists nothing
   * but ID, course and year level cannot blank out the allergies, guardian,
   * address and photo the clinic has been collecting all year.
   */
  function csvPayload(rec: PendingCsvRow, exists: boolean): Student {
    if (!exists) return rec.student;
    const merged: Record<string, unknown> = { studentId: rec.student.studentId };
    for (const key of Object.keys(rec.raw)) {
      merged[key] = rec.student[key as keyof Student];
    }
    // A name is rebuilt from whichever of the name columns were present, so a
    // file with just a surname column does not resend a half-empty full name.
    if (!('name' in rec.raw) && !('lastName' in rec.raw) && !('firstName' in rec.raw)) delete merged.name;
    return merged as unknown as Student;
  }

  async function handleCsvImport() {
    if (!pendingCsv.length) { showToast('Choose a CSV file first'); return; }
    try {
      await Promise.all(
        pendingCsv.map((rec) => {
          const exists = students.some((s) => s.studentId === rec.student.studentId);
          return saveStudentApi(csvPayload(rec, exists), exists ? rec.student.studentId : null);
        }),
      );
    } catch (error) {
      showToast(`${error instanceof Error ? error.message : 'API error'}. CSV was not imported.`);
      return;
    }
    setStudents((prev) => {
      const updated = [...prev];
      pendingCsv.forEach((rec) => {
        const idx = updated.findIndex((s) => s.studentId === rec.student.studentId);
        // Mirrors the merge sent to the server: keep what is already known and
        // lay only the file's own columns over the top.
        if (idx >= 0) updated[idx] = { ...updated[idx], ...csvPayload(rec, true) };
        else updated.push(rec.student);
      });
      return updated;
    });
    showToast(`${pendingCsv.length} record(s) imported`);
    addActivity(`${pendingCsv.length} students imported from CSV`);
    setPendingCsv([]);
    setCsvFileName('');
    setShowImportModal(false);
  }

  function exportRows(rows: Student[], title: string) {
    const headers = [
      'Student ID', 'Last Name', 'First Name', 'M.I.', 'Name', 'Course', 'Year Level', 'Sex', 'Contact Number', 'Email', 'Birthdate', 'Blood Type', 'Height (cm)', 'Weight (kg)', 'School Year',
      'Guardian Name', 'Guardian Relationship', 'Guardian Contact',
      'Current Province', 'Current City/Municipality', 'Current Barangay', 'Current Purok/Street', 'Current ZIP',
      'Home Province', 'Home City/Municipality', 'Home Barangay', 'Home Purok/Street', 'Home ZIP',
      'Is Boarding', 'Boarding House Name', 'Boarding House Address', 'Landlord Name', 'Landlord Contact',
      'Medical Conditions', 'Allergies', 'Current Medications', 'Others', 'Status', 'Date Graduated',
    ];
    const csv = [headers, ...rows.map((s) => [
      s.studentId, s.lastName, s.firstName, s.middleInitial, s.name, s.course, s.yearLevel, s.gender, s.contactNumber, s.email, s.birthdate, s.bloodType, s.height, s.weight, s.schoolYear,
      s.guardianName, s.guardianRelationship, s.guardianContact,
      s.currentProvince, s.currentCity, s.currentBarangay, s.currentPurok, s.currentZip,
      s.homeProvince, s.homeCity, s.homeBarangay, s.homePurok, s.homeZip,
      s.isBoarding ? 'Yes' : 'No', s.boardingHouseName, s.boardingHouseAddress, s.landlordName, s.landlordContact,
      s.medicalConditions, s.allergies, s.currentMedications, s.medicalOthers, s.status, s.dateGraduated,
    ])].map((row) => row.map(csvCell).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = `${title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'students'}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function sortRows(rows: Student[]) {
    const sorted = [...rows];
    sorted.sort((a, b) => {
      switch (sortOrder) {
        case 'name-desc':
          return `${b.lastName} ${b.firstName}`.localeCompare(`${a.lastName} ${a.firstName}`);
        case 'id-asc':
          return a.studentId.localeCompare(b.studentId, undefined, { numeric: true });
        case 'id-desc':
          return b.studentId.localeCompare(a.studentId, undefined, { numeric: true });
        case 'name-asc':
        default:
          return `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`);
      }
    });
    return sorted;
  }

  function printRows(rows: Student[], title: string) {
    const html = `
      <h2>${htmlCell(title)}</h2>
      <p>${rows.length} record(s)</p>
      <table border="1" cellspacing="0" cellpadding="6" style="width:100%;border-collapse:collapse;font-family:Arial;font-size:12px">
        <thead><tr>${['ID', 'Last Name', 'First Name', 'M.I.', 'Course', 'Year', 'Sex', 'Contact', 'Medical Conditions', 'Status'].map((h) => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${rows.map((s) => `<tr><td>${htmlCell(s.studentId)}</td><td>${htmlCell(s.lastName)}</td><td>${htmlCell(s.firstName)}</td><td>${htmlCell(s.middleInitial)}</td><td>${htmlCell(s.course)}</td><td>${htmlCell(s.yearLevel)}</td><td>${htmlCell(s.gender)}</td><td>${htmlCell(s.contactNumber)}</td><td>${htmlCell(s.medicalConditions)}</td><td>${htmlCell(s.status)}</td></tr>`).join('')}</tbody>
      </table>`;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.print();
  }

  const fieldClass =
    'w-full border border-blue-100 dark:border-slate-600 rounded-lg px-3 py-2 text-black dark:text-slate-200 bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';
  const labelClass = 'block text-slate-600 dark:text-slate-400 mb-1';
  const btnPrimary =
    'bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors';
  const btnSecondary =
    'bg-white border border-blue-100 text-black px-4 py-2 rounded-lg hover:bg-blue-50 transition-colors';

  function studentTable(rows: Student[], title: string) {
    const sortedRows = sortRows(rows);
    return (
      <div className="mt-3 overflow-hidden rounded-xl border border-blue-100 bg-white">
        <div className="px-5 py-4 border-b border-blue-100">
          <p className="text-black" style={{ fontSize: 14, fontWeight: 600 }}>
            {title}
          </p>
          <p className="text-slate-400" style={{ fontSize: 12 }}>
            {sortedRows.length} {statusFilter === 'all' ? '' : `${statusFilter} `}record{sortedRows.length !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="bg-blue-50 border-b border-blue-100">
                {[
                  'Profile', 'ID', 'Last Name', 'First Name', 'M.I.', 'Course', 'Year', 'Contact',
                  'Medical Conditions', 'Status', 'Actions',
                ].map((h) => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 text-slate-500 uppercase tracking-wider whitespace-nowrap"
                    style={{ fontSize: 11, fontWeight: 600 }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center py-12 text-slate-400" style={{ fontSize: 13 }}>
                    No students match your search
                  </td>
                </tr>
              ) : (
                sortedRows.map((s) => (
                  <tr key={s.studentId} onClick={() => setViewStudent(s)}
                    className="hover:bg-blue-50 transition-colors cursor-pointer" title="View profile">
                    <td className="px-4 py-3">
                      <StudentAvatar photo={s.photo} name={s.name} size="sm" />
                    </td>
                    <td className="px-4 py-3 text-slate-600" style={{ fontSize: 13 }}>
                      {s.studentId}
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-black" style={{ fontSize: 13, fontWeight: 500 }}>
                          {s.lastName}
                        </p>
                        <p className="text-slate-400" style={{ fontSize: 11 }}>
                          {s.gender || '—'}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600" style={{ fontSize: 13 }}>
                      {s.firstName || '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-600" style={{ fontSize: 13 }}>
                      {s.middleInitial || '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-600" style={{ fontSize: 13 }}>
                      {s.course || '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap" style={{ fontSize: 13 }}>
                      {s.yearLevel || '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap" style={{ fontSize: 13 }}>
                      {s.contactNumber || '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-500 max-w-[160px] truncate" style={{ fontSize: 13 }}>
                      {s.medicalConditions || 'None'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); openEdit(s); }}
                          className="p-1.5 rounded-md hover:bg-blue-100 text-slate-400 hover:text-black transition-colors"
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        {/* Only an enrolled student can be dropped. Offering it on
                            a graduate would imply their record can be taken out
                            of circulation, which is exactly what must not happen. */}
                        {s.status === 'enrolled' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleArchive(s); }}
                            className="p-1.5 rounded-md hover:bg-yellow-50 text-slate-400 hover:text-yellow-600 transition-colors"
                            title="Mark as dropped"
                          >
                            <Archive size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const tableTitle =
    [STATUS_VIEWS.find((v) => v.id === statusFilter)?.label, courseFilter, yearFilter]
      .filter(Boolean).join(' / ') || 'All Students';

  return (
    <div className="space-y-5 max-w-screen-xl">
      {!viewStudent && <>
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-black dark:text-white" style={{ fontWeight: 700, fontSize: 20 }}>Students</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-0.5" style={{ fontSize: 13 }}>
            Manage student records, profiles, and enrollment status
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => exportRows(sortRows(visible), tableTitle)}
            className="flex shrink-0 items-center gap-2 rounded-lg border border-blue-100 bg-white px-4 py-2 text-slate-600 transition-colors hover:bg-blue-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            style={{ fontSize: 13 }}
            title="Export CSV"
          >
            <Download size={15} />
            CSV
          </button>
          <button
            onClick={() => printRows(sortRows(visible), tableTitle)}
            className="flex shrink-0 items-center gap-2 rounded-lg border border-blue-100 bg-white px-4 py-2 text-slate-600 transition-colors hover:bg-blue-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            style={{ fontSize: 13 }}
            title="Print student list"
          >
            <Printer size={15} />
            Print
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="flex shrink-0 items-center gap-2 rounded-lg border border-blue-100 bg-white px-4 py-2 text-slate-600 transition-colors hover:bg-blue-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            style={{ fontSize: 13 }}
            title="Import CSV"
          >
            <Upload size={15} />
            Import
          </button>
          <button
            onClick={() => openAdd(courseFilter || yearFilter ? { course: courseFilter, yearLevel: yearFilter } : {})}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
            style={{ fontSize: 13 }}
          >
            <Plus size={15} />
            Add Student
          </button>
        </div>
      </div>

      {/* ── LIST TAB ── */}
      {tab === 'list' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden border border-blue-100 dark:border-slate-700">
          {/* Status views — one page, one table, filtered. Graduates are not on a
              separate screen because they are not a separate kind of record. */}
          <div className="flex flex-wrap gap-1 border-b border-blue-100 px-5 pt-4 dark:border-slate-700">
            {STATUS_VIEWS.map((v) => {
              const active = statusFilter === v.id;
              return (
                <button
                  key={v.id}
                  onClick={() => setStatusFilter(v.id)}
                  className={`flex items-center gap-2 rounded-t-lg border-b-2 px-4 py-2.5 transition-colors ${
                    active
                      ? 'border-blue-600 text-blue-700 dark:text-blue-300'
                      : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                  }`}
                  style={{ fontSize: 13, fontWeight: active ? 600 : 500 }}
                  aria-current={active ? 'page' : undefined}
                >
                  {v.label}
                  <span
                    className={`rounded-full px-1.5 py-0.5 ${active ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'}`}
                    style={{ fontSize: 11, fontWeight: 600 }}
                  >
                    {statusCounts[v.id]}
                  </span>
                </button>
              );
            })}
          </div>

          {statusFilter === 'graduated' && (
            <div className="flex items-start gap-2 border-b border-emerald-100 bg-emerald-50 px-5 py-3 dark:border-emerald-900/40 dark:bg-emerald-900/20">
              <GraduationCap size={15} className="mt-px shrink-0 text-emerald-600" />
              <p className="text-emerald-800 dark:text-emerald-200" style={{ fontSize: 12.5 }}>
                Alumni records are kept in full and stay searchable — a graduate can
                still be given a copy of their medical record. New consultations are
                closed off, but their entire history remains readable.
              </p>
            </div>
          )}

          <div className="px-5 py-4 border-b border-blue-100">
            <div className="flex flex-wrap items-center gap-3">
              {/* Search — upper left, grows to fill available width */}
              <div className="relative flex-1 min-w-[240px]">
                <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={localSearch}
                  onFocus={() => setSearchOpen(true)}
                  onChange={(e) => { setLocalSearch(e.target.value); setSearchOpen(true); }}
                  placeholder="Search by name, ID, course, or year..."
                  className={`${fieldClass} pl-10 ${localSearch ? 'pr-9' : ''}`}
                  style={{ fontSize: 13 }}
                />
                {localSearch && (
                  <button type="button" onClick={() => { setLocalSearch(''); setSearchOpen(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-blue-600" title="Clear search" aria-label="Clear search">
                    <X size={15} />
                  </button>
                )}

                {searchOpen && searchMatches.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-20 mt-1.5 rounded-xl border border-blue-100 bg-white p-1.5 shadow-xl">
                    <p className="px-2 py-1 text-blue-700" style={{ fontSize: 12, fontWeight: 600 }}>
                      Matching students
                    </p>
                    <div className="grid gap-1">
                      {searchMatches.map((s) => (
                        <button
                          key={s.studentId}
                          onClick={() => { setViewStudent(s); setLocalSearch(''); setSearchOpen(false); }}
                          className="flex items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-blue-50"
                        >
                          <StudentAvatar photo={s.photo} name={s.name} size="sm" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-black truncate" style={{ fontSize: 13, fontWeight: 600 }}>
                              {s.name}
                            </span>
                            <span className="block text-slate-500 truncate" style={{ fontSize: 12 }}>
                              {s.course || 'No course'} · {s.yearLevel || 'No year'}
                            </span>
                          </span>
                          <span className="text-slate-400 whitespace-nowrap" style={{ fontSize: 12 }}>
                            {s.studentId}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Filters — beside the search, pushed to the right */}
              <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
                <label className="flex items-center gap-2 text-slate-500" style={{ fontSize: 12, fontWeight: 600 }}>
                  <Filter size={14} />
                  Course
                  <select
                    value={courseFilter}
                    onChange={(e) => setCourseFilter(e.target.value)}
                    className="rounded-lg border border-blue-100 bg-white px-3 py-1.5 text-black"
                    style={{ fontSize: 12 }}
                  >
                    <option value="">All courses</option>
                    {colleges.map((college) => (
                      <optgroup key={college.name} label={college.name}>
                        {college.courses.map((course) => <option key={course} value={course}>{course}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-slate-500" style={{ fontSize: 12, fontWeight: 600 }}>
                  Year
                  <select
                    value={yearFilter}
                    onChange={(e) => setYearFilter(e.target.value)}
                    className="rounded-lg border border-blue-100 bg-white px-3 py-1.5 text-black"
                    style={{ fontSize: 12 }}
                  >
                    <option value="">All year levels</option>
                    {YEAR_OPTIONS.map((year) => <option key={year} value={year}>{year}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-slate-500" style={{ fontSize: 12, fontWeight: 600 }}>
                  Sort
                  <select
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                    className="rounded-lg border border-blue-100 bg-white px-3 py-1.5 text-black"
                    style={{ fontSize: 12 }}
                  >
                    <option value="name-asc">Name A-Z</option>
                    <option value="name-desc">Name Z-A</option>
                    <option value="id-asc">ID Asc</option>
                    <option value="id-desc">ID Desc</option>
                  </select>
                </label>
                {(courseFilter || yearFilter) && (
                  <button
                    onClick={() => { setCourseFilter(''); setYearFilter(''); }}
                    className="text-blue-600 hover:text-blue-700"
                    style={{ fontSize: 12, fontWeight: 600 }}
                  >
                    Clear filters
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="px-4 pb-4">
            {studentTable(visible, tableTitle)}
          </div>
        </div>
      )}

      </>}

      {/* ── FORM TAB ── */}
      <Modal
        isOpen={showFormModal}
        title={editingId ? 'Edit Student' : 'Add Student'}
        onClose={() => { setForm(defaultForm); setEditingId(null); setShowFormModal(false); }}
        maxWidth="max-w-3xl"
        scrollBody
      >
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-blue-100 dark:border-slate-700 w-full">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-black" style={{ fontSize: 15, fontWeight: 600 }}>
                {editingId ? 'Edit Student' : 'Add Student'}
              </p>
              <p className="text-slate-400" style={{ fontSize: 12 }}>
                {editingId
                  ? `Editing record ${editingId}`
                  : 'Enter student details to create a new record'}
              </p>
            </div>
            <span
              className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-700"
              style={{ fontSize: 11, fontWeight: 500 }}
            >
              {editingId ? 'Editing' : 'New record'}
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Profile upload */}
            <div className="flex items-center gap-5">
              <div className="relative shrink-0">
                {form.photo ? (
                  <img
                    src={form.photo}
                    alt="Student profile"
                    className="w-20 h-20 rounded-full object-cover border-2 border-blue-100"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-blue-100 border-2 border-dashed border-blue-200 flex items-center justify-center">
                    <User size={28} className="text-slate-400" />
                  </div>
                )}
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  className="hidden"
                />
              </div>
              <div>
                <p className="text-black" style={{ fontSize: 13, fontWeight: 500 }}>
                  Profile
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className="flex items-center gap-1.5 rounded-lg border border-blue-200 px-3 py-1.5 text-blue-700 hover:bg-blue-50 dark:border-slate-600 dark:text-blue-400 dark:hover:bg-slate-700"
                    style={{ fontSize: 12, fontWeight: 600 }}
                  >
                    <Upload size={13} /> Upload file
                  </button>
                  {/* The camera needs a secure context. On the clinic PC
                      (localhost) that holds; over the LAN the browser blocks it,
                      so the button explains itself rather than doing nothing. */}
                  <button
                    type="button"
                    onClick={() => cameraAvailable() ? setCameraOpen(true) : showToast(cameraUnavailableReason())}
                    className="flex items-center gap-1.5 rounded-lg border border-blue-200 px-3 py-1.5 text-blue-700 hover:bg-blue-50 dark:border-slate-600 dark:text-blue-400 dark:hover:bg-slate-700"
                    style={{ fontSize: 12, fontWeight: 600 }}
                    title={cameraAvailable() ? 'Take a photo with a camera' : cameraUnavailableReason()}
                  >
                    <Camera size={13} /> Take photo
                  </button>
                </div>
                <p className="text-slate-400 mt-1.5" style={{ fontSize: 11.5 }}>
                  JPG or PNG up to 8 MB — resized automatically. A phone set up as a
                  webcam appears in the camera list.
                </p>
                {form.photo && (
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, photo: '' }))}
                    className="mt-1.5 text-red-500 hover:text-red-600 transition-colors"
                    style={{ fontSize: 12 }}
                  >
                    Remove profile
                  </button>
                )}
              </div>
            </div>

            <div className="border-t border-blue-100 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <label>
                  <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>
                    Student ID
                  </span>
                  <input
                    value={form.studentId}
                    onChange={(e) => setForm((f) => ({ ...f, studentId: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                    placeholder="000001"
                    maxLength={6}
                    inputMode="numeric"
                    pattern="\d{6}"
                    className={fieldClass}
                    style={{ fontSize: 13 }}
                    required
                    disabled={!!editingId}
                  />
                </label>
                <label>
                  <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>
                    Last Name
                  </span>
                  <input
                    value={form.lastName}
                    onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                    placeholder="Last name"
                    className={fieldClass}
                    style={{ fontSize: 13 }}
                    required
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-4">
                <label>
                  <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>
                    First Name
                  </span>
                  <input
                    value={form.firstName}
                    onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                    placeholder="First name"
                    className={fieldClass}
                    style={{ fontSize: 13 }}
                    required
                  />
                </label>
                <label>
                  <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>
                    Middle Initial
                  </span>
                  <input
                    value={form.middleInitial}
                    onChange={(e) => setForm((f) => ({ ...f, middleInitial: e.target.value.slice(0, 1).toUpperCase() }))}
                    placeholder="M"
                    maxLength={1}
                    className={fieldClass}
                    style={{ fontSize: 13 }}
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-4">
                <label>
                  <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>
                    Course / Program
                  </span>
                  <select
                    value={form.course}
                    onChange={(e) => setForm((f) => ({ ...f, course: e.target.value }))}
                    className={fieldClass}
                    style={{ fontSize: 13 }}
                    required
                  >
                    <option value="">Select program</option>
                    {colleges.map((college) => (
                      <optgroup key={college.name} label={college.name}>
                        {college.courses.map((course) => <option key={course}>{course}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </label>
                <label>
                  <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>
                    Year Level
                  </span>
                  <input
                    value={form.yearLevel}
                    onChange={(e) => setForm((f) => ({ ...f, yearLevel: e.target.value }))}
                    placeholder="3rd Year"
                    className={fieldClass}
                    style={{ fontSize: 13 }}
                    required
                  />
                </label>
              </div>

              {/* Status — the one-off path. Most students change status through
                  Year-End Processing in Settings; this is for the exceptions:
                  early graduates, late completers, shiftees, stop-outs. */}
              <div className="grid grid-cols-2 gap-4 mt-4">
                <label>
                  <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>
                    Status
                  </span>
                  <select
                    value={form.status}
                    onChange={(e) => {
                      const status = e.target.value as StudentStatus;
                      setForm((f) => ({
                        ...f,
                        status,
                        // Prompt with today's date rather than an empty field, and
                        // drop it again if the student turns out not to have graduated.
                        dateGraduated: status === 'graduated'
                          ? (f.dateGraduated || new Date().toISOString().slice(0, 10))
                          : '',
                      }));
                    }}
                    className={fieldClass}
                    style={{ fontSize: 13 }}
                  >
                    {STUDENT_STATUSES.map((s) => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </label>
                {form.status === 'graduated' && (
                  <label>
                    <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>
                      Date Graduated
                    </span>
                    <input
                      type="date"
                      value={form.dateGraduated}
                      onChange={(e) => setForm((f) => ({ ...f, dateGraduated: e.target.value }))}
                      className={fieldClass}
                      style={{ fontSize: 13 }}
                      required
                    />
                  </label>
                )}
              </div>
              {form.status !== 'enrolled' && (
                <p className="mt-2 flex items-start gap-1.5 text-slate-500 dark:text-slate-400" style={{ fontSize: 11.5 }}>
                  <AlertCircle size={13} className="mt-px shrink-0 text-amber-500" />
                  The medical record is kept in full and stays searchable. Only new
                  consultations are closed off.
                </p>
              )}

              <div className="grid grid-cols-2 gap-4 mt-4">
                <label>
                  <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>
                    Sex
                  </span>
                  <select
                    value={form.gender}
                    onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
                    className={fieldClass}
                    style={{ fontSize: 13 }}
                    required
                  >
                    <option value="">Select sex</option>
                    <option>Female</option>
                    <option>Male</option>
                    <option>Prefer not to say</option>
                  </select>
                </label>
                <label>
                  <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>
                    Contact Number
                  </span>
                  <input
                    value={form.contactNumber}
                    onChange={(e) => setForm((f) => ({ ...f, contactNumber: e.target.value.replace(/\D/g, '').slice(0, 12) }))}
                    placeholder="09XXXXXXXXX"
                    maxLength={12}
                    inputMode="numeric"
                    pattern="\d{1,12}"
                    className={fieldClass}
                    style={{ fontSize: 13 }}
                  />
                </label>
                <label>
                  <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>
                    Email Address
                  </span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value.trim() }))}
                    placeholder="name@example.com"
                    className={fieldClass}
                    style={{ fontSize: 13 }}
                  />
                </label>
              </div>

              <p className="mt-6 mb-1 text-slate-500 uppercase tracking-wider" style={{ fontSize: 10, fontWeight: 700 }}>
                Clinic Consultation Record Info
              </p>

              <div className="grid grid-cols-2 gap-4 mt-2">
                <label>
                  <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Birthdate</span>
                  <input
                    type="date"
                    value={form.birthdate}
                    onChange={(e) => setForm((f) => ({ ...f, birthdate: e.target.value }))}
                    className={fieldClass}
                    style={{ fontSize: 13 }}
                  />
                </label>
                <label>
                  <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Blood Type</span>
                  <select
                    value={form.bloodType}
                    onChange={(e) => setForm((f) => ({ ...f, bloodType: e.target.value }))}
                    className={fieldClass}
                    style={{ fontSize: 13 }}
                  >
                    <option value="">Select blood type</option>
                    {BLOOD_TYPES.map((bt) => <option key={bt}>{bt}</option>)}
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-4">
                <label>
                  <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Height (cm)</span>
                  <input
                    value={form.height}
                    onChange={(e) => setForm((f) => ({ ...f, height: e.target.value.replace(/[^0-9.]/g, '') }))}
                    placeholder="e.g. 160"
                    inputMode="decimal"
                    className={fieldClass}
                    style={{ fontSize: 13 }}
                  />
                </label>
                <label>
                  <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Weight (kg)</span>
                  <input
                    value={form.weight}
                    onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value.replace(/[^0-9.]/g, '') }))}
                    placeholder="e.g. 48"
                    inputMode="decimal"
                    className={fieldClass}
                    style={{ fontSize: 13 }}
                  />
                </label>
              </div>
              {(() => {
                const bmi = computeBmi(form.height, form.weight);
                return bmi ? (
                  <p className="mt-2 flex items-center gap-1.5 text-slate-500" style={{ fontSize: 12 }}>
                    BMI (auto-calculated): <span className="text-black dark:text-slate-200" style={{ fontWeight: 700 }}>{bmi.value}</span> ({bmi.category})
                  </p>
                ) : null;
              })()}

              <div className="grid grid-cols-2 gap-4 mt-4">
                <label>
                  <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>School Year</span>
                  <input
                    value={form.schoolYear}
                    onChange={(e) => setForm((f) => ({ ...f, schoolYear: e.target.value }))}
                    placeholder="2025-2026"
                    className={fieldClass}
                    style={{ fontSize: 13 }}
                  />
                </label>
                <label>
                  <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Parent's / Guardian's Name</span>
                  <input
                    value={form.guardianName}
                    onChange={(e) => setForm((f) => ({ ...f, guardianName: e.target.value }))}
                    placeholder="Full name"
                    className={fieldClass}
                    style={{ fontSize: 13 }}
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-4">
                <label>
                  <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Relationship to Student</span>
                  <input
                    value={form.guardianRelationship}
                    onChange={(e) => setForm((f) => ({ ...f, guardianRelationship: e.target.value }))}
                    placeholder="e.g. Mother, Father, Guardian"
                    className={fieldClass}
                    style={{ fontSize: 13 }}
                  />
                </label>
                <label>
                  <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Parent's / Guardian's Contact</span>
                  <input
                    value={form.guardianContact}
                    onChange={(e) => setForm((f) => ({ ...f, guardianContact: e.target.value.replace(/\D/g, '').slice(0, 12) }))}
                    placeholder="09XXXXXXXXX"
                    maxLength={12}
                    inputMode="numeric"
                    className={fieldClass}
                    style={{ fontSize: 13 }}
                  />
                </label>
              </div>

              {/* ── Current Residence ── */}
              <div className="mt-6 rounded-xl border border-blue-100 dark:border-slate-600 p-4">
                <p className="flex items-center gap-1.5 text-blue-900 dark:text-blue-300 mb-3" style={{ fontSize: 12.5, fontWeight: 700 }}>
                  <MapPin size={14} /> Current Residence
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <label>
                    <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Province</span>
                    <input value={form.currentProvince} onChange={(e) => setForm((f) => ({ ...f, currentProvince: e.target.value }))} className={fieldClass} style={{ fontSize: 13 }} />
                  </label>
                  <label>
                    <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Municipality/City</span>
                    <input value={form.currentCity} onChange={(e) => setForm((f) => ({ ...f, currentCity: e.target.value }))} className={fieldClass} style={{ fontSize: 13 }} />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <label>
                    <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Barangay</span>
                    <input value={form.currentBarangay} onChange={(e) => setForm((f) => ({ ...f, currentBarangay: e.target.value }))} className={fieldClass} style={{ fontSize: 13 }} />
                  </label>
                  <label>
                    <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Purok/Street</span>
                    <input value={form.currentPurok} onChange={(e) => setForm((f) => ({ ...f, currentPurok: e.target.value }))} className={fieldClass} style={{ fontSize: 13 }} />
                  </label>
                </div>
                <label className="block mt-4 max-w-[calc(50%-0.5rem)]">
                  <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>
                    ZIP Code <span className="text-slate-400" style={{ fontWeight: 400 }}>(optional)</span>
                  </span>
                  <input value={form.currentZip} onChange={(e) => setForm((f) => ({ ...f, currentZip: e.target.value }))} className={fieldClass} style={{ fontSize: 13 }} />
                </label>
              </div>

              {/* ── Permanent / Home Address ── */}
              <div className="mt-4 rounded-xl border border-blue-100 dark:border-slate-600 p-4">
                <p className="flex items-center gap-1.5 text-blue-900 dark:text-blue-300 mb-3" style={{ fontSize: 12.5, fontWeight: 700 }}>
                  <Home size={14} /> Permanent / Home Address
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <label>
                    <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Province</span>
                    <input value={form.homeProvince} onChange={(e) => setForm((f) => ({ ...f, homeProvince: e.target.value }))} className={fieldClass} style={{ fontSize: 13 }} />
                  </label>
                  <label>
                    <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Municipality/City</span>
                    <input value={form.homeCity} onChange={(e) => setForm((f) => ({ ...f, homeCity: e.target.value }))} className={fieldClass} style={{ fontSize: 13 }} />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <label>
                    <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Barangay</span>
                    <input value={form.homeBarangay} onChange={(e) => setForm((f) => ({ ...f, homeBarangay: e.target.value }))} className={fieldClass} style={{ fontSize: 13 }} />
                  </label>
                  <label>
                    <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Purok/Street</span>
                    <input value={form.homePurok} onChange={(e) => setForm((f) => ({ ...f, homePurok: e.target.value }))} className={fieldClass} style={{ fontSize: 13 }} />
                  </label>
                </div>
                <label className="block mt-4 max-w-[calc(50%-0.5rem)]">
                  <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>
                    ZIP Code <span className="text-slate-400" style={{ fontWeight: 400 }}>(optional)</span>
                  </span>
                  <input value={form.homeZip} onChange={(e) => setForm((f) => ({ ...f, homeZip: e.target.value }))} className={fieldClass} style={{ fontSize: 13 }} />
                </label>
              </div>

              {/* ── Boarding House Information ── */}
              <div className="mt-4 rounded-xl border border-blue-100 dark:border-slate-600 p-4">
                <p className="flex items-center gap-1.5 text-blue-900 dark:text-blue-300 mb-3" style={{ fontSize: 12.5, fontWeight: 700 }}>
                  <Building2 size={14} /> Boarding House Information
                </p>
                <label className="flex items-start gap-2.5 rounded-lg bg-blue-50 dark:bg-slate-700/40 p-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.isBoarding}
                    onChange={(e) => setForm((f) => ({ ...f, isBoarding: e.target.checked }))}
                    className="mt-0.5 shrink-0"
                  />
                  <span className="text-slate-600 dark:text-slate-300" style={{ fontSize: 12.5 }}>
                    Student is currently staying in a boarding house / dormitory / apartment (not living with family)
                  </span>
                </label>

                {form.isBoarding ? (
                  <>
                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <label>
                        <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Boarding House Name</span>
                        <input
                          value={form.boardingHouseName}
                          onChange={(e) => setForm((f) => ({ ...f, boardingHouseName: e.target.value }))}
                          className={fieldClass}
                          style={{ fontSize: 13 }}
                          required
                        />
                      </label>
                      <label>
                        <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Boarding House Address</span>
                        <input
                          value={form.boardingHouseAddress}
                          onChange={(e) => setForm((f) => ({ ...f, boardingHouseAddress: e.target.value }))}
                          className={fieldClass}
                          style={{ fontSize: 13 }}
                          required
                        />
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-4 mt-4">
                      <label>
                        <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Landlord/Landlady Name</span>
                        <input
                          value={form.landlordName}
                          onChange={(e) => setForm((f) => ({ ...f, landlordName: e.target.value }))}
                          className={fieldClass}
                          style={{ fontSize: 13 }}
                          required
                        />
                      </label>
                      <label>
                        <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Landlord Contact Number</span>
                        <input
                          value={form.landlordContact}
                          onChange={(e) => setForm((f) => ({ ...f, landlordContact: e.target.value.replace(/\D/g, '').slice(0, 12) }))}
                          placeholder="09XXXXXXXXX"
                          maxLength={12}
                          inputMode="numeric"
                          className={fieldClass}
                          style={{ fontSize: 13 }}
                          required
                        />
                      </label>
                    </div>
                  </>
                ) : (
                  <p className="mt-3 text-slate-400 italic" style={{ fontSize: 12 }}>
                    Living with family — boarding house fields will be recorded as "N/A".
                  </p>
                )}
              </div>

              <label className="block mt-4">
                <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>
                  Medical Conditions
                </span>
                <textarea
                  value={form.medicalConditions}
                  onChange={(e) => setForm((f) => ({ ...f, medicalConditions: e.target.value }))}
                  placeholder="Chronic conditions, past surgeries, or other health notes."
                  className={`${fieldClass} resize-none`}
                  rows={3}
                  style={{ fontSize: 13 }}
                />
              </label>

              <div className="grid grid-cols-2 gap-4 mt-4">
                <label>
                  <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Allergies</span>
                  <textarea
                    value={form.allergies}
                    onChange={(e) => setForm((f) => ({ ...f, allergies: e.target.value }))}
                    placeholder="e.g. Penicillin, seafood"
                    className={`${fieldClass} resize-none`}
                    rows={2}
                    style={{ fontSize: 13 }}
                  />
                </label>
                <label>
                  <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Current Medications</span>
                  <textarea
                    value={form.currentMedications}
                    onChange={(e) => setForm((f) => ({ ...f, currentMedications: e.target.value }))}
                    placeholder="e.g. Maintenance medicines, dosage"
                    className={`${fieldClass} resize-none`}
                    rows={2}
                    style={{ fontSize: 13 }}
                  />
                </label>
              </div>

              <label className="block mt-4">
                <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Others</span>
                <textarea
                  value={form.medicalOthers}
                  onChange={(e) => setForm((f) => ({ ...f, medicalOthers: e.target.value }))}
                  placeholder="Any other relevant medical information"
                  className={`${fieldClass} resize-none`}
                  rows={2}
                  style={{ fontSize: 13 }}
                />
              </label>

              {isAdmin && (
                <label className="block mt-4">
                  <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>
                    <span className="inline-flex items-center gap-1.5">
                      <Lock size={12} /> Confidential Notes
                      <span className="text-slate-400" style={{ fontWeight: 400 }}>(admin only)</span>
                    </span>
                  </span>
                  <textarea
                    value={form.confidentialNotes}
                    onChange={(e) => setForm((f) => ({ ...f, confidentialNotes: e.target.value }))}
                    placeholder="Sensitive notes visible to the main admin only (e.g. counseling, private conditions)."
                    className={`${fieldClass} resize-none`}
                    rows={3}
                    style={{ fontSize: 13 }}
                  />
                </label>
              )}

              {editingId ? (
                <div className="mt-4">
                  <PersonDocuments ownerType="student" ownerId={editingId} showToast={showToast} canEdit />
                </div>
              ) : (
                <p className="mt-4 rounded-lg bg-blue-50 px-3 py-2.5 text-slate-400" style={{ fontSize: 12 }}>
                  Save this student first, then edit the record to attach files.
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setForm(defaultForm); setEditingId(null); setShowFormModal(false); }}
                className={btnSecondary}
                style={{ fontSize: 13 }}
              >
                Cancel
              </button>
              <button type="submit" className={btnPrimary} style={{ fontSize: 13 }}>
                {editingId ? 'Update student' : 'Save student'}
              </button>
            </div>
          </form>
        </div>
      </Modal>

      {/* Camera capture. Produces the same downscaled JPEG the file picker does,
          so a captured photo and an uploaded one are stored identically. */}
      <PhotoCapture
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onCapture={(dataUrl) => setForm((f) => ({ ...f, photo: dataUrl }))}
      />

      {/* ── IMPORT TAB ── */}
      <Modal
        isOpen={showImportModal}
        title="Import CSV"
        onClose={() => setShowImportModal(false)}
      >
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-blue-100 dark:border-slate-700 w-full">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-black" style={{ fontSize: 15, fontWeight: 600 }}>Import CSV</p>
              <p className="text-slate-400" style={{ fontSize: 12 }}>
                Upload a CSV file to add multiple student records at once
              </p>
            </div>
            <span
              className="px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-700"
              style={{ fontSize: 11, fontWeight: 500 }}
            >
              CSV upload
            </span>
          </div>

          <label className="block border-2 border-dashed border-blue-100 rounded-xl p-8 text-center hover:border-blue-400 transition-colors cursor-pointer">
            <Upload size={28} className="mx-auto text-slate-300 mb-3" />
            <p className="text-slate-600" style={{ fontSize: 13, fontWeight: 500 }}>
              {csvFileName || 'Click to select a CSV file'}
            </p>
            <p className="text-slate-400 mt-1" style={{ fontSize: 12 }}>
              Columns: studentId, name, course, yearLevel, sex, contactNumber, medicalConditions
            </p>
            <input type="file" accept=".csv,text/csv" onChange={handleCsvFile} className="hidden" />
          </label>

          {pendingCsv.length > 0 && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2">
              <CheckCircle2 size={16} className="text-blue-600 shrink-0" />
              <p className="text-blue-700" style={{ fontSize: 13 }}>
                {pendingCsv.length} valid record{pendingCsv.length !== 1 ? 's' : ''} ready to import
              </p>
            </div>
          )}

          <div className="flex justify-end gap-3 mt-5">
            <button onClick={() => setShowImportModal(false)} className={btnSecondary} style={{ fontSize: 13 }}>
              Cancel
            </button>
            <button
              onClick={handleCsvImport}
              disabled={!pendingCsv.length}
              className={`${btnPrimary} disabled:opacity-50 disabled:cursor-not-allowed`}
              style={{ fontSize: 13 }}
            >
              Import {pendingCsv.length > 0 ? `${pendingCsv.length} records` : ''}
            </button>
          </div>
        </div>
      </Modal>

      {/* ── PROFILE PAGE — replaces the list while a student is selected ── */}
      {viewStudent && (
        <StudentProfileView
          student={students.find((x) => x.studentId === viewStudent.studentId) ?? viewStudent}
          consultations={consultations}
          isAdmin={isAdmin}
          showToast={showToast}
          onBack={() => setViewStudent(null)}
          onEdit={openEdit}
          onViewHistory={onViewHistory}
        />
      )}
    </div>
  );
}
