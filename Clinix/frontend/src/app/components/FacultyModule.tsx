import { useState, useMemo, useRef } from 'react';
import { Plus, Search, Pencil, Eye, Filter, Upload, Download, Printer, CheckCircle2, X } from 'lucide-react';
import { FacultyMember, normalizeFaculty } from '../App';
import { Modal } from './Modal';
import { PersonDocuments } from './PersonDocuments';
import { useColleges, normalizeCollegeName } from '../colleges';

const API_URL = (import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:4001/api`).replace(/\/$/, '');

type Props = {
  faculty: FacultyMember[];
  setFaculty: React.Dispatch<React.SetStateAction<FacultyMember[]>>;
  globalSearch: string;
  showToast: (m: string) => void;
  addActivity: (m: string) => void;
};

type SortOrder = 'name-asc' | 'name-desc' | 'id-asc' | 'id-desc';

const defaultForm = {
  staffId: '', name: '', college: '', role: '', contact: '', medicalHistory: '',
  employmentCategory: '', employmentType: '',
  birthdate: '', bloodType: '', office: '', homeAddress: '', presentAddress: '',
  guardianName: '', guardianContact: '',
};

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

// Employment classification: category → its employment types
const CLASSIFICATIONS: { category: string; types: string[] }[] = [
  { category: 'Non-teaching', types: ['Permanent', 'Casual', 'Contract of Service'] },
  { category: 'Teaching', types: ['Permanent', 'Temporary', 'Contract of Service', 'Part time'] },
  { category: 'Agency', types: ['Security guard'] },
];
const typesForCategory = (category: string) => CLASSIFICATIONS.find((c) => c.category === category)?.types ?? [];

type CsvRecord = Record<string, string>;

function avatarInitials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase();
}

function sortFaculty(rows: FacultyMember[], sort: SortOrder) {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    switch (sort) {
      case 'name-desc':
        return a.name === b.name
          ? a.staffId.localeCompare(b.staffId, undefined, { numeric: true })
          : b.name.localeCompare(a.name);
      case 'id-asc':
        return a.staffId.localeCompare(b.staffId, undefined, { numeric: true });
      case 'id-desc':
        return b.staffId.localeCompare(a.staffId, undefined, { numeric: true });
      case 'name-asc':
      default:
        return a.name === b.name
          ? a.staffId.localeCompare(b.staffId, undefined, { numeric: true })
          : a.name.localeCompare(b.name);
    }
  });
  return sorted;
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

function parseCsv(text: string): CsvRecord[] {
  const headerMap: Record<string, string> = {
    staffid: 'staffId',
    id: 'staffId',
    name: 'name',
    college: 'college',
    designation: 'role',
    role: 'role',
    contact: 'contact',
    contactnumber: 'contact',
    medicalhistory: 'medicalHistory',
    history: 'medicalHistory',
    classification: 'employmentCategory', employmentcategory: 'employmentCategory', category: 'employmentCategory',
    employmenttype: 'employmentType', type: 'employmentType',
    birthdate: 'birthdate', birthday: 'birthdate', dob: 'birthdate',
    bloodtype: 'bloodType',
    office: 'office',
    homeaddress: 'homeAddress',
    presentaddress: 'presentAddress',
    spouse: 'guardianName', spousename: 'guardianName', nextofkin: 'guardianName', guardianname: 'guardianName',
    spousecontact: 'guardianContact', kincontact: 'guardianContact', guardiancontact: 'guardianContact',
  };
  const lines = text.replace(/\r/g, '').split('\n').filter((line) => line.trim());
  if (!lines.length) return [];
  const headers = parseCsvLine(lines.shift()!).map(normalizeCsvHeader);
  return lines.map((line) => {
    const values = parseCsvLine(line);
    const record: CsvRecord = {};
    headers.forEach((header, index) => {
      const key = headerMap[header];
      if (key) record[key] = values[index] ?? '';
    });
    return record;
  });
}

function csvCell(value: string) {
  return `"${String(value || '').replace(/"/g, '""')}"`;
}

function htmlCell(value: string) {
  return String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
}

