import { useState, useMemo, useRef } from 'react';
import { Plus, Search, Pencil, Archive, Eye, Upload, CheckCircle2, Camera, User, Download, Printer, Filter, X } from 'lucide-react';
import { Student, normalizeStudent } from '../App';
import { Modal } from './Modal';
import { PersonDocuments } from './PersonDocuments';
import { useColleges, YEAR_OPTIONS } from '../colleges';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4001/api').replace(/\/$/, '');

type Props = {
  students: Student[];
  setStudents: React.Dispatch<React.SetStateAction<Student[]>>;
  globalSearch: string;
  showToast: (m: string) => void;
  addActivity: (m: string) => void;
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
  medicalConditions: '',
  photo: '',
  birthdate: '',
  bloodType: '',
  schoolYear: '',
  homeAddress: '',
  presentAddress: '',
  guardianName: '',
  guardianContact: '',
};

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

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
    enrolled: 'bg-green-100 text-green-700',
    'not enrolled': 'bg-slate-100 text-slate-600',
    dropped: 'bg-amber-100 text-amber-700',
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
    medicalconditions: 'medicalConditions', conditions: 'medicalConditions',
    lastname: 'lastName', surname: 'lastName',
    firstname: 'firstName', fullname: 'name',
    middleinitial: 'middleInitial', mi: 'middleInitial',
    birthdate: 'birthdate', birthday: 'birthdate', dob: 'birthdate',
    bloodtype: 'bloodType',
    schoolyear: 'schoolYear',
    guardianname: 'guardianName', parentname: 'guardianName',
    guardiancontact: 'guardianContact', parentcontact: 'guardianContact',
    homeaddress: 'homeAddress',
    presentaddress: 'presentAddress',
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
  const res = await fetch(`${API_URL}/students${editingId ? `/${editingId}` : ''}`, {
    method: editingId ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...student, course: normalizeCourseName(student.course) }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || 'API request failed');
  }
}

