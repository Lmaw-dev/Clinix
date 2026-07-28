import { useState, useMemo } from 'react';
import { Plus, Eye, Search, X, UserRound, Activity, Pencil } from 'lucide-react';
import { Consultation, Student, FacultyMember } from '../App';
import { Modal } from './Modal';

type Props = {
  consultations: Consultation[];
  setConsultations: React.Dispatch<React.SetStateAction<Consultation[]>>;
  students: Student[];
  faculty: FacultyMember[];
  currentUser: string;
  globalSearch: string;
  showToast: (m: string) => void;
  addActivity: (m: string) => void;
};

type PersonType = 'student' | 'faculty';

const emptyForm = {
  personType: 'student' as PersonType,
  personId: '', name: '', age: '', sex: '', courseOrOffice: '', bloodType: '',
  date: '', time: '', bp: '', rr: '', pr: '', temp: '', o2sat: '', chiefComplaint: '',
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

const STATUS_STYLES: Record<string, string> = {
  Pending: 'bg-amber-100 text-amber-700',
  Evaluated: 'bg-blue-100 text-blue-700',
  Confirmed: 'bg-green-100 text-green-700',
};
function StatusBadge({ status }: { status?: string }) {
  const s = status || 'Pending';
  return <span className={`inline-flex px-2 py-0.5 rounded-full ${STATUS_STYLES[s] || STATUS_STYLES.Pending}`} style={{ fontSize: 11, fontWeight: 500 }}>{s}</span>;
}

export function ConsultationRecordModule({ consultations, setConsultations, students, faculty, currentUser, globalSearch, showToast, addActivity }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [personSearch, setPersonSearch] = useState('');
  const [personOpen, setPersonOpen] = useState(false);
  const [viewRec, setViewRec] = useState<Consultation | null>(null);

  const query = globalSearch.trim().toLowerCase();
  const visible = useMemo(
    () => consultations.filter((c) =>
      [c.studentId, c.studentName, c.date, c.time, c.chiefComplaint, c.consultStatus].join(' ').toLowerCase().includes(query),
    ),
    [consultations, query],
  );

  const personMatches = useMemo(() => {
    const q = personSearch.trim().toLowerCase();
    if (!q) return [];
    if (form.personType === 'student') {
      return students.filter((s) => [s.name, s.studentId, s.course].join(' ').toLowerCase().includes(q)).slice(0, 8)
        .map((s) => ({ id: s.studentId, name: s.name, sub: [s.course, s.yearLevel].filter(Boolean).join(' '), age: ageFromBirthdate(s.birthdate), sex: s.gender, courseOrOffice: [s.course, s.yearLevel].filter(Boolean).join(' '), bloodType: s.bloodType }));
    }
    return faculty.filter((f) => [f.name, f.staffId, f.office, f.role].join(' ').toLowerCase().includes(q)).slice(0, 8)
      .map((f) => ({ id: f.staffId, name: f.name, sub: f.office || f.role, age: ageFromBirthdate(f.birthdate), sex: '', courseOrOffice: f.office || f.role, bloodType: f.bloodType }));
  }, [personSearch, form.personType, students, faculty]);

  function openAdd() {
    const now = new Date();
    setForm({ ...emptyForm, date: now.toISOString().slice(0, 10), time: now.toTimeString().slice(0, 5) });
    setPersonSearch('');
    setEditingId(null);
    setShowModal(true);
  }

  function openEdit(c: Consultation) {
    setForm({
      personType: (c.personType as PersonType) || 'student',
      personId: c.studentId, name: c.studentName, age: c.age || '', sex: c.sex || '',
      courseOrOffice: c.courseOrOffice || '', bloodType: c.bloodType || '',
      date: c.date, time: c.time || '', bp: c.bp || '', rr: c.rr || '', pr: c.pr || '',
      temp: c.temp || '', o2sat: c.o2sat || '', chiefComplaint: c.chiefComplaint || '',
    });
    setPersonSearch(c.studentName);
    setEditingId(c.id);
    setShowModal(true);
  }

  function pickPerson(p: { id: string; name: string; age: string; sex: string; courseOrOffice: string; bloodType?: string }) {
    setForm((f) => ({ ...f, personId: p.id, name: p.name, age: p.age || f.age, sex: p.sex || f.sex, courseOrOffice: p.courseOrOffice || f.courseOrOffice, bloodType: p.bloodType || f.bloodType }));
    setPersonSearch(p.name);
    setPersonOpen(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { showToast('Select or enter a patient'); return; }
    if (!form.chiefComplaint.trim()) { showToast('Enter the chief complaint'); return; }
    const base = {
      studentId: form.personId.trim(), studentName: form.name.trim(),
      personType: form.personType, date: form.date, time: form.time,
      age: form.age.trim(), sex: form.sex.trim(), courseOrOffice: form.courseOrOffice.trim(),
      bloodType: form.bloodType.trim(), bp: form.bp.trim(), rr: form.rr.trim(), pr: form.pr.trim(),
      temp: form.temp.trim(), o2sat: form.o2sat.trim(), chiefComplaint: form.chiefComplaint.trim(),
      reason: form.chiefComplaint.trim(), summary: form.chiefComplaint.trim(),
    };
    if (editingId) {
      setConsultations((prev) => prev.map((c) => c.id === editingId ? { ...c, ...base } : c));
      showToast('Consultation record updated');
      addActivity(`Consultation record updated: ${form.name}`);
    } else {
      const rec: Consultation = {
        id: String(Date.now()), ...base,
        outcome: '', management: '',
        consultStatus: 'Pending', recordedBy: currentUser || 'staff',
      };
      setConsultations((prev) => [rec, ...prev]);
      showToast('Consultation record saved');
      addActivity(`Consultation record taken for ${form.name}`);
    }
    setShowModal(false);
    setForm(emptyForm);
    setEditingId(null);
  }

  const fieldClass = 'w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500';
  const labelClass = 'block text-slate-600 dark:text-slate-400 mb-1';
  const td = 'px-4 py-3 text-slate-600';

  return (
    <div className="space-y-5 max-w-screen-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-slate-900 dark:text-white flex items-center gap-2" style={{ fontWeight: 700, fontSize: 20 }}>
            <Activity size={19} className="text-blue-600" /> Consultation Record
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-0.5" style={{ fontSize: 13 }}>
            Record intake vital signs and chief complaint for each clinic visit
          </p>
        </div>
        <button onClick={openAdd} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 shrink-0" style={{ fontSize: 13 }}>
          <Plus size={15} />New Record
        </button>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700">
          <p className="text-slate-400" style={{ fontSize: 12 }}>{visible.length} record{visible.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
                {['Date', 'Time', 'Name', 'Chief Complaint', 'Vital Signs', 'Status', ''].map((h, i) => (
                  <th key={i} className="text-left px-4 py-3 text-slate-500 uppercase tracking-wider whitespace-nowrap" style={{ fontSize: 11, fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {visible.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400" style={{ fontSize: 13 }}>No records yet</td></tr>
              ) : (
                visible.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className={`${td} whitespace-nowrap`} style={{ fontSize: 13 }}>{c.date || '—'}</td>
                    <td className={`${td} whitespace-nowrap`} style={{ fontSize: 13 }}>{c.time || '—'}</td>
                    <td className="px-4 py-3 text-slate-800 dark:text-slate-100" style={{ fontSize: 13, fontWeight: 500 }}>{c.studentName || '—'}</td>
                    <td className={`${td} max-w-[200px] truncate`} style={{ fontSize: 13 }}>{c.chiefComplaint || '—'}</td>
                    <td className={`${td} whitespace-nowrap`} style={{ fontSize: 12 }}>
                      {[c.bp && `BP ${c.bp}`, c.temp && `T ${c.temp}°`, c.pr && `PR ${c.pr}`].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={c.consultStatus} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setViewRec(c)} className="p-1.5 rounded-md hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors" title="View"><Eye size={14} /></button>
                        {(c.consultStatus || 'Pending') === 'Pending' && (
                          <button onClick={() => openEdit(c)} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors" title="Edit"><Pencil size={14} /></button>
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

      {/* New / edit record */}
      <Modal isOpen={showModal} title={editingId ? 'Edit Consultation Record' : 'New Consultation Record'} onClose={() => setShowModal(false)}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Patient */}
          <div className="grid grid-cols-2 gap-4">
            <label><span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Patient type</span>
              <select value={form.personType} onChange={(e) => { setForm((f) => ({ ...f, personType: e.target.value as PersonType, personId: '', name: '' })); setPersonSearch(''); }} className={fieldClass} style={{ fontSize: 13 }}>
                <option value="student">Student</option>
                <option value="faculty">Faculty &amp; Staff</option>
              </select>
            </label>
            <label className="relative"><span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Find patient</span>
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={personSearch} onChange={(e) => { setPersonSearch(e.target.value); setPersonOpen(true); }} onFocus={() => setPersonOpen(true)} onBlur={() => setTimeout(() => setPersonOpen(false), 150)} placeholder="Search by name or ID…" className={`${fieldClass} pl-9`} style={{ fontSize: 13 }} />
                {personSearch && <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setPersonSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600"><X size={15} /></button>}
                {personOpen && personMatches.length > 0 && (
                  <div className="absolute left-0 right-0 top-full z-20 mt-1.5 max-h-56 overflow-auto rounded-xl border border-blue-100 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-800">
                    {personMatches.map((p) => (
                      <button key={p.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pickPerson(p)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-blue-50 dark:hover:bg-slate-700">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600"><UserRound size={15} /></div>
                        <span className="min-w-0 flex-1"><span className="block truncate text-slate-800 dark:text-slate-100" style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</span><span className="block truncate text-slate-500" style={{ fontSize: 12 }}>{p.id} · {p.sub || '—'}</span></span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </label>
          </div>

          <div className="grid grid-cols-4 gap-3">
            <label className="col-span-2"><span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Name</span><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className={fieldClass} style={{ fontSize: 13 }} /></label>
            <label><span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Age</span><input value={form.age} onChange={(e) => setForm((f) => ({ ...f, age: e.target.value.replace(/\D/g, '').slice(0, 3) }))} className={fieldClass} style={{ fontSize: 13 }} /></label>
            <label><span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Sex</span>
              <select value={form.sex} onChange={(e) => setForm((f) => ({ ...f, sex: e.target.value }))} className={fieldClass} style={{ fontSize: 13 }}><option value="">—</option><option>Female</option><option>Male</option></select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label><span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Course & Year / Office</span><input value={form.courseOrOffice} onChange={(e) => setForm((f) => ({ ...f, courseOrOffice: e.target.value }))} className={fieldClass} style={{ fontSize: 13 }} /></label>
            <label><span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Blood Type</span><input value={form.bloodType} onChange={(e) => setForm((f) => ({ ...f, bloodType: e.target.value }))} placeholder="O+" className={fieldClass} style={{ fontSize: 13 }} /></label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <label><span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Date</span><input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className={fieldClass} style={{ fontSize: 13 }} required /></label>
            <label><span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Time</span><input type="time" value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} className={fieldClass} style={{ fontSize: 13 }} /></label>
          </div>

          {/* Initial vital signs */}
          <p className="text-slate-500 uppercase tracking-wider" style={{ fontSize: 10, fontWeight: 700 }}>Initial Vital Signs</p>
          <div className="grid grid-cols-5 gap-2">
            {([['bp', 'BP', 'mmHg'], ['rr', 'RR', 'bpm'], ['pr', 'PR', 'bpm'], ['temp', 'Temp', '°C'], ['o2sat', 'O₂ Sat', '%']] as const).map(([key, lbl, unit]) => (
              <label key={key}><span className={labelClass} style={{ fontSize: 11, fontWeight: 500 }}>{lbl} <span className="text-slate-400">{unit}</span></span>
                <input value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} className={fieldClass} style={{ fontSize: 13 }} />
              </label>
            ))}
          </div>

          <label className="block"><span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Purpose of Visit / Chief Complaint</span>
            <textarea value={form.chiefComplaint} onChange={(e) => setForm((f) => ({ ...f, chiefComplaint: e.target.value }))} placeholder="Headache, fever, checkup…" className={`${fieldClass} resize-none`} rows={2} style={{ fontSize: 13 }} required />
          </label>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowModal(false)} className="bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg hover:bg-slate-50" style={{ fontSize: 13 }}>Cancel</button>
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700" style={{ fontSize: 13 }}>{editingId ? 'Update' : 'Save record'}</button>
          </div>
        </form>
      </Modal>

      {/* View */}
      <Modal isOpen={!!viewRec} title="Consultation Record" onClose={() => setViewRec(null)}>
        {viewRec && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-900 dark:text-white" style={{ fontSize: 15, fontWeight: 700 }}>{viewRec.studentName}</p>
                <p className="text-slate-500" style={{ fontSize: 12 }}>{viewRec.studentId} · {viewRec.courseOrOffice || '—'}</p>
              </div>
              <StatusBadge status={viewRec.consultStatus} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[['Date', viewRec.date], ['Time', viewRec.time], ['Age', viewRec.age], ['Sex', viewRec.sex], ['Blood Type', viewRec.bloodType]].map(([k, v]) => (
                <div key={k} className="bg-slate-50 dark:bg-slate-700/40 rounded-lg p-2.5"><p className="text-slate-400" style={{ fontSize: 11 }}>{k}</p><p className="text-slate-700 dark:text-slate-200" style={{ fontSize: 13 }}>{v || '—'}</p></div>
              ))}
            </div>
            <div className="bg-slate-50 dark:bg-slate-700/40 rounded-lg p-3">
              <p className="text-slate-400 mb-1.5" style={{ fontSize: 11, fontWeight: 600 }}>Initial Vital Signs</p>
              <div className="grid grid-cols-5 gap-2 text-center">
                {([['BP', viewRec.bp], ['RR', viewRec.rr], ['PR', viewRec.pr], ['Temp', viewRec.temp], ['O₂', viewRec.o2sat]] as const).map(([k, v]) => (
                  <div key={k}><p className="text-slate-400" style={{ fontSize: 10 }}>{k}</p><p className="text-slate-700 dark:text-slate-200" style={{ fontSize: 13, fontWeight: 600 }}>{v || '—'}</p></div>
                ))}
              </div>
            </div>
            <div className="bg-slate-50 dark:bg-slate-700/40 rounded-lg p-3"><p className="text-slate-400 mb-1" style={{ fontSize: 11 }}>Chief Complaint</p><p className="text-slate-700 dark:text-slate-200" style={{ fontSize: 13 }}>{viewRec.chiefComplaint || '—'}</p></div>
            {viewRec.management && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3"><p className="text-green-700 mb-1" style={{ fontSize: 11, fontWeight: 600 }}>Management & Treatment</p><p className="text-slate-700" style={{ fontSize: 13 }}>{viewRec.management}</p></div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
