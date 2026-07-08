import { useState, useMemo } from 'react';
import { Plus, Eye } from 'lucide-react';
import { Visit } from '../App';
import { Modal } from './Modal';

type Props = {
  visits: Visit[];
  setVisits: React.Dispatch<React.SetStateAction<Visit[]>>;
  globalSearch: string;
  showToast: (m: string) => void;
  addActivity: (m: string) => void;
};

const defaultForm = { studentId: '', studentName: '', reason: '', date: '', staff: 'Nurse' };

function nextVisitId(visits: Visit[]) {
  const max = visits.reduce((m, v) => Math.max(m, Number(v.id) || 0), 0);
  return String(max + 1).padStart(4, '0');
}

export function VisitsModule({ visits, setVisits, globalSearch, showToast, addActivity }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [viewVisit, setViewVisit] = useState<Visit | null>(null);
  const [form, setForm] = useState(defaultForm);

  const query = globalSearch.trim().toLowerCase();
  const visible = useMemo(
    () => visits.filter((v) => [v.id, v.studentId, v.studentName, v.reason, v.date, v.staff].join(' ').toLowerCase().includes(query)),
    [visits, query],
  );

  function openAdd() {
    setForm({ ...defaultForm, date: new Date().toISOString().slice(0, 10) });
    setShowModal(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.studentId.trim()) { showToast('Student ID required'); return; }
    const rec: Visit = {
      id: nextVisitId(visits),
      studentId: form.studentId.trim(),
      studentName: form.studentName.trim(),
      reason: form.reason.trim(),
      date: form.date,
      staff: form.staff.trim() || 'Nurse',
    };
    setVisits((prev) => [...prev, rec]);
    showToast('Visit logged');
    addActivity(`Visit logged for ${form.studentName || form.studentId}`);
    setShowModal(false);
    setForm(defaultForm);
  }

  const fieldClass = 'w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';
  const labelClass = 'block text-slate-600 dark:text-slate-400 mb-1';

  return (
    <div className="space-y-5 max-w-screen-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-slate-900 dark:text-white" style={{ fontWeight: 700, fontSize: 20 }}>Visit / History</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-0.5" style={{ fontSize: 13 }}>Track clinic visits, diagnoses, and outcomes</p>
        </div>
        <button onClick={openAdd} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 shrink-0" style={{ fontSize: 13 }}>
          <Plus size={15} />Log Visit
        </button>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700">
          <p className="text-slate-400" style={{ fontSize: 12 }}>{visible.length} visit{visible.length !== 1 ? 's' : ''} recorded</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
                {['Visit ID', 'Student', 'Date', 'Reason', 'Staff', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-slate-500 uppercase tracking-wider" style={{ fontSize: 11, fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {visible.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400" style={{ fontSize: 13 }}>No visits logged</td></tr>
              ) : (
                visible.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="px-5 py-3.5 text-slate-500" style={{ fontSize: 12, fontFamily: 'monospace' }}>{v.id}</td>
                    <td className="px-5 py-3.5">
                      <p className="text-slate-800" style={{ fontSize: 13, fontWeight: 500 }}>{v.studentName || '—'}</p>
                      <p className="text-slate-400" style={{ fontSize: 11 }}>ID: {v.studentId}</p>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 whitespace-nowrap" style={{ fontSize: 13 }}>{v.date}</td>
                    <td className="px-5 py-3.5 text-slate-600 max-w-[180px] truncate" style={{ fontSize: 13 }}>{v.reason}</td>
                    <td className="px-5 py-3.5 text-slate-600" style={{ fontSize: 13 }}>{v.staff}</td>
                    <td className="px-5 py-3.5">
                      <button onClick={() => setViewVisit(v)} className="p-1.5 rounded-md hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"><Eye size={14} /></button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={showModal} title="Log Visit" onClose={() => setShowModal(false)}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <label><span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Student ID</span><input value={form.studentId} onChange={(e) => setForm((f) => ({ ...f, studentId: e.target.value }))} placeholder="000001" className={fieldClass} style={{ fontSize: 13 }} required /></label>
            <label><span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Student Name</span><input value={form.studentName} onChange={(e) => setForm((f) => ({ ...f, studentName: e.target.value }))} placeholder="Full name" className={fieldClass} style={{ fontSize: 13 }} /></label>
          </div>
          <label><span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Reason for Visit</span><input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Headache, fever, checkup…" className={fieldClass} style={{ fontSize: 13 }} required /></label>
          <div className="grid grid-cols-2 gap-4">
            <label><span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Date</span><input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className={fieldClass} style={{ fontSize: 13 }} required /></label>
            <label><span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Attending Staff</span><input value={form.staff} onChange={(e) => setForm((f) => ({ ...f, staff: e.target.value }))} placeholder="Nurse" className={fieldClass} style={{ fontSize: 13 }} /></label>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowModal(false)} className="bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors" style={{ fontSize: 13 }}>Cancel</button>
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors" style={{ fontSize: 13 }}>Save</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!viewVisit} title="Visit Details" onClose={() => setViewVisit(null)}>
        {viewVisit && (
          <div className="space-y-3">
            {[['Visit ID', viewVisit.id], ['Student ID', viewVisit.studentId], ['Student Name', viewVisit.studentName], ['Date', viewVisit.date], ['Reason', viewVisit.reason], ['Attending Staff', viewVisit.staff]].map(([k, v]) => (
              <div key={k} className="bg-slate-50 dark:bg-slate-700/40 rounded-lg p-3">
                <p className="text-slate-400" style={{ fontSize: 11, fontWeight: 500 }}>{k}</p>
                <p className="text-slate-700" style={{ fontSize: 13 }}>{v || '—'}</p>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
