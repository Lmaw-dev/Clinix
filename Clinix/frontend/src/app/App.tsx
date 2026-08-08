import { useState, useEffect, useRef, useCallback } from 'react';
import { ThemeProvider } from './ThemeContext';
import { LoginPage } from './components/LoginPage';
import { LandingPage } from './components/LandingPage';
import { Sidebar } from './components/Sidebar';
import { Role, canAccess, isValidRole, apiLogout } from './auth';
import { ConfirmHost } from './components/ConfirmDialog';
import { LogoutDialog } from './components/LogoutDialog';

import { Dashboard } from './components/Dashboard';
import { StudentsModule } from './components/StudentsModule';
import { FacultyModule } from './components/FacultyModule';
import { MedicalRecordsModule } from './components/MedicalRecordsModule';
import { InventoryModule } from './components/InventoryModule';
import { CertificatesModule } from './components/CertificatesModule';
import { AccountsModule } from './components/AccountsModule';
import { ConsultationsModule } from './components/ConsultationsModule';
import { listConsultationsApi, migrateLocalConsultations } from './consultations';
import {
  listApi, createApi, migrateLocalCollection, text, toDateInput, toSqlDateTime,
  toDisplayDateTime, getAdminProfileApi, saveAdminProfileApi,
  listPrescriptionsApi, type Prescription,
} from './store';
import { listDocumentsByForm } from './documents';
import { ReportsModule } from './components/ReportsModule';
import { SettingsModule } from './components/SettingsModule';
import { API_URL, apiFetch, getToken, setUnauthorizedHandler } from './api';

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
  | 'settings'
  | 'accounts';

export type AdminProfile = {
  name: string;
  photo: string;
};

/**
 * Where a student stands with the school. Graduating does not archive, delete
 * or relocate anything — the row and its whole medical history stay put, and
 * only this value moves, so a graduate can still be searched for and handed a
 * copy of their record years later.
 */
export const STUDENT_STATUSES = ['enrolled', 'graduated', 'dropped'] as const;
export type StudentStatus = (typeof STUDENT_STATUSES)[number];

/** A graduate's record is kept for reference but no longer added to. */
export function isActiveStudent(s: { status: StudentStatus }): boolean {
  return s.status === 'enrolled';
}

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
  email: string;
  medicalConditions: string;
  // A graduate is never deleted or moved elsewhere — the medical record has to
  // be retained, so only this field changes. See STUDENT_STATUSES below.
  status: StudentStatus;
  dateGraduated: string;     // set when status is 'graduated', blank otherwise
  statusUpdatedAt: string;   // audit: when the status last changed
  statusUpdatedBy: string;   // audit: accounts.id of whoever changed it
  photo?: string;
  // ── Clinic consultation record info ──
  birthdate: string;
  bloodType: string;
  schoolYear: string;
  homeAddress: string;       // composed permanent address (kept for display/export)
  presentAddress: string;    // composed current address (kept for display/export)
  guardianName: string;      // Parent's / Guardian's name
  guardianRelationship: string; // e.g. Mother, Father, Guardian
  guardianContact: string;   // Contact number (Parent/Guardian)
  confidentialNotes: string; // Admin-only sensitive notes
  // ── Medical details ──
  allergies: string;
  currentMedications: string;
  medicalOthers: string;
  height: string;            // in cm
  weight: string;            // in kg — BMI is computed from height + weight, not stored
  // ── Structured residence info ──
  currentProvince: string;
  currentCity: string;
  currentBarangay: string;
  currentPurok: string;
  currentZip: string;
  homeProvince: string;
  homeCity: string;
  homeBarangay: string;
  homePurok: string;
  homeZip: string;
  isBoarding: boolean;          // staying in a boarding house / dorm / apartment / rented house
  boardingHouseName: string;    // "N/A" when living with family
  boardingHouseAddress: string;
  landlordName: string;
  landlordContact: string;
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
  confidentialNotes: string; // Admin-only sensitive notes
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

