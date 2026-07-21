import { useState, useEffect, useRef, useCallback } from 'react';
import { ThemeProvider } from './ThemeContext';
import { LoginPage } from './components/LoginPage';
import { Sidebar } from './components/Sidebar';
import { Role, canAccess, isValidRole } from './auth';

import { Dashboard } from './components/Dashboard';
import { StudentsModule } from './components/StudentsModule';
import { FacultyModule } from './components/FacultyModule';
import { MedicalRecordsModule } from './components/MedicalRecordsModule';
import { InventoryModule } from './components/InventoryModule';
import { CertificatesModule } from './components/CertificatesModule';
import { ConsultationsModule } from './components/ConsultationsModule';
import { ReportsModule } from './components/ReportsModule';
import { SettingsModule } from './components/SettingsModule';

// ─── Types ─────────────────────────────────────────────────────────────────

export type Page =
  | 'dashboard'
  | 'students'
  | 'faculty'
  | 'medical-records'
  | 'inventory'
  | 'certificates'
  | 'consultations'
  | 'reports'
  | 'settings';

export type AdminProfile = {
  name: string;
  photo: string;
};

export type Student = {
  studentId: string;
  name: string;
  lastName: string;
  firstName: string;
  middleInitial: string;
  course: string;
  yearLevel: string;
  gender: string;
  contactNumber: string;
  medicalConditions: string;
  status: 'enrolled' | 'not enrolled' | 'dropped';
  photo?: string;
};

export type FacultyMember = {
  staffId: string;
  name: string;
  college?: string;
  role: string;
  contact: string;
  medicalHistory: string;
};

export type MedFormStatus = 'Pending' | 'Processing' | 'Completed' | 'On Hold';

export type MedRecord = {
  id: string;
  studentId: string;
  name: string;
  summary: string;
  date: string;
  status: MedFormStatus;
};

export type InventoryItem = {
  code: string;
  name: string;
  qty: number;
  unit: string;
  expiry: string;
};

export type Certificate = {
  id: string;
  studentId: string;
  studentName: string;
  date: string;
  status: string;
};

export type Consultation = {
  id: string;
  studentId: string;
  studentName: string;
  date: string;
  summary: string;
  outcome: string;
  reason?: string;
  staff?: string;
};

export type Activity = {
  msg: string;
  ts: string;
};

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4001/api').replace(/\/$/, '');

// ─── Helpers ───────────────────────────────────────────────────────────────

export function normalizeStudent(s: Record<string, unknown>): Student {
  const allowed = ['enrolled', 'not enrolled', 'dropped'] as const;
  const rawStatus = String(s.status ?? '').trim().toLowerCase();
  const status: Student['status'] = (allowed as readonly string[]).includes(rawStatus)
    ? (rawStatus as Student['status'])
    : 'enrolled';
  const rawId = String(s.studentId ?? '').replace(/\D/g, '').slice(0, 6);
  const fallbackName = String(s.name ?? '').trim();
  const parts = fallbackName.split(/\s+/).filter(Boolean);
  const firstName = String(s.firstName ?? parts[0] ?? '').trim();
  const lastName = String(s.lastName ?? (parts.slice(1).join(' ') || parts[0] || '')).trim();
  const middleInitial = String(s.middleInitial ?? s.middleName ?? '').trim().slice(0, 1).toUpperCase();
  const name = [firstName, middleInitial ? `${middleInitial}.` : '', lastName].filter(Boolean).join(' ') || fallbackName;
  return {
    studentId: rawId.length ? rawId.padStart(6, '0') : '000000',
    name,
    lastName,
    firstName,
    middleInitial,
    course: String(s.course ?? '').trim(),
    yearLevel: String(s.yearLevel ?? '').trim(),
    gender: String(s.gender ?? '').trim(),
    contactNumber: String(s.contactNumber ?? '').trim(),
    medicalConditions: String(s.medicalConditions ?? '').trim(),
    status,
    photo: typeof s.photo === 'string' && s.photo ? s.photo : undefined,
  };
}

