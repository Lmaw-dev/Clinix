import { useState, useRef } from 'react';
import {
  User, Shield, Building2, Monitor, FileText, Bell,
  Database, Clock, Lock, Info, Camera, Check, Eye, EyeOff,
  Sun, Moon, Download, Upload, RefreshCw, LogOut, Activity,
  ChevronRight, GraduationCap, Plus, Trash2, X,
} from 'lucide-react';

import { Page, AdminProfile } from '../App';
import { useTheme } from '../ThemeContext';
import {
  useColleges, addCollege, removeCollege, addCourse, removeCourse, resetColleges,
} from '../colleges';

// ── helpers ──────────────────────────────────────────────────────────────────

function ls<T>(key: string, def: T): T {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : def; } catch { return def; }
}
function lsSave(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
}

// ── types ─────────────────────────────────────────────────────────────────────

type AccountData = {
  fullName: string; username: string; email: string;
  contact: string; employeeId: string; role: string;
  department: string; status: 'active' | 'inactive';
};
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
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden mb-5">
      <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between gap-4">
        <div>
          <p className="text-slate-900 dark:text-slate-100" style={{ fontSize: 14, fontWeight: 600 }}>{title}</p>
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

const INPUT = 'w-full border border-slate-200 dark:border-slate-600 rounded-xl px-3.5 py-2.5 text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500';

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="relative shrink-0 transition-colors focus:outline-none"
      style={{ width: 44, height: 24, borderRadius: 12, background: on ? '#2563EB' : '#CBD5E1' }}
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

