import { useState, useMemo } from 'react';
import { Plus, Eye } from 'lucide-react';
import { MedRecord } from '../App';
import { Modal } from './Modal';

type Props = {
  records: MedRecord[];
  setRecords: React.Dispatch<React.SetStateAction<MedRecord[]>>;
  globalSearch: string;
  showToast: (m: string) => void;
  addActivity: (m: string) => void;
};

const defaultForm = { studentId: '', name: '', summary: '', date: '' };

export function MedicalRecordsModule({ records, setRecords, globalSearch, showToast, addActivity }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [viewRec, setViewRec] = useState<MedRecord | null>(null);
  const [form, setForm] = useState(defaultForm);

  const query = globalSearch.trim().toLowerCase();
  const visible = useMemo(
    () => records.filter((r) => [r.id, r.studentId, r.name, r.summary, r.date].join(' ').toLowerCase().includes(query)),
    [records, query],
  );

  function openAdd() {
    setForm({ ...defaultForm, date: new Date().toISOString().slice(0, 10) });
    setShowModal(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.studentId.trim()) { showToast('Student ID required'); return; }
    const rec: MedRecord = {
      id: String(Date.now()),
      studentId: form.studentId.trim(),
      name: form.name.trim(),
      summary: form.summary.trim(),
      date: form.date,
    };
    setRecords((prev) => [...prev, rec]);
    showToast('Medical record saved');
    addActivity(`Medical record added for ${form.name || form.studentId}`);
    setShowModal(false);
    setForm(defaultForm);
  }

  const fieldClass = 'w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';
  const labelClass = 'block text-slate-600 dark:text-slate-400 mb-1';

  return (
    <div className="space-y-5 max-w-screen-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-slate-900 dark:text-white" style={{ fontWeight: 700, fontSize: 20 }}>Student Medical Records</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-0.5" style={{ fontSize: 13 }}>Create and manage clinical records attached to student profiles</p>
        </div>
        <button onClick={openAdd} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 shrink-0" style={{ fontSize: 13 }}>
          <Plus size={15} />New record
        </button>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700">
          <p className="text-slate-400" style={{ fontSize: 12 }}>{visible.length} record{visible.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
                {['Record ID', 'Student ID', 'Name', 'Summary', 'Date', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-slate-500 uppercase tracking-wider" style={{ fontSize: 11, fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {visible.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400" style={{ fontSize: 13 }}>No medical records found</td></tr>
              ) : (
                visible.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="px-5 py-3.5 text-slate-500" style={{ fontSize: 12 }}>{r.id.slice(-6)}</td>
                    <td className="px-5 py-3.5 text-slate-600" style={{ fontSize: 13 }}>{r.studentId}</td>
                    <td className="px-5 py-3.5 text-slate-800" style={{ fontSize: 13, fontWeight: 500 }}>{r.name || '—'}</td>
                    <td className="px-5 py-3.5 text-slate-500 max-w-[200px] truncate" style={{ fontSize: 13 }}>{r.summary}</td>
                    <td className="px-5 py-3.5 text-slate-600 whitespace-nowrap" style={{ fontSize: 13 }}>{r.date}</td>
                    <td className="px-5 py-3.5">
                      <button onClick={() => setViewRec(r)} className="p-1.5 rounded-md hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"><Eye size={14} /></button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={showModal} title="New Medical Record" onClose={() => setShowModal(false)}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <label><span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Student ID</span><input value={form.studentId} onChange={(e) => setForm((f) => ({ ...f, studentId: e.target.value }))} placeholder="000001" className={fieldClass} style={{ fontSize: 13 }} required /></label>
            <label><span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Student Name</span><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Full name" className={fieldClass} style={{ fontSize: 13 }} /></label>
          </div>
          <label><span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Summary</span><textarea value={form.summary} onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))} placeholder="Clinical summary and findings…" className={`${fieldClass} resize-none`} rows={3} style={{ fontSize: 13 }} required /></label>
          <label><span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Date</span><input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className={fieldClass} style={{ fontSize: 13 }} required /></label>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowModal(false)} className="bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors" style={{ fontSize: 13 }}>Cancel</button>
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors" style={{ fontSize: 13 }}>Save</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!viewRec} title="Medical Record" onClose={() => setViewRec(null)}>
        {viewRec && (
          <div className="space-y-3">
            {[['Record ID', viewRec.id.slice(-6)], ['Student ID', viewRec.studentId], ['Name', viewRec.name], ['Date', viewRec.date]].map(([k, v]) => (
              <div key={k} className="bg-slate-50 dark:bg-slate-700/40 rounded-lg p-3">
                <p className="text-slate-400" style={{ fontSize: 11, fontWeight: 500 }}>{k}</p>
                <p className="text-slate-700" style={{ fontSize: 13 }}>{v || '—'}</p>
              </div>
            ))}
            <div className="bg-slate-50 dark:bg-slate-700/40 rounded-lg p-3">
              <p className="text-slate-400 mb-1" style={{ fontSize: 11, fontWeight: 500 }}>Summary</p>
              <p className="text-slate-700" style={{ fontSize: 13 }}>{viewRec.summary}</p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
