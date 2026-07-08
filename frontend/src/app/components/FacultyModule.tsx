import { useState, useMemo } from 'react';
import { Plus, Search, Pencil, Eye, X } from 'lucide-react';
import { FacultyMember } from '../App';
import { Modal } from './Modal';

type Props = {
  faculty: FacultyMember[];
  setFaculty: React.Dispatch<React.SetStateAction<FacultyMember[]>>;
  globalSearch: string;
  showToast: (m: string) => void;
  addActivity: (m: string) => void;
};

const defaultForm = { staffId: '', name: '', role: '', contact: '', medicalHistory: '' };

function avatarInitials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((s) => s[0]).join('').toUpperCase();
}

export function FacultyModule({ faculty, setFaculty, globalSearch, showToast, addActivity }: Props) {
  const [localSearch, setLocalSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [viewMember, setViewMember] = useState<FacultyMember | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  const query = (localSearch || globalSearch).trim().toLowerCase();
  const visible = useMemo(
    () =>
      faculty.filter((f) =>
        [f.staffId, f.name, f.role, f.contact, f.medicalHistory]
          .join(' ')
          .toLowerCase()
          .includes(query),
      ),
    [faculty, query],
  );

  function openAdd() {
    setForm(defaultForm);
    setEditingId(null);
    setShowModal(true);
  }

  function openEdit(f: FacultyMember) {
    setForm({ staffId: f.staffId, name: f.name, role: f.role, contact: f.contact, medicalHistory: f.medicalHistory });
    setEditingId(f.staffId);
    setShowModal(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const rec: FacultyMember = {
      staffId: form.staffId.trim(),
      name: form.name.trim(),
      role: form.role.trim(),
      contact: form.contact.trim(),
      medicalHistory: form.medicalHistory.trim(),
    };
    if (!rec.staffId || !rec.name) { showToast('ID and name required'); return; }

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

  const fieldClass = 'w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';
  const labelClass = 'block text-slate-600 dark:text-slate-400 mb-1';

  return (
    <div className="space-y-5 max-w-screen-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-slate-900 dark:text-white" style={{ fontWeight: 700, fontSize: 20 }}>Faculty & Staff</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-0.5" style={{ fontSize: 13 }}>Manage personnel records and medical history</p>
        </div>
        <button
          onClick={openAdd}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 shrink-0"
          style={{ fontSize: 13 }}
        >
          <Plus size={15} />
          Add Faculty/Staff
        </button>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center gap-4 dark:bg-slate-800/50">
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

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
                {['ID', 'Name & Role', 'Contact', 'Medical History', 'Actions'].map((h) => (
                  <th
                    key={h}
                    className="text-left px-5 py-3 text-slate-500 uppercase tracking-wider"
                    style={{ fontSize: 11, fontWeight: 600 }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-slate-400" style={{ fontSize: 13 }}>
                    No faculty/staff match your search
                  </td>
                </tr>
              ) : (
                visible.map((f) => (
                  <tr key={f.staffId} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="px-5 py-3.5 text-slate-600" style={{ fontSize: 13 }}>
                      {f.staffId}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-8 h-8 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center shrink-0"
                          style={{ fontSize: 11, fontWeight: 700 }}
                        >
                          {avatarInitials(f.name)}
                        </div>
                        <div>
                          <p className="text-slate-800" style={{ fontSize: 13, fontWeight: 500 }}>{f.name}</p>
                          <p className="text-slate-400" style={{ fontSize: 11 }}>{f.role || '—'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600" style={{ fontSize: 13 }}>
                      {f.contact || '—'}
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 max-w-[200px] truncate" style={{ fontSize: 13 }}>
                      {f.medicalHistory || 'None recorded'}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setViewMember(f)}
                          className="p-1.5 rounded-md hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"
                          title="View"
                        >
                          <Eye size={14} />
                        </button>
                        <button
                          onClick={() => openEdit(f)}
                          className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                          title="Edit"
                        >
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
          <div className="grid grid-cols-2 gap-4">
            <label>
              <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Role</span>
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
                ['Role', viewMember.role],
                ['Contact', viewMember.contact],
              ].map(([k, v]) => (
                <div key={k} className="bg-slate-50 dark:bg-slate-700/40 rounded-lg p-3">
                  <p className="text-slate-400" style={{ fontSize: 11, fontWeight: 500 }}>{k}</p>
                  <p className="text-slate-700" style={{ fontSize: 13 }}>{v || '—'}</p>
                </div>
              ))}
            </div>
            <div className="bg-slate-50 dark:bg-slate-700/40 rounded-lg p-3">
              <p className="text-slate-400 mb-1" style={{ fontSize: 11, fontWeight: 500 }}>Medical History</p>
              <p className="text-slate-700" style={{ fontSize: 13 }}>{viewMember.medicalHistory || 'No entries'}</p>
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