function SaveBar({ onSave, saved }: { onSave: () => void; saved: boolean }) {
  return (
    <div className="flex justify-end mt-5">
      <button
        onClick={onSave}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white transition-all"
        style={{ fontSize: 13, fontWeight: 600, background: saved ? '#16A34A' : '#2563EB' }}
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
  adminProfile?: AdminProfile;
  setAdminProfile?: React.Dispatch<React.SetStateAction<AdminProfile>>;
};

const DEFAULT_PROFILE: AdminProfile = { name: 'Clinic Admin', photo: '' };


// ── main component ────────────────────────────────────────────────────────────

export function SettingsModule({ onNavigate, showToast, adminProfile = DEFAULT_PROFILE, setAdminProfile }: Props) {
  const { isDark, toggle: toggleTheme } = useTheme();
  const photoRef = useRef<HTMLInputElement>(null);

  // ── Account state
  const [account, setAccount] = useState<AccountData>(() => ls('clinixAccount', {
    fullName: adminProfile?.name ?? 'Clinic Admin', username: 'clinic.admin',
    email: 'clinic@bisu-calape.edu.ph', contact: '', employeeId: '',
    role: 'Clinic Administrator', department: 'Health Services', status: 'active',
  }));
  const [accountPhoto, setAccountPhoto] = useState(adminProfile?.photo ?? '');
  const [accountSaved, setAccountSaved] = useState(false);

  // ── Security state
  const [twoFa, setTwoFa] = useState(() => ls('clinixTwoFa', false));
  const [autoLogout, setAutoLogout] = useState(() => ls('clinixAutoLogout', '30'));
  const [showPwForm, setShowPwForm] = useState(false);
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
    emailFailedLogin: true, emailUpdates: true, desktop: true,
  }));
  const [notifSaved, setNotifSaved] = useState(false);

  // ── Backup state
  const [backupPrefs, setBackupPrefs] = useState<BackupPrefs>(() => ls('clinixBackupPrefs', {
    frequency: 'daily', lastBackup: 'July 7, 2026 · 9:30 PM',
  }));

  // ── Privacy state
  const [privacy, setPrivacy] = useState<PrivacyPrefs>(() => ls('clinixPrivacy', {
    encrypt: true, requirePasswordExport: true, hideSensitive: true, recordActivity: true,
  }));
  const [privSaved, setPrivSaved] = useState(false);

  // ── Colleges & Courses state
  const collegesList = useColleges();
  const [newCollege, setNewCollege] = useState('');
  const [courseDrafts, setCourseDrafts] = useState<Record<string, string>>({});

  function handleAddCollege() {
    const name = newCollege.trim();
    const res = addCollege(name);
    if (!res.ok) { showToast(res.error || 'Could not add college'); return; }
    showToast(`College "${name}" added`);
    setNewCollege('');
  }
  function handleRemoveCollege(name: string) {
    if (!confirm(`Remove "${name}" and its courses? Existing student/faculty records keep their saved values.`)) return;
    removeCollege(name);
    showToast(`College "${name}" removed`);
  }
  function handleAddCourse(college: string) {
    const course = (courseDrafts[college] || '').trim();
    const res = addCourse(college, course);
    if (!res.ok) { showToast(res.error || 'Could not add course'); return; }
    showToast(`Course "${course}" added to ${college}`);
    setCourseDrafts((d) => ({ ...d, [college]: '' }));
  }
  function handleRemoveCourse(college: string, course: string) {
    removeCourse(college, course);
    showToast(`Course "${course}" removed`);
  }
  function handleResetColleges() {
    if (!confirm('Restore the default colleges and courses? Your custom additions will be removed.')) return;
    resetColleges();
    showToast('Colleges & courses reset to defaults');
  }

  // ── Save helpers
  function saved(setter: (v: boolean) => void) {
    setter(true); setTimeout(() => setter(false), 2000);
  }

  function saveAccount() {
    lsSave('clinixAccount', account);
    setAdminProfile?.({ name: account.fullName || 'Clinic Admin', photo: accountPhoto });
    showToast('Account updated'); saved(setAccountSaved);
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

  function changePassword() {
    if (!pw.current) { showToast('Enter your current password'); return; }
    if (pw.next.length < 8) { showToast('New password must be 8+ characters'); return; }
    if (pw.next !== pw.confirm) { showToast('Passwords do not match'); return; }
    showToast('Password changed successfully');
    setPw({ current: '', next: '', confirm: '' });
    setShowPwForm(false);
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showToast('Photo must be under 2 MB'); return; }
    const reader = new FileReader();
    reader.onload = () => setAccountPhoto(reader.result as string);
    reader.readAsDataURL(file);
  }

  function createBackup() {
    const keys = ['clinixStudents', 'clinixFaculty', 'clinixMedRecords', 'clinixVisits', 'clinixInventory', 'clinixCertificates', 'clinixConsultations'];
    const data: Record<string, unknown> = {};
    keys.forEach(k => { try { data[k] = JSON.parse(localStorage.getItem(k) || 'null'); } catch { data[k] = null; } });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `clinix-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    URL.revokeObjectURL(url);
    const now = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const time = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    const nb = { ...backupPrefs, lastBackup: `${now} · ${time}` };
    setBackupPrefs(nb); lsSave('clinixBackupPrefs', nb);
    showToast('Backup created and downloaded');
  }

  const activities: Array<{ msg: string; ts: string }> = ls('clinixActivities', []);

  const initials = account.fullName.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase() || 'AD';

  // ── Render helpers
  const selClass = `${INPUT} appearance-none`;
  const accentOptions: Array<{ id: SysPrefs['accent']; label: string; color: string }> = [
    { id: 'blue', label: 'Blue', color: '#2563EB' },
    { id: 'green', label: 'Green', color: '#16A34A' },
    { id: 'teal', label: 'Teal', color: '#0D9488' },
  ];

  // ── Section content (all rendered sequentially, no switch needed)
  function renderSection() {
    return (
      <>
        <SectionCard title="Account Information" desc="Your profile details used across the system">
            {/* Photo */}
            <div className="flex items-center gap-5 mb-6 pb-6 border-b border-slate-100 dark:border-slate-700">
              <div className="relative shrink-0">
                {accountPhoto ? (
                  <img src={accountPhoto} alt="Profile" className="w-20 h-20 rounded-2xl object-cover border-2 border-slate-200 dark:border-slate-600 shadow" />
                ) : (
                  <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-white shadow" style={{ background: 'linear-gradient(135deg,#3B82F6,#1D4ED8)', fontSize: 24, fontWeight: 700 }}>{initials}</div>
                )}
                <button onClick={() => photoRef.current?.click()} className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow border-2 border-white dark:border-slate-800 hover:bg-blue-700 transition-colors">
                  <Camera size={13} />
                </button>
                <input ref={photoRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-slate-800 dark:text-slate-100" style={{ fontSize: 16, fontWeight: 700 }}>{account.fullName || 'Clinic Admin'}</p>
                <p className="text-slate-500 dark:text-slate-400" style={{ fontSize: 12 }}>{account.role} · {account.department}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${account.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{account.status === 'active' ? 'Active' : 'Inactive'}</span>
                </div>
              </div>
              {accountPhoto && <button onClick={() => setAccountPhoto('')} className="text-red-500 hover:text-red-600 text-xs transition-colors">Remove photo</button>}
            </div>

            {/* Fields */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Full Name">
                <input value={account.fullName} onChange={e => setAccount(a => ({ ...a, fullName: e.target.value }))} placeholder="Full name" className={INPUT} style={{ fontSize: 13 }} />
              </Field>
              <Field label="Username">
                <input value={account.username} onChange={e => setAccount(a => ({ ...a, username: e.target.value }))} placeholder="username" className={INPUT} style={{ fontSize: 13 }} />
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
              <Field label="Department">
                <input value={account.department} onChange={e => setAccount(a => ({ ...a, department: e.target.value }))} placeholder="Health Services" className={INPUT} style={{ fontSize: 13 }} />
              </Field>
              <Field label="Role">
                <select value={account.role} onChange={e => setAccount(a => ({ ...a, role: e.target.value }))} className={selClass} style={{ fontSize: 13 }}>
                  <option>Clinic Administrator</option>
                  <option>Nurse</option>
                  <option>Physician</option>
                </select>
              </Field>
              <Field label="Status">
                <div className="flex gap-3 pt-1">
                  {(['active', 'inactive'] as const).map(s => (
                    <button key={s} onClick={() => setAccount(a => ({ ...a, status: s }))}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl border transition-colors"
                      style={{ fontSize: 13, fontWeight: 500, borderColor: account.status === s ? '#2563EB' : '#E2E8F0', background: account.status === s ? '#EFF6FF' : 'transparent', color: account.status === s ? '#2563EB' : '#64748B' }}>
                      <span className="w-3 h-3 rounded-full border-2" style={{ borderColor: account.status === s ? '#2563EB' : '#CBD5E1', background: account.status === s ? '#2563EB' : 'transparent' }} />
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
            <SaveBar onSave={saveAccount} saved={accountSaved} />
          </SectionCard>

        <SectionHeading icon={Shield} label="Security" />
        {/* Change password */}
          <SectionCard title="Change Password"
            action={<button onClick={() => setShowPwForm(v => !v)} className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors" style={{ fontSize: 13 }}>{showPwForm ? 'Cancel' : 'Change Password'}</button>}>
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
                  <button onClick={changePassword} className="px-5 py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors" style={{ fontSize: 13, fontWeight: 600 }}>Update Password</button>
                </div>
              </div>
            )}
          </SectionCard>

          {/* 2FA */}
          <SectionCard title="Two-Factor Authentication" desc="Add an extra layer of security to your account">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-700 dark:text-slate-300" style={{ fontSize: 13, fontWeight: 500 }}>2FA Status</p>
                <p className="text-slate-400" style={{ fontSize: 12 }}>{twoFa ? 'Enabled — your account is protected' : 'Disabled — your account is less secure'}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${twoFa ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{twoFa ? 'Enabled' : 'Disabled'}</span>
                <Toggle on={twoFa} onToggle={() => { setTwoFa(v => !v); }} />
              </div>
            </div>
          </SectionCard>

          {/* Session */}
          <SectionCard title="Session Management">
            <div className="bg-slate-50 dark:bg-slate-700/40 rounded-xl p-4 mb-4">
              <p className="text-slate-500 dark:text-slate-400 mb-3" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Current Session</p>
              <div className="grid grid-cols-3 gap-4">
                {[['Device', 'Windows 11 / Chrome'], ['Last Login', 'July 8, 2026 · 8:42 AM'], ['Location', 'BISU Calape Campus']].map(([k, v]) => (
                  <div key={k}>
                    <p className="text-slate-400" style={{ fontSize: 11 }}>{k}</p>
                    <p className="text-slate-700 dark:text-slate-300" style={{ fontSize: 13, fontWeight: 500 }}>{v}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-slate-700 dark:text-slate-300" style={{ fontSize: 13, fontWeight: 500 }}>Automatic Logout</p>
                <p className="text-slate-400" style={{ fontSize: 12 }}>Sign out after period of inactivity</p>
              </div>
              <select value={autoLogout} onChange={e => setAutoLogout(e.target.value)} className="border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500" style={{ fontSize: 13 }}>
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
              <button onClick={saveSec} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white transition-all" style={{ fontSize: 13, fontWeight: 600, background: secSaved ? '#16A34A' : '#2563EB' }}>
                {secSaved && <Check size={14} />}{secSaved ? 'Saved!' : 'Save Settings'}
              </button>
            </div>
          </SectionCard>

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
            <button onClick={handleResetColleges} className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors" style={{ fontSize: 13 }}>
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
              <div key={col.name} className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-slate-800 dark:text-slate-100" style={{ fontSize: 13, fontWeight: 700 }}>{col.name}</p>
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
                    <span key={course} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 px-2.5 py-1 text-slate-700 dark:text-slate-200" style={{ fontSize: 12, fontWeight: 500 }}>
                      {course}
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
                  <button onClick={() => handleAddCourse(col.name)} className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-600 px-3 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors" style={{ fontSize: 12, fontWeight: 600 }}>
                    <Plus size={14} /> Add
                  </button>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionHeading icon={Monitor} label="System Preferences" />
        <SectionCard title="Appearance" desc="Control how Clinix looks on your device">
            {/* Theme */}
            <div className="mb-5">
              <p className="text-slate-600 dark:text-slate-400 mb-2" style={{ fontSize: 12, fontWeight: 500 }}>Theme</p>
              <div className="flex gap-3">
                {([['light', Sun, 'Light'], ['dark', Moon, 'Dark']] as const).map(([id, Icon, label]) => (
                  <button key={id} onClick={() => { if ((id === 'dark') !== isDark) toggleTheme(); }}
                    className="flex-1 flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all"
                    style={{ borderColor: (id === 'dark') === isDark ? '#2563EB' : '#E2E8F0', background: (id === 'dark') === isDark ? '#EFF6FF' : 'transparent' }}>
                    <Icon size={16} style={{ color: (id === 'dark') === isDark ? '#2563EB' : '#94A3B8' }} />
                    <span style={{ fontSize: 13, fontWeight: 500, color: (id === 'dark') === isDark ? '#2563EB' : '#64748B' }}>{label}</span>
                    {(id === 'dark') === isDark && <Check size={14} style={{ color: '#2563EB', marginLeft: 'auto' }} />}
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
                    style={{ borderColor: sysPrefs.accent === id ? color : '#E2E8F0', background: sysPrefs.accent === id ? `${color}15` : 'transparent' }}>
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
                    style={{ fontSize: s === 'small' ? 11 : s === 'medium' ? 13 : 15, fontWeight: 500, borderColor: sysPrefs.fontSize === s ? '#2563EB' : '#E2E8F0', color: sysPrefs.fontSize === s ? '#2563EB' : '#64748B', background: sysPrefs.fontSize === s ? '#EFF6FF' : 'transparent' }}>
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
                    style={{ fontSize: 13, fontWeight: 500, borderColor: sysPrefs.language === l ? '#2563EB' : '#E2E8F0', color: sysPrefs.language === l ? '#2563EB' : '#64748B', background: sysPrefs.language === l ? '#EFF6FF' : 'transparent' }}>
                    {l === 'english' ? '🇺🇸 English' : '🇵🇭 Filipino'}
                  </button>
                ))}
              </div>
            </div>
          </SectionCard>
          <div className="flex justify-end">
            <button onClick={savePrefs} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white transition-all" style={{ fontSize: 13, fontWeight: 600, background: prefsSaved ? '#16A34A' : '#2563EB' }}>
              {prefsSaved && <Check size={14} />}{prefsSaved ? 'Saved!' : 'Save Preferences'}
            </button>
          </div>

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
                  <p className="text-slate-700 dark:text-slate-300" style={{ fontSize: 13, fontWeight: 500 }}>{label}</p>
                  <p className="text-slate-400" style={{ fontSize: 12 }}>{desc}</p>
                </div>
                <Toggle on={recPrefs[key]} onToggle={() => setRecPrefs(p => ({ ...p, [key]: !p[key] }))} />
              </div>
            ))}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-700 dark:text-slate-300" style={{ fontSize: 13, fontWeight: 500 }}>Archive Inactive Records After</p>
                <p className="text-slate-400" style={{ fontSize: 12 }}>Records with no activity will be moved to archive</p>
              </div>
              <select value={recPrefs.archiveAfter} onChange={e => setRecPrefs(p => ({ ...p, archiveAfter: e.target.value }))} className="border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none" style={{ fontSize: 13 }}>
                <option value="1">1 year</option>
                <option value="2">2 years</option>
                <option value="3">3 years</option>
                <option value="5">5 years</option>
              </select>
            </div>
          </div>
          <SaveBar onSave={saveRec} saved={recSaved} />
        </SectionCard>

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
                  <p className="text-slate-700 dark:text-slate-300" style={{ fontSize: 13 }}>{label}</p>
                  <Toggle on={notif[key] as boolean} onToggle={() => setNotif(n => ({ ...n, [key]: !n[key] }))} />
                </div>
              ))}
            </div>
          </SectionCard>
          <SectionCard title="Desktop Notifications">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-700 dark:text-slate-300" style={{ fontSize: 13, fontWeight: 500 }}>Desktop Notifications</p>
                <p className="text-slate-400" style={{ fontSize: 12 }}>Show system notifications in your browser</p>
              </div>
              <Toggle on={notif.desktop} onToggle={() => setNotif(n => ({ ...n, desktop: !n.desktop }))} />
            </div>
          </SectionCard>
          <div className="flex justify-end">
            <button onClick={saveNotif} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white transition-all" style={{ fontSize: 13, fontWeight: 600, background: notifSaved ? '#16A34A' : '#2563EB' }}>
              {notifSaved && <Check size={14} />}{notifSaved ? 'Saved!' : 'Save Notifications'}
            </button>
          </div>

        <SectionHeading icon={Database} label="Backup & Recovery" />
        <SectionCard title="Database Backup" desc="Create and restore system backups">
            <div className="bg-slate-50 dark:bg-slate-700/40 rounded-xl p-4 mb-5 flex items-center justify-between">
              <div>
                <p className="text-slate-400" style={{ fontSize: 11, fontWeight: 500 }}>Last Backup</p>
                <p className="text-slate-800 dark:text-slate-200" style={{ fontSize: 14, fontWeight: 600 }}>{backupPrefs.lastBackup || 'Never'}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
                <Database size={18} className="text-green-600" />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={createBackup} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors" style={{ fontSize: 13, fontWeight: 600 }}>
                <Download size={15} />Create Backup
              </button>
              <button onClick={() => showToast('Restore: select a backup file to continue')} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors" style={{ fontSize: 13, fontWeight: 600 }}>
                <Upload size={15} />Restore Backup
              </button>
            </div>
          </SectionCard>
          <SectionCard title="Automatic Backup" desc="Schedule regular backups of clinic data">
            <div className="flex gap-3">
              {(['daily', 'weekly', 'monthly'] as const).map(f => (
                <button key={f} onClick={() => { setBackupPrefs(p => ({ ...p, frequency: f })); lsSave('clinixBackupPrefs', { ...backupPrefs, frequency: f }); showToast(`Auto backup set to ${f}`); }}
                  className="flex-1 py-3 rounded-xl border-2 transition-all"
                  style={{ fontSize: 13, fontWeight: 500, borderColor: backupPrefs.frequency === f ? '#2563EB' : '#E2E8F0', color: backupPrefs.frequency === f ? '#2563EB' : '#64748B', background: backupPrefs.frequency === f ? '#EFF6FF' : 'transparent' }}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </SectionCard>

        <SectionHeading icon={Clock} label="Audit Log" />
        <SectionCard title="Recent Activities" desc="A log of all actions performed in the system">
          {activities.length === 0 ? (
            <p className="text-slate-400 text-center py-8" style={{ fontSize: 13 }}>No recent activities</p>
          ) : (
            <ul className="space-y-3">
              {activities.slice(0, 15).map((a, i) => (
                <li key={i} className="flex items-start gap-3 pb-3 border-b border-slate-100 dark:border-slate-700 last:border-0 last:pb-0">
                  <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0" style={{ fontSize: 11, fontWeight: 700 }}>
                    {account.fullName.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase() || 'AD'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-700 dark:text-slate-300" style={{ fontSize: 13 }}>{a.msg}</p>
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

        <SectionHeading icon={Lock} label="Data Privacy" />
        <SectionCard title="Privacy & Compliance" desc="Healthcare data protection settings">
          <div className="space-y-4">
            {([
              ['encrypt', 'Encrypt Patient Records', 'All stored patient data is encrypted at rest'],
              ['requirePasswordExport', 'Require Password Before Exporting Records', 'Prompt for confirmation before any data export'],
              ['hideSensitive', 'Hide Sensitive Information', 'Mask sensitive fields in table views'],
              ['recordActivity', 'Record User Activity', 'Log all system actions in the audit trail'],
            ] as [keyof PrivacyPrefs, string, string][]).map(([key, label, desc]) => (
              <div key={key} className="flex items-start justify-between gap-4 py-2 border-b border-slate-100 dark:border-slate-700 last:border-0">
                <div>
                  <p className="text-slate-700 dark:text-slate-300" style={{ fontSize: 13, fontWeight: 500 }}>{label}</p>
                  <p className="text-slate-400" style={{ fontSize: 12 }}>{desc}</p>
                </div>
                <Toggle on={privacy[key] as boolean} onToggle={() => setPrivacy(p => ({ ...p, [key]: !p[key] }))} />
              </div>
            ))}
          </div>
          <SaveBar onSave={savePrivacy} saved={privSaved} />
        </SectionCard>

        <SectionHeading icon={Info} label="About System" />
        <SectionCard title="System Information">
            <div className="flex items-center gap-4 mb-6 pb-6 border-b border-slate-100 dark:border-slate-700">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg,#3B82F6,#1D4ED8)' }}>
                <Activity size={24} className="text-white" />
              </div>
              <div>
                <p className="text-slate-900 dark:text-white" style={{ fontSize: 18, fontWeight: 800 }}>Clinix</p>
                <p className="text-slate-500" style={{ fontSize: 13 }}>Clinic Records Management System</p>
              </div>
            </div>
            <div className="space-y-3">
              {[
                ['Version', '2.1.0'],
                ['Build Number', `build-${new Date().getFullYear()}0708`],
                ['Database Version', 'LocalStorage v1.0'],
                ['Developer', 'BISU Computer Science Department'],
                ['Institution', 'BISU Calape Campus'],
                ['License', 'Educational Use'],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700 last:border-0">
                  <span className="text-slate-500 dark:text-slate-400" style={{ fontSize: 13 }}>{k}</span>
                  <span className="text-slate-700 dark:text-slate-300" style={{ fontSize: 13, fontWeight: 500 }}>{v}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => showToast('Clinix is up to date (v2.1.0)')} className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors" style={{ fontSize: 13, fontWeight: 600 }}>
                <RefreshCw size={14} />Check for Updates
              </button>
            </div>
          </SectionCard>

          {/* Data management */}
          <SectionCard title="Data Management">
            <div className="flex flex-wrap gap-3">
              <button onClick={() => { onNavigate('dashboard'); showToast('Dashboard opened'); }} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors" style={{ fontSize: 13 }}>
                Back to Dashboard
              </button>
              <button onClick={() => { if (!confirm('Clear all activity logs?')) return; localStorage.removeItem('clinixActivities'); showToast('Activity log cleared'); }} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" style={{ fontSize: 13 }}>
                Clear Activity Log
              </button>
            </div>
          </SectionCard>
      </>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-screen-xl">
      <div className="mb-6">
        <h1 className="text-slate-900 dark:text-white" style={{ fontWeight: 800, fontSize: 22 }}>Settings</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1" style={{ fontSize: 13 }}>Manage your account, clinic, and system preferences</p>
      </div>
      {renderSection()}
    </div>
  );
}