function exportRows(rows: FacultyMember[], title: string) {
  const headers = ['Staff ID', 'Name', 'College', 'Role', 'Classification', 'Employment Type', 'Contact', 'Office', 'Birthdate', 'Blood Type', 'Spouse Name', 'Spouse Contact', 'Home Address', 'Present Address', 'Medical History'];
  const csv = [headers, ...rows.map((row) => [row.staffId, row.name, row.college || '', row.role, row.employmentCategory, row.employmentType, row.contact, row.office, row.birthdate, row.bloodType, row.guardianName, row.guardianContact, row.homeAddress, row.presentAddress, row.medicalHistory])]
    .map((row) => row.map(csvCell).join(','))
    .join('\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  link.download = `${title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'faculty'}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function printRows(rows: FacultyMember[], title: string) {
  const html = `
    <h2>${htmlCell(title)}</h2>
    <p>${rows.length} record(s)</p>
    <table border="1" cellspacing="0" cellpadding="6" style="width:100%;border-collapse:collapse;font-family:Arial;font-size:12px">
      <thead><tr>${['ID', 'Name', 'College', 'Role', 'Contact', 'Medical History'].map((h) => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((row) => `<tr><td>${htmlCell(row.staffId)}</td><td>${htmlCell(row.name)}</td><td>${htmlCell(row.college || '')}</td><td>${htmlCell(row.role)}</td><td>${htmlCell(row.contact)}</td><td>${htmlCell(row.medicalHistory)}</td></tr>`).join('')}</tbody>
    </table>`;
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.print();
}

async function saveFacultyApi(member: FacultyMember, editingId?: string | null) {
  const res = await fetch(`${API_URL}/faculty${editingId ? `/${editingId}` : ''}`, {
    method: editingId ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(member),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || 'API request failed');
  }
}

export function FacultyModule({ faculty, setFaculty, globalSearch, showToast, addActivity }: Props) {
  const colleges = useColleges();
  const [localSearch, setLocalSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [viewMember, setViewMember] = useState<FacultyMember | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<SortOrder>('name-asc');
  const [classFilter, setClassFilter] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [pendingCsv, setPendingCsv] = useState<FacultyMember[]>([]);
  const [csvFileName, setCsvFileName] = useState('');
  const csvInputRef = useRef<HTMLInputElement>(null);

  const query = (localSearch || globalSearch).trim().toLowerCase();
  const visible = useMemo(
    () =>
      faculty.filter(
        (f) =>
          (!classFilter || f.employmentCategory === classFilter) &&
          [f.staffId, f.name, f.college, f.role, f.contact, f.medicalHistory, f.employmentCategory, f.employmentType]
            .join(' ')
            .toLowerCase()
            .includes(query),
      ),
    [faculty, query, classFilter],
  );

  const searchMatches = useMemo(
    () =>
      query
        ? faculty
            .filter((f) =>
              [f.staffId, f.name, f.college, f.role, f.contact, f.medicalHistory]
                .join(' ')
                .toLowerCase()
                .includes(query),
            )
            .slice(0, 6)
        : [],
    [faculty, query],
  );

  function openAdd() {
    setForm(defaultForm);
    setEditingId(null);
    setShowModal(true);
  }

  function openEdit(f: FacultyMember) {
    setForm({
      staffId: f.staffId, name: f.name, college: f.college || '', role: f.role,
      contact: f.contact, medicalHistory: f.medicalHistory,
      employmentCategory: f.employmentCategory || '', employmentType: f.employmentType || '',
      birthdate: f.birthdate || '', bloodType: f.bloodType || '', office: f.office || '',
      homeAddress: f.homeAddress || '', presentAddress: f.presentAddress || '',
      guardianName: f.guardianName || '', guardianContact: f.guardianContact || '',
    });
    setEditingId(f.staffId);
    setShowModal(true);
  }

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const records = parseCsv(String(reader.result || ''))
        .map((rec) => normalizeFaculty(rec))
        .filter((rec) => rec.staffId && rec.name);
      setPendingCsv(records);
    };
    reader.readAsText(file);
  }

  async function handleCsvImport() {
    if (!pendingCsv.length) { showToast('Choose a CSV file first'); return; }
    try {
      await Promise.all(
        pendingCsv.map((member) =>
          saveFacultyApi(member, faculty.some((f) => f.staffId === member.staffId) ? member.staffId : null),
        ),
      );
    } catch (error) {
      showToast(`${error instanceof Error ? error.message : 'API error'}. CSV was not imported.`);
      return;
    }
    setFaculty((prev) => {
      const updated = [...prev];
      pendingCsv.forEach((member) => {
        const idx = updated.findIndex((f) => f.staffId === member.staffId);
        if (idx >= 0) updated[idx] = { ...updated[idx], ...member };
        else updated.push(member);
      });
      return updated;
    });
    showToast(`${pendingCsv.length} record(s) imported`);
    addActivity(`${pendingCsv.length} faculty/staff records imported from CSV`);
    setPendingCsv([]);
    setCsvFileName('');
    setShowImportModal(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const rec: FacultyMember = {
      staffId: form.staffId.trim(),
      name: form.name.trim(),
      college: normalizeCollegeName(form.college) || undefined,
      role: form.role.trim(),
      contact: form.contact.trim(),
      medicalHistory: form.medicalHistory.trim(),
      employmentCategory: form.employmentCategory.trim(),
      employmentType: form.employmentType.trim(),
      birthdate: form.birthdate.trim(),
      bloodType: form.bloodType.trim(),
      office: form.office.trim(),
      homeAddress: form.homeAddress.trim(),
      presentAddress: form.presentAddress.trim(),
      guardianName: form.guardianName.trim(),
      guardianContact: form.guardianContact.trim(),
    };
    if (!rec.staffId || !rec.name) { showToast('ID and name required'); return; }

    try {
      await saveFacultyApi(rec, editingId);
    } catch (error) {
      showToast(`${error instanceof Error ? error.message : 'API error'}. Record was not saved.`);
      return;
    }

    setFaculty((prev) => {
      const idx = prev.findIndex((f) => f.staffId === rec.staffId);
      if (idx >= 0) { const updated = [...prev]; updated[idx] = rec; return updated; }
      return [...prev, rec];
    });
    showToast(editingId ? `${rec.name} updated` : `${rec.name} added`);
    addActivity(`Faculty ${editingId ? 'updated' : 'added'}: ${rec.name}`);
    setShowModal(false);
    setForm(defaultForm);
    setEditingId(null);
  }

  function facultyTable(rows: FacultyMember[], title: string) {
    const sortedRows = sortFaculty(rows, sortOrder);
    return (
      <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 dark:border-slate-700">
          <div>
            <p className="text-slate-800 dark:text-slate-100" style={{ fontSize: 14, fontWeight: 600 }}>{title}</p>
            <p className="text-slate-400" style={{ fontSize: 12 }}>{sortedRows.length} personnel record{sortedRows.length !== 1 ? 's' : ''}</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60">
                {['ID', 'Name & Designation', 'College', 'Classification', 'Contact', 'Medical History', 'Actions'].map((h) => (
                  <th key={h} className="whitespace-nowrap px-5 py-3 text-left text-slate-500 uppercase tracking-wider" style={{ fontSize: 11, fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400" style={{ fontSize: 13 }}>No personnel match your search</td>
                </tr>
              ) : (
                sortedRows.map((member) => (
                  <tr key={member.staffId} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/30">
                    <td className="px-5 py-3.5 text-slate-600" style={{ fontSize: 13 }}>{member.staffId}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700" style={{ fontSize: 11, fontWeight: 700 }}>
                          {avatarInitials(member.name)}
                        </div>
                        <div>
                          <p className="text-slate-800 dark:text-slate-100" style={{ fontSize: 13, fontWeight: 500 }}>{member.name}</p>
                          <p className="text-slate-400" style={{ fontSize: 11 }}>{member.role || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600" style={{ fontSize: 13 }}>{member.college || '—'}</td>
                    <td className="px-5 py-3.5" style={{ fontSize: 13 }}>
                      {member.employmentCategory ? (
                        <div>
                          <p className="text-slate-700 dark:text-slate-200" style={{ fontSize: 13 }}>{member.employmentCategory}</p>
                          {member.employmentType && <p className="text-slate-400" style={{ fontSize: 11 }}>{member.employmentType}</p>}
                        </div>
                      ) : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600" style={{ fontSize: 13 }}>{member.contact || '—'}</td>
                    <td className="max-w-[220px] px-5 py-3.5 truncate text-slate-500" style={{ fontSize: 13 }}>{member.medicalHistory || 'None recorded'}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setViewMember(member)} className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600" title="View">
                          <Eye size={14} />
                        </button>
                        <button onClick={() => openEdit(member)} className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700" title="Edit">
                          <Pencil size={14} />
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

  const fieldClass = 'w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';
  const labelClass = 'block text-slate-600 dark:text-slate-400 mb-1';

  return (
    <div className="space-y-5 max-w-screen-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-slate-900 dark:text-white" style={{ fontWeight: 700, fontSize: 20 }}>Faculty & Staff</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-0.5" style={{ fontSize: 13 }}>Manage personnel records and medical history</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => exportRows(faculty, 'faculty-staff')}
            className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            style={{ fontSize: 13 }}
            title="Export CSV"
          >
            <Download size={15} />
            CSV
          </button>
          <button
            onClick={() => printRows(faculty, 'Faculty & Staff')}
            className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            style={{ fontSize: 13 }}
            title="Print faculty list"
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
            onClick={openAdd}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
            style={{ fontSize: 13 }}
          >
            <Plus size={15} />
            Add Faculty/Staff
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-700 dark:bg-slate-800/50">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search — upper left, grows to fill available width */}
            <div className="relative flex-1 min-w-[240px]">
              <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={localSearch}
                onFocus={() => setSearchOpen(true)}
                onChange={(e) => { setLocalSearch(e.target.value); setSearchOpen(true); }}
                placeholder="Search by name, ID, college, or designation..."
                className={`${fieldClass} pl-10 ${localSearch ? 'pr-9' : ''}`}
                style={{ fontSize: 13 }}
              />
              {localSearch && (
                <button type="button" onClick={() => { setLocalSearch(''); setSearchOpen(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-blue-600" title="Clear search" aria-label="Clear search">
                  <X size={15} />
                </button>
              )}

              {searchOpen && searchMatches.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1.5 rounded-xl border border-blue-100 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-800">
                  <p className="px-2 py-1 text-blue-700" style={{ fontSize: 12, fontWeight: 600 }}>
                    Matching personnel
                  </p>
                  <div className="grid gap-1">
                    {searchMatches.map((member) => (
                      <button
                        key={member.staffId}
                        onClick={() => { setViewMember(member); setLocalSearch(''); setSearchOpen(false); }}
                        className="flex items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-blue-50 dark:hover:bg-slate-700"
                      >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700" style={{ fontSize: 11, fontWeight: 700 }}>
                          {avatarInitials(member.name)}
                        </div>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-slate-800 dark:text-slate-100" style={{ fontSize: 13, fontWeight: 600 }}>{member.name}</span>
                          <span className="block truncate text-slate-500" style={{ fontSize: 12 }}>
                            {member.role || 'No designation'} · {normalizeCollegeName(member.college) || 'No college'}
                          </span>
                        </span>
                        <span className="whitespace-nowrap text-slate-400" style={{ fontSize: 12 }}>{member.staffId}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Filters — beside search, pushed to the right */}
            <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
              <label className="flex items-center gap-2 text-slate-500" style={{ fontSize: 12, fontWeight: 600 }}>
                <Filter size={14} />
                Classification
                <select
                  value={classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
                  style={{ fontSize: 12 }}
                >
                  <option value="">All classifications</option>
                  {CLASSIFICATIONS.map((c) => <option key={c.category} value={c.category}>{c.category}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 text-slate-500" style={{ fontSize: 12, fontWeight: 600 }}>
                Sort
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as SortOrder)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
                  style={{ fontSize: 12 }}
                >
                  <option value="name-asc">Name A-Z</option>
                  <option value="name-desc">Name Z-A</option>
                  <option value="id-asc">ID Asc</option>
                  <option value="id-desc">ID Desc</option>
                </select>
              </label>
              {classFilter && (
                <button
                  onClick={() => setClassFilter('')}
                  className="text-blue-600 hover:text-blue-700"
                  style={{ fontSize: 12, fontWeight: 600 }}
                >
                  Clear filter
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="px-4 pb-4">
          {facultyTable(visible, classFilter || 'All Personnel')}
        </div>
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={showModal}
        title={editingId ? 'Edit Faculty/Staff' : 'Add Faculty/Staff'}
        onClose={() => { setShowModal(false); setForm(defaultForm); setEditingId(null); }}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <label>
              <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Staff ID</span>
              <input
                value={form.staffId}
                onChange={(e) => setForm((f) => ({ ...f, staffId: e.target.value }))}
                placeholder="F001"
                className={fieldClass}
                style={{ fontSize: 13 }}
                required
                disabled={!!editingId}
              />
            </label>
            <label>
              <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Full Name</span>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Dr. Maria Santos"
                className={fieldClass}
                style={{ fontSize: 13 }}
                required
              />
            </label>
          </div>
          <label>
            <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>College</span>
            <select
              value={form.college}
              onChange={(e) => setForm((f) => ({ ...f, college: e.target.value }))}
              className={fieldClass}
              style={{ fontSize: 13 }}
            >
              <option value="">Not assigned to a college</option>
              {colleges.map((college) => (
                <option key={college.name} value={college.name}>{college.name}</option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label>
              <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Classification</span>
              <select
                value={form.employmentCategory}
                onChange={(e) => setForm((f) => ({ ...f, employmentCategory: e.target.value, employmentType: '' }))}
                className={fieldClass}
                style={{ fontSize: 13 }}
              >
                <option value="">Select classification</option>
                {CLASSIFICATIONS.map((c) => <option key={c.category} value={c.category}>{c.category}</option>)}
              </select>
            </label>
            <label>
              <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Employment Type</span>
              <select
                value={form.employmentType}
                onChange={(e) => setForm((f) => ({ ...f, employmentType: e.target.value }))}
                className={fieldClass}
                style={{ fontSize: 13 }}
                disabled={!form.employmentCategory}
              >
                <option value="">{form.employmentCategory ? 'Select type' : 'Select classification first'}</option>
                {typesForCategory(form.employmentCategory).map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label>
              <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Designation / Role</span>
              <input
                value={form.role}
                onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                placeholder="Clinic Physician"
                className={fieldClass}
                style={{ fontSize: 13 }}
              />
            </label>
            <label>
              <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Contact</span>
              <input
                value={form.contact}
                onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
                placeholder="09XX XXX XXXX"
                className={fieldClass}
                style={{ fontSize: 13 }}
              />
            </label>
          </div>
          <p className="mt-2 text-slate-500 uppercase tracking-wider" style={{ fontSize: 10, fontWeight: 700 }}>
            Clinic Consultation Record Info
          </p>
          <div className="grid grid-cols-2 gap-4">
            <label>
              <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Office</span>
              <input
                value={form.office}
                onChange={(e) => setForm((f) => ({ ...f, office: e.target.value }))}
                placeholder="Office / department"
                className={fieldClass}
                style={{ fontSize: 13 }}
              />
            </label>
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
          </div>
          <div className="grid grid-cols-2 gap-4">
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
            <label>
              <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Spouse / Next of Kin</span>
              <input
                value={form.guardianName}
                onChange={(e) => setForm((f) => ({ ...f, guardianName: e.target.value }))}
                placeholder="Full name"
                className={fieldClass}
                style={{ fontSize: 13 }}
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label>
              <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Spouse / Next of Kin Contact</span>
              <input
                value={form.guardianContact}
                onChange={(e) => setForm((f) => ({ ...f, guardianContact: e.target.value }))}
                placeholder="09XX XXX XXXX"
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
          <label>
            <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Present Address</span>
            <input
              value={form.presentAddress}
              onChange={(e) => setForm((f) => ({ ...f, presentAddress: e.target.value }))}
              placeholder="Current address"
              className={fieldClass}
              style={{ fontSize: 13 }}
            />
          </label>
          <label>
            <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Medical History</span>
            <textarea
              value={form.medicalHistory}
              onChange={(e) => setForm((f) => ({ ...f, medicalHistory: e.target.value }))}
              placeholder="Known conditions, allergies, or notes."
              className={`${fieldClass} resize-none`}
              rows={3}
              style={{ fontSize: 13 }}
            />
          </label>

          {editingId ? (
            <PersonDocuments ownerType="faculty" ownerId={editingId} showToast={showToast} canEdit />
          ) : (
            <p className="rounded-lg bg-slate-50 dark:bg-slate-700/40 px-3 py-2.5 text-slate-400" style={{ fontSize: 12 }}>
              Save this record first, then edit it to attach files.
            </p>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => { setShowModal(false); setForm(defaultForm); setEditingId(null); }}
              className="bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
              style={{ fontSize: 13 }}
            >
              Cancel
            </button>
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors" style={{ fontSize: 13 }}>
              {editingId ? 'Update' : 'Save'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={showImportModal}
        title="Import CSV"
        onClose={() => setShowImportModal(false)}
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center dark:border-slate-700 dark:bg-slate-800/60">
            <Upload size={28} className="mx-auto mb-3 text-slate-300" />
            <p className="text-slate-900 dark:text-slate-100" style={{ fontSize: 15, fontWeight: 600 }}>Import CSV</p>
            <p className="text-slate-500 dark:text-slate-400 mt-1" style={{ fontSize: 12 }}>Upload a CSV file to add or update personnel records.</p>
            <input ref={csvInputRef} type="file" accept=".csv,text/csv" onChange={handleCsvFile} className="mt-4 block w-full text-sm text-slate-500 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-white hover:file:bg-blue-700" />
            {csvFileName && <p className="mt-2 text-slate-500" style={{ fontSize: 12 }}>{csvFileName}</p>}
          </div>

          {pendingCsv.length > 0 && (
            <div className="rounded-xl border border-green-100 bg-green-50 p-3 dark:border-green-900/40 dark:bg-green-900/20">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-300" style={{ fontSize: 12, fontWeight: 600 }}>
                <CheckCircle2 size={16} />
                {pendingCsv.length} valid record{pendingCsv.length !== 1 ? 's' : ''} ready to import
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowImportModal(false)} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300" style={{ fontSize: 13 }}>
              Cancel
            </button>
            <button type="button" onClick={handleCsvImport} className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700" style={{ fontSize: 13 }}>
              Import {pendingCsv.length > 0 ? `${pendingCsv.length} records` : ''}
            </button>
          </div>
        </div>
      </Modal>

      {/* View Modal */}
      <Modal
        isOpen={!!viewMember}
        title="Personnel Profile"
        onClose={() => setViewMember(null)}
      >
        {viewMember && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center shrink-0"
                style={{ fontSize: 16, fontWeight: 700 }}
              >
                {avatarInitials(viewMember.name)}
              </div>
              <div>
                <p className="text-slate-900" style={{ fontSize: 15, fontWeight: 600 }}>{viewMember.name}</p>
                <p className="text-slate-500" style={{ fontSize: 12 }}>
                  {viewMember.staffId} • {viewMember.role || 'No role assigned'}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                ['College', viewMember.college],
                ['Designation', viewMember.role],
                ['Classification', [viewMember.employmentCategory, viewMember.employmentType].filter(Boolean).join(' · ')],
                ['Contact', viewMember.contact],
                ['Office', viewMember.office],
                ['Birthdate', viewMember.birthdate],
                ['Blood Type', viewMember.bloodType],
                ['Spouse / Next of Kin', viewMember.guardianName],
                ['Kin Contact', viewMember.guardianContact],
                ['Home Address', viewMember.homeAddress],
                ['Present Address', viewMember.presentAddress],
              ].map(([k, v]) => (
                <div key={k} className="bg-slate-50 dark:bg-slate-700/40 rounded-lg p-3">
                  <p className="text-slate-400" style={{ fontSize: 11, fontWeight: 500 }}>{k}</p>
                  <p className="text-slate-700 dark:text-slate-200" style={{ fontSize: 13 }}>{v || '—'}</p>
                </div>
              ))}
            </div>
            <div className="bg-slate-50 dark:bg-slate-700/40 rounded-lg p-3">
              <p className="text-slate-400 mb-1" style={{ fontSize: 11, fontWeight: 500 }}>Medical History</p>
              <p className="text-slate-700 dark:text-slate-200" style={{ fontSize: 13 }}>{viewMember.medicalHistory || 'No entries'}</p>
            </div>

            {/* Documents & files */}
            <PersonDocuments ownerType="faculty" ownerId={viewMember.staffId} showToast={showToast} />

            <div className="flex justify-end">
              <button
                onClick={() => { openEdit(viewMember); setViewMember(null); }}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                style={{ fontSize: 13 }}
              >
                Edit record
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