function seedStudents(): Student[] {
  return [
    { studentId: '121451', firstName: 'Jessa', middleInitial: '', lastName: 'Salazar', course: 'BSCS', yearLevel: '3rd Year', gender: 'Female', contactNumber: '0917 555 0123', medicalConditions: 'Seasonal allergies', status: 'enrolled' },
    { studentId: '432652', firstName: 'Ronaldo', middleInitial: '', lastName: 'Mendez', course: 'BSED-Math', yearLevel: '2nd Year', gender: 'Male', contactNumber: '0918 555 0148', medicalConditions: 'None recorded', status: 'enrolled' },
    { studentId: '543293', firstName: 'Paula', middleInitial: '', lastName: 'Lazo', course: 'BSIT-FPST', yearLevel: '4th Year', gender: 'Female', contactNumber: '0991 555 0175', medicalConditions: 'Mild asthma', status: 'enrolled' },
    { studentId: '324514', firstName: 'Arvin', middleInitial: '', lastName: 'dela Cruz', course: 'BSM', yearLevel: '1st Year', gender: 'Male', contactNumber: '0932 555 0199', medicalConditions: 'Migraines', status: 'enrolled' },
  ].map((s) => normalizeStudent(s as Record<string, unknown>));
}

function seedFaculty(): FacultyMember[] {
  return [
    { staffId: 'F001', name: 'Dr. Maria Santos', role: 'Clinic Physician', contact: '0917 111 2233', medicalHistory: 'Hypertension - monitoring' },
    { staffId: 'F002', name: 'Nurse Pedro Cruz', role: 'Nurse', contact: '0918 222 3344', medicalHistory: 'None recorded' },
  ];
}

export function normalizeFaculty(member: Record<string, unknown>): FacultyMember {
  return {
    staffId: String(member.staffId ?? member.staff_id ?? '').trim(),
    name: String(member.name ?? '').trim(),
    college: String(member.college ?? '').trim() || undefined,
    role: String(member.role ?? '').trim(),
    contact: String(member.contact ?? '').trim(),
    medicalHistory: String(member.medicalHistory ?? member.medical_history ?? '').trim(),
  };
}

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) ?? fallback;
  } catch {
    return fallback;
  }
}

