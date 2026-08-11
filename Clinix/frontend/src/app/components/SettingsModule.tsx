import { useState, useRef, useEffect } from 'react';
import {
  User, Shield, Building2, Monitor, FileText, Bell,
  Database, Clock, Lock, Info, Camera, Check, Eye, EyeOff,
  Sun, Moon, Download, Upload, RefreshCw, LogOut,
  ChevronRight, GraduationCap, Plus, Trash2, X, CalendarClock,
} from 'lucide-react';

import { Page } from '../App';
import { useTheme } from '../ThemeContext';
import { APP_VERSION } from '../version';
import { confirmDialog } from './ConfirmDialog';
import { ClinixLogo } from './ClinixLogo';
import { canSeeConfidential, currentUsername, currentRole, changePasswordApi, ROLE_LABELS } from '../auth';
import {
  useColleges, addCollege, removeCollege, addCourse, removeCourse, resetColleges,
  useCourseYears, setCourseYears, getCourseYears, DEFAULT_COURSE_YEARS, YEAR_OPTIONS,
} from '../colleges';
import {
  previewYearEndApi, commitYearEndApi, YearEndCandidate, YearEndPlan,
  saveMyProfileApi, EMPTY_PROFILE, type UserProfile,
  createBackupApi, restoreBackupApi,
} from '../store';
import { parseMasterlistCsv, MasterlistRow } from '../masterlist';

// ── helpers ──────────────────────────────────────────────────────────────────

function ls<T>(key: string, def: T): T {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : def; } catch { return def; }
}
function lsSave(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
}

// ── types ─────────────────────────────────────────────────────────────────────

// Exactly the fields an account owns about itself, and no more. `username` and
// `role` were editable here before and persisted nowhere — a staff member could
// set their role to "Clinic Administrator" and the box would remember it while
// changing nothing. Both are shown read-only now; changing either is an admin
// action on the Accounts screen.
type AccountData = {
  fullName: string; email: string; contact: string;
  employeeId: string; address: string; birthdate: string;
};

function accountFrom(p: UserProfile): AccountData {
  return {
    fullName: p.name, email: p.email, contact: p.contact,
    employeeId: p.empId, address: p.address, birthdate: p.birthdate,
  };
}
type ClinicInfo = {
  name: string; address: string; contact: string;
  email: string; officeHours: string; emergency: string;
};
type SysPrefs = {
  accent: 'blue' | 'green' | 'teal';
  fontSize: 'small' | 'medium' | 'large';
  language: 'english' | 'filipino';
};
type RecordPrefs = {
  format: string; autoGenerate: boolean;
  allowDuplicates: boolean; archiveAfter: string;
};
type NotifPrefs = {
  emailNewPatient: boolean; emailBackup: boolean;
  emailLowStock: boolean; emailFailedLogin: boolean;
  emailUpdates: boolean; desktop: boolean;
  // Staff/assistant get one switch for email instead of the per-event list.
  emailAll: boolean;
};
type BackupPrefs = { frequency: 'daily' | 'weekly' | 'monthly'; lastBackup: string };
type PrivacyPrefs = {
  encrypt: boolean; requirePasswordExport: boolean;
  hideSensitive: boolean; recordActivity: boolean;
};

// ── reusable sub-components ───────────────────────────────────────────────────

function SectionCard({ title, desc, children, action }: {
  title: string; desc?: string; children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-blue-100 dark:border-slate-700 overflow-hidden mb-5">
      <div className="px-6 py-4 border-b border-blue-100 dark:border-slate-700 flex items-center justify-between gap-4">
        <div>
          <p className="text-black dark:text-slate-100" style={{ fontSize: 14, fontWeight: 600 }}>{title}</p>
          {desc && <p className="text-slate-400 dark:text-slate-500 mt-0.5" style={{ fontSize: 12 }}>{desc}</p>}
        </div>
        {action}
      </div>
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-slate-600 dark:text-slate-400 mb-1.5" style={{ fontSize: 12, fontWeight: 500 }}>{label}</label>
      {children}
    </div>
  );
}

const INPUT = 'w-full border border-blue-100 dark:border-slate-600 rounded-xl px-3.5 py-2.5 text-black dark:text-slate-200 bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500';

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="relative shrink-0 transition-colors focus:outline-none"
      style={{ width: 44, height: 24, borderRadius: 12, background: on ? '#4C5CAE' : '#C6CEEC' }}
    >
      <span
        style={{
          position: 'absolute', top: 2, width: 20, height: 20, borderRadius: '50%',
          background: '#FFFFFF', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          transform: on ? 'translateX(22px)' : 'translateX(2px)',
          transition: 'transform 0.2s ease', display: 'block',
        }}
      />
    </button>
  );
}

function SectionHeading({ icon: Icon, label }: { icon: React.ComponentType<{ size?: number; className?: string }>; label: string }) {
  return (
    <div className="flex items-center gap-2 mt-2 mb-3 pt-2">
      <Icon size={15} className="text-slate-400" />
      <p className="text-slate-500 dark:text-slate-400 uppercase tracking-wider" style={{ fontSize: 10, fontWeight: 700 }}>{label}</p>
    </div>
  );
}

/**
 * The preview list for one bucket of pending roster changes, shared by year-end
 * processing and the registrar masterlist import. Collapsed to the first few
 * rows with a count, because "300 students will be affected" is the number the
 * admin needs to see before committing — not 300 lines to scroll past.
 *
 * Passing `selected` turns the bucket into a pick list: the masterlist import
 * uses that for students who are enrolled here but absent from the registrar's
 * file, which are never acted on unless somebody ticks them.
 */
