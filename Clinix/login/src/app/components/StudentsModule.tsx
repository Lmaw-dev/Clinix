import { useState, useMemo, useRef } from 'react';
import { Plus, Search, Pencil, Archive, Eye, Upload, CheckCircle2, Camera, User } from 'lucide-react';
import { Student, normalizeStudent } from '../App';
import { Modal } from './Modal';

const COURSES = [
  'BSCS', 'BSF', 'BSIT-Elect-Tech', 'BSIT-FPST', 'BSM',
  'BSED-Math', 'BSED-English', 'BEED',
];

type Props = {
  students: Student[];
  setStudents: React.Dispatch<React.SetStateAction<Student[]>>;
  globalSearch: string;
  showToast: (m: string) => void;
  addActivity: (m: string) => void;
};

type TabId = 'list' | 'form' | 'import';

const defaultForm = {
  studentId: '',
  name: '',
  course: '',
  yearLevel: '',
  gender: '',
  contactNumber: '',
  medicalConditions: '',
  photo: '',
};

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
    yearlevel: 'yearLevel', year: 'yearLevel', gender: 'gender',
    contactnumber: 'contactNumber', contact: 'contactNumber',
    medicalconditions: 'medicalConditions', conditions: 'medicalConditions',
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

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function StudentsModule({ students, setStudents, globalSearch, showToast, addActivity }: Props) {
  const [tab, setTab] = useState<TabId>('list');
  const [localSearch, setLocalSearch] = useState('');
  const [form, setForm] = useState(defaultForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewStudent, setViewStudent] = useState<Student | null>(null);
  const [pendingCsv, setPendingCsv] = useState<Student[]>([]);
  const [csvFileName, setCsvFileName] = useState('');
  const photoInputRef = useRef<HTMLInputElement>(null);

  const query = (localSearch || globalSearch).trim().toLowerCase();
  const visible = useMemo(
    () =>
      students.filter(
        (s) =>
          s.status !== 'dropped' &&
          [s.studentId, s.name, s.course, s.yearLevel, s.gender, s.contactNumber, s.medicalConditions]
            .join(' ')
            .toLowerCase()
            .includes(query),
      ),
    [students, query],
  );

  function openAdd() {
    setForm(defaultForm);
    setEditingId(null);
    setTab('form');
  }

  function openEdit(s: Student) {
    setForm({
      studentId: s.studentId,
      name: s.name,
      course: s.course,
      yearLevel: s.yearLevel,
      gender: s.gender,
      contactNumber: s.contactNumber,
      medicalConditions: s.medicalConditions,
      photo: s.photo || '',
    });
    setEditingId(s.studentId);
    setTab('form');
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { showToast('Photo must be under 2 MB'); return; }
    const dataUrl = await readFileAsDataUrl(file);
    setForm((f) => ({ ...f, photo: dataUrl }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const record = normalizeStudent({ ...form, status: 'enrolled' } as Record<string, unknown>);
    if (!record.studentId || !record.name) {
      showToast('Student ID and name are required');
      return;
    }
    if (editingId) {
      setStudents((prev) =>
        prev.map((s) =>
          s.studentId === editingId ? { ...s, ...record, status: s.status } : s
        ),
      );
      showToast(`${record.name} updated`);
      addActivity(`Student updated: ${record.name}`);
    } else {
      if (students.find((s) => s.studentId === record.studentId)) {
        showToast('Student ID already exists');
        return;
      }
      setStudents((prev) => [...prev, record]);
      showToast(`${record.name} added`);
      addActivity(`Student added: ${record.name}`);
    }
    setForm(defaultForm);
    setEditingId(null);
    setTab('list');
  }

  function handleArchive(s: Student) {
    if (!confirm(`Archive ${s.name}?`)) return;
    setStudents((prev) =>
      prev.map((x) => (x.studentId === s.studentId ? { ...x, status: 'dropped' } : x)),
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

  function handleCsvImport() {
    if (!pendingCsv.length) { showToast('Choose a CSV file first'); return; }
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
    setTab('list');
  }

  const fieldClass =
    'w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';
  const labelClass = 'block text-slate-600 dark:text-slate-400 mb-1';
  const btnPrimary =
    'bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors';
  const btnSecondary =
    'bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors';

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
        <button
          onClick={openAdd}
          className={`${btnPrimary} flex items-center gap-2 shrink-0`}
          style={{ fontSize: 13 }}
        >
          <Plus size={15} />
          Add student
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg w-fit border border-slate-200 dark:border-slate-700">
        {(['list', 'form', 'import'] as TabId[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md transition-colors ${
              tab === t ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-800 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
            style={{ fontSize: 13, fontWeight: tab === t ? 500 : 400 }}
          >
            {t === 'list'
              ? 'Student List'
              : t === 'form'
              ? editingId
                ? 'Edit Student'
                : 'Add Student'
              : 'Import CSV'}
          </button>
        ))}
      </div>

      {/* ── LIST TAB ── */}
      {tab === 'list' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700" >
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-4">
            <div>
              <p className="text-slate-800 dark:text-slate-100" style={{ fontSize: 14, fontWeight: 600 }}>
                Student List
              </p>
              <p className="text-slate-400" style={{ fontSize: 12 }}>
                {visible.length} enrolled record{visible.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="relative ml-auto max-w-xs w-full">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                placeholder="Search students…"
                className={`${fieldClass} pl-9`}
                style={{ fontSize: 13 }}
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {[
                    'Photo', 'ID', 'Name', 'Course', 'Year', 'Contact',
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
                {visible.length === 0 ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="text-center py-12 text-slate-400"
                      style={{ fontSize: 13 }}
                    >
                      No students match your search
                    </td>
                  </tr>
                ) : (
                  visible.map((s) => (
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
                            {s.name}
                          </p>
                          <p className="text-slate-400" style={{ fontSize: 11 }}>
                            {s.gender || '—'}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600" style={{ fontSize: 13 }}>
                        {s.course || '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap" style={{ fontSize: 13 }}>
                        {s.yearLevel || '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap" style={{ fontSize: 13 }}>
                        {s.contactNumber || '—'}
                      </td>
                      <td
                        className="px-4 py-3 text-slate-500 max-w-[160px] truncate"
                        style={{ fontSize: 13 }}
                      >
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
      )}

      {/* ── FORM TAB ── */}
      {tab === 'form' && (
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
            {/* Photo upload */}
            <div className="flex items-center gap-5">
              <div className="relative shrink-0">
                {form.photo ? (
                  <img
                    src={form.photo}
                    alt="Student photo"
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
                  title="Upload photo"
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
                  Student Photo
                </p>
                <p className="text-slate-400 mt-0.5" style={{ fontSize: 12 }}>
                  Click the camera icon to upload. JPG, PNG up to 2 MB.
                </p>
                {form.photo && (
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, photo: '' }))}
                    className="mt-1.5 text-red-500 hover:text-red-600 transition-colors"
                    style={{ fontSize: 12 }}
                  >
                    Remove photo
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
                    onChange={(e) => setForm((f) => ({ ...f, studentId: e.target.value }))}
                    placeholder="000001"
                    maxLength={6}
                    className={fieldClass}
                    style={{ fontSize: 13 }}
                    required
                    disabled={!!editingId}
                  />
                </label>
                <label>
                  <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>
                    Full Name
                  </span>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Full name"
                    className={fieldClass}
                    style={{ fontSize: 13 }}
                    required
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
                    {COURSES.map((c) => <option key={c}>{c}</option>)}
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
                    Gender
                  </span>
                  <select
                    value={form.gender}
                    onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
                    className={fieldClass}
                    style={{ fontSize: 13 }}
                    required
                  >
                    <option value="">Select gender</option>
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
                    onChange={(e) => setForm((f) => ({ ...f, contactNumber: e.target.value }))}
                    placeholder="09XX XXX XXXX"
                    className={fieldClass}
                    style={{ fontSize: 13 }}
                  />
                </label>
              </div>

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
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => { setForm(defaultForm); setEditingId(null); setTab('list'); }}
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
      )}

      {/* ── IMPORT TAB ── */}
      {tab === 'import' && (
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
              Columns: studentId, name, course, yearLevel, gender, contactNumber, medicalConditions
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
            <button onClick={() => setTab('list')} className={btnSecondary} style={{ fontSize: 13 }}>
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
      )}

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
                  title="Edit / change photo"
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
                ['Gender', viewStudent.gender],
                ['Contact', viewStudent.contactNumber],
                ['Program', viewStudent.course],
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
