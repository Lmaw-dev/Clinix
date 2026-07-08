import { useState, useMemo } from 'react';
import { Plus, Eye, CheckCircle2 } from 'lucide-react';
import { Certificate } from '../App';
import { Modal } from './Modal';

type Props = {
  certificates: Certificate[];
  setCertificates: React.Dispatch<React.SetStateAction<Certificate[]>>;
  globalSearch: string;
  showToast: (m: string) => void;
  addActivity: (m: string) => void;
};

const defaultForm = { studentId: '', studentName: '', date: '' };

function nextCertId(certs: Certificate[]) {
  const max = certs.reduce((m, c) => Math.max(m, Number(c.id) || 0), 0);
  return String(max + 1).padStart(4, '0');
}

function StatusBadge({ status }: { status: string }) {
  const style = status === 'Approved'
    ? 'bg-green-100 text-green-700'
    : status === 'Rejected'
    ? 'bg-red-100 text-red-700'
    : 'bg-amber-100 text-amber-700';
  return <span className={`px-2 py-0.5 rounded-full ${style}`} style={{ fontSize: 11, fontWeight: 500 }}>{status}</span>;
}

export function CertificatesModule({ certificates, setCertificates, globalSearch, showToast, addActivity }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [viewCert, setViewCert] = useState<Certificate | null>(null);
  const [form, setForm] = useState(defaultForm);

  const query = globalSearch.trim().toLowerCase();
  const visible = useMemo(
    () => certificates.filter((c) => [c.id, c.studentId, c.studentName, c.status, c.date].join(' ').toLowerCase().includes(query)),
    [certificates, query],
  );

  function openAdd() {
    setForm({ ...defaultForm, date: new Date().toISOString().slice(0, 10) });
    setShowModal(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.studentId.trim()) { showToast('Student ID required'); return; }
    const rec: Certificate = {
      id: nextCertId(certificates),
      studentId: form.studentId.trim(),
      studentName: form.studentName.trim(),
      date: form.date,
      status: 'Pending',
    };
    setCertificates((prev) => [...prev, rec]);
    showToast('Certificate request created');
    addActivity(`Certificate requested for ${form.studentName || form.studentId}`);
    setShowModal(false);
    setForm(defaultForm);
  }

  function handleApprove(id: string) {
    const cert = certificates.find((c) => c.id === id);
    setCertificates((prev) => prev.map((c) => c.id === id ? { ...c, status: 'Approved' } : c));
    showToast('Certificate approved');
    if (cert) addActivity(`Certificate approved for ${cert.studentName || cert.studentId}`);
    setViewCert(null);
  }

  const fieldClass = 'w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';
  const labelClass = 'block text-slate-600 dark:text-slate-400 mb-1';
  const pending = certificates.filter((c) => c.status === 'Pending').length;

  return (
    <div className="space-y-5 max-w-screen-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-slate-900 dark:text-white" style={{ fontWeight: 700, fontSize: 20 }}>Medical Certificate Requests</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-0.5" style={{ fontSize: 13 }}>Manage certificate requests from students</p>
        </div>
        <button onClick={openAdd} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 shrink-0" style={{ fontSize: 13 }}>
          <Plus size={15} />New Request
        </button>
      </div>

      {pending > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <CheckCircle2 size={16} className="text-amber-600 shrink-0" />
          <p className="text-amber-700" style={{ fontSize: 13 }}>{pending} pending request{pending !== 1 ? 's' : ''} awaiting approval</p>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700">
          <p className="text-slate-400" style={{ fontSize: 12 }}>{visible.length} request{visible.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
                {['Req ID', 'Student', 'Date', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-slate-500 uppercase tracking-wider" style={{ fontSize: 11, fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {visible.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-12 text-slate-400" style={{ fontSize: 13 }}>No certificate requests</td></tr>
              ) : (
                visible.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="px-5 py-3.5 text-slate-500" style={{ fontSize: 12, fontFamily: 'monospace' }}>{c.id}</td>
                    <td className="px-5 py-3.5">
                      <p className="text-slate-800" style={{ fontSize: 13, fontWeight: 500 }}>{c.studentName || '—'}</p>
                      <p className="text-slate-400" style={{ fontSize: 11 }}>ID: {c.studentId}</p>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 whitespace-nowrap" style={{ fontSize: 13 }}>{c.date}</td>
                    <td className="px-5 py-3.5"><StatusBadge status={c.status} /></td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setViewCert(c)} className="p-1.5 rounded-md hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"><Eye size={14} /></button>
                        {c.status === 'Pending' && (
                          <button onClick={() => handleApprove(c.id)} className="px-2.5 py-1 rounded-md bg-green-50 text-green-600 hover:bg-green-100 transition-colors" style={{ fontSize: 11, fontWeight: 500 }}>Approve</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={showModal} title="Medical Certificate Request" onClose={() => setShowModal(false)}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <label><span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Student ID</span><input value={form.studentId} onChange={(e) => setForm((f) => ({ ...f, studentId: e.target.value }))} placeholder="000001" className={fieldClass} style={{ fontSize: 13 }} required /></label>
            <label><span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Student Name</span><input value={form.studentName} onChange={(e) => setForm((f) => ({ ...f, studentName: e.target.value }))} placeholder="Full name" className={fieldClass} style={{ fontSize: 13 }} /></label>
          </div>
          <label><span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Request Date</span><input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className={fieldClass} style={{ fontSize: 13 }} required /></label>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowModal(false)} className="bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors" style={{ fontSize: 13 }}>Cancel</button>
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors" style={{ fontSize: 13 }}>Submit Request</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!viewCert} title="Certificate Request Details" onClose={() => setViewCert(null)}>
        {viewCert && (
          <div className="space-y-3">
            {[['Request ID', viewCert.id], ['Student ID', viewCert.studentId], ['Student Name', viewCert.studentName], ['Date', viewCert.date]].map(([k, v]) => (
              <div key={k} className="bg-slate-50 dark:bg-slate-700/40 rounded-lg p-3">
                <p className="text-slate-400" style={{ fontSize: 11, fontWeight: 500 }}>{k}</p>
                <p className="text-slate-700" style={{ fontSize: 13 }}>{v || '—'}</p>
              </div>
            ))}
            <div className="bg-slate-50 rounded-lg p-3 flex items-center gap-2">
              <p className="text-slate-400" style={{ fontSize: 11, fontWeight: 500 }}>Status</p>
              <StatusBadge status={viewCert.status} />
            </div>
            {viewCert.status === 'Pending' && (
              <div className="flex justify-end">
                <button onClick={() => handleApprove(viewCert.id)} className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors" style={{ fontSize: 13 }}>Approve Request</button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