export function StudentsModule({ students, setStudents, globalSearch, showToast, addActivity }: Props) {
  const colleges = useColleges();
  const [tab, setTab] = useState<TabId>('list');
  const [localSearch, setLocalSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewStudent, setViewStudent] = useState<Student | null>(null);
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
      medicalConditions: s.medicalConditions,
      photo: s.photo || '',
      birthdate: s.birthdate || '',
      bloodType: s.bloodType || '',
      schoolYear: s.schoolYear || '',
      homeAddress: s.homeAddress || '',
      presentAddress: s.presentAddress || '',
      guardianName: s.guardianName || '',
      guardianContact: s.guardianContact || '',
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
    const current = editingId ? students.find((s) => s.studentId === editingId) : null;
    const record = normalizeStudent({ ...form, status: current?.status || 'enrolled' } as Record<string, unknown>);
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
    if (!confirm(`Archive ${s.name}?`)) return;
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
    const headers = ['Student ID', 'Last Name', 'First Name', 'M.I.', 'Name', 'Course', 'Year Level', 'Sex', 'Contact Number', 'Birthdate', 'Blood Type', 'School Year', 'Guardian Name', 'Guardian Contact', 'Home Address', 'Present Address', 'Medical Conditions', 'Status'];
    const csv = [headers, ...rows.map((s) => [
      s.studentId, s.lastName, s.firstName, s.middleInitial, s.name, s.course, s.yearLevel, s.gender, s.contactNumber, s.birthdate, s.bloodType, s.schoolYear, s.guardianName, s.guardianContact, s.homeAddress, s.presentAddress, s.medicalConditions, s.status,
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
    'w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';
  const labelClass = 'block text-slate-600 dark:text-slate-400 mb-1';
  const btnPrimary =
    'bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors';
  const btnSecondary =
    'bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors';

  function studentTable(rows: Student[], title: string) {
    const sortedRows = sortRows(rows);
    return (
      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="px-5 py-4 border-b border-slate-100">
          <p className="text-slate-800" style={{ fontSize: 14, fontWeight: 600 }}>
            {title}
          </p>
          <p className="text-slate-400" style={{ fontSize: 12 }}>
            {sortedRows.length} enrolled record{sortedRows.length !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
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
                  <tr key={s.studentId} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <StudentAvatar photo={s.photo} name={s.name} size="sm" />
                    </td>
                    <td className="px-4 py-3 text-slate-600" style={{ fontSize: 13 }}>
                      {s.studentId}
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-slate-800" style={{ fontSize: 13, fontWeight: 500 }}>
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
                          onClick={() => setViewStudent(s)}
                          className="p-1.5 rounded-md hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"
                          title="View profile"
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          onClick={() => openEdit(s)}
                          className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleArchive(s)}
                          className="p-1.5 rounded-md hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-colors"
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
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-slate-900 dark:text-white" style={{ fontWeight: 700, fontSize: 20 }}>Students</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-0.5" style={{ fontSize: 13 }}>
            Manage student records, profiles, and enrollment status
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => exportRows(sortRows(visible), tableTitle)}
            className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            style={{ fontSize: 13 }}
            title="Export CSV"
          >
            <Download size={15} />
            CSV
          </button>
          <button
            onClick={() => printRows(sortRows(visible), tableTitle)}
            className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            style={{ fontSize: 13 }}
            title="Print student list"
          >
            <Printer size={15} />
            Print
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
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
        <div className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
          <div className="px-5 py-4 border-b border-slate-100">
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
                            <span className="block text-slate-800 truncate" style={{ fontSize: 13, fontWeight: 600 }}>
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
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-700"
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
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-700"
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
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-700"
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

      {/* ── FORM TAB ── */}
      <Modal
        isOpen={showFormModal}
        title={editingId ? 'Edit Student' : 'Add Student'}
        onClose={() => { setForm(defaultForm); setEditingId(null); setShowFormModal(false); }}
      >
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 w-full">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="text-slate-900" style={{ fontSize: 15, fontWeight: 600 }}>
                {editingId ? 'Edit Student' : 'Add Student'}
              </p>
              <p className="text-slate-400" style={{ fontSize: 12 }}>
                {editingId
                  ? `Editing record ${editingId}`
                  : 'Enter student details to create a new record'}
              </p>
            </div>
            <span
              className="px-2.5 py-1 rounded-full bg-green-100 text-green-700"
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
                    className="w-20 h-20 rounded-full object-cover border-2 border-slate-200"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-slate-100 border-2 border-dashed border-slate-300 flex items-center justify-center">
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
                <p className="text-slate-700" style={{ fontSize: 13, fontWeight: 500 }}>
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

            <div className="border-t border-slate-100 pt-4">
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
                <label>
                  <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Home Address</span>
                  <input
                    value={form.homeAddress}
                    onChange={(e) => setForm((f) => ({ ...f, homeAddress: e.target.value }))}
                    placeholder="Permanent / home address"
                    className={fieldClass}
                    style={{ fontSize: 13 }}
                  />
                </label>
              </div>

              <label className="block mt-4">
                <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Present Address</span>
                <input
                  value={form.presentAddress}
                  onChange={(e) => setForm((f) => ({ ...f, presentAddress: e.target.value }))}
                  placeholder="Current address while studying"
                  className={fieldClass}
                  style={{ fontSize: 13 }}
                />
              </label>

              <label className="block mt-4">
                <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>
                  Medical Conditions
                </span>
                <textarea
                  value={form.medicalConditions}
                  onChange={(e) => setForm((f) => ({ ...f, medicalConditions: e.target.value }))}
                  placeholder="List allergies, chronic conditions, or other health notes."
                  className={`${fieldClass} resize-none`}
                  rows={3}
                  style={{ fontSize: 13 }}
                />
              </label>

              {editingId ? (
                <div className="mt-4">
                  <PersonDocuments ownerType="student" ownerId={editingId} showToast={showToast} canEdit />
                </div>
              ) : (
                <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2.5 text-slate-400" style={{ fontSize: 12 }}>
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
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 w-full">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-slate-900" style={{ fontSize: 15, fontWeight: 600 }}>Import CSV</p>
              <p className="text-slate-400" style={{ fontSize: 12 }}>
                Upload a CSV file to add multiple student records at once
              </p>
            </div>
            <span
              className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-700"
              style={{ fontSize: 11, fontWeight: 500 }}
            >
              CSV upload
            </span>
          </div>

          <label className="block border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-blue-400 transition-colors cursor-pointer">
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
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
              <CheckCircle2 size={16} className="text-green-600 shrink-0" />
              <p className="text-green-700" style={{ fontSize: 13 }}>
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

      {/* ── VIEW PROFILE MODAL ── */}
      <Modal
        isOpen={!!viewStudent}
        title="Student Profile"
        onClose={() => setViewStudent(null)}
      >
        {viewStudent && (
          <div className="space-y-4">
            {/* Profile header */}
            <div className="flex flex-col items-center text-center py-4 bg-gradient-to-b from-blue-50 to-white rounded-xl px-4">
              <div className="relative mb-3">
                {viewStudent.photo ? (
                  <img
                    src={viewStudent.photo}
                    alt={viewStudent.name}
                    className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-lg"
                  />
                ) : (
                  <div
                    className="w-24 h-24 rounded-full bg-blue-100 border-4 border-white shadow-lg flex items-center justify-center"
                    style={{ fontSize: 28, fontWeight: 700, color: '#2563EB' }}
                  >
                    {avatarInitials(viewStudent.name) || <User size={32} className="text-blue-400" />}
                  </div>
                )}
                <button
                  onClick={() => { openEdit(viewStudent); setViewStudent(null); }}
                  className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center shadow hover:bg-blue-700 transition-colors"
                  title="Edit / change profile"
                >
                  <Camera size={13} />
                </button>
              </div>
              <p className="text-slate-900" style={{ fontSize: 17, fontWeight: 700 }}>
                {viewStudent.name}
              </p>
              <p className="text-slate-500 mt-0.5" style={{ fontSize: 12 }}>
                {viewStudent.studentId} • {viewStudent.course || 'No course'}
              </p>
              <div className="mt-2">
                <StatusBadge status={viewStudent.status} />
              </div>
            </div>

            {/* Details grid */}
            <div className="grid grid-cols-2 gap-2">
              {[
                ['Year Level', viewStudent.yearLevel],
                ['Sex', viewStudent.gender],
                ['Contact', viewStudent.contactNumber],
                ['Program', viewStudent.course],
                ['Birthdate', viewStudent.birthdate],
                ['Blood Type', viewStudent.bloodType],
                ['School Year', viewStudent.schoolYear],
                ["Parent's / Guardian's Name", viewStudent.guardianName],
                ["Guardian's Contact", viewStudent.guardianContact],
                ['Home Address', viewStudent.homeAddress],
                ['Present Address', viewStudent.presentAddress],
              ].map(([k, v]) => (
                <div key={k} className="bg-slate-50 rounded-lg p-3">
                  <p className="text-slate-400" style={{ fontSize: 11, fontWeight: 500 }}>
                    {k}
                  </p>
                  <p className="text-slate-700" style={{ fontSize: 13 }}>{v || '—'}</p>
                </div>
              ))}
            </div>

            {/* Medical conditions */}
            <div className="bg-slate-50 rounded-lg p-3">
              <p className="text-slate-400 mb-1" style={{ fontSize: 11, fontWeight: 500 }}>
                Medical Conditions
              </p>
              <p className="text-slate-700" style={{ fontSize: 13 }}>
                {viewStudent.medicalConditions || 'None recorded'}
              </p>
            </div>

            {/* Documents & files */}
            <PersonDocuments ownerType="student" ownerId={viewStudent.studentId} showToast={showToast} />

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { openEdit(viewStudent); setViewStudent(null); }}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                style={{ fontSize: 13 }}
              >
                <Pencil size={13} />
                Edit record
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