// ── Uploaded medical forms ──
// A form is an uploaded document (the original/blank copy is kept), under which
// each student's filled copy is compiled. Files live on the backend (documents API).
export type MedFormEntry = {
  ownerType?: 'student' | 'faculty'; // which directory the person belongs to (defaults to student)
  studentId: string;   // person id (student ID or staff ID)
  studentName: string; // person name
  docId: string;       // backend document id of the person's filled copy
  fileName: string;
  uploadedAt: string;
};

export type MedForm = {
  id: string;
  name: string;
  description: string;
  date: string;
  templateDocId: string;    // backend document id of the original/blank form
  templateFileName: string;
  entries: MedFormEntry[];
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

// Why the person came in. Only a 'Consultation' visit gets a consultation
// record (vital signs / assessment) — the other purposes are logged and closed.
export const CONSULTATION_PURPOSES = [
  'Consultation',
  'Medicine',
  'Treatment',
  'Certificate',
  'Other',
] as const;
export type ConsultationPurpose = typeof CONSULTATION_PURPOSES[number];

/**
 * Entries logged before the purpose field existed have none. The log was only
 * ever used for consultations back then, so they are read as consultations
 * rather than being hidden from the workflow.
 */
export function purposeOf(c: Consultation): ConsultationPurpose {
  return c.purpose ?? 'Consultation';
}

export function isConsultationVisit(c: Consultation): boolean {
  return purposeOf(c) === 'Consultation';
}

export type Consultation = {
  id: string;
  studentId: string;
  studentName: string;
  date: string;
  summary: string;
  outcome: string;
  reason?: string;
  staff?: string;
  // ── Daily Treatment Record fields ──
  time?: string;
  age?: string;
  sex?: string;
  courseOrOffice?: string;    // Course & Year / Office
  purpose?: ConsultationPurpose; // why they came in — gates the consultation record
  chiefComplaint?: string;    // Purpose of Visit / Chief Complaint
  management?: string;        // Management & Treatment (added by admin)
  // ── Clinic Consultation Record — intake by staff ──
  personType?: 'student' | 'faculty';
  bloodType?: string;
  bp?: string;                // BP (mmHg)
  rr?: string;                // RR (bpm)
  pr?: string;                // PR (bpm)
  temp?: string;              // Temp (°C)
  o2sat?: string;             // O2 Sat (%)
  assessment?: string;        // staff's observations at intake
  recordedAt?: string;        // ISO timestamp of the vital-signs record
  // ── Workflow ──
  consultStatus?: 'Pending' | 'Evaluated' | 'Confirmed';
  recordedBy?: string;        // staff who took the intake
  evaluatedBy?: string;       // assistant who evaluated
  confirmedBy?: string;       // admin who confirmed
};

export type Activity = {
  msg: string;
  ts: string;
};


// ─── Helpers ───────────────────────────────────────────────────────────────

export function normalizeStudent(s: Record<string, unknown>): Student {
  const rawStatus = String(s.status ?? '').trim().toLowerCase();
  // 'not enrolled' is the retired fourth value; the database folds it into
  // 'dropped', and so does anything still cached in this browser.
  const status: StudentStatus = (STUDENT_STATUSES as readonly string[]).includes(rawStatus)
    ? (rawStatus as StudentStatus)
    : rawStatus === 'not enrolled'
      ? 'dropped'
      : 'enrolled';
  const rawId = String(s.studentId ?? '').replace(/\D/g, '').slice(0, 6);
  const fallbackName = String(s.name ?? '').trim();
  const parts = fallbackName.split(/\s+/).filter(Boolean);
  const firstName = String(s.firstName ?? parts[0] ?? '').trim();
  const lastName = String(s.lastName ?? (parts.slice(1).join(' ') || parts[0] || '')).trim();
  const middleInitial = String(s.middleInitial ?? s.middleName ?? '').trim().slice(0, 1).toUpperCase();
  const name = [firstName, middleInitial ? `${middleInitial}.` : '', lastName].filter(Boolean).join(' ') || fallbackName;
  const g = (k: string) => String(s[k] ?? '').trim();
  const joinAddr = (purok: string, brgy: string, city: string, prov: string, zip: string) => {
    const base = [purok, brgy, city, prov].filter(Boolean).join(', ');
    return zip ? `${base} ${zip}`.trim() : base;
  };
  const currentComposed = joinAddr(g('currentPurok'), g('currentBarangay'), g('currentCity'), g('currentProvince'), g('currentZip'));
  const homeComposed = joinAddr(g('homePurok'), g('homeBarangay'), g('homeCity'), g('homeProvince'), g('homeZip'));
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
    email: String(s.email ?? '').trim(),
    medicalConditions: String(s.medicalConditions ?? '').trim(),
    status,
    dateGraduated: status === 'graduated' ? toDateInput(s.dateGraduated ?? s.date_graduated ?? '') : '',
    statusUpdatedAt: String(s.statusUpdatedAt ?? s.status_updated_at ?? '').trim(),
    statusUpdatedBy: String(s.statusUpdatedBy ?? s.status_updated_by ?? '').trim(),
    photo: typeof s.photo === 'string' && s.photo ? s.photo : undefined,
    birthdate: String(s.birthdate ?? '').trim(),
    bloodType: String(s.bloodType ?? s.blood_type ?? '').trim(),
    schoolYear: String(s.schoolYear ?? s.school_year ?? '').trim(),
    homeAddress: homeComposed || String(s.homeAddress ?? s.home_address ?? '').trim(),
    presentAddress: currentComposed || String(s.presentAddress ?? s.present_address ?? '').trim(),
    guardianName: String(s.guardianName ?? s.guardian_name ?? '').trim(),
    guardianRelationship: String(s.guardianRelationship ?? s.guardian_relationship ?? '').trim(),
    guardianContact: String(s.guardianContact ?? s.guardian_contact ?? '').trim(),
    confidentialNotes: String(s.confidentialNotes ?? s.confidential_notes ?? '').trim(),
    allergies: String(s.allergies ?? '').trim(),
    currentMedications: String(s.currentMedications ?? s.current_medications ?? '').trim(),
    medicalOthers: String(s.medicalOthers ?? s.medical_others ?? '').trim(),
    height: String(s.height ?? '').trim(),
    weight: String(s.weight ?? '').trim(),
    currentProvince: g('currentProvince'),
    currentCity: g('currentCity'),
    currentBarangay: g('currentBarangay'),
    currentPurok: g('currentPurok'),
    currentZip: g('currentZip'),
    homeProvince: g('homeProvince'),
    homeCity: g('homeCity'),
    homeBarangay: g('homeBarangay'),
    homePurok: g('homePurok'),
    homeZip: g('homeZip'),
    isBoarding: ['true', '1', 'yes', 'y'].includes(String(s.isBoarding ?? '').trim().toLowerCase()) || s.isBoarding === true || s.isBoarding === 1,
    boardingHouseName: g('boardingHouseName'),
    boardingHouseAddress: g('boardingHouseAddress'),
    landlordName: g('landlordName'),
    landlordContact: g('landlordContact'),
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
    confidentialNotes: String(member.confidentialNotes ?? member.confidential_notes ?? '').trim(),
  };
}

