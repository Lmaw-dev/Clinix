import { useState, useMemo } from 'react';
import { Plus, Eye, Search, X, UserRound } from 'lucide-react';
import { Consultation, Student } from '../App';
import { Modal } from './Modal';

type Props = {
  consultations: Consultation[];
  setConsultations: React.Dispatch<React.SetStateAction<Consultation[]>>;
  students: Student[];
  globalSearch: string;
  showToast: (m: string) => void;
  addActivity: (m: string) => void;
};

const defaultForm = {
  date: '', time: '', studentId: '', studentName: '',
  age: '', sex: '', courseOrOffice: '', chiefComplaint: '', management: '',
};

function ageFromBirthdate(bd?: string) {
  if (!bd) return '';
  const d = new Date(bd);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 130 ? String(age) : '';
}

export function ConsultationsModule({ consultations, setConsultations, students, globalSearch, showToast, addActivity }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [viewConsult, setViewConsult] = useState<Consultation | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentOpen, setStudentOpen] = useState(false);

  const studentMatches = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return [];
    return students
      .filter((s) => [s.name, s.studentId, s.course, s.yearLevel].join(' ').toLowerCase().includes(q))
      .slice(0, 8);
  }, [students, studentSearch]);

  const query = globalSearch.trim().toLowerCase();
  const visible = useMemo(
    () => consultations.filter((c) =>
      [c.id, c.studentId, c.studentName, c.date, c.time, c.age, c.sex, c.courseOrOffice, c.chiefComplaint, c.management, c.reason, c.summary, c.outcome]
        .join(' ').toLowerCase().includes(query),
    ),
    [consultations, query],
  );

  function openAdd() {
    const now = new Date();
    setForm({ ...defaultForm, date: now.toISOString().slice(0, 10), time: now.toTimeString().slice(0, 5) });
    setStudentSearch('');
    setStudentOpen(false);
    setShowModal(true);
  }

  // Auto-fill Name / Age / Sex / Course when a student ID is picked
  function linkStudent(studentId: string) {
    const s = students.find((x) => x.studentId === studentId);
    if (!s) { setForm((f) => ({ ...f, studentId })); return; }
    setForm((f) => ({
      ...f,
      studentId: s.studentId,
      studentName: s.name,
      age: ageFromBirthdate(s.birthdate) || f.age,
      sex: s.gender || f.sex,
      courseOrOffice: [s.course, s.yearLevel].filter(Boolean).join(' ') || f.courseOrOffice,
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.studentName.trim() && !form.studentId.trim()) { showToast('Enter a name or ID'); return; }
    const rec: Consultation = {
      id: String(Date.now()),
      studentId: form.studentId.trim(),
      studentName: form.studentName.trim(),
      date: form.date,
      time: form.time,
      age: form.age.trim(),
      sex: form.sex.trim(),
      courseOrOffice: form.courseOrOffice.trim(),
      chiefComplaint: form.chiefComplaint.trim(),
      management: form.management.trim(),
      // legacy mirrors so existing search/analytics keep working
      summary: form.chiefComplaint.trim(),
      outcome: form.management.trim(),
      reason: form.chiefComplaint.trim(),
      staff: '',
    };
    setConsultations((prev) => [rec, ...prev]);
    showToast('Treatment record logged');
    addActivity(`Consultation logged for ${form.studentName || form.studentId}`);
    setShowModal(false);
    setForm(defaultForm);
  }

  const fieldClass = 'w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';
  const labelClass = 'block text-slate-600 dark:text-slate-400 mb-1';
  const td = 'px-4 py-3 text-slate-600';

  return (
    <div className="space-y-5 max-w-screen-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-slate-900 dark:text-white" style={{ fontWeight: 700, fontSize: 20 }}>Consultation Logs</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-0.5" style={{ fontSize: 13 }}>Daily treatment record of clinic visits</p>
        </div>
        <button onClick={openAdd} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 shrink-0" style={{ fontSize: 13 }}>
          <Plus size={15} />New Consultation
        </button>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700">
          <p className="text-slate-400" style={{ fontSize: 12 }}>{visible.length} record{visible.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px]">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
                {['Date', 'Time', 'ID', 'Name', 'Age', 'Sex', 'Course & Year / Office', 'Purpose of Visit / Chief Complaint', 'Management', ''].map((h, i) => (
                  <th key={i} className="text-left px-4 py-3 text-slate-500 uppercase tracking-wider whitespace-nowrap" style={{ fontSize: 11, fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {visible.length === 0 ? (
                <tr><td colSpan={10} className="text-center py-12 text-slate-400" style={{ fontSize: 13 }}>No records logged</td></tr>
              ) : (
                visible.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className={`${td} whitespace-nowrap`} style={{ fontSize: 13 }}>{c.date || '—'}</td>
                    <td className={`${td} whitespace-nowrap`} style={{ fontSize: 13 }}>{c.time || '—'}</td>
                    <td className="px-4 py-3 text-slate-500" style={{ fontSize: 12, fontFamily: 'monospace' }}>{c.studentId || '—'}</td>
                    <td className="px-4 py-3 text-slate-800 dark:text-slate-100" style={{ fontSize: 13, fontWeight: 500 }}>{c.studentName || '—'}</td>
                    <td className={td} style={{ fontSize: 13 }}>{c.age || '—'}</td>
                    <td className={td} style={{ fontSize: 13 }}>{c.sex || '—'}</td>
                    <td className={`${td} max-w-[160px] truncate`} style={{ fontSize: 13 }}>{c.courseOrOffice || '—'}</td>
                    <td className={`${td} max-w-[220px] truncate`} style={{ fontSize: 13 }}>{c.chiefComplaint || c.reason || '—'}</td>
                    <td className={`${td} max-w-[200px] truncate`} style={{ fontSize: 13 }}>{c.management || c.outcome || '—'}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => setViewConsult(c)} className="p-1.5 rounded-md hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"><Eye size={14} /></button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New consultation */}
      <Modal isOpen={showModal} title="New Consultation" onClose={() => setShowModal(false)}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Quick-fill from a student record — type to search */}
          <label className="block">
            <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Link a student <span className="text-slate-400">(auto-fills the details)</span></span>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={studentSearch}
                onChange={(e) => { setStudentSearch(e.target.value); setStudentOpen(true); }}
                onFocus={() => setStudentOpen(true)}
                onBlur={() => setTimeout(() => setStudentOpen(false), 150)}
                placeholder="Search student by name or ID…"
                className={`${fieldClass} pl-9 ${studentSearch ? 'pr-9' : ''}`}
                style={{ fontSize: 13 }}
              />
              {studentSearch && (
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { setStudentSearch(''); setStudentOpen(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600" title="Clear"><X size={15} /></button>
              )}
              {studentOpen && studentMatches.length > 0 && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1.5 max-h-64 overflow-auto rounded-xl border border-blue-100 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-800">
                  {studentMatches.map((s) => (
                    <button
                      key={s.studentId}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { linkStudent(s.studentId); setStudentSearch(s.name); setStudentOpen(false); }}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-blue-50 dark:hover:bg-slate-700"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600"><UserRound size={15} /></div>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-slate-800 dark:text-slate-100" style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</span>
                        <span className="block truncate text-slate-500" style={{ fontSize: 12 }}>{s.studentId} · {[s.course, s.yearLevel].filter(Boolean).join(' ') || 'No course'}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="text-slate-400 mt-1" style={{ fontSize: 11 }}>Leave blank for a walk-in / faculty and fill the fields manually.</p>
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label><span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Date</span><input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className={fieldClass} style={{ fontSize: 13 }} required /></label>
            <label><span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Time</span><input type="time" value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} className={fieldClass} style={{ fontSize: 13 }} /></label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label><span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>ID</span><input value={form.studentId} onChange={(e) => setForm((f) => ({ ...f, studentId: e.target.value }))} placeholder="Student / staff ID" className={fieldClass} style={{ fontSize: 13 }} /></label>
            <label><span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Name</span><input value={form.studentName} onChange={(e) => setForm((f) => ({ ...f, studentName: e.target.value }))} placeholder="Full name" className={fieldClass} style={{ fontSize: 13 }} /></label>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <label><span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Age</span><input value={form.age} onChange={(e) => setForm((f) => ({ ...f, age: e.target.value.replace(/\D/g, '').slice(0, 3) }))} placeholder="Age" inputMode="numeric" className={fieldClass} style={{ fontSize: 13 }} /></label>
            <label><span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Sex</span>
              <select value={form.sex} onChange={(e) => setForm((f) => ({ ...f, sex: e.target.value }))} className={fieldClass} style={{ fontSize: 13 }}>
                <option value="">—</option>
                <option>Female</option>
                <option>Male</option>
              </select>
            </label>
            <label><span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Course & Year / Office</span><input value={form.courseOrOffice} onChange={(e) => setForm((f) => ({ ...f, courseOrOffice: e.target.value }))} placeholder="BSCS 3rd Year / Registrar" className={fieldClass} style={{ fontSize: 13 }} /></label>
          </div>

          <label><span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Purpose of Visit / Chief Complaint</span><textarea value={form.chiefComplaint} onChange={(e) => setForm((f) => ({ ...f, chiefComplaint: e.target.value }))} placeholder="Headache, fever, checkup…" className={`${fieldClass} resize-none`} rows={2} style={{ fontSize: 13 }} required /></label>
          <label><span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Management</span><textarea value={form.management} onChange={(e) => setForm((f) => ({ ...f, management: e.target.value }))} placeholder="Treatment given, medication, referral…" className={`${fieldClass} resize-none`} rows={2} style={{ fontSize: 13 }} /></label>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowModal(false)} className="bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors" style={{ fontSize: 13 }}>Cancel</button>
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors" style={{ fontSize: 13 }}>Save</button>
          </div>
        </form>
      </Modal>

      {/* View */}
      <Modal isOpen={!!viewConsult} title="Treatment Record" onClose={() => setViewConsult(null)}>
        {viewConsult && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {[
                ['Date', viewConsult.date], ['Time', viewConsult.time], ['ID', viewConsult.studentId], ['Name', viewConsult.studentName],
                ['Age', viewConsult.age], ['Sex', viewConsult.sex], ['Course & Year / Office', viewConsult.courseOrOffice],
              ].map(([k, v]) => (
                <div key={k} className="bg-slate-50 dark:bg-slate-700/40 rounded-lg p-3">
                  <p className="text-slate-400" style={{ fontSize: 11, fontWeight: 500 }}>{k}</p>
                  <p className="text-slate-700 dark:text-slate-200" style={{ fontSize: 13 }}>{v || '—'}</p>
                </div>
              ))}
            </div>
            <div className="bg-slate-50 dark:bg-slate-700/40 rounded-lg p-3">
              <p className="text-slate-400 mb-1" style={{ fontSize: 11, fontWeight: 500 }}>Purpose of Visit / Chief Complaint</p>
              <p className="text-slate-700 dark:text-slate-200" style={{ fontSize: 13 }}>{viewConsult.chiefComplaint || viewConsult.reason || 'Not recorded'}</p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-700/40 rounded-lg p-3">
              <p className="text-slate-400 mb-1" style={{ fontSize: 11, fontWeight: 500 }}>Management</p>
              <p className="text-slate-700 dark:text-slate-200" style={{ fontSize: 13 }}>{viewConsult.management || viewConsult.outcome || 'Not recorded'}</p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