// ─── App ───────────────────────────────────────────────────────────────────

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    try { return localStorage.getItem('clinixSession') === 'active'; } catch { return false; }
  });
  const [role, setRole] = useState<Role>(() => {
    try {
      const stored = localStorage.getItem('clinixRole');
      return isValidRole(stored) ? stored : 'admin';
    } catch { return 'admin'; }
  });
  const [activePage, setActivePage] = useState<Page>('dashboard');

  const navigate = useCallback((p: Page) => {
    setActivePage((prev) => (canAccess(role, p) ? p : prev));
  }, [role]);
  const [globalSearch, setGlobalSearch] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [students, setStudents] = useState<Student[]>(() => {
    const raw = loadFromStorage<Record<string, unknown>[]>('clinixStudents', []);
    return raw.length ? raw.map(normalizeStudent) : seedStudents();
  });

  const [faculty, setFaculty] = useState<FacultyMember[]>(() => {
    const raw = loadFromStorage<FacultyMember[]>('clinixFaculty', []);
    return raw.length ? raw : seedFaculty();
  });

  const [medRecords, setMedRecords] = useState<MedRecord[]>(() => {
    const raw = loadFromStorage<Record<string, unknown>[]>('clinixMedRecords', []);
    return raw.map((r) => ({ ...r, status: (r.status as MedFormStatus) || 'Pending' } as MedRecord));
  });
  const [inventory, setInventory] = useState<InventoryItem[]>(() =>
    loadFromStorage('clinixInventory', [])
  );
  const [certificates, setCertificates] = useState<Certificate[]>(() =>
    loadFromStorage('clinixCertificates', [])
  );
  const [consultations, setConsultations] = useState<Consultation[]>(() => {
    const stored = loadFromStorage<Consultation[]>('clinixConsultations', []);
    if (stored.length) return stored;
    // One-time migration: fold the old Visit/History records into consultations
    const legacyVisits = loadFromStorage<Record<string, unknown>[]>('clinixVisits', []);
    return legacyVisits.map((v) => ({
      id: `visit-${String(v.id ?? Date.now())}`,
      studentId: String(v.studentId ?? ''),
      studentName: String(v.studentName ?? ''),
      date: String(v.date ?? ''),
      summary: String(v.reason ?? ''),
      outcome: '',
      reason: String(v.reason ?? ''),
      staff: String(v.staff ?? ''),
    }));
  });
  const [activities, setActivities] = useState<Activity[]>(() =>
    loadFromStorage('clinixActivities', [])
  );

  const [adminProfile, setAdminProfile] = useState<AdminProfile>(() =>
    loadFromStorage('clinixAdminProfile', { name: 'Clinic Admin', photo: '' })
  );

  useEffect(() => {
    fetch(`${API_URL}/students`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((rows: Record<string, unknown>[]) => setStudents(rows.map(normalizeStudent)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch(`${API_URL}/faculty`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((rows: Record<string, unknown>[]) => setFaculty(rows.map(normalizeFaculty)))
      .catch(() => {});
  }, []);

  // Persist to localStorage
  useEffect(() => { localStorage.setItem('clinixStudents', JSON.stringify(students)); }, [students]);
  useEffect(() => { localStorage.setItem('clinixFaculty', JSON.stringify(faculty)); }, [faculty]);
  useEffect(() => { localStorage.setItem('clinixMedRecords', JSON.stringify(medRecords)); }, [medRecords]);
  useEffect(() => { localStorage.setItem('clinixInventory', JSON.stringify(inventory)); }, [inventory]);
  useEffect(() => { localStorage.setItem('clinixCertificates', JSON.stringify(certificates)); }, [certificates]);
  useEffect(() => { localStorage.setItem('clinixConsultations', JSON.stringify(consultations)); }, [consultations]);
  useEffect(() => { localStorage.setItem('clinixActivities', JSON.stringify(activities)); }, [activities]);
  useEffect(() => { localStorage.setItem('clinixAdminProfile', JSON.stringify(adminProfile)); }, [adminProfile]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }, []);

  const addActivity = useCallback((msg: string) => {
    setActivities((prev) =>
      [{ msg, ts: new Date().toLocaleString() }, ...prev].slice(0, 50)
    );
  }, []);

  function handleLogout() {
    try {
      localStorage.removeItem('clinixSession');
      localStorage.removeItem('clinixRole');
    } catch {}
    setIsLoggedIn(false);
    setActivePage('dashboard');
  }

  function handleLogin(r: Role) {
    setRole(r);
    setActivePage('dashboard');
    setIsLoggedIn(true);
  }

  // If the current role loses access to the active page, fall back to dashboard
  useEffect(() => {
    if (!canAccess(role, activePage)) setActivePage('dashboard');
  }, [role, activePage]);

  // Never render a page the current role can't access
  const page: Page = canAccess(role, activePage) ? activePage : 'dashboard';

  return (
    <ThemeProvider>
    {!isLoggedIn ? (
      <LoginPage onLogin={handleLogin} />
    ) : (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-900">
      <Sidebar role={role} activePage={activePage} onNavigate={navigate} onLogout={handleLogout} />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <main className="flex-1 overflow-y-auto">
          <div className="p-6">
          {page === 'dashboard' && (
            <Dashboard
              students={students}
              faculty={faculty}
              consultations={consultations}
              medRecords={medRecords}
              inventory={inventory}
              activities={activities}
              onNavigate={navigate}
              adminProfile={adminProfile}
              role={role}
            />
          )}
          {page === 'students' && (
            <StudentsModule
              students={students}
              setStudents={setStudents}
              globalSearch={globalSearch}
              showToast={showToast}
              addActivity={addActivity}
            />
          )}
          {page === 'faculty' && (
            <FacultyModule
              faculty={faculty}
              setFaculty={setFaculty}
              globalSearch={globalSearch}
              showToast={showToast}
              addActivity={addActivity}
            />
          )}
          {page === 'medical-records' && (
            <MedicalRecordsModule
              records={medRecords}
              setRecords={setMedRecords}
              globalSearch={globalSearch}
              showToast={showToast}
              addActivity={addActivity}
            />
          )}
          {page === 'inventory' && (
            <InventoryModule
              inventory={inventory}
              setInventory={setInventory}
              globalSearch={globalSearch}
              showToast={showToast}
              addActivity={addActivity}
            />
          )}
          {page === 'certificates' && (
            <CertificatesModule
              certificates={certificates}
              setCertificates={setCertificates}
              globalSearch={globalSearch}
              showToast={showToast}
              addActivity={addActivity}
            />
          )}
          {page === 'consultations' && (
            <ConsultationsModule
              consultations={consultations}
              setConsultations={setConsultations}
              globalSearch={globalSearch}
              showToast={showToast}
              addActivity={addActivity}
            />
          )}
          {page === 'reports' && (
            <ReportsModule
              students={students}
              faculty={faculty}
              medRecords={medRecords}
              inventory={inventory}
              certificates={certificates}
              consultations={consultations}
              activities={activities}
            />
          )}
          {page === 'settings' && (
            <SettingsModule
              onNavigate={navigate}
              showToast={showToast}
              adminProfile={adminProfile}
              setAdminProfile={setAdminProfile}
            />
          )}
          </div>
        </main>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-2xl z-[100] pointer-events-none"
          style={{ fontSize: 13, fontWeight: 500 }}
        >
          {toast}
        </div>
      )}
    </div>
    )}
    </ThemeProvider>
  );
}
