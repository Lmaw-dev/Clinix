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
  // ── Clinic consultation record info ──
  birthdate: string;
  bloodType: string;
  schoolYear: string;
  homeAddress: string;
  presentAddress: string;
  guardianName: string;      // Parent's / Guardian's name
  guardianContact: string;   // Contact number (Parent/Guardian)
};

export type FacultyMember = {
  staffId: string;
  name: string;
  college?: string;
  role: string;
  contact: string;
  medicalHistory: string;
  photo?: string;
  // ── Employment classification ──
  employmentCategory: string; // Non-teaching | Teaching | Agency
  employmentType: string;     // depends on category (Permanent, Casual, …)
  // ── Clinic consultation record info ──
  birthdate: string;
  bloodType: string;
  office: string;            // Course / Office
  homeAddress: string;
  presentAddress: string;
  guardianName: string;      // Spouse / next of kin
  guardianContact: string;   // Contact number (Spouse/next of kin)
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

export type MonthlyStock = { remaining: number | null; dispensed: number | null };

export type InventoryItem = {
  code: string;
  name: string;
  qty: number;
  unit: string;
  expiry: string;
  category: string; // Medicines | Medical Supplies | Medication (Old) | Janitorial | Dental Supplies
  monthly?: MonthlyStock[]; // 12 entries (Jan–Dec of the tracking year); used for Medicines
  archived?: boolean; // hidden from the active list until restored
};

export const INVENTORY_CATEGORIES = ['Medicines', 'Medical Supplies', 'Medication (Old)', 'Janitorial', 'Dental Supplies'];
export const INVENTORY_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const INVENTORY_YEAR = 2026;

/** Build a 12-month array from a compact list of [remaining, dispensed] pairs. */
export function buildMonthly(pairs: (readonly [number | null, number | null])[]): MonthlyStock[] {
  return Array.from({ length: 12 }, (_, i) =>
    pairs[i] ? { remaining: pairs[i][0], dispensed: pairs[i][1] } : { remaining: null, dispensed: null },
  );
}

/** Latest month with a recorded remaining count (used as the item's current qty). */
export function latestRemaining(monthly?: MonthlyStock[], fallback = 0): number {
  if (!monthly) return fallback;
  for (let i = monthly.length - 1; i >= 0; i--) {
    if (monthly[i] && monthly[i].remaining !== null) return monthly[i].remaining as number;
  }
  return fallback;
}

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
    birthdate: String(s.birthdate ?? '').trim(),
    bloodType: String(s.bloodType ?? s.blood_type ?? '').trim(),
    schoolYear: String(s.schoolYear ?? s.school_year ?? '').trim(),
    homeAddress: String(s.homeAddress ?? s.home_address ?? '').trim(),
    presentAddress: String(s.presentAddress ?? s.present_address ?? '').trim(),
    guardianName: String(s.guardianName ?? s.guardian_name ?? '').trim(),
    guardianContact: String(s.guardianContact ?? s.guardian_contact ?? '').trim(),
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
  ].map((m) => normalizeFaculty(m as Record<string, unknown>));
}