// ── Shapes coming back from the database ────────────────────────────────────
// MySQL returns nulls for empty text and timestamps for DATE columns, so each
// collection is flattened back into the plain strings the screens expect.

export function normalizeInventory(row: Record<string, unknown>): InventoryItem {
  const monthly = row.monthly;
  return {
    code: text(row.code),
    name: text(row.name),
    qty: Number(row.qty ?? 0),
    unit: text(row.unit),
    expiry: text(row.expiry),
    category: text(row.category) || 'Medicines',
    monthly: Array.isArray(monthly) && monthly.length === 12 ? (monthly as MonthlyStock[]) : undefined,
    archived: Boolean(row.archived),
  };
}

export function normalizeMedRecord(row: Record<string, unknown>): MedRecord {
  return {
    id: text(row.id),
    studentId: text(row.studentId),
    name: text(row.name),
    summary: text(row.summary),
    date: toDateInput(row.date),
    status: (text(row.status) || 'Pending') as MedFormStatus,
  };
}

export function normalizeCertificate(row: Record<string, unknown>): Certificate {
  return {
    id: text(row.id),
    studentId: text(row.studentId),
    studentName: text(row.studentName),
    date: toDateInput(row.date),
    status: text(row.status),
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
  const [currentUser, setCurrentUser] = useState<string>(() => {
    try { return localStorage.getItem('clinixUser') || ''; } catch { return ''; }
  });
  // Which of the two signed-out screens is showing. Kept in the URL hash so the
  // browser's Back button returns to sign-in and a refresh stays put.
  const [signedOutView, setSignedOutView] = useState<'login' | 'landing'>(() =>
    window.location.hash === '#learn-more' ? 'landing' : 'login'
  );

  // Follows Back/Forward while signed out.
  useEffect(() => {
    const onHashChange = () =>
      setSignedOutView(window.location.hash === '#learn-more' ? 'landing' : 'login');
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const showLanding = useCallback(() => {
    window.location.hash = 'learn-more';
    setSignedOutView('landing');
  }, []);

  const showLogin = useCallback(() => {
    // Replaced rather than pushed, so Back does not bounce straight into the
    // landing page the user just left.
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    window.scrollTo(0, 0);
    setSignedOutView('login');
  }, []);

  // Whether the Medical Certificates page is enabled (toggled in Settings).
  const [certificatesEnabled, setCertificatesEnabled] = useState<boolean>(() => {
    try { const v = localStorage.getItem('clinixShowCertificates'); return v === null ? true : v === 'true'; }
    catch { return true; }
  });
  const [activePage, setActivePage] = useState<Page>('dashboard');
  // Splash between sign-in and the dashboard. A restored session starts in it
  // too — the collections still have to be fetched before anything is worth
  // showing. Progress is counted in completed boot steps, not guessed.
  const [booting, setBooting] = useState(isLoggedIn);
  const [bootStep, setBootStep] = useState(0);
  const [bootStatus, setBootStatus] = useState('Connecting to the clinic server');
  const BOOT_STEPS = 10;
  // Student profile requested from outside the Students module (e.g. Dashboard search)
  const [profileStudentId, setProfileStudentId] = useState<string | null>(null);

  // A page is reachable if the role allows it AND (for certificates) it's enabled.
  const pageAllowed = useCallback(
    (p: Page) => canAccess(role, p) && (p !== 'certificates' || certificatesEnabled),
    [role, certificatesEnabled],
  );

  const navigate = useCallback((p: Page) => {
    setActivePage((prev) => (pageAllowed(p) ? p : prev));
  }, [pageAllowed]);
  const [globalSearch, setGlobalSearch] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [logoutOpen, setLogoutOpen] = useState(false);

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
  const [medForms, setMedForms] = useState<MedForm[]>(() => loadFromStorage('clinixMedForms', []));
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

  // Dispensed medicine. This one never lived in localStorage — it was created
  // straight into the database — so there is nothing to migrate and no cache.
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);

  const [adminProfile, setAdminProfile] = useState<AdminProfile>(() =>
    loadFromStorage('clinixAdminProfile', { name: 'Clinic Admin', photo: '' })
  );
  // Guards the save-on-change effect below: until the server copy has been
  // fetched, the state still holds the local default, and writing that back
  // would overwrite the real profile with "Clinic Admin".
  const adminProfileLoaded = useRef(false);

  // Persist to localStorage
  useEffect(() => { localStorage.setItem('clinixStudents', JSON.stringify(students)); }, [students]);
  useEffect(() => { localStorage.setItem('clinixFaculty', JSON.stringify(faculty)); }, [faculty]);
  useEffect(() => { localStorage.setItem('clinixMedRecords', JSON.stringify(medRecords)); }, [medRecords]);
  useEffect(() => { localStorage.setItem('clinixMedForms', JSON.stringify(medForms)); }, [medForms]);
  useEffect(() => { localStorage.setItem('clinixInventory', JSON.stringify(inventory)); }, [inventory]);
  useEffect(() => { localStorage.setItem('clinixCertificates', JSON.stringify(certificates)); }, [certificates]);
  useEffect(() => { localStorage.setItem('clinixConsultations', JSON.stringify(consultations)); }, [consultations]);
  useEffect(() => { localStorage.setItem('clinixActivities', JSON.stringify(activities)); }, [activities]);
  // Cached locally so the name/photo show instantly on the next load, and saved
  // to the database so the same profile follows the account to any device.
  useEffect(() => {
    localStorage.setItem('clinixAdminProfile', JSON.stringify(adminProfile));
    if (adminProfileLoaded.current) saveAdminProfileApi(adminProfile).catch(() => { /* cached copy stands */ });
  }, [adminProfile]);
  useEffect(() => { try { localStorage.setItem('clinixShowCertificates', String(certificatesEnabled)); } catch { /* ignore */ } }, [certificatesEnabled]);

  // Persist the certificates toggle system-wide (shared across devices) + local cache.
  const updateCertificatesEnabled = useCallback((v: boolean) => {
    setCertificatesEnabled(v);
    apiFetch(`${API_URL}/settings/showCertificates`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: String(v) }),
    }).catch(() => { /* offline — cached locally */ });
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }, []);

  /**
   * Re-read the roster from the server. Needed after a bulk change the browser
   * did not make row by row — year-end processing rewrites hundreds of records
   * server-side, so the copy in state is stale the moment it commits.
   */
  const reloadStudents = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_URL}/students`);
      if (!res.ok) throw new Error('students');
      const rows: Record<string, unknown>[] = await res.json();
      setStudents(rows.map(normalizeStudent));
    } catch {
      showToast('Saved, but the student list on screen could not be refreshed — reload the page.');
    }
  }, [showToast]);

  // Every clinic collection lives in the database so all devices see the same
  // data — the staff member's vital signs reach the nurse's screen, and one
  // person's dispensed medicine shows up in everyone's stock count. Whatever is
  // still sitting in localStorage from before is lifted across once, after
  // which the server copy is authoritative.
  //
  // This runs only once signed in, and re-runs on each sign-in: every request
  // below needs the session token, so firing it on the sign-in screen would
  // only earn a row of 401s and leave the dashboard showing the stale cache.
  // The splash screen stays up until it finishes.
  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    setBooting(true);
    setBootStep(0);

    // Referenced below but never declared, which threw a ReferenceError inside
    // the async block — before setBooting(false) ran, so the splash never
    // cleared and sign-in appeared to hang. Vite strips types without checking
    // them, so it built cleanly and only failed at runtime.
    const MIN_SPLASH_MS = 900;

    (async () => {
      const startedAt = Date.now();
      let moved = 0;
      let done = 0;

      const step = (label: string) => {
        if (cancelled) return;
        setBootStatus(label);
      };
      const finishStep = () => {
        if (cancelled) return;
        done += 1;
        setBootStep(done);
      };

      const pull = async <T,>(
        label: string,
        run: () => Promise<{ moved: number; rows: T[] }>,
        apply: (rows: T[]) => void,
      ) => {
        step(label);
        try {
          const result = await run();
          if (cancelled) return;
          moved += result.moved;
          apply(result.rows);
        } catch {
          // Backend unreachable, or this collection failed — keep the cached
          // copy on screen and let the other collections still load.
        } finally {
          finishStep();
        }
      };

      // Directories first: they are what the dashboard and most modules read.
      await pull<Student>(
        'Loading student records',
        async () => {
          const res = await apiFetch(`${API_URL}/students`);
          if (!res.ok) throw new Error('students');
          const rows: Record<string, unknown>[] = await res.json();
          return { moved: 0, rows: rows.map(normalizeStudent) };
        },
        setStudents,
      );

      await pull<FacultyMember>(
        'Loading faculty & staff',
        async () => {
          const res = await apiFetch(`${API_URL}/faculty`);
          if (!res.ok) throw new Error('faculty');
          const rows: Record<string, unknown>[] = await res.json();
          return { moved: 0, rows: rows.map(normalizeFaculty) };
        },
        setFaculty,
      );

      await pull<Consultation>(
        'Loading consultation logs',
        async () => ({
          moved: await migrateLocalConsultations(loadFromStorage<Consultation[]>('clinixConsultations', [])),
          rows: await listConsultationsApi(),
        }),
        setConsultations,
      );

      await pull<InventoryItem>(
        'Loading medicine inventory',
        async () => ({
          moved: await migrateLocalCollection('inventory', loadFromStorage<InventoryItem[]>('clinixInventory', []), 'clinixInventoryMigrated'),
          rows: (await listApi<Record<string, unknown>>('inventory')).map(normalizeInventory),
        }),
        setInventory,
      );

      await pull<MedRecord>(
        'Loading medical records',
        async () => ({
          moved: await migrateLocalCollection('medicalRecords', loadFromStorage<MedRecord[]>('clinixMedRecords', []), 'clinixMedRecordsMigrated'),
          rows: (await listApi<Record<string, unknown>>('medicalRecords')).map(normalizeMedRecord),
        }),
        setMedRecords,
      );

      await pull<Certificate>(
        'Loading medical certificates',
        async () => ({
          moved: await migrateLocalCollection('certificates', loadFromStorage<Certificate[]>('clinixCertificates', []), 'clinixCertificatesMigrated'),
          rows: (await listApi<Record<string, unknown>>('certificates')).map(normalizeCertificate),
        }),
        setCertificates,
      );

      // A form's per-person entries are not stored twice: each filled copy is a
      // row in `documents` tagged with the form id, so the entries are rebuilt
      // from there. That keeps the file and its listing from drifting apart.
      await pull<MedForm>(
        'Loading medical forms',
        async () => {
          const moved = await migrateLocalCollection(
            'medicalForms',
            loadFromStorage<MedForm[]>('clinixMedForms', []).map((f) => ({
              id: f.id, name: f.name, description: f.description, date: f.date,
              templateDocId: f.templateDocId, templateFileName: f.templateFileName,
            })) as unknown as MedForm[],
            'clinixMedFormsMigrated',
          );
          const rows = await listApi<Record<string, unknown>>('medicalForms');
          const forms = await Promise.all(rows.map(async (r): Promise<MedForm> => {
            const id = text(r.id);
            let entries: MedFormEntry[] = [];
            try {
              const docs = await listDocumentsByForm(id);
              entries = docs.map((d) => ({
                ownerType: d.ownerType,
                studentId: d.ownerId,
                studentName: '',
                docId: d.id,
                fileName: d.fileName,
                uploadedAt: String(d.uploadedAt ?? ''),
              }));
            } catch { /* leave the form listed with no copies rather than hiding it */ }
            return {
              id,
              name: text(r.name),
              description: text(r.description),
              date: toDateInput(r.date),
              templateDocId: text(r.templateDocId),
              templateFileName: text(r.templateFileName),
              entries,
            };
          }));
          return { moved, rows: forms };
        },
        setMedForms,
      );

      await pull<Activity>(
        'Loading recent activity',
        async () => ({
          // Old entries carry a locale-formatted timestamp that MySQL cannot
          // store, so each is converted before it is uploaded.
          moved: await migrateLocalCollection(
            'activities',
            loadFromStorage<Activity[]>('clinixActivities', []).map((a) => {
              const parsed = new Date(a.ts);
              return { msg: a.msg, ts: toSqlDateTime(Number.isNaN(parsed.getTime()) ? new Date() : parsed) };
            }),
            'clinixActivitiesMigrated',
          ),
          rows: (await listApi<Record<string, unknown>>('activities'))
            .slice(0, 50)
            .map((a) => ({ msg: text(a.msg), ts: toDisplayDateTime(a.ts) })),
        }),
        setActivities,
      );

      step('Loading dispensed medicine');
      try {
        const rows = await listPrescriptionsApi();
        if (!cancelled) setPrescriptions(rows);
      } catch { /* the section will simply show nothing dispensed yet */ }
      finishStep();

      step('Loading your profile');
      try {
        const profile = await getAdminProfileApi();
        if (!cancelled && profile.name) setAdminProfile(profile);
      } catch { /* keep the cached profile */ }
      finally { adminProfileLoaded.current = true; }
      finishStep();

      // System-wide feature toggles, so they apply to everyone rather than per device.
      step('Applying clinic settings');
      try {
        const res = await apiFetch(`${API_URL}/settings`);
        const s = res.ok ? await res.json() : null;
        if (!cancelled && s && typeof s.showCertificates === 'string') {
          setCertificatesEnabled(s.showCertificates === 'true');
        }
      } catch { /* backend offline — keep the local value */ }
      finishStep();

      if (cancelled) return;

      if (moved) {
        showToast(`Moved ${moved} saved item${moved === 1 ? '' : 's'} into the database`);
      }

      // On a fast connection the whole sequence can finish inside a couple of
      // hundred milliseconds, and a splash that appears and vanishes reads as a
      // glitch. Hold it just long enough to be seen as deliberate.
      setBootStatus('Opening your dashboard');
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_SPLASH_MS) {
        await new Promise((r) => setTimeout(r, MIN_SPLASH_MS - elapsed));
      }
      if (!cancelled) setBooting(false);
    })();
    return () => { cancelled = true; };
  }, [isLoggedIn, showToast]);

  // The feed is written to the database so every device sees the same history.
  // On screen a readable local timestamp is shown, but an ISO one is stored:
  // "7/31/2026, 6:00:45 PM" is not a value MySQL can put in a DATETIME column,
  // and sorting such strings would not put the newest entry first either.
  const addActivity = useCallback((msg: string) => {
    const now = new Date();
    setActivities((prev) => [{ msg, ts: now.toLocaleString() }, ...prev].slice(0, 50));
    createApi('activities', { msg, ts: toSqlDateTime(now) }).catch(() => {
      // The feed is a convenience, not a record anyone acts on — a failed write
      // is not worth interrupting the user for.
    });
  }, []);

  const endSession = useCallback(() => {
    try {
      localStorage.removeItem('clinixSession');
      localStorage.removeItem('clinixRole');
      localStorage.removeItem('clinixUser');
    } catch {}
    setIsLoggedIn(false);
    setActivePage('dashboard');
  }, []);

  function confirmLogout() {
    setLogoutOpen(false);
    // Revoke the token on the server too — clearing it locally alone would
    // leave a working session behind for anyone who kept a copy.
    apiLogout().finally(endSession);
  }

  // A token that has expired or been revoked must return the user to sign-in
  // rather than leaving every panel silently empty.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      showToast('Your session ended — please sign in again');
      endSession();
    });
  }, [endSession, showToast]);

  // A restored "session" in localStorage means nothing without the token that
  // actually authorises requests; without it, go back to sign-in.
  useEffect(() => {
    if (isLoggedIn && !getToken()) endSession();
  }, [isLoggedIn, endSession]);

  function handleLogin(r: Role, username: string) {
    // Drop #learn-more so signing out later lands back on the sign-in screen.
    if (window.location.hash) showLogin();
    setRole(r);
    setCurrentUser(username);
    try { localStorage.setItem('clinixUser', username); } catch { /* ignore */ }
    setActivePage('dashboard');
    setIsLoggedIn(true);
  }

  // If the current role loses access to (or a feature disables) the active page, fall back to dashboard
  useEffect(() => {
    if (!pageAllowed(activePage)) setActivePage('dashboard');
  }, [pageAllowed, activePage]);

  // Never render a page the current role/feature-flag can't access
  const page: Page = pageAllowed(activePage) ? activePage : 'dashboard';

  return (
    <ThemeProvider>
    {!isLoggedIn ? (
      signedOutView === 'landing'
        ? <LandingPage onSignIn={showLogin} />
        : <LoginPage onLogin={handleLogin} onLearnMore={showLanding} />
    ) : (
    <div className="flex h-screen overflow-hidden bg-blue-50 dark:bg-blue-950">
      <Sidebar
        role={role}
        activePage={activePage}
        onNavigate={navigate}
        onLogout={() => setLogoutOpen(true)}
        certificatesEnabled={certificatesEnabled}
        userName={adminProfile.name}
        username={currentUser}
      />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <main className="flex-1 overflow-y-auto">
          <div className="p-6">
          {page === 'dashboard' && (
            <Dashboard
              students={students}
              faculty={faculty}
              consultations={consultations}
              medRecords={medRecords}
              medForms={medForms}
              inventory={inventory}
              activities={activities}
              onNavigate={navigate}
              adminProfile={adminProfile}
              role={role}
              onOpenStudentProfile={pageAllowed('students')
                ? (id) => { setProfileStudentId(id); navigate('students'); }
                : undefined}
            />
          )}
          {page === 'students' && (
            <StudentsModule
              students={students}
              setStudents={setStudents}
              globalSearch={globalSearch}
              showToast={showToast}
              addActivity={addActivity}
              openProfileId={profileStudentId}
              onProfileOpened={() => setProfileStudentId(null)}
              consultations={consultations}
              onViewHistory={pageAllowed('consultations') ? () => navigate('consultations') : undefined}
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
              forms={medForms}
              setForms={setMedForms}
              students={students}
              faculty={faculty}
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
              students={students}
              inventory={inventory}
              setInventory={setInventory}
              prescriptions={prescriptions}
              setPrescriptions={setPrescriptions}
              role={role}
              currentUser={currentUser}
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
              medForms={medForms}
              inventory={inventory}
              certificates={certificates}
              consultations={consultations}
              activities={activities}
              role={role}
            />
          )}
          {page === 'settings' && (
            <SettingsModule
              onNavigate={navigate}
              showToast={showToast}
              adminProfile={adminProfile}
              setAdminProfile={setAdminProfile}
              certificatesEnabled={certificatesEnabled}
              setCertificatesEnabled={updateCertificatesEnabled}
              onRosterChanged={reloadStudents}
            />
          )}
          {page === 'accounts' && (
            <AccountsModule
              role={role}
              currentUser={currentUser}
              showToast={showToast}
              addActivity={addActivity}
            />
          )}
          </div>
        </main>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-blue-900 text-white px-5 py-3 rounded-xl shadow-2xl z-[100] pointer-events-none"
          style={{ fontSize: 13, fontWeight: 500 }}
        >
          {toast}
        </div>
      )}

      <LogoutDialog
        open={logoutOpen}
        onCancel={() => setLogoutOpen(false)}
        onConfirm={confirmLogout}
      />
    </div>
    )}
    {/* Hosts every confirmDialog() call — without it they fall back to window.confirm */}
    <ConfirmHost />
    </ThemeProvider>
  );
}
