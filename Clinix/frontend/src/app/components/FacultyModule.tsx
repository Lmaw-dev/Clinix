import { useState, useMemo, useRef } from 'react';
import { Plus, Search, Pencil, Eye, Folder, ChevronRight, Filter, List, Upload, Download, Printer, CheckCircle2 } from 'lucide-react';
import { FacultyMember } from '../App';
import { Modal } from './Modal';

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4001/api').replace(/\/$/, '');

type Props = {
  faculty: FacultyMember[];
  setFaculty: React.Dispatch<React.SetStateAction<FacultyMember[]>>;
  globalSearch: string;
  showToast: (m: string) => void;
  addActivity: (m: string) => void;
};

const COLLEGES = [
  { name: 'CTECH', courses: ['BSCS', 'BSIT-FPST', 'BSIT-ELECT'] },
  { name: 'CTE', courses: ['BEED', 'BSED-ENGLISH', 'BSED-MATH'] },
  { name: 'COM', courses: ['BSM'] },
  { name: 'COF', courses: ['BSF'] },
];

type FolderMode = 'colleges' | 'designations';
type FolderLayout = 'list' | 'icon';
type FolderSort = 'name-asc' | 'name-desc' | 'id-asc' | 'id-desc';

type FolderGroup = {
  key: string;
  title: string;
  members: FacultyMember[];
  subtext: string;
};

const defaultForm = { staffId: '', name: '', college: '', role: '', contact: '', medicalHistory: '' };

type CsvRecord = Record<string, string>;

function avatarInitials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase();
}

function normalizeCollegeName(college?: string) {
  const raw = (college || '').trim();
  if (!raw) return '';
  return COLLEGES.find((c) => c.name.toLowerCase() === raw.toLowerCase())?.name || raw.toUpperCase();
}