// Real BISU Calape Campus Clinic stock, grouped by the source workbook's sheets.
// Medicine quantities reflect the latest recorded count (April 2026).
function seedInventory(): InventoryItem[] {
  const withCategory = (category: string, items: Omit<InventoryItem, 'category'>[]) =>
    items.map((i) => ({ ...i, category }));
  return [
    ...withCategory('Medicines', [
      { code: 'MED-001', name: 'Ascorbic Acid 500mg', qty: 100, unit: 'tablet', expiry: '2028-04-01', monthly: buildMonthly([[100, 0], [100, 0], [100, 0], [100, null]]) },
      { code: 'MED-002', name: 'Ascorbic Acid 500mg', qty: 365, unit: 'tablet', expiry: '2027-05-01', monthly: buildMonthly([[500, 0], [500, 120], [380, 15], [365, null]]) },
      { code: 'MED-003', name: 'Captopril 25mg', qty: 10, unit: 'tablet', expiry: '2028-05-01', monthly: buildMonthly([[10, 0], [10, 0], [10, 0], [10, null]]) },
      { code: 'MED-004', name: 'Cefuroxime 500mg tablet', qty: 69, unit: 'tablet', expiry: '2028-06-01', monthly: buildMonthly([[90, 0], [90, 0], [90, 21], [69, null]]) },
      { code: 'MED-005', name: 'Hyoscine Butylbromide 10mg', qty: 9, unit: 'tablet', expiry: '2027-06-01', monthly: buildMonthly([[9, 0], [9, 0], [9, 0], [9, null]]) },
      { code: 'MED-006', name: 'Hyoscine Butylbromide 10mg', qty: 10, unit: 'tablet', expiry: '2028-01-01', monthly: buildMonthly([[10, 0], [10, 0], [10, 0], [10, null]]) },
      { code: 'MED-007', name: 'Kremil-S Advance (Famotidine + Ca Carbonate + Mg Hydroxide)', qty: 255, unit: 'tablet', expiry: '2026-11-01', monthly: buildMonthly([[276, 1], [275, 8], [267, 12], [255, null]]) },
      { code: 'MED-008', name: 'Lidocaine + Epinephrine (Xylodent)', qty: 0, unit: 'cartridge', expiry: '2028-07-01', monthly: buildMonthly([[150, 0], [0, 150], [0, 0], [0, null]]) },
      { code: 'MED-009', name: 'Lidocaine + Epinephrine (Xylodent)', qty: 0, unit: 'cartridge', expiry: '2028-04-01', monthly: buildMonthly([[100, 0], [0, 100], [0, 0], [0, null]]) },
      { code: 'MED-010', name: 'Lidocaine + Epinephrine (Xylodent)', qty: 0, unit: 'cartridge', expiry: '2026-04-01', monthly: buildMonthly([[11, 0], [0, 11], [0, 0], [0, null]]) },
      { code: 'MED-011', name: 'Loperamide HCl 2mg', qty: 76, unit: 'capsule', expiry: '2027-03-01', monthly: buildMonthly([[78, 1], [77, 1], [76, 0], [76, null]]) },
      { code: 'MED-012', name: 'Loperamide HCl 2mg', qty: 99, unit: 'capsule', expiry: '2027-06-01', monthly: buildMonthly([[99, 0], [99, 0], [99, 0], [99, null]]) },
      { code: 'MED-013', name: 'Meclizine HCl 10mg', qty: 14, unit: 'tablet', expiry: '2026-09-01', monthly: buildMonthly([[14, 0], [14, 0], [14, 0], [14, null]]) },
      { code: 'MED-014', name: 'Mefenamic Acid 500mg', qty: 58, unit: 'capsule', expiry: '2027-05-01', monthly: buildMonthly([[67, 3], [64, 4], [60, 2], [58, null]]) },
      { code: 'MED-015', name: 'Mupirocin', qty: 5, unit: 'tube', expiry: '2026-04-01', monthly: buildMonthly([[5, 0], [5, 0], [5, 0], [5, null]]) },
      { code: 'MED-016', name: 'Mupirocin', qty: 4, unit: 'tube', expiry: '2027-01-01', monthly: buildMonthly([[4, 0], [4, 0], [4, 0], [4, null]]) },
      { code: 'MED-017', name: 'ORS Rehydration', qty: 46, unit: 'sachet', expiry: '2028-03-01', monthly: buildMonthly([[46, 0], [46, 0], [46, 0], [46, null]]) },
      { code: 'MED-018', name: 'Paracetamol 500mg', qty: 490, unit: 'tablet', expiry: '2027-02-01', monthly: buildMonthly([[500, 0], [500, 4], [496, 6], [490, null]]) },
      { code: 'MED-019', name: 'Paracetamol 500mg (Myremol)', qty: 52, unit: 'tablet', expiry: '2026-01-01', monthly: buildMonthly([[52, 2]]) },
      { code: 'MED-020', name: 'Polymyxin B Sulfate + Neomycin SO4 + Dexamethasone Na Phosphate', qty: 1, unit: 'bottle', expiry: '2026-03-01', monthly: buildMonthly([[1, 0], [1, 0], [1, 0]]) },
      { code: 'MED-021', name: 'Polymyxin B Sulfate + Neomycin SO4 + Dexamethasone Na Phosphate', qty: 2, unit: 'bottle', expiry: '2028-04-01', monthly: buildMonthly([[2, 0], [2, 0], [2, 0], [2, null]]) },
      { code: 'MED-022', name: 'Robitussin Guaifenesin Expectorant Soft Gel 200mg', qty: 300, unit: 'capsule', expiry: '2026-11-01', monthly: buildMonthly([[300, 0], [300, 0], [300, 0], [300, null]]) },
      { code: 'MED-023', name: 'Salbutamol Nebule', qty: 10, unit: 'nebule', expiry: '2026-03-01', monthly: buildMonthly([[10, 0], [10, 0], [10, 0]]) },
      { code: 'MED-024', name: 'Symdex-D', qty: 44, unit: 'tablet', expiry: '2026-09-01', monthly: buildMonthly([[83, 3], [80, 12], [68, 24], [44, null]]) },
      { code: 'MED-025', name: 'Tranexamic Acid 500mg', qty: 10, unit: 'capsule', expiry: '2027-11-01', monthly: buildMonthly([[10, 0], [10, 0], [10, 0], [10, null]]) },
    ]),
    // Medical supplies (2025 snapshot — quantities as recorded)
    ...withCategory('Medical Supplies', [
      { code: 'SUP-001', name: 'Methyl salicylate + camphor + menthol (Omega) 30ml', qty: 7, unit: 'bottle', expiry: '' },
      { code: 'SUP-002', name: 'Methyl salicylate + menthol + eucalyptol (Superscent)', qty: 10, unit: 'bottle', expiry: '' },
      { code: 'SUP-003', name: 'Cotton buds 200/pack', qty: 4, unit: 'pack', expiry: '' },
      { code: 'SUP-004', name: 'White Flower 1.5ml', qty: 10, unit: 'bottle', expiry: '' },
      { code: 'SUP-005', name: 'Non-sterile gauze pads 4x4', qty: 10, unit: 'pack', expiry: '' },
      { code: 'SUP-006', name: 'Non-sterile gauze pads 3x3', qty: 5, unit: 'pack', expiry: '' },
      { code: 'SUP-007', name: 'Non-sterile gauze pads 2x2', qty: 3, unit: 'pack', expiry: '' },
      { code: 'SUP-008', name: 'Soft cervical collar', qty: 1, unit: 'piece', expiry: '' },
      { code: 'SUP-009', name: 'Hard cervical collar', qty: 1, unit: 'piece', expiry: '' },
      { code: 'SUP-010', name: 'Transpore tape 1/2 inch', qty: 5, unit: 'piece', expiry: '' },
      { code: 'SUP-011', name: 'Transpore tape 1 inch', qty: 5, unit: 'piece', expiry: '' },
      { code: 'SUP-012', name: 'Asepto syringe', qty: 1, unit: 'piece', expiry: '' },
      { code: 'SUP-013', name: 'Wheelchair transport 9045B-46 (SKU-170946)', qty: 1, unit: 'unit', expiry: '' },
    ]),
    // Medication (Old) — 2023–2024 archive; stock counts not recorded, most already expired
    ...withCategory('Medication (Old)', [
      { code: 'OLD-001', name: 'Carbocisteine 500mg', qty: 0, unit: 'capsule', expiry: '2025-01-01' },
      { code: 'OLD-002', name: 'Salbutamol Sulfate Nebule', qty: 0, unit: 'nebule', expiry: '2025-03-01' },
      { code: 'OLD-003', name: 'Aluminum Magnesium Hydroxide 200mg', qty: 0, unit: 'tablet', expiry: '2023-09-01' },
      { code: 'OLD-004', name: 'Tranexamic Acid 500mg', qty: 0, unit: 'capsule', expiry: '2024-10-01' },
      { code: 'OLD-005', name: 'Lidocaine Hydrochloride + Epinephrine', qty: 0, unit: 'cartridge', expiry: '2026-04-01' },
      { code: 'OLD-006', name: 'Amoxicillin 500mg capsule (Herbimox)', qty: 0, unit: 'capsule', expiry: '2024-05-01' },
      { code: 'OLD-007', name: 'Mefenamic Acid 500mg (Myrefen)', qty: 0, unit: 'capsule', expiry: '2024-07-01' },
      { code: 'OLD-008', name: 'Paracetamol 500mg (Rapidol)', qty: 0, unit: 'tablet', expiry: '2025-02-01' },
      { code: 'OLD-009', name: 'Cetirizine 10mg', qty: 0, unit: 'tablet', expiry: '2023-06-01' },
      { code: 'OLD-010', name: 'Loperamide HCl 2mg', qty: 0, unit: 'capsule', expiry: '2024-06-01' },
      { code: 'OLD-011', name: 'ORS Rehydration', qty: 0, unit: 'sachet', expiry: '2025-03-01' },
      { code: 'OLD-012', name: 'Mefenamic Acid 500mg (Vamgesic)', qty: 0, unit: 'capsule', expiry: '2024-01-01' },
      { code: 'OLD-013', name: 'Paracetamol + Chlorphenamine + Phenylephrine', qty: 0, unit: 'tablet', expiry: '2025-01-01' },
      { code: 'OLD-014', name: 'Paracetamol 500mg (Myremol)', qty: 0, unit: 'tablet', expiry: '2026-01-01' },
    ]),
    // Janitorial supplies — item list only (no counts recorded)
    ...withCategory('Janitorial', [
      { code: 'JAN-001', name: 'Alcohol Gel 500ml', qty: 0, unit: 'bottle', expiry: '' },
      { code: 'JAN-002', name: 'Clorox Bleach 709ml', qty: 0, unit: 'bottle', expiry: '' },
      { code: 'JAN-003', name: 'Domex Bathroom Cleaner 900ml', qty: 0, unit: 'bottle', expiry: '' },
      { code: 'JAN-004', name: 'Liquid Handsoap 500ml', qty: 0, unit: 'bottle', expiry: '' },
      { code: 'JAN-005', name: 'Lysol Disinfectant 900ml', qty: 0, unit: 'bottle', expiry: '' },
      { code: 'JAN-006', name: 'Lysol Spray 510g', qty: 0, unit: 'bottle', expiry: '' },
      { code: 'JAN-007', name: 'Muriatic Acid 960ml/1L', qty: 0, unit: 'bottle', expiry: '' },
      { code: 'JAN-008', name: 'Powder Detergent 1.1kg', qty: 0, unit: 'pack', expiry: '' },
      { code: 'JAN-009', name: 'Solbac 400g', qty: 0, unit: 'bottle', expiry: '' },
      { code: 'JAN-010', name: 'Tissue Roll', qty: 0, unit: 'rolls', expiry: '' },
      { code: 'JAN-011', name: 'Trash Bag 10s (large)', qty: 0, unit: 'pack', expiry: '' },
      { code: 'JAN-012', name: 'Trash Bag 10s (medium)', qty: 0, unit: 'pack', expiry: '' },
      { code: 'JAN-013', name: 'Trash Bag 10s (XX-large)', qty: 0, unit: 'pack', expiry: '' },
    ]),
    // Dental supplies — item list only (no counts recorded)
    ...withCategory('Dental Supplies', [
      { code: 'DEN-001', name: 'Dental Bib', qty: 0, unit: 'piece', expiry: '' },
      { code: 'DEN-002', name: 'Dental Needle G27', qty: 0, unit: 'piece', expiry: '' },
      { code: 'DEN-003', name: 'Diamond Points', qty: 0, unit: 'piece', expiry: '' },
      { code: 'DEN-004', name: 'Ionomer', qty: 0, unit: 'box', expiry: '' },
      { code: 'DEN-005', name: 'Micro Applicators', qty: 0, unit: 'piece', expiry: '' },
    ]),
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
    photo: typeof member.photo === 'string' && member.photo ? member.photo : undefined,
    employmentCategory: String(member.employmentCategory ?? member.employment_category ?? '').trim(),
    employmentType: String(member.employmentType ?? member.employment_type ?? '').trim(),
    birthdate: String(member.birthdate ?? '').trim(),
    bloodType: String(member.bloodType ?? member.blood_type ?? '').trim(),
    office: String(member.office ?? '').trim(),
    homeAddress: String(member.homeAddress ?? member.home_address ?? '').trim(),
    presentAddress: String(member.presentAddress ?? member.present_address ?? '').trim(),
    guardianName: String(member.guardianName ?? member.guardian_name ?? '').trim(),
    guardianContact: String(member.guardianContact ?? member.guardian_contact ?? '').trim(),
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
  const [inventory, setInventory] = useState<InventoryItem[]>(() => {
    const stored = loadFromStorage<InventoryItem[]>('clinixInventory', []);
    // Re-seed when empty, or upgrade older seeds that predate categories.
    const INVENTORY_SEED_VERSION = 5;
    const seeded = Number(loadFromStorage('clinixInventorySeedVersion', 0));
    if (!stored.length || seeded < INVENTORY_SEED_VERSION) {
      try { localStorage.setItem('clinixInventorySeedVersion', String(INVENTORY_SEED_VERSION)); } catch { /* ignore */ }
      return seedInventory();
    }
    return stored;
  });
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