function PreviewList<T extends { studentId: string; name: string }>({
  title, rows, describe, tone = 'normal', selected, onToggle,
}: {
  title: string;
  rows: T[];
  describe: (s: T) => string;
  tone?: 'normal' | 'warn';
  selected?: Set<string>;
  onToggle?: (ids: string[], on: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!rows.length) return null;
  const shown = expanded ? rows : rows.slice(0, 8);
  const pickable = !!selected && !!onToggle;
  const allOn = pickable && rows.every(s => selected!.has(s.studentId));
  return (
    <div className={`rounded-xl border ${tone === 'warn' ? 'border-amber-200 dark:border-amber-900/50' : 'border-blue-100 dark:border-slate-600'}`}>
      <div className={`flex items-center justify-between px-4 py-2.5 ${tone === 'warn' ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-blue-50 dark:bg-slate-700/40'}`}>
        <p className="text-black dark:text-slate-200" style={{ fontSize: 12.5, fontWeight: 600 }}>
          {title} · {rows.length}
          {pickable && <span className="text-slate-500 dark:text-slate-400" style={{ fontWeight: 500 }}> · {rows.filter(s => selected!.has(s.studentId)).length} selected</span>}
        </p>
        <div className="flex items-center gap-3">
          {pickable && (
            <button onClick={() => onToggle!(rows.map(s => s.studentId), !allOn)} className="text-blue-600 hover:text-blue-700 dark:text-blue-300" style={{ fontSize: 12, fontWeight: 600 }}>
              {allOn ? 'Clear all' : 'Select all'}
            </button>
          )}
          {rows.length > 8 && (
            <button onClick={() => setExpanded(v => !v)} className="text-blue-600 hover:text-blue-700 dark:text-blue-300" style={{ fontSize: 12, fontWeight: 600 }}>
              {expanded ? 'Show less' : `Show all ${rows.length}`}
            </button>
          )}
        </div>
      </div>
      <ul className="divide-y divide-slate-100 dark:divide-slate-700 max-h-72 overflow-y-auto">
        {shown.map(s => (
          <li key={s.studentId} className="flex items-center justify-between gap-3 px-4 py-2">
            <span className="flex min-w-0 items-center gap-3">
              {pickable && (
                <input
                  type="checkbox"
                  checked={selected!.has(s.studentId)}
                  onChange={e => onToggle!([s.studentId], e.target.checked)}
                  className="shrink-0 h-4 w-4 accent-amber-600"
                  aria-label={`Mark ${s.name || s.studentId} as dropped`}
                />
              )}
              <span className="min-w-0">
                <span className="block truncate text-black dark:text-slate-200" style={{ fontSize: 12.5, fontWeight: 500 }}>{s.name || s.studentId}</span>
                <span className="block truncate text-slate-500 dark:text-slate-400" style={{ fontSize: 11.5 }}>{describe(s)}</span>
              </span>
            </span>
            <span className="shrink-0 text-slate-400" style={{ fontSize: 11, fontFamily: 'monospace' }}>{s.studentId}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SaveBar({ onSave, saved }: { onSave: () => void; saved: boolean }) {
  return (
    <div className="flex justify-end mt-5">
      <button
        onClick={onSave}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white transition-all"
        style={{ fontSize: 13, fontWeight: 600, background: saved ? '#4C5CAE' : '#4C5CAE' }}
      >
        {saved && <Check size={14} />}
        {saved ? 'Saved!' : 'Save Changes'}
      </button>
    </div>
  );
}

// ── props ─────────────────────────────────────────────────────────────────────

type Props = {
  onNavigate: (p: Page) => void;
  showToast: (m: string) => void;
  userProfile?: UserProfile;
  setUserProfile?: React.Dispatch<React.SetStateAction<UserProfile>>;
  certificatesEnabled?: boolean;
  setCertificatesEnabled?: (v: boolean) => void;
  /** Re-read the student list after year-end processing rewrote it server-side. */
  onRosterChanged?: () => void;
};

// ── Settings tabs (keeps the page short instead of one long scroll) ───────────
type TabId = 'account' | 'security' | 'clinic' | 'prefs' | 'data' | 'about';

type TabDef = { id: TabId; label: string; icon: React.ComponentType<{ size?: number }> };

const TABS: TabDef[] = [
  { id: 'account',  label: 'Account',       icon: User },
  { id: 'security', label: 'Security',      icon: Shield },
  { id: 'clinic',   label: 'Clinic',        icon: Building2 },
  { id: 'prefs',    label: 'Preferences',   icon: Monitor },
  { id: 'data',     label: 'Data & Backup', icon: Database },
  { id: 'about',    label: 'About',         icon: Info },
];

// Staff and assistant accounts only manage themselves: their own profile,
// their password, their notifications and how the app looks on their device.
// Everything clinic-wide (clinic profile, colleges, record rules, backups,
// audit log, privacy, feature toggles) stays with the main admin. Their page is
// short enough to read as one scroll, so it gets no tabs at all.


// ── main component ────────────────────────────────────────────────────────────

export function SettingsModule({ onNavigate, showToast, userProfile = EMPTY_PROFILE, setUserProfile, certificatesEnabled = true, setCertificatesEnabled, onRosterChanged }: Props) {
  const { isDark, toggle: toggleTheme } = useTheme();
  const isAdmin = canSeeConfidential();
  const photoRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<TabId>('account');

  // ── Account state
  // Seeded from the signed-in account rather than from a `clinixAccount` blob in
  // localStorage. The old blob was per-browser and invented its defaults
  // ("clinic.admin", "clinic@bisu-calape.edu.ph"), so the page showed a plausible
  // profile that belonged to nobody and matched no row in the database.
  const [account, setAccount] = useState<AccountData>(() => accountFrom(userProfile));
  const [accountPhoto, setAccountPhoto] = useState(userProfile.photo);
  const [accountSaved, setAccountSaved] = useState(false);
  const [accountSaving, setAccountSaving] = useState(false);

  // The profile arrives from the server after this component may already have
  // mounted, and it is replaced wholesale on save. Re-seed the form when it
  // does; it only changes on load and on a successful save, so this cannot
  // discard an edit in progress.
  useEffect(() => {
    setAccount(accountFrom(userProfile));
    setAccountPhoto(userProfile.photo);
  }, [userProfile]);

  // ── Security state
  const [twoFa, setTwoFa] = useState(() => ls('clinixTwoFa', false));
  const [autoLogout, setAutoLogout] = useState(() => ls('clinixAutoLogout', '30'));
  const [showPwForm, setShowPwForm] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [showPw, setShowPw] = useState({ current: false, next: false, confirm: false });
  const [secSaved, setSecSaved] = useState(false);

  // ── Clinic state
  const [clinic, setClinic] = useState<ClinicInfo>(() => ls('clinixClinicInfo', {
    name: 'BISU Calape Campus Clinic', address: '', contact: '',
    email: '', officeHours: 'Monday – Friday, 8:00 AM – 5:00 PM', emergency: '',
  }));
  const [clinicSaved, setClinicSaved] = useState(false);

  // ── System prefs state
  const [sysPrefs, setSysPrefs] = useState<SysPrefs>(() => ls('clinixSysPrefs', {
    accent: 'blue', fontSize: 'medium', language: 'english',
  }));
  const [prefsSaved, setPrefsSaved] = useState(false);

  // ── Record prefs state
  const [recPrefs, setRecPrefs] = useState<RecordPrefs>(() => ls('clinixRecordPrefs', {
    format: 'BISU-2026-0001', autoGenerate: true, allowDuplicates: false, archiveAfter: '2',
  }));
  const [recSaved, setRecSaved] = useState(false);

  // ── Notif prefs state
  const [notif, setNotif] = useState<NotifPrefs>(() => ls('clinixNotifPrefs', {
    emailNewPatient: true, emailBackup: true, emailLowStock: true,
    emailFailedLogin: true, emailUpdates: true, desktop: true, emailAll: true,
  }));
  const [notifSaved, setNotifSaved] = useState(false);

  // ── Backup state
  // lastBackup defaulted to a hardcoded date, so a clinic that had never taken
  // one was told it had a backup from July 2026. Empty means "Never", which is
  // what the panel renders when nobody has pressed the button.
  const [backupPrefs, setBackupPrefs] = useState<BackupPrefs>(() => ls('clinixBackupPrefs', {
    frequency: 'daily', lastBackup: '',
  }));
  const [backupBusy, setBackupBusy] = useState(false);
  const restoreRef = useRef<HTMLInputElement>(null);

  // ── Privacy state
  const [privacy, setPrivacy] = useState<PrivacyPrefs>(() => ls('clinixPrivacy', {
    encrypt: true, requirePasswordExport: true, hideSensitive: true, recordActivity: true,
  }));
  const [privSaved, setPrivSaved] = useState(false);

  // ── Colleges & Courses state
  const collegesList = useColleges();
  const courseYearsMap = useCourseYears();
  const [newCollege, setNewCollege] = useState('');
  const [courseDrafts, setCourseDrafts] = useState<Record<string, string>>({});

  // ── Year-end processing state
  const [yearEndSy, setYearEndSy] = useState(() => {
    // A school year is named for the year it starts in, and processing normally
    // runs at the tail end of it.
    const y = new Date().getFullYear();
    return `${y}-${y + 1}`;
  });
  const [yearEndDate, setYearEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [yearEndPlan, setYearEndPlan] = useState<YearEndPlan | null>(null);
  const [yearEndBusy, setYearEndBusy] = useState(false);

  async function runYearEndPreview() {
    setYearEndBusy(true);
    try {
      setYearEndPlan(await previewYearEndApi(getCourseYears()));
    } catch (err) {
      setYearEndPlan(null);
      showToast(err instanceof Error ? err.message : 'Could not build the preview');
    } finally {
      setYearEndBusy(false);
    }
  }

  async function commitYearEnd() {
    if (!yearEndPlan) return;
    const total = yearEndPlan.promote.length + yearEndPlan.graduate.length;
    // The confirmation spells out the counts rather than asking "are you sure?".
    // A number is something the admin can check against what they expected.
    if (!(await confirmDialog({
      title: `Apply year-end processing for SY ${yearEndSy}?`,
      message:
        `${yearEndPlan.promote.length} student(s) move up a year level and ` +
        `${yearEndPlan.graduate.length} are marked graduated as of ${yearEndDate}. ` +
        'No record is deleted — graduates keep their full medical history and move to Alumni Records. ' +
        'This cannot be undone in bulk; individual students can still be corrected from their profile.',
      confirmLabel: `Apply to ${total} student${total !== 1 ? 's' : ''}`,
    }))) return;

    setYearEndBusy(true);
    try {
      const r = await commitYearEndApi(getCourseYears(), yearEndDate);
      showToast(`Year-end done — ${r.promoted} promoted, ${r.graduated} graduated`);
      onRosterChanged?.();
      setYearEndPlan(null);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Year-end processing failed — nothing was changed');
    } finally {
      setYearEndBusy(false);
    }
  }

  // ── Registrar masterlist state
  const masterlistInput = useRef<HTMLInputElement>(null);
  const [mlFileName, setMlFileName] = useState('');
  const [mlRows, setMlRows] = useState<MasterlistRow[]>([]);
  const [mlWarnings, setMlWarnings] = useState<string[]>([]);
  const [mlSy, setMlSy] = useState(() => {
    const y = new Date().getFullYear();
    return `${y}-${y + 1}`;
  });
  const [mlPlan, setMlPlan] = useState<MasterlistPlan | null>(null);
  const [mlDrops, setMlDrops] = useState<Set<string>>(new Set());
  const [mlBusy, setMlBusy] = useState(false);

  function toggleDrop(ids: string[], on: boolean) {
    setMlDrops(prev => {
      const next = new Set(prev);
      ids.forEach(id => (on ? next.add(id) : next.delete(id)));
      return next;
    });
  }

  function handleMasterlistFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Clearing the input means picking the same file twice in a row still fires
    // a change event, which matters when the encoder fixes the file and re-picks.
    e.target.value = '';
    if (!file) return;
    // Any previous preview describes the previous file and must not survive it.
    setMlPlan(null);
    setMlDrops(new Set());
    setMlFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const { rows, ignoredColumns, missingColumns } = parseMasterlistCsv(String(reader.result || ''));
      setMlRows(rows);
      const warnings: string[] = [];
      if (missingColumns.length) warnings.push(`Missing required column(s): ${missingColumns.join(', ')}`);
      if (ignoredColumns.length) warnings.push(`Ignored column(s): ${ignoredColumns.join(', ')}`);
      if (!rows.length) warnings.push('No data rows were found below the header.');
      setMlWarnings(warnings);
    };
    reader.onerror = () => { setMlRows([]); setMlWarnings(['Could not read that file.']); };
    reader.readAsText(file);
  }

  async function runMasterlistPreview() {
    if (!mlRows.length) { showToast('Choose a registrar CSV file first'); return; }
    setMlBusy(true);
    try {
      const plan = await previewMasterlistApi(mlRows, mlSy.trim());
      setMlPlan(plan);
      // Absent-from-the-file students start unticked on purpose. A per-college
      // export or a late encoder looks exactly like a student who left, and
      // pre-ticking them would make dropping the roster the default action.
      setMlDrops(new Set());
    } catch (err) {
      setMlPlan(null);
      showToast(err instanceof Error ? err.message : 'Could not read that masterlist');
    } finally {
      setMlBusy(false);
    }
  }

  async function commitMasterlist() {
    if (!mlPlan) return;
    const total = mlPlan.create.length + mlPlan.update.length + mlDrops.size;
    if (!total) { showToast('Nothing to apply — the roster already matches this file'); return; }
    if (!(await confirmDialog({
      title: `Apply the registrar masterlist for SY ${mlSy.trim() || '—'}?`,
      message:
        `${mlPlan.update.length} student record(s) updated, ${mlPlan.create.length} added, and ` +
        `${mlDrops.size} marked dropped. Only year level, course, status and school year change — ` +
        'medical records, guardian details and addresses are left exactly as they are. ' +
        `${mlPlan.invalid.length} unreadable row(s) will be skipped.`,
      confirmLabel: `Apply ${total} change${total !== 1 ? 's' : ''}`,
    }))) return;

    setMlBusy(true);
    try {
      const r = await commitMasterlistApi(mlRows, mlSy.trim(), [...mlDrops]);
      showToast(`Masterlist applied — ${r.updated} updated, ${r.created} added, ${r.dropped} dropped`);
      onRosterChanged?.();
      setMlPlan(null);
      setMlDrops(new Set());
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Import failed — nothing was changed');
    } finally {
      setMlBusy(false);
    }
  }

  // Every one of these now writes to the database and waits for the answer:
  // the list is shared, so "added" has to mean the server took it, not that
  // this browser drew it. A rejection carries the server's own reason — which
  // courses still hold students, which college is not empty — because those are
  // the only ones the admin can act on.
  async function handleAddCollege() {
    const name = newCollege.trim();
    const res = await addCollege(name);
    if (!res.ok) { showToast(res.error || 'Could not add college'); return; }
    showToast(`College "${name}" added`);
    setNewCollege('');
  }
  async function handleRemoveCollege(name: string) {
    if (!(await confirmDialog({
      title: `Remove "${name}"?`,
      message: 'The college will be removed for everyone. It must have no courses left, and existing student and faculty records keep their saved values.',
      confirmLabel: 'Remove',
      danger: true,
    }))) return;
    const res = await removeCollege(name);
    showToast(res.ok ? `College "${name}" removed` : res.error || 'Could not remove college');
  }
  async function handleAddCourse(college: string) {
    const course = (courseDrafts[college] || '').trim();
    const res = await addCourse(college, course);
    if (!res.ok) { showToast(res.error || 'Could not add course'); return; }
    showToast(`Course "${course}" added to ${college}`);
    setCourseDrafts((d) => ({ ...d, [college]: '' }));
  }
  async function handleRemoveCourse(college: string, course: string) {
    const res = await removeCourse(college, course);
    showToast(res.ok ? `Course "${course}" removed` : res.error || 'Could not remove course');
  }
  async function handleResetColleges() {
    if (!(await confirmDialog({
      title: 'Restore default colleges & courses?',
      message: 'The built-in list will be restored for everyone, and any custom colleges or courses added since will be removed. Courses that still have students enrolled cannot be removed, and the reset will stop rather than change anything.',
      confirmLabel: 'Restore defaults',
      danger: true,
    }))) return;
    const res = await resetColleges();
    showToast(res.ok ? 'Colleges & courses reset to defaults' : res.error || 'Could not reset');
  }

  // ── Save helpers
  function saved(setter: (v: boolean) => void) {
    setter(true); setTimeout(() => setter(false), 2000);
  }

  /**
   * Save your own profile to the database.
   *
   * Awaited rather than fired and forgotten: the previous version handed the
   * change to an effect that swallowed any failure, so a rejected save still
   * showed "Account updated" and the user only found out it had not stuck when
   * they signed in somewhere else.
   */
  async function saveAccount() {
    if (accountSaving) return;
    setAccountSaving(true);
    try {
      const updated = await saveMyProfileApi({
        fullName: account.fullName,
        email: account.email,
        contact: account.contact,
        empId: account.employeeId,
        address: account.address,
        birthdate: account.birthdate,
        photo: accountPhoto,
      });
      // The server composes the display name from the split first/last columns,
      // so take its answer rather than assuming ours matches.
      setUserProfile?.(updated);
      showToast('Profile updated');
      saved(setAccountSaved);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save your profile');
    } finally {
      setAccountSaving(false);
    }
  }

  function saveClinic() { lsSave('clinixClinicInfo', clinic); showToast('Clinic info saved'); saved(setClinicSaved); }
  function savePrefs() { lsSave('clinixSysPrefs', sysPrefs); showToast('Preferences saved'); saved(setPrefsSaved); }
  function saveRec() { lsSave('clinixRecordPrefs', recPrefs); showToast('Record settings saved'); saved(setRecSaved); }
  function saveNotif() { lsSave('clinixNotifPrefs', notif); showToast('Notifications saved'); saved(setNotifSaved); }
  function savePrivacy() { lsSave('clinixPrivacy', privacy); showToast('Privacy settings saved'); saved(setPrivSaved); }
  function saveSec() {
    lsSave('clinixTwoFa', twoFa); lsSave('clinixAutoLogout', autoLogout);
    showToast('Security settings saved'); saved(setSecSaved);
  }

  async function changePassword() {
    if (!pw.current) { showToast('Enter your current password'); return; }
    if (pw.next.length < 8) { showToast('New password must be 8+ characters'); return; }
    if (pw.next !== pw.confirm) { showToast('Passwords do not match'); return; }
    const username = currentUsername();
    if (!username) { showToast('Could not determine the signed-in account'); return; }
    setPwSaving(true);
    try {
      await changePasswordApi(username, pw.current, pw.next);
      showToast('Password changed successfully');
      setPw({ current: '', next: '', confirm: '' });
      setShowPwForm(false);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not change the password');
    } finally {
      setPwSaving(false);
    }
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showToast('Photo must be under 2 MB'); return; }
    const reader = new FileReader();
    reader.onload = () => setAccountPhoto(reader.result as string);
    reader.readAsDataURL(file);
  }

  // ── Backup & restore ──────────────────────────────────────────────────────
  // This used to dump seven localStorage keys, which was a copy of whatever
  // this one browser happened to be caching — never the clinic's records, and
  // different on every computer. It reads MySQL now, and Restore, which used to
  // be a toast wired to nothing, actually writes it back.
  async function createBackup() {
    if (backupBusy) return;
    setBackupBusy(true);
    try {
      const backup = await createBackupApi();
      const rows = Object.values(backup.collections).reduce((n, list) => n + list.length, 0);
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url;
      a.download = `clinix-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
      URL.revokeObjectURL(url);
      const now = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      const time = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      const nb = { ...backupPrefs, lastBackup: `${now} · ${time}` };
      setBackupPrefs(nb); lsSave('clinixBackupPrefs', nb);
      showToast(`Backup downloaded — ${rows.toLocaleString()} record${rows === 1 ? '' : 's'}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not create the backup');
    } finally {
      setBackupBusy(false);
    }
  }

  async function handleRestoreFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Cleared straight away so choosing the same file twice still fires onChange.
    e.target.value = '';
    if (!file || backupBusy) return;

    let backup: { generatedAt?: string; collections?: Record<string, unknown[]> };
    try {
      backup = JSON.parse(await file.text());
    } catch {
      showToast('That file is not readable JSON.');
      return;
    }
    if (!backup || typeof backup !== 'object' || !backup.collections) {
      showToast('That file is not a Clinix backup.');
      return;
    }

    // Restore replaces, it does not merge. Say the size of what is being thrown
    // away before doing it, not after.
    const rows = Object.values(backup.collections).reduce((n, list) => n + (Array.isArray(list) ? list.length : 0), 0);
    const taken = backup.generatedAt ? new Date(backup.generatedAt).toLocaleString() : 'an unknown date';
    if (!(await confirmDialog({
      title: 'Replace all clinic records?',
      message: `This backup was taken on ${taken} and holds ${rows.toLocaleString()} record${rows === 1 ? '' : 's'}. `
        + 'Every student, staff member, consultation, medical record, certificate and stock item currently in the database will be deleted and replaced with the file\'s. '
        + 'User accounts and uploaded document files are not touched. This cannot be undone — create a backup first if you have not.',
      confirmLabel: 'Replace everything',
      danger: true,
    }))) return;

    setBackupBusy(true);
    try {
      const restored = await restoreBackupApi(backup);
      const total = Object.values(restored).reduce((n, v) => n + v, 0);
      showToast(`Restored ${total.toLocaleString()} record${total === 1 ? '' : 's'} — reloading`);
      // Every module is holding rows that no longer exist. A reload is blunt but
      // it is the only thing that leaves nothing stale on screen.
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Restore failed — nothing was changed');
      setBackupBusy(false);
    }
  }

  const activities: Array<{ msg: string; ts: string }> = ls('clinixActivities', []);

  const initials = account.fullName.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase() || 'AD';
  // Staff and assistants cannot set their own role — it is shown as-is from the account.
  const roleLabel = ROLE_LABELS[currentRole()];

  // ── Render helpers
  const accentOptions: Array<{ id: SysPrefs['accent']; label: string; color: string }> = [
    { id: 'blue', label: 'Azul Brant', color: '#1B2A6E' },
    { id: 'green', label: 'Horizonte Claro', color: '#6C7FC8' },
    { id: 'teal', label: 'Sol de Minas', color: '#F5C518' },
  ];

  // ── Staff / assistant settings ────────────────────────────────────────────
  // A deliberately small page: their own details, their password, their
  // notifications and their theme. Nothing here changes anyone else's clinic.
  // Short enough that tabs would only hide it — everything is on one scroll.
  function renderStaffSection() {
    const emailOn = notif.emailAll !== false; // saved before this switch existed → on
    return (
      <>
        <SectionHeading icon={User} label="My Profile" />
          <SectionCard title="My Profile" desc="Your name, photo and contact details">
            {/* Photo */}
            <div className="flex items-center gap-5 mb-6 pb-6 border-b border-blue-100 dark:border-slate-700">
              <div className="relative shrink-0">
                {accountPhoto ? (
                  <img src={accountPhoto} alt="Profile" className="w-20 h-20 rounded-2xl object-cover border-2 border-blue-100 dark:border-slate-600 shadow" />
                ) : (
                  <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-white shadow" style={{ background: 'linear-gradient(135deg,#6C7FC8,#37479A)', fontSize: 24, fontWeight: 700 }}>{initials}</div>
                )}
                <button onClick={() => photoRef.current?.click()} title="Change profile picture" className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow border-2 border-white dark:border-slate-800 hover:bg-blue-700 transition-colors">
                  <Camera size={13} />
                </button>
                <input ref={photoRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-black dark:text-slate-100" style={{ fontSize: 16, fontWeight: 700 }}>{account.fullName || roleLabel}</p>
                <p className="text-slate-500 dark:text-slate-400" style={{ fontSize: 12 }}>{roleLabel}</p>
              </div>
              {accountPhoto && <button onClick={() => setAccountPhoto('')} className="text-red-500 hover:text-red-600 text-xs transition-colors">Remove photo</button>}
            </div>

            {/* Only the fields they own — role, department and status stay with the admin */}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Field label="Full Name">
                  <input value={account.fullName} onChange={e => setAccount(a => ({ ...a, fullName: e.target.value }))} placeholder="Full name" className={INPUT} style={{ fontSize: 13 }} />
                </Field>
              </div>
              <Field label="Email Address">
                <input type="email" value={account.email} onChange={e => setAccount(a => ({ ...a, email: e.target.value }))} placeholder="email@bisu.edu.ph" className={INPUT} style={{ fontSize: 13 }} />
              </Field>
              <Field label="Contact Number">
                <input value={account.contact} onChange={e => setAccount(a => ({ ...a, contact: e.target.value }))} placeholder="09XX XXX XXXX" className={INPUT} style={{ fontSize: 13 }} />
              </Field>
            </div>
            <SaveBar onSave={saveAccount} saved={accountSaved} />
          </SectionCard>

        <SectionHeading icon={Lock} label="Password" />
          <SectionCard title="Change Password"
            action={<button onClick={() => setShowPwForm(v => !v)} className="px-4 py-2 rounded-xl border border-blue-100 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors" style={{ fontSize: 13 }}>{showPwForm ? 'Cancel' : 'Change Password'}</button>}>
            {!showPwForm ? (
              <p className="text-slate-400" style={{ fontSize: 13 }}>Choose a password of at least 8 characters that you do not use anywhere else.</p>
            ) : (
              <div className="space-y-4">
                {(['current', 'next', 'confirm'] as const).map(k => (
                  <Field key={k} label={k === 'current' ? 'Current Password' : k === 'next' ? 'New Password' : 'Confirm New Password'}>
                    <div className="relative">
                      <input type={showPw[k] ? 'text' : 'password'} value={pw[k]}
                        onChange={e => setPw(p => ({ ...p, [k]: e.target.value }))}
                        placeholder="••••••••" className={`${INPUT} pr-10`} style={{ fontSize: 13 }} />
                      <button type="button" onClick={() => setShowPw(p => ({ ...p, [k]: !p[k] }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        {showPw[k] ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </Field>
                ))}
                <div className="flex justify-end">
                  <button onClick={changePassword} disabled={pwSaving} className="px-5 py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 transition-colors" style={{ fontSize: 13, fontWeight: 600 }}>{pwSaving ? 'Updating…' : 'Update Password'}</button>
                </div>
              </div>
            )}
          </SectionCard>

        <SectionHeading icon={Bell} label="Notifications" />
          <SectionCard title="Notifications" desc="Choose how Clinix reaches you">
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-4 py-1">
                <div>
                  <p className="text-black dark:text-slate-300" style={{ fontSize: 13, fontWeight: 500 }}>Email Notifications</p>
                  <p className="text-slate-400" style={{ fontSize: 12 }}>Send alerts to your email address</p>
                </div>
                <Toggle on={emailOn} onToggle={() => setNotif(n => ({ ...n, emailAll: !emailOn }))} />
              </div>
              <div className="flex items-start justify-between gap-4 py-1 border-t border-blue-100 dark:border-slate-700 pt-4">
                <div>
                  <p className="text-black dark:text-slate-300" style={{ fontSize: 13, fontWeight: 500 }}>System Notifications</p>
                  <p className="text-slate-400" style={{ fontSize: 12 }}>Show notifications inside Clinix on this device</p>
                </div>
                <Toggle on={notif.desktop} onToggle={() => setNotif(n => ({ ...n, desktop: !n.desktop }))} />
              </div>
            </div>
          </SectionCard>
          <div className="flex justify-end">
            <button onClick={saveNotif} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white transition-all" style={{ fontSize: 13, fontWeight: 600, background: '#4C5CAE' }}>
              {notifSaved && <Check size={14} />}{notifSaved ? 'Saved!' : 'Save Notifications'}
            </button>
          </div>

        <SectionHeading icon={Monitor} label="Appearance" />
          <SectionCard title="Appearance" desc="Control how Clinix looks on your device">
            {/* Light / Dark */}
            <div className="mb-5">
              <p className="text-slate-600 dark:text-slate-400 mb-2" style={{ fontSize: 12, fontWeight: 500 }}>Mode</p>
              <div className="flex gap-3">
                {([['light', Sun, 'Light'], ['dark', Moon, 'Dark']] as const).map(([id, Icon, label]) => (
                  <button key={id} onClick={() => { if ((id === 'dark') !== isDark) toggleTheme(); }}
                    className="flex-1 flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all"
                    style={{ borderColor: (id === 'dark') === isDark ? '#4C5CAE' : '#DEE3F5', background: (id === 'dark') === isDark ? '#EEF1FA' : 'transparent' }}>
                    <Icon size={16} style={{ color: (id === 'dark') === isDark ? '#4C5CAE' : '#94A3B8' }} />
                    <span style={{ fontSize: 13, fontWeight: 500, color: (id === 'dark') === isDark ? '#4C5CAE' : '#64748B' }}>{label}</span>
                    {(id === 'dark') === isDark && <Check size={14} style={{ color: '#4C5CAE', marginLeft: 'auto' }} />}
                  </button>
                ))}
              </div>
            </div>

            {/* Theme colour */}
            <div>
              <p className="text-slate-600 dark:text-slate-400 mb-2" style={{ fontSize: 12, fontWeight: 500 }}>Theme</p>
              <div className="flex gap-3">
                {accentOptions.map(({ id, label, color }) => (
                  <button key={id} onClick={() => setSysPrefs(p => ({ ...p, accent: id }))}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all"
                    style={{ borderColor: sysPrefs.accent === id ? color : '#DEE3F5', background: sysPrefs.accent === id ? `${color}15` : 'transparent' }}>
                    <span className="w-4 h-4 rounded-full" style={{ background: color }} />
                    <span style={{ fontSize: 13, fontWeight: 500, color: sysPrefs.accent === id ? color : '#64748B' }}>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          </SectionCard>
          <div className="flex justify-end">
            <button onClick={savePrefs} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white transition-all" style={{ fontSize: 13, fontWeight: 600, background: '#4C5CAE' }}>
              {prefsSaved && <Check size={14} />}{prefsSaved ? 'Saved!' : 'Save Appearance'}
            </button>
          </div>
      </>
    );
  }

  // ── Section content — only the active tab's sections are rendered
  function renderSection() {
    return (
      <>
        {tab === 'account' && (<>
        <SectionCard title="Account Information" desc="Your profile details used across the system">
            {/* Photo */}
            <div className="flex items-center gap-5 mb-6 pb-6 border-b border-blue-100 dark:border-slate-700">
              <div className="relative shrink-0">
                {accountPhoto ? (
                  <img src={accountPhoto} alt="Profile" className="w-20 h-20 rounded-2xl object-cover border-2 border-blue-100 dark:border-slate-600 shadow" />
                ) : (
                  <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-white shadow" style={{ background: 'linear-gradient(135deg,#6C7FC8,#37479A)', fontSize: 24, fontWeight: 700 }}>{initials}</div>
                )}
                <button onClick={() => photoRef.current?.click()} className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow border-2 border-white dark:border-slate-800 hover:bg-blue-700 transition-colors">
                  <Camera size={13} />
                </button>
                <input ref={photoRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-black dark:text-slate-100" style={{ fontSize: 16, fontWeight: 700 }}>{account.fullName || roleLabel}</p>
                <p className="text-slate-500 dark:text-slate-400" style={{ fontSize: 12 }}>{roleLabel}</p>
              </div>
              {accountPhoto && <button onClick={() => setAccountPhoto('')} className="text-red-500 hover:text-red-600 text-xs transition-colors">Remove photo</button>}
            </div>

            {/* Fields */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Full Name">
                <input value={account.fullName} onChange={e => setAccount(a => ({ ...a, fullName: e.target.value }))} placeholder="Full name" className={INPUT} style={{ fontSize: 13 }} />
              </Field>
              {/* Your login and your role identify the account rather than
                  describe it, so neither is editable from your own profile.
                  Both are managed on the Accounts screen. */}
              <Field label="Username">
                <input value={userProfile.username} readOnly disabled className={INPUT} style={{ fontSize: 13, opacity: 0.7 }} />
              </Field>
              <Field label="Email Address">
                <input type="email" value={account.email} onChange={e => setAccount(a => ({ ...a, email: e.target.value }))} placeholder="email@bisu.edu.ph" className={INPUT} style={{ fontSize: 13 }} />
              </Field>
              <Field label="Contact Number">
                <input value={account.contact} onChange={e => setAccount(a => ({ ...a, contact: e.target.value }))} placeholder="09XX XXX XXXX" className={INPUT} style={{ fontSize: 13 }} />
              </Field>
              <Field label="Employee ID">
                <input value={account.employeeId} onChange={e => setAccount(a => ({ ...a, employeeId: e.target.value }))} placeholder="EMP-001" className={INPUT} style={{ fontSize: 13 }} />
              </Field>
              <Field label="Birthdate">
                <input type="date" value={account.birthdate} onChange={e => setAccount(a => ({ ...a, birthdate: e.target.value }))} className={INPUT} style={{ fontSize: 13 }} />
              </Field>
              <Field label="Role">
                <input value={roleLabel} readOnly disabled className={INPUT} style={{ fontSize: 13, opacity: 0.7 }} />
              </Field>
              <div className="col-span-2">
                <Field label="Address">
                  <input value={account.address} onChange={e => setAccount(a => ({ ...a, address: e.target.value }))} placeholder="Home address" className={INPUT} style={{ fontSize: 13 }} />
                </Field>
              </div>
            </div>
            <SaveBar onSave={saveAccount} saved={accountSaved} />
          </SectionCard>

        </>)}

        {tab === 'security' && (<>
        <SectionHeading icon={Shield} label="Security" />
        {/* Change password */}
          <SectionCard title="Change Password"
            action={<button onClick={() => setShowPwForm(v => !v)} className="px-4 py-2 rounded-xl border border-blue-100 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors" style={{ fontSize: 13 }}>{showPwForm ? 'Cancel' : 'Change Password'}</button>}>
            {!showPwForm ? (
              <p className="text-slate-400" style={{ fontSize: 13 }}>Password was last changed on your account creation date.</p>
            ) : (
              <div className="space-y-4">
                {(['current', 'next', 'confirm'] as const).map(k => (
                  <Field key={k} label={k === 'current' ? 'Current Password' : k === 'next' ? 'New Password' : 'Confirm New Password'}>
                    <div className="relative">
                      <input type={showPw[k] ? 'text' : 'password'} value={pw[k]}
                        onChange={e => setPw(p => ({ ...p, [k]: e.target.value }))}
                        placeholder="••••••••" className={`${INPUT} pr-10`} style={{ fontSize: 13 }} />
                      <button type="button" onClick={() => setShowPw(p => ({ ...p, [k]: !p[k] }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        {showPw[k] ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </Field>
                ))}
                <div className="flex justify-end">
                  <button onClick={changePassword} disabled={pwSaving} className="px-5 py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 transition-colors" style={{ fontSize: 13, fontWeight: 600 }}>{pwSaving ? 'Updating…' : 'Update Password'}</button>
                </div>
              </div>
            )}
          </SectionCard>

          {/* 2FA */}
          <SectionCard title="Two-Factor Authentication" desc="Add an extra layer of security to your account">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-black dark:text-slate-300" style={{ fontSize: 13, fontWeight: 500 }}>2FA Status</p>
                <p className="text-slate-400" style={{ fontSize: 12 }}>{twoFa ? 'Enabled — your account is protected' : 'Disabled — your account is less secure'}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${twoFa ? 'bg-blue-100 text-blue-700' : 'bg-blue-100 text-slate-500'}`}>{twoFa ? 'Enabled' : 'Disabled'}</span>
                <Toggle on={twoFa} onToggle={() => { setTwoFa(v => !v); }} />
              </div>
            </div>
          </SectionCard>

          {/* Session */}
          <SectionCard title="Session Management">
            <div className="bg-blue-50 dark:bg-slate-700/40 rounded-xl p-4 mb-4">
              <p className="text-slate-500 dark:text-slate-400 mb-3" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Current Session</p>
              <div className="grid grid-cols-3 gap-4">
                {[['Device', 'Windows 11 / Chrome'], ['Last Login', 'July 8, 2026 · 8:42 AM'], ['Location', 'BISU Calape Campus']].map(([k, v]) => (
                  <div key={k}>
                    <p className="text-slate-400" style={{ fontSize: 11 }}>{k}</p>
                    <p className="text-black dark:text-slate-300" style={{ fontSize: 13, fontWeight: 500 }}>{v}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-black dark:text-slate-300" style={{ fontSize: 13, fontWeight: 500 }}>Automatic Logout</p>
                <p className="text-slate-400" style={{ fontSize: 12 }}>Sign out after period of inactivity</p>
              </div>
              <select value={autoLogout} onChange={e => setAutoLogout(e.target.value)} className="border border-blue-100 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-700 text-black dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500" style={{ fontSize: 13 }}>
                <option value="10">10 minutes</option>
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="60">1 hour</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <button onClick={() => showToast('All other sessions signed out')} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" style={{ fontSize: 13 }}>
                <LogOut size={14} />Sign Out All Devices
              </button>
              <button onClick={saveSec} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white transition-all" style={{ fontSize: 13, fontWeight: 600, background: secSaved ? '#4C5CAE' : '#4C5CAE' }}>
                {secSaved && <Check size={14} />}{secSaved ? 'Saved!' : 'Save Settings'}
              </button>
            </div>
          </SectionCard>

        </>)}

        {tab === 'clinic' && isAdmin && (<>
        <SectionHeading icon={Building2} label="Clinic Information" />
        <SectionCard title="Clinic Profile" desc="Official information about the campus clinic">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Field label="Clinic Name">
                <input value={clinic.name} onChange={e => setClinic(c => ({ ...c, name: e.target.value }))} className={INPUT} style={{ fontSize: 13 }} />
              </Field>
            </div>
            <div className="col-span-2">
              <Field label="Clinic Address">
                <input value={clinic.address} onChange={e => setClinic(c => ({ ...c, address: e.target.value }))} placeholder="Campus address" className={INPUT} style={{ fontSize: 13 }} />
              </Field>
            </div>
            <Field label="Campus Contact Number">
              <input value={clinic.contact} onChange={e => setClinic(c => ({ ...c, contact: e.target.value }))} placeholder="(038) XXX XXXX" className={INPUT} style={{ fontSize: 13 }} />
            </Field>
            <Field label="Official Email">
              <input type="email" value={clinic.email} onChange={e => setClinic(c => ({ ...c, email: e.target.value }))} placeholder="clinic@bisu-calape.edu.ph" className={INPUT} style={{ fontSize: 13 }} />
            </Field>
            <Field label="Office Hours">
              <input value={clinic.officeHours} onChange={e => setClinic(c => ({ ...c, officeHours: e.target.value }))} placeholder="Mon – Fri, 8:00 AM – 5:00 PM" className={INPUT} style={{ fontSize: 13 }} />
            </Field>
            <Field label="Emergency Contact">
              <input value={clinic.emergency} onChange={e => setClinic(c => ({ ...c, emergency: e.target.value }))} placeholder="Emergency number" className={INPUT} style={{ fontSize: 13 }} />
            </Field>
          </div>
          <SaveBar onSave={saveClinic} saved={clinicSaved} />
        </SectionCard>

        <SectionHeading icon={GraduationCap} label="Colleges & Courses" />
        <SectionCard
          title="Colleges & Courses"
          desc="Add or remove colleges and their courses. Changes apply to the Student and Faculty forms and filters instantly."
          action={
            <button onClick={handleResetColleges} className="px-4 py-2 rounded-xl border border-blue-100 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors" style={{ fontSize: 13 }}>
              Restore defaults
            </button>
          }
        >
          {/* Add a new college */}
          <div className="flex gap-2 mb-5">
            <input
              value={newCollege}
              onChange={e => setNewCollege(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCollege(); } }}
              placeholder="New college code or name (e.g. CON — College of Nursing)"
              className={INPUT}
              style={{ fontSize: 13 }}
            />
            <button onClick={handleAddCollege} className="flex shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-4 text-white hover:bg-blue-700 transition-colors" style={{ fontSize: 13, fontWeight: 600 }}>
              <Plus size={15} /> Add College
            </button>
          </div>

          {/* College list */}
          <div className="space-y-4">
            {collegesList.length === 0 && (
              <p className="text-slate-400 text-center py-6" style={{ fontSize: 13 }}>No colleges yet — add one above.</p>
            )}
            {collegesList.map((col) => (
              <div key={col.name} className="rounded-xl border border-blue-100 dark:border-slate-700 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-black dark:text-slate-100" style={{ fontSize: 13, fontWeight: 700 }}>{col.name}</p>
                  <button onClick={() => handleRemoveCollege(col.name)} title="Remove college" className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                    <Trash2 size={15} />
                  </button>
                </div>

                {/* Course chips */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {col.courses.length === 0 && (
                    <span className="text-slate-400" style={{ fontSize: 12 }}>No courses yet</span>
                  )}
                  {col.courses.map((course) => (
                    <span key={course} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-100 dark:bg-slate-700 px-2.5 py-1 text-black dark:text-slate-200" style={{ fontSize: 12, fontWeight: 500 }}>
                      {course}
                      {/* Program length. Year-end processing graduates a student
                          on reaching this year level, so a 2-year course does not
                          get pushed to a 3rd year that does not exist. */}
                      <input
                        type="number"
                        min={1}
                        max={YEAR_OPTIONS.length}
                        value={courseYearsMap[course] ?? DEFAULT_COURSE_YEARS}
                        onChange={async e => {
                          const r = await setCourseYears(course, Number(e.target.value));
                          if (!r.ok) showToast(r.error || 'Could not set the program length');
                        }}
                        title={`${course} runs for this many years`}
                        aria-label={`${course} program length in years`}
                        className="w-11 rounded border border-blue-200 bg-white px-1 py-0.5 text-center text-black dark:border-slate-500 dark:bg-slate-600 dark:text-slate-200"
                        style={{ fontSize: 11 }}
                      />
                      <span className="text-slate-500 dark:text-slate-400" style={{ fontSize: 10.5 }}>yrs</span>
                      <button onClick={() => handleRemoveCourse(col.name, course)} title="Remove course" className="text-slate-400 hover:text-red-600 transition-colors">
                        <X size={13} />
                      </button>
                    </span>
                  ))}
                </div>

                {/* Add a course to this college */}
                <div className="flex gap-2">
                  <input
                    value={courseDrafts[col.name] || ''}
                    onChange={e => setCourseDrafts(d => ({ ...d, [col.name]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCourse(col.name); } }}
                    placeholder={`Add course to ${col.name}`}
                    className={INPUT}
                    style={{ fontSize: 12 }}
                  />
                  <button onClick={() => handleAddCourse(col.name)} className="flex shrink-0 items-center gap-1.5 rounded-xl border border-blue-100 dark:border-slate-600 px-3 text-slate-600 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors" style={{ fontSize: 12, fontWeight: 600 }}>
                    <Plus size={14} /> Add
                  </button>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionHeading icon={CalendarClock} label="Enrolment &amp; School Year" />
        <SectionCard
          title="Registrar Masterlist Import"
          desc="Upload the registrar's enrolled-students file and let it update year levels, courses and enrolment status."
        >
          {/* The registrar's file is the authority on who is enrolled, so this is
              the preferred way to roll the roster into a new term: it carries the
              irregulars, shiftees and stop-outs that a blanket promotion gets
              wrong. Preview first, same as year-end — nothing is written until
              the counts have been read. */}
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 dark:border-slate-600 dark:bg-slate-700/40 mb-5">
            <p className="text-slate-600 dark:text-slate-300" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
              Only <strong>year level, course, enrolment status and school year</strong> are
              taken from the file. Medical records, allergies, guardian details, addresses
              and photos are never touched — the registrar's file does not describe them,
              so they are left exactly as the clinic recorded them.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="School Year / Term">
              <input
                value={mlSy}
                onChange={e => setMlSy(e.target.value)}
                placeholder="2026-2027"
                className={INPUT}
                style={{ fontSize: 13 }}
              />
            </Field>
            <Field label="Masterlist file">
              <button
                onClick={() => masterlistInput.current?.click()}
                className={`${INPUT} flex items-center gap-2 text-left`}
                style={{ fontSize: 13 }}
              >
                <Upload size={14} className="shrink-0 text-slate-400" />
                <span className="truncate">{mlFileName || 'Choose a CSV file…'}</span>
              </button>
              <input
                ref={masterlistInput}
                type="file"
                accept=".csv,text/csv"
                onChange={handleMasterlistFile}
                className="hidden"
              />
            </Field>
          </div>
          <p className="text-slate-400 mt-1.5" style={{ fontSize: 11.5 }}>
            Save the registrar's Excel sheet as <strong>CSV</strong> first (File → Save As → CSV).
            Columns read: Student ID, Name (or Last/First/Middle), Course, Year Level, Status, Sex.
            The school year is stamped on everyone found in the file; leave it blank
            to keep whatever each student already has.
          </p>

          {mlWarnings.length > 0 && (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-900/20">
              {mlWarnings.map(w => (
                <p key={w} className="text-amber-800 dark:text-amber-200" style={{ fontSize: 12, lineHeight: 1.6 }}>{w}</p>
              ))}
            </div>
          )}

          {mlRows.length > 0 && (
            <p className="text-slate-500 dark:text-slate-400 mt-3" style={{ fontSize: 12 }}>
              {mlRows.length} row{mlRows.length !== 1 ? 's' : ''} read from {mlFileName}.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 mt-5">
            <button
              onClick={runMasterlistPreview}
              disabled={mlBusy || !mlRows.length}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
              style={{ fontSize: 13, fontWeight: 600 }}
            >
              <RefreshCw size={14} className={mlBusy ? 'animate-spin' : ''} />
              {mlBusy ? 'Working…' : mlPlan ? 'Refresh preview' : 'Preview changes'}
            </button>
            {mlPlan && (
              <button
                onClick={commitMasterlist}
                disabled={mlBusy || !(mlPlan.create.length + mlPlan.update.length + mlDrops.size)}
                className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-5 py-2.5 text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200 transition-colors"
                style={{ fontSize: 13, fontWeight: 600 }}
              >
                <Check size={14} />
                Apply {mlPlan.create.length + mlPlan.update.length + mlDrops.size} change
                {mlPlan.create.length + mlPlan.update.length + mlDrops.size !== 1 ? 's' : ''}
              </button>
            )}
          </div>

          {mlPlan && (
            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-4 gap-3">
                {([
                  ['Updated', mlPlan.update.length, '#2563EB'],
                  ['New', mlPlan.create.length, '#0E7490'],
                  ['Already correct', mlPlan.unchanged.length, '#64748B'],
                  ['Needs fixing', mlPlan.invalid.length, '#B45309'],
                ] as const).map(([label, n, colour]) => (
                  <div key={label} className="rounded-xl border border-blue-100 px-4 py-3 dark:border-slate-600">
                    <p style={{ fontSize: 22, fontWeight: 700, color: colour }}>{n}</p>
                    <p className="text-slate-500 dark:text-slate-400" style={{ fontSize: 11.5 }}>{label}</p>
                  </div>
                ))}
              </div>

              <PreviewList
                title="Updated from the masterlist"
                rows={mlPlan.update}
                describe={s => s.changes || 'Changed'}
              />
              <PreviewList
                title="New students to be added"
                rows={mlPlan.create}
                describe={s => `${s.course} · ${s.yearLevel} · ${s.status} — medical details still blank`}
              />
              <PreviewList
                title="Rows that could not be read — fix the file and re-upload"
                rows={mlPlan.invalid}
                describe={s => `Line ${s.line}: ${s.reason || 'Unreadable'}`}
                tone="warn"
              />
              <PreviewList
                title="Enrolled here but not in this file — tick to mark dropped"
                rows={mlPlan.missing}
                describe={s => `${s.course} · ${s.yearLevel} — stays enrolled unless ticked`}
                tone="warn"
                selected={mlDrops}
                onToggle={toggleDrop}
              />
              {mlPlan.missing.length > 0 && (
                <p className="text-slate-500 dark:text-slate-400" style={{ fontSize: 11.5, lineHeight: 1.6 }}>
                  Nobody in this list is changed unless you tick them. If the file covers only
                  one college, or the registrar is still encoding, leave them alone — they stay
                  enrolled and the import can be run again later.
                </p>
              )}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Year-End Processing"
          desc="No registrar file? Move every enrolled student up one year level, and graduate the ones who have finished their program."
        >
          {/* Deliberately two steps. This touches the whole roster at once, and
              the roster is never as tidy as the rule assumes — irregulars,
              shiftees and stop-outs all need somebody to read the list first.
              There is no automatic run and no one-click commit. */}
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 dark:border-slate-600 dark:bg-slate-700/40 mb-5">
            <p className="text-slate-600 dark:text-slate-300" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
              Nothing is deleted and nothing is moved to another table. A graduating
              student keeps their row, their documents and their entire consultation
              history — only their status changes to <strong>Graduated</strong>, and
              they move to the Alumni Records view under Students.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="School Year Ending">
              <input
                value={yearEndSy}
                onChange={e => setYearEndSy(e.target.value)}
                placeholder="2026-2027"
                className={INPUT}
                style={{ fontSize: 13 }}
              />
            </Field>
            <Field label="Date Graduated">
              <input
                type="date"
                value={yearEndDate}
                onChange={e => setYearEndDate(e.target.value)}
                className={INPUT}
                style={{ fontSize: 13 }}
              />
            </Field>
          </div>
          <p className="text-slate-400 mt-1.5" style={{ fontSize: 11.5 }}>
            Program lengths come from Colleges &amp; Courses above — a course set to
            2 years graduates at 2nd Year.
          </p>

          <div className="flex flex-wrap items-center gap-3 mt-5">
            <button
              onClick={runYearEndPreview}
              disabled={yearEndBusy}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
              style={{ fontSize: 13, fontWeight: 600 }}
            >
              <RefreshCw size={14} className={yearEndBusy ? 'animate-spin' : ''} />
              {yearEndBusy ? 'Working…' : yearEndPlan ? 'Refresh preview' : 'Preview changes'}
            </button>
            {yearEndPlan && (
              <button
                onClick={commitYearEnd}
                disabled={yearEndBusy || (!yearEndPlan.promote.length && !yearEndPlan.graduate.length)}
                className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-5 py-2.5 text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200 transition-colors"
                style={{ fontSize: 13, fontWeight: 600 }}
              >
                <Check size={14} />
                Apply to {yearEndPlan.promote.length + yearEndPlan.graduate.length} student
                {yearEndPlan.promote.length + yearEndPlan.graduate.length !== 1 ? 's' : ''}
              </button>
            )}
          </div>

          {yearEndPlan && (
            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {([
                  ['Promoted', yearEndPlan.promote.length, '#2563EB'],
                  ['Graduating', yearEndPlan.graduate.length, '#0E7490'],
                  ['Needs attention', yearEndPlan.skipped.length, '#B45309'],
                ] as const).map(([label, n, colour]) => (
                  <div key={label} className="rounded-xl border border-blue-100 px-4 py-3 dark:border-slate-600">
                    <p style={{ fontSize: 22, fontWeight: 700, color: colour }}>{n}</p>
                    <p className="text-slate-500 dark:text-slate-400" style={{ fontSize: 11.5 }}>{label}</p>
                  </div>
                ))}
              </div>

              <PreviewList
                title="Graduating"
                rows={yearEndPlan.graduate}
                describe={s => `${s.course} · ${s.yearLevel} → Graduated`}
              />
              <PreviewList
                title="Promoted"
                rows={yearEndPlan.promote}
                describe={s => `${s.course} · ${s.yearLevel} → ${s.nextYearLevel}`}
              />
              <PreviewList
                title="Skipped — fix these first"
                rows={yearEndPlan.skipped}
                describe={s => s.reason || 'Cannot be processed'}
                tone="warn"
              />
            </div>
          )}
        </SectionCard>

        </>)}

        {tab === 'prefs' && (<>
        {/* Clinic-wide page toggles — admin only */}
        {isAdmin && (<>
        <SectionHeading icon={FileText} label="Pages & Features" />
        <SectionCard title="Optional Pages" desc="Turn clinic pages on or off for everyone">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-black dark:text-slate-300" style={{ fontSize: 13, fontWeight: 500 }}>Medical Certificates page</p>
              <p className="text-slate-400" style={{ fontSize: 12 }}>
                {certificatesEnabled ? 'Shown in the sidebar and accessible.' : 'Hidden from the sidebar for all users.'}
              </p>
            </div>
            <Toggle on={certificatesEnabled} onToggle={() => {
              const next = !certificatesEnabled;
              setCertificatesEnabled?.(next);
              showToast(next ? 'Medical Certificates page enabled' : 'Medical Certificates page hidden');
            }} />
          </div>
        </SectionCard>
        </>)}

        <SectionHeading icon={Monitor} label="System Preferences" />
        <SectionCard title="Appearance" desc="Control how Clinix looks on your device">
            {/* Theme */}
            <div className="mb-5">
              <p className="text-slate-600 dark:text-slate-400 mb-2" style={{ fontSize: 12, fontWeight: 500 }}>Theme</p>
              <div className="flex gap-3">
                {([['light', Sun, 'Light'], ['dark', Moon, 'Dark']] as const).map(([id, Icon, label]) => (
                  <button key={id} onClick={() => { if ((id === 'dark') !== isDark) toggleTheme(); }}
                    className="flex-1 flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all"
                    style={{ borderColor: (id === 'dark') === isDark ? '#4C5CAE' : '#DEE3F5', background: (id === 'dark') === isDark ? '#EEF1FA' : 'transparent' }}>
                    <Icon size={16} style={{ color: (id === 'dark') === isDark ? '#4C5CAE' : '#94A3B8' }} />
                    <span style={{ fontSize: 13, fontWeight: 500, color: (id === 'dark') === isDark ? '#4C5CAE' : '#64748B' }}>{label}</span>
                    {(id === 'dark') === isDark && <Check size={14} style={{ color: '#4C5CAE', marginLeft: 'auto' }} />}
                  </button>
                ))}
              </div>
            </div>

            {/* Accent */}
            <div className="mb-5">
              <p className="text-slate-600 dark:text-slate-400 mb-2" style={{ fontSize: 12, fontWeight: 500 }}>Accent Color</p>
              <div className="flex gap-3">
                {accentOptions.map(({ id, label, color }) => (
                  <button key={id} onClick={() => setSysPrefs(p => ({ ...p, accent: id }))}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 transition-all"
                    style={{ borderColor: sysPrefs.accent === id ? color : '#DEE3F5', background: sysPrefs.accent === id ? `${color}15` : 'transparent' }}>
                    <span className="w-4 h-4 rounded-full" style={{ background: color }} />
                    <span style={{ fontSize: 13, fontWeight: 500, color: sysPrefs.accent === id ? color : '#64748B' }}>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Font size */}
            <div className="mb-5">
              <p className="text-slate-600 dark:text-slate-400 mb-2" style={{ fontSize: 12, fontWeight: 500 }}>Font Size</p>
              <div className="flex gap-3">
                {(['small', 'medium', 'large'] as const).map(s => (
                  <button key={s} onClick={() => setSysPrefs(p => ({ ...p, fontSize: s }))}
                    className="flex-1 py-2.5 rounded-xl border-2 transition-all"
                    style={{ fontSize: s === 'small' ? 11 : s === 'medium' ? 13 : 15, fontWeight: 500, borderColor: sysPrefs.fontSize === s ? '#4C5CAE' : '#DEE3F5', color: sysPrefs.fontSize === s ? '#4C5CAE' : '#64748B', background: sysPrefs.fontSize === s ? '#EEF1FA' : 'transparent' }}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Language */}
            <div>
              <p className="text-slate-600 dark:text-slate-400 mb-2" style={{ fontSize: 12, fontWeight: 500 }}>Language</p>
              <div className="flex gap-3">
                {(['english', 'filipino'] as const).map(l => (
                  <button key={l} onClick={() => setSysPrefs(p => ({ ...p, language: l }))}
                    className="flex-1 py-2.5 rounded-xl border-2 transition-all"
                    style={{ fontSize: 13, fontWeight: 500, borderColor: sysPrefs.language === l ? '#4C5CAE' : '#DEE3F5', color: sysPrefs.language === l ? '#4C5CAE' : '#64748B', background: sysPrefs.language === l ? '#EEF1FA' : 'transparent' }}>
                    {l === 'english' ? '🇺🇸 English' : '🇵🇭 Filipino'}
                  </button>
                ))}
              </div>
            </div>
          </SectionCard>
          <div className="flex justify-end">
            <button onClick={savePrefs} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white transition-all" style={{ fontSize: 13, fontWeight: 600, background: prefsSaved ? '#4C5CAE' : '#4C5CAE' }}>
              {prefsSaved && <Check size={14} />}{prefsSaved ? 'Saved!' : 'Save Preferences'}
            </button>
          </div>

        {/* Clinic-wide record rules — admin only */}
        {isAdmin && (<>
        <SectionHeading icon={FileText} label="Medical Records" />
        <SectionCard title="Patient Record Preferences" desc="Configure how patient records are created and managed">
          <div className="space-y-5">
            <Field label="Default Record Number Format">
              <input value={recPrefs.format} onChange={e => setRecPrefs(p => ({ ...p, format: e.target.value }))} placeholder="BISU-2026-0001" className={INPUT} style={{ fontSize: 13 }} />
              <p className="text-slate-400 mt-1" style={{ fontSize: 11 }}>Used as the template for auto-generated record IDs</p>
            </Field>
            {[
              { key: 'autoGenerate' as const, label: 'Auto Generate Patient IDs', desc: 'Automatically assign record numbers to new patients' },
              { key: 'allowDuplicates' as const, label: 'Allow Duplicate Student Numbers', desc: 'Permit multiple records with the same student ID' },
            ].map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between py-1">
                <div>
                  <p className="text-black dark:text-slate-300" style={{ fontSize: 13, fontWeight: 500 }}>{label}</p>
                  <p className="text-slate-400" style={{ fontSize: 12 }}>{desc}</p>
                </div>
                <Toggle on={recPrefs[key]} onToggle={() => setRecPrefs(p => ({ ...p, [key]: !p[key] }))} />
              </div>
            ))}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-black dark:text-slate-300" style={{ fontSize: 13, fontWeight: 500 }}>Archive Inactive Records After</p>
                <p className="text-slate-400" style={{ fontSize: 12 }}>Records with no activity will be moved to archive</p>
              </div>
              <select value={recPrefs.archiveAfter} onChange={e => setRecPrefs(p => ({ ...p, archiveAfter: e.target.value }))} className="border border-blue-100 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-700 text-black dark:text-slate-200 focus:outline-none" style={{ fontSize: 13 }}>
                <option value="1">1 year</option>
                <option value="2">2 years</option>
                <option value="3">3 years</option>
                <option value="5">5 years</option>
              </select>
            </div>
          </div>
          <SaveBar onSave={saveRec} saved={recSaved} />
        </SectionCard>

        </>)}

        <SectionHeading icon={Bell} label="Notifications" />
        <SectionCard title="Email Notifications" desc="Choose what events trigger email alerts">
            <div className="space-y-3">
              {([
                ['emailNewPatient', 'New Patient Registered'],
                ['emailBackup', 'Backup Completed'],
                ['emailLowStock', 'Low Medicine Stock'],
                ['emailFailedLogin', 'Failed Login Attempts'],
                ['emailUpdates', 'System Updates'],
              ] as [keyof NotifPrefs, string][]).map(([key, label]) => (
                <div key={key} className="flex items-center justify-between py-1.5">
                  <p className="text-black dark:text-slate-300" style={{ fontSize: 13 }}>{label}</p>
                  <Toggle on={notif[key] as boolean} onToggle={() => setNotif(n => ({ ...n, [key]: !n[key] }))} />
                </div>
              ))}
            </div>
          </SectionCard>
          <SectionCard title="Desktop Notifications">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-black dark:text-slate-300" style={{ fontSize: 13, fontWeight: 500 }}>Desktop Notifications</p>
                <p className="text-slate-400" style={{ fontSize: 12 }}>Show system notifications in your browser</p>
              </div>
              <Toggle on={notif.desktop} onToggle={() => setNotif(n => ({ ...n, desktop: !n.desktop }))} />
            </div>
          </SectionCard>
          <div className="flex justify-end">
            <button onClick={saveNotif} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white transition-all" style={{ fontSize: 13, fontWeight: 600, background: notifSaved ? '#4C5CAE' : '#4C5CAE' }}>
              {notifSaved && <Check size={14} />}{notifSaved ? 'Saved!' : 'Save Notifications'}
            </button>
          </div>

        </>)}

        {tab === 'data' && isAdmin && (<>
        {isAdmin && <>
        <SectionHeading icon={Database} label="Backup & Recovery" />
        <SectionCard title="Database Backup" desc="Create and restore system backups">
            <div className="bg-blue-50 dark:bg-slate-700/40 rounded-xl p-4 mb-5 flex items-center justify-between">
              <div>
                <p className="text-slate-400" style={{ fontSize: 11, fontWeight: 500 }}>Last Backup</p>
                <p className="text-black dark:text-slate-200" style={{ fontSize: 14, fontWeight: 600 }}>{backupPrefs.lastBackup || 'Never'}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                <Database size={18} className="text-blue-600" />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={createBackup} disabled={backupBusy} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-60" style={{ fontSize: 13, fontWeight: 600 }}>
                <Download size={15} />{backupBusy ? 'Working…' : 'Create Backup'}
              </button>
              <input ref={restoreRef} type="file" accept="application/json,.json" onChange={handleRestoreFile} className="hidden" />
              <button onClick={() => restoreRef.current?.click()} disabled={backupBusy} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-blue-100 dark:border-slate-600 text-black dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-60" style={{ fontSize: 13, fontWeight: 600 }}>
                <Upload size={15} />Restore Backup
              </button>
            </div>
            {/* The file holds every record in readable form, and a restore is a
                replacement rather than a merge. Both are worth knowing before
                the button is pressed rather than after. */}
            <p className="text-slate-500 dark:text-slate-400 mt-4" style={{ fontSize: 11.5, lineHeight: 1.55 }}>
              The backup covers students, staff, consultations, medical records, certificates, stock and the college list, straight from the database.
              User accounts and uploaded document files are not included. Records are stored unencrypted inside the file, so keep it somewhere private.
              Restoring <strong>replaces</strong> everything currently in the database.
            </p>
          </SectionCard>
          {/* The daily/weekly/monthly picker is left out on purpose: nothing in
              the app runs on a schedule, so the buttons only ever saved a
              preference and would have promised backups that never happened.
              Scheduled backups are set up on the server — see
              deploy/install-backup-task.ps1, which registers backup-clinix.ps1
              as a Windows task and captures the uploaded files too. */}
        </>}

        <SectionHeading icon={Clock} label="Audit Log" />
        <SectionCard title="Recent Activities" desc="A log of all actions performed in the system">
          {activities.length === 0 ? (
            <p className="text-slate-400 text-center py-8" style={{ fontSize: 13 }}>No recent activities</p>
          ) : (
            <ul className="space-y-3">
              {activities.slice(0, 15).map((a, i) => (
                <li key={i} className="flex items-start gap-3 pb-3 border-b border-blue-100 dark:border-slate-700 last:border-0 last:pb-0">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0" style={{ fontSize: 11, fontWeight: 700 }}>
                    {account.fullName.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase() || 'AD'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-black dark:text-slate-300" style={{ fontSize: 13 }}>{a.msg}</p>
                    <p className="text-slate-400" style={{ fontSize: 11 }}>{a.ts}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {activities.length > 15 && (
            <div className="flex justify-center mt-4">
              <button className="flex items-center gap-2 text-blue-600 hover:text-blue-700 transition-colors" style={{ fontSize: 13, fontWeight: 500 }}>
                View Full Audit Log <ChevronRight size={14} />
              </button>
            </div>
          )}
        </SectionCard>

        </>)}

        {/* Data Privacy lives on the Security tab — clinic-wide, admin only */}
        {tab === 'security' && isAdmin && (<>
        <SectionHeading icon={Lock} label="Data Privacy" />
        <SectionCard title="Privacy & Compliance" desc="Healthcare data protection settings">
          <div className="space-y-4">
            {([
              ['encrypt', 'Encrypt Patient Records', 'All stored patient data is encrypted at rest'],
              ['requirePasswordExport', 'Require Password Before Exporting Records', 'Prompt for confirmation before any data export'],
              ['hideSensitive', 'Hide Sensitive Information', 'Mask sensitive fields in table views'],
              ['recordActivity', 'Record User Activity', 'Log all system actions in the audit trail'],
            ] as [keyof PrivacyPrefs, string, string][]).map(([key, label, desc]) => (
              <div key={key} className="flex items-start justify-between gap-4 py-2 border-b border-blue-100 dark:border-slate-700 last:border-0">
                <div>
                  <p className="text-black dark:text-slate-300" style={{ fontSize: 13, fontWeight: 500 }}>{label}</p>
                  <p className="text-slate-400" style={{ fontSize: 12 }}>{desc}</p>
                </div>
                <Toggle on={privacy[key] as boolean} onToggle={() => setPrivacy(p => ({ ...p, [key]: !p[key] }))} />
              </div>
            ))}
          </div>
          <SaveBar onSave={savePrivacy} saved={privSaved} />
        </SectionCard>

        </>)}

        {tab === 'about' && (<>
        <SectionHeading icon={Info} label="About System" />
        <SectionCard title="System Information">
            <div className="flex items-center gap-4 mb-6 pb-6 border-b border-blue-100 dark:border-slate-700">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#6C7FC8,#37479A)' }}>
                <ClinixLogo width={34} />
              </div>
              <div>
                <p className="text-black dark:text-white" style={{ fontSize: 18, fontWeight: 800 }}>Clinix</p>
                <p className="text-slate-500" style={{ fontSize: 13 }}>Clinic Records Management System</p>
              </div>
            </div>
            <div className="space-y-3">
              {[
                ['Version', APP_VERSION],
                ['Build Number', `build-${new Date().getFullYear()}0708`],
                ['Database Version', 'LocalStorage v1.0'],
                ['Developer', 'BISU Computer Science Department'],
                ['Institution', 'BISU Calape Campus'],
                ['License', 'Educational Use'],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between py-2 border-b border-blue-100 dark:border-slate-700 last:border-0">
                  <span className="text-slate-500 dark:text-slate-400" style={{ fontSize: 13 }}>{k}</span>
                  <span className="text-black dark:text-slate-300" style={{ fontSize: 13, fontWeight: 500 }}>{v}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => showToast(`Clinix is up to date (v${APP_VERSION})`)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors" style={{ fontSize: 13, fontWeight: 600 }}>
                <RefreshCw size={14} />Check for Updates
              </button>
            </div>
          </SectionCard>

          {/* Data management */}
          <SectionCard title="Data Management">
            <div className="flex flex-wrap gap-3">
              <button onClick={() => { onNavigate('dashboard'); showToast('Dashboard opened'); }} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-blue-100 dark:border-slate-600 text-black dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors" style={{ fontSize: 13 }}>
                Back to Dashboard
              </button>
              {isAdmin && (
                <button onClick={async () => { if (!(await confirmDialog({ title: 'Clear the activity log?', message: 'All recorded activity history will be permanently deleted. This cannot be undone.', confirmLabel: 'Clear log', danger: true }))) return; localStorage.removeItem('clinixActivities'); showToast('Activity log cleared'); }} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" style={{ fontSize: 13 }}>
                  Clear Activity Log
                </button>
              )}
            </div>
          </SectionCard>
        </>)}
      </>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-screen-xl">
      <div className="mb-6">
        <h1 className="text-black dark:text-white" style={{ fontWeight: 800, fontSize: 22 }}>Settings</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1" style={{ fontSize: 13 }}>
          {isAdmin ? 'Manage your account, clinic, and system preferences' : 'Manage your profile, password and preferences'}
        </p>
      </div>

      {/* Tabs — the admin's settings are long enough that one scroll would bury
          them. Staff and assistants have only their own four sections, so they
          read them straight down with no tabs. */}
      {isAdmin && (
      <div className="mb-5 flex flex-wrap gap-1.5 border-b border-slate-200 dark:border-slate-700 pb-px">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              className="flex items-center gap-2 rounded-t-xl px-4 py-2.5 transition-colors"
              style={{
                fontSize: 13,
                fontWeight: active ? 600 : 500,
                color: active ? '#2563EB' : '#64748B',
                background: active ? (isDark ? 'rgba(37,99,235,0.12)' : '#EFF6FF') : 'transparent',
                borderBottom: `2px solid ${active ? '#2563EB' : 'transparent'}`,
                marginBottom: -1,
              }}
            >
              <Icon size={15} />
              {label}
            </button>
          );
        })}
      </div>
      )}

      {isAdmin ? renderSection() : renderStaffSection()}
    </div>
  );
}