function sortFaculty(rows: FacultyMember[], sort: FolderSort) {
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
  const headers = ['Staff ID', 'Name', 'College', 'Role', 'Contact', 'Medical History'];
  const csv = [headers, ...rows.map((row) => [row.staffId, row.name, row.college || '', row.role, row.contact, row.medicalHistory])]
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
  const [localSearch, setLocalSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [viewMember, setViewMember] = useState<FacultyMember | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [folderMode, setFolderMode] = useState<FolderMode>('colleges');
  const [folderLayout, setFolderLayout] = useState<FolderLayout>('list');
  const [folderSort, setFolderSort] = useState<FolderSort>('name-asc');
  const [folderFilter, setFolderFilter] = useState<string | null>(null);
  const [pendingCsv, setPendingCsv] = useState<FacultyMember[]>([]);
  const [csvFileName, setCsvFileName] = useState('');
  const csvInputRef = useRef<HTMLInputElement>(null);

  const query = (localSearch || globalSearch).trim().toLowerCase();
  const visible = useMemo(
    () =>
      faculty.filter((f) =>
        [f.staffId, f.name, f.college, f.role, f.contact, f.medicalHistory]
          .join(' ')
          .toLowerCase()
          .includes(query),
      ),
    [faculty, query],
  );

  const folderGroups = useMemo<FolderGroup[]>(() => {
    if (folderMode === 'colleges') {
      return COLLEGES.map((college) => {
        const members = visible.filter((f) => normalizeCollegeName(f.college) === college.name);
        return {
          key: college.name,
          title: college.name,
          members,
          subtext: members.length
            ? [...new Set(members.map((m) => m.role).filter(Boolean))].join(', ')
            : college.courses.join(', '),
        };
      })
        .filter((group) => group.members.length > 0)
        .sort((a, b) => {
          switch (folderSort) {
            case 'name-desc':
              return b.title.localeCompare(a.title);
            case 'id-asc':
              return (a.members[0]?.staffId || a.title).localeCompare(b.members[0]?.staffId || b.title, undefined, { numeric: true });
            case 'id-desc':
              return (b.members[0]?.staffId || b.title).localeCompare(a.members[0]?.staffId || a.title, undefined, { numeric: true });
            case 'name-asc':
            default:
              return a.title.localeCompare(b.title);
          }
        });
    }

    const byRole = new Map<string, FacultyMember[]>();
    visible.forEach((member) => {
      const role = member.role.trim() || 'Unspecified';
      if (!byRole.has(role)) byRole.set(role, []);
      byRole.get(role)!.push(member);
    });

    return [...byRole.entries()]
      .map(([title, members]) => ({
        key: title,
        title,
        members,
        subtext: [...new Set(members.map((m) => normalizeCollegeName(m.college) || 'No college'))].join(' · '),
      }))
      .sort((a, b) => {
        switch (folderSort) {
          case 'name-desc':
            return b.title.localeCompare(a.title);
          case 'id-asc':
            return (a.members[0]?.staffId || a.title).localeCompare(b.members[0]?.staffId || b.title, undefined, { numeric: true });
          case 'id-desc':
            return (b.members[0]?.staffId || b.title).localeCompare(a.members[0]?.staffId || a.title, undefined, { numeric: true });
          case 'name-asc':
          default:
            return a.title.localeCompare(b.title);
        }
      });
  }, [visible, folderMode, folderSort]);

  const selectedMembers = useMemo(() => {
    if (!folderFilter) return [];
    if (folderMode === 'colleges') {
      return visible.filter((f) => normalizeCollegeName(f.college) === folderFilter);
    }
    return visible.filter((f) => (f.role.trim() || 'Unspecified') === folderFilter);
  }, [visible, folderFilter, folderMode]);

  function openAdd() {
    setForm(defaultForm);
    setEditingId(null);
    setShowModal(true);
  }

  function openEdit(f: FacultyMember) {
    setForm({ staffId: f.staffId, name: f.name, college: f.college || '', role: f.role, contact: f.contact, medicalHistory: f.medicalHistory });
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
    const sortedRows = sortFaculty(rows, folderSort);
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
                {['ID', 'Name & Designation', 'College', 'Contact', 'Medical History', 'Actions'].map((h) => (
                  <th key={h} className="whitespace-nowrap px-5 py-3 text-left text-slate-500 uppercase tracking-wider" style={{ fontSize: 11, fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400" style={{ fontSize: 13 }}>No personnel match this folder</td>
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
        <div className="space-y-4 border-b border-slate-100 px-5 py-4 dark:border-slate-700 dark:bg-slate-800/50">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-slate-800 dark:text-slate-100" style={{ fontSize: 14, fontWeight: 600 }}>Personnel Records</p>
              <p className="text-slate-400" style={{ fontSize: 12 }}>{visible.length} record{visible.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="relative ml-auto max-w-xs w-full">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                placeholder="Search faculty/staff…"
                className={`${fieldClass} pl-9`}
                style={{ fontSize: 13 }}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-slate-500" style={{ fontSize: 12, fontWeight: 600 }}>
              <Filter size={14} />
              View
              <select
                value={folderMode}
                onChange={(e) => {
                  setFolderMode(e.target.value as FolderMode);
                  setFolderFilter(null);
                }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
                style={{ fontSize: 12 }}
              >
                <option value="colleges">Colleges</option>
                <option value="designations">Designations</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-slate-500" style={{ fontSize: 12, fontWeight: 600 }}>
              <List size={14} />
              Layout
              <select
                value={folderLayout}
                onChange={(e) => setFolderLayout(e.target.value as FolderLayout)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
                style={{ fontSize: 12 }}
              >
                <option value="list">List</option>
                <option value="icon">Icon</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-slate-500" style={{ fontSize: 12, fontWeight: 600 }}>
              <Filter size={14} />
              Sort
              <select
                value={folderSort}
                onChange={(e) => setFolderSort(e.target.value as FolderSort)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
                style={{ fontSize: 12 }}
              >
                <option value="name-asc">Name A-Z</option>
                <option value="name-desc">Name Z-A</option>
                <option value="id-asc">ID Asc</option>
                <option value="id-desc">ID Desc</option>
              </select>
            </label>
          </div>
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-1 border-b border-slate-100 px-5 py-3 text-slate-600 dark:border-slate-700 dark:text-slate-300">
            <button onClick={() => setFolderFilter(null)} className="hover:text-blue-700" style={{ fontSize: 13, fontWeight: 600 }}>
              Personnel
            </button>
            {folderFilter && (
              <>
                <ChevronRight size={14} />
                <span className="text-blue-700" style={{ fontSize: 13, fontWeight: 700 }}>{folderFilter}</span>
              </>
            )}
          </div>

          {!folderFilter ? (
            <div className={folderLayout === 'icon' ? 'grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4' : 'divide-y divide-slate-100 dark:divide-slate-700'}>
              {folderGroups.map((group) => {
                const itemClass = `w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors border-slate-200 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700/50 ${folderLayout === 'icon' ? 'min-h-32 flex-col items-start justify-center' : ''}`;
                return (
                  <div key={group.key} className={folderLayout === 'icon' ? 'min-w-0' : 'px-4 py-3'}>
                    <button onClick={() => setFolderFilter(group.key)} className={itemClass}>
                      <Folder size={folderLayout === 'icon' ? 34 : 24} className="shrink-0 text-blue-600" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-slate-800 dark:text-slate-100" style={{ fontSize: 14, fontWeight: 700 }}>{group.title}</span>
                        <span className="block truncate text-slate-500" style={{ fontSize: 12 }}>{group.subtext || 'No details'}</span>
                      </span>
                      <span className="whitespace-nowrap text-slate-500" style={{ fontSize: 13 }}>{group.members.length} personnel</span>
                    </button>
                  </div>
                );
              })}
              {folderGroups.length === 0 && (
                <div className="px-5 py-12 text-center text-slate-400" style={{ fontSize: 13 }}>
                  No personnel folders available for this view
                </div>
              )}
            </div>
          ) : (
            facultyTable(selectedMembers, `${folderMode === 'colleges' ? 'College' : 'Designation'} / ${folderFilter}`)
          )}
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
              {COLLEGES.map((college) => (
                <option key={college.name} value={college.name}>{college.name}</option>
              ))}
            </select>
          </label>
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
                ['Contact', viewMember.contact],
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
