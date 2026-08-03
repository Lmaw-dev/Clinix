import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Plus, Search, Pencil, Archive, Upload, CheckCircle2, Camera, User, Download, Printer, Filter, X, Lock,
  ArrowLeft, Phone, Mail, CalendarDays, GraduationCap, BookOpen, HeartPulse, Users, Home, MapPin, FileText, Building2,
} from 'lucide-react';
import { Student, normalizeStudent } from '../App';
import { Modal } from './Modal';
import { PersonDocuments } from './PersonDocuments';
import { useColleges, YEAR_OPTIONS } from '../colleges';
import { canSeeConfidential } from '../auth';
import { confirmDialog } from './ConfirmDialog';
import { API_URL, apiFetch } from '../api';


type Props = {
  students: Student[];
  setStudents: React.Dispatch<React.SetStateAction<Student[]>>;
  globalSearch: string;
  showToast: (m: string) => void;
  addActivity: (m: string) => void;
  /** Student ID whose full profile should open on mount (e.g. from Dashboard search) */
  openProfileId?: string | null;
  onProfileOpened?: () => void;
};

type TabId = 'list' | 'form' | 'import';
type SortOrder = 'name-asc' | 'name-desc' | 'id-asc' | 'id-desc';

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

function StatusBadge({ status }: { status: Student['status'] }) {
  const styles: Record<string, string> = {
    enrolled: 'bg-blue-100 text-blue-700',
    'not enrolled': 'bg-blue-100 text-slate-600',
    dropped: 'bg-yellow-100 text-yellow-700',
  };
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-full ${styles[status] || styles.dropped}`}
      style={{ fontSize: 11, fontWeight: 500 }}
    >
      {status}
    </span>
  );
}

function normalizeCourseName(course: string) {
  const key = course.trim().toUpperCase().replace(/\s+/g, '-');
  return ({
    'BSIT-ELECT-TECH': 'BSIT-ELECT',
    'BSED-MATH': 'BSED-MATH',
    'BSED-ENGLISH': 'BSED-ENGLISH',
  } as Record<string, string>)[key] || key;
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') { current += '"'; i++; } else { quoted = !quoted; }
      continue;
    }
    if (ch === ',' && !quoted) { cells.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function normalizeCsvHeader(h: string) {
  return h.toLowerCase().replace(/[^a-z0-9]+/g, '');
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
  const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim());
  if (!lines.length) return [];
  const headers = parseCsvLine(lines.shift()!).map(normalizeCsvHeader);
  return lines.map((line) => {
    const vals = parseCsvLine(line);
    const rec: Record<string, unknown> = { status: 'enrolled' };
    headers.forEach((h, idx) => {
      const key = HEADER_MAP[h];
      if (key) rec[key] = vals[idx] ?? '';
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

export function StudentsModule({ students, setStudents, globalSearch, showToast, addActivity, openProfileId, onProfileOpened }: Props) {
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
  const [pendingCsv, setPendingCsv] = useState<Student[]>([]);
  const [csvFileName, setCsvFileName] = useState('');
  const [sortOrder, setSortOrder] = useState<SortOrder>('name-asc');
  const [courseFilter, setCourseFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const photoInputRef = useRef<HTMLInputElement>(null);

  const query = (localSearch || globalSearch).trim().toLowerCase();
  const visible = useMemo(
    () =>
      students.filter(
        (s) =>
          s.status !== 'dropped' &&
          (!courseFilter || normalizeCourseName(s.course) === courseFilter) &&
          (!yearFilter || s.yearLevel === yearFilter) &&
          [s.studentId, s.name, s.lastName, s.firstName, s.middleInitial, s.course, s.yearLevel, s.gender, s.contactNumber, s.medicalConditions]
            .join(' ')
            .toLowerCase()
            .includes(query),
      ).sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`)),
    [students, query, courseFilter, yearFilter],
  );

  const searchMatches = useMemo(
    () =>
      query
        ? students
            .filter(
              (s) =>
                s.status !== 'dropped' &&
                [s.studentId, s.name, s.lastName, s.firstName, s.middleInitial, s.course, s.yearLevel, s.gender, s.contactNumber, s.medicalConditions]
                  .join(' ')
                  .toLowerCase()
                  .includes(query),
            )
            .slice(0, 6)
        : [],
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
    const current = editingId ? students.find((s) => s.studentId === editingId) : null;
    const record = normalizeStudent({ ...form, ...boarding, status: current?.status || 'enrolled' } as Record<string, unknown>);
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
          s.studentId === editingId ? { ...s, ...record } : s
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
      title: `Archive ${s.name}?`,
      message: 'The record will be marked as dropped and moved out of the enrolled list. You can edit it again anytime.',
      confirmLabel: 'Archive',
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
        .map(normalizeStudent)
        .filter((r) => r.studentId && r.name);
      setPendingCsv(records);
    };
    reader.readAsText(file);
  }

  async function handleCsvImport() {
    if (!pendingCsv.length) { showToast('Choose a CSV file first'); return; }
    try {
      await Promise.all(
        pendingCsv.map((rec) =>
          saveStudentApi(rec, students.some((s) => s.studentId === rec.studentId) ? rec.studentId : null),
        ),
      );
    } catch (error) {
      showToast(`${error instanceof Error ? error.message : 'API error'}. CSV was not imported.`);
      return;
    }
    setStudents((prev) => {
      const updated = [...prev];
      pendingCsv.forEach((rec) => {
        const idx = updated.findIndex((s) => s.studentId === rec.studentId);
        if (idx >= 0) updated[idx] = { ...updated[idx], ...rec };
        else updated.push(rec);
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
      'Medical Conditions', 'Allergies', 'Current Medications', 'Others', 'Status',
    ];
    const csv = [headers, ...rows.map((s) => [
      s.studentId, s.lastName, s.firstName, s.middleInitial, s.name, s.course, s.yearLevel, s.gender, s.contactNumber, s.email, s.birthdate, s.bloodType, s.height, s.weight, s.schoolYear,
      s.guardianName, s.guardianRelationship, s.guardianContact,
      s.currentProvince, s.currentCity, s.currentBarangay, s.currentPurok, s.currentZip,
      s.homeProvince, s.homeCity, s.homeBarangay, s.homePurok, s.homeZip,
      s.isBoarding ? 'Yes' : 'No', s.boardingHouseName, s.boardingHouseAddress, s.landlordName, s.landlordContact,
      s.medicalConditions, s.allergies, s.currentMedications, s.medicalOthers, s.status,
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
            {sortedRows.length} enrolled record{sortedRows.length !== 1 ? 's' : ''}
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
                        <button
                          onClick={(e) => { e.stopPropagation(); handleArchive(s); }}
                          className="p-1.5 rounded-md hover:bg-yellow-50 text-slate-400 hover:text-yellow-600 transition-colors"
                          title="Archive"
                        >
                          <Archive size={14} />
                        </button>
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

  const tableTitle = [courseFilter, yearFilter].filter(Boolean).join(' / ') || 'All Students';

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
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-md hover:bg-blue-700 transition-colors"
                  title="Upload profile"
                >
                  <Camera size={13} />
                </button>
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
                <p className="text-slate-400 mt-0.5" style={{ fontSize: 12 }}>
                  Click the camera icon to upload. JPG, PNG up to 8 MB — auto-resized for storage.
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
      {viewStudent && (() => {
        const p = students.find((x) => x.studentId === viewStudent.studentId) ?? viewStudent;
        const age = (() => {
          if (!p.birthdate) return '';
          const b = new Date(p.birthdate);
          if (isNaN(b.getTime())) return '';
          const now = new Date();
          let a = now.getFullYear() - b.getFullYear();
          const m = now.getMonth() - b.getMonth();
          if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
          return a >= 0 ? String(a) : '';
        })();
        const bmi = computeBmi(p.height, p.weight);
        const Field = ({ label, value, conf = false }: { label: string; value?: string; conf?: boolean }) => (
          <div className="py-1.5 border-b border-blue-50 dark:border-slate-700/60">
            <p className="text-slate-500 dark:text-slate-400 flex items-center gap-1" style={{ fontSize: 12 }}>
              {conf && <Lock size={10} />}{label}
            </p>
            {conf && !isAdmin ? (
              <p className="text-slate-400 italic mt-0.5" style={{ fontSize: 12 }}>Admin only</p>
            ) : (
              <p className="text-black dark:text-slate-200 mt-0.5" style={{ fontSize: 13.5, fontWeight: 500 }}>{value || '—'}</p>
            )}
          </div>
        );
        const Section = ({ icon: Icon, title, cols = 2, children }: { icon: typeof User; title: string; cols?: 2 | 3; children: React.ReactNode }) => (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-blue-100 dark:border-slate-700 p-4">
            <div className="flex items-center gap-2.5 mb-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 dark:bg-slate-700/60">
                <Icon size={16} className="text-blue-600 dark:text-blue-400" />
              </span>
              <p className="text-blue-900 dark:text-white" style={{ fontSize: 15, fontWeight: 700 }}>{title}</p>
            </div>
            <div className={`grid grid-cols-1 gap-x-6 ${cols === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>{children}</div>
          </div>
        );
        return (
          <div className="space-y-5">
            {/* Page header: back + title */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => setViewStudent(null)}
                className="flex items-center justify-center rounded-lg border border-blue-100 bg-white p-2 text-slate-600 transition-colors hover:bg-blue-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                title="Back to Students"
                aria-label="Back to Students"
              >
                <ArrowLeft size={17} />
              </button>
              <h1 className="text-black dark:text-white" style={{ fontWeight: 700, fontSize: 22 }}>
                Student Profile
              </h1>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
              {/* ── Left: hero + info sections ── */}
              <div className="xl:col-span-2 space-y-4">
                {/* Hero card */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl border border-blue-100 dark:border-slate-700 p-5">
                  <div className="flex flex-col sm:flex-row items-start gap-5">
                    {/* Photo + change button */}
                    <div className="relative shrink-0">
                      {p.photo ? (
                        <img
                          src={p.photo}
                          alt={p.name}
                          className="h-40 w-36 rounded-xl border border-blue-100 object-cover shadow dark:border-slate-600"
                        />
                      ) : (
                        <div
                          className="flex h-40 w-36 items-center justify-center rounded-xl border border-blue-100 bg-blue-100 shadow dark:border-slate-600"
                          style={{ fontSize: 30, fontWeight: 700, color: '#4C5CAE' }}
                        >
                          {avatarInitials(p.name) || <User size={36} className="text-blue-400" />}
                        </div>
                      )}
                      <button
                        onClick={() => openEdit(p)}
                        className="absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-white/95 px-3 py-1 text-blue-700 shadow transition-colors hover:bg-blue-50"
                        style={{ fontSize: 11.5, fontWeight: 600 }}
                        title="Change photo"
                      >
                        <Camera size={12} />
                        Change Photo
                      </button>
                    </div>

                    {/* Identity */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <p className="text-black dark:text-white" style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.01em' }}>
                            {p.name}
                          </p>
                          <StatusBadge status={p.status} />
                        </div>
                        <button
                          onClick={() => openEdit(p)}
                          className="flex items-center gap-2 rounded-lg border border-blue-200 bg-white px-4 py-2 text-blue-700 transition-colors hover:bg-blue-50 dark:border-slate-600 dark:bg-slate-800 dark:text-blue-400 dark:hover:bg-slate-700"
                          style={{ fontSize: 13, fontWeight: 600 }}
                        >
                          <Pencil size={13} />
                          Edit Record
                        </button>
                      </div>
                      <p className="text-slate-500 dark:text-slate-400 mt-1" style={{ fontSize: 13.5 }}>
                        Student ID: {p.studentId}
                      </p>

                      {/* Chips */}
                      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
                        <span className="flex items-center gap-2 text-slate-700 dark:text-slate-300" style={{ fontSize: 13 }}>
                          <GraduationCap size={15} className="text-blue-600 dark:text-blue-400" />
                          {p.yearLevel || 'No year'}
                        </span>
                        <span className="hidden sm:block h-5 w-px bg-blue-200 dark:bg-slate-600" />
                        <span className="flex items-center gap-2 text-slate-700 dark:text-slate-300" style={{ fontSize: 13 }}>
                          <BookOpen size={15} className="text-blue-600 dark:text-blue-400" />
                          {p.course || 'No course'}
                        </span>
                        <span className="hidden sm:block h-5 w-px bg-blue-200 dark:bg-slate-600" />
                        <span className="flex items-center gap-2 text-slate-700 dark:text-slate-300" style={{ fontSize: 13 }}>
                          <CalendarDays size={15} className="text-blue-600 dark:text-blue-400" />
                          {p.schoolYear ? `SY ${p.schoolYear}` : '—'}
                        </span>
                      </div>

                      {/* Quick contact strip */}
                      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                        <span className="flex items-center gap-2 text-slate-700 dark:text-slate-300" style={{ fontSize: 13 }}>
                          <Phone size={15} className="text-blue-600 dark:text-blue-400" />
                          {p.contactNumber || '—'}
                        </span>
                        <span className="hidden sm:block h-5 w-px bg-blue-200 dark:bg-slate-600" />
                        <span className="flex items-center gap-2 text-slate-700 dark:text-slate-300" style={{ fontSize: 13 }}>
                          <Mail size={15} className="text-blue-600 dark:text-blue-400" />
                          {p.email || '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Info sections — two independent stacks so cards pack upward */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                  <div className="space-y-4">
                    <Section icon={User} title="Personal Information" cols={3}>
                      <Field label="Sex" value={p.gender} />
                      <Field label="Date of Birth" value={p.birthdate} />
                      <Field label="Age" value={age} />
                      <Field label="Blood Type" value={p.bloodType} />
                      <Field label="Height" value={p.height ? `${p.height} cm` : ''} />
                      <Field label="Weight" value={p.weight ? `${p.weight} kg` : ''} />
                      <Field label="BMI" value={bmi ? `${bmi.value} (${bmi.category})` : ''} />
                    </Section>

                    <Section icon={Users} title="Guardian / Parent Information">
                      <Field label="Name" value={p.guardianName} conf />
                      <Field label="Relationship" value={p.guardianRelationship} conf />
                      <Field label="Contact Number" value={p.guardianContact} conf />
                    </Section>

                    <Section icon={HeartPulse} title="Medical Information">
                      <Field label="Allergies" value={p.allergies} />
                      <Field label="Medical Conditions" value={p.medicalConditions} />
                      <Field label="Current Medications" value={p.currentMedications} />
                      <Field label="Others" value={p.medicalOthers} />
                    </Section>
                  </div>

                  <div className="space-y-4">
                    <Section icon={MapPin} title="Residence Information">
                      <Field label="Current Address" value={p.presentAddress} conf />
                      <Field label="Permanent / Home Address" value={p.homeAddress} conf />
                    </Section>

                    <Section icon={Building2} title="Boarding House Information">
                      <Field label="Boarding House Name" value={p.boardingHouseName} conf />
                      <Field label="Boarding House Address" value={p.boardingHouseAddress} conf />
                      <Field label="Landlord/Landlady" value={p.landlordName} conf />
                      <Field label="Landlord Contact Number" value={p.landlordContact} conf />
                    </Section>
                  </div>
                </div>

                {/* Confidential notes — admin only */}
                {isAdmin && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-5">
                    <p className="text-yellow-700 mb-1 flex items-center gap-1.5" style={{ fontSize: 12, fontWeight: 600 }}>
                      <Lock size={12} /> Confidential Notes (admin only)
                    </p>
                    <p className="text-black" style={{ fontSize: 13 }}>
                      {p.confidentialNotes || 'None recorded'}
                    </p>
                  </div>
                )}
              </div>

              {/* ── Right: documents panel ── */}
              <div className="bg-white dark:bg-slate-800 rounded-2xl border border-blue-100 dark:border-slate-700 p-5">
                <div className="flex items-center gap-2.5 mb-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 dark:bg-slate-700/60">
                    <FileText size={16} className="text-blue-600 dark:text-blue-400" />
                  </span>
                  <p className="text-blue-900 dark:text-white" style={{ fontSize: 15, fontWeight: 700 }}>Documents &amp; Records</p>
                </div>
                <PersonDocuments ownerType="student" ownerId={p.studentId} showToast={showToast} />
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
