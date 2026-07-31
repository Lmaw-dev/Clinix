import { useState } from 'react';
import { Activity } from 'lucide-react';
import { Consultation } from '../App';
import { Modal } from './Modal';

// The consultation record is no longer something you create on its own. It hangs
// off a log entry whose purpose of visit is "Consultation", and holds the
// assessment and vital signs taken from the person being checked up. Staff fill
// this in; the nurse and assistant can too.

type Props = {
  consultation: Consultation | null;
  readOnly?: boolean;
  currentUser: string;
  onClose: () => void;
  onSave: (id: string, changes: Partial<Consultation>) => void;
  showToast: (m: string) => void;
};

const emptyVitals = { bloodType: '', bp: '', rr: '', pr: '', temp: '', o2sat: '', assessment: '' };

export function ConsultationRecordModal({ consultation, readOnly = false, currentUser, onClose, onSave, showToast }: Props) {
  const [form, setForm] = useState(emptyVitals);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Reload the form whenever a different consultation is opened.
  if (consultation && loadedFor !== consultation.id) {
    setLoadedFor(consultation.id);
    setForm({
      bloodType: consultation.bloodType || '',
      bp: consultation.bp || '',
      rr: consultation.rr || '',
      pr: consultation.pr || '',
      temp: consultation.temp || '',
      o2sat: consultation.o2sat || '',
      assessment: consultation.assessment || '',
    });
  }

  if (!consultation) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!consultation) return;
    const anyVital = [form.bp, form.rr, form.pr, form.temp, form.o2sat].some((v) => v.trim());
    if (!anyVital && !form.assessment.trim()) {
      showToast('Record at least one vital sign or an assessment');
      return;
    }
    onSave(consultation.id, {
      bloodType: form.bloodType.trim(),
      bp: form.bp.trim(),
      rr: form.rr.trim(),
      pr: form.pr.trim(),
      temp: form.temp.trim(),
      o2sat: form.o2sat.trim(),
      assessment: form.assessment.trim(),
      recordedBy: currentUser || 'staff',
      recordedAt: new Date().toISOString(),
    });
    onClose();
  }

  const fieldClass = 'w-full border border-blue-100 dark:border-slate-600 rounded-lg px-3 py-2 text-black dark:text-slate-200 bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500';
  const labelClass = 'block text-slate-600 dark:text-slate-400 mb-1';
  const vital = (key: keyof typeof emptyVitals, label: string, placeholder: string) => (
    <label key={key}>
      <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>{label}</span>
      <input
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        className={fieldClass}
        style={{ fontSize: 13 }}
        disabled={readOnly}
      />
    </label>
  );

  const title = readOnly ? 'Consultation Record' : 'Assessment & Vital Signs';

  return (
    <Modal isOpen={!!consultation} title={title} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Who this record belongs to — read-only, it comes from the log entry. */}
        <div className="rounded-lg bg-blue-50 dark:bg-slate-700/50 px-3 py-2.5">
          <p className="text-black dark:text-slate-100 flex items-center gap-2" style={{ fontSize: 14, fontWeight: 600 }}>
            <Activity size={15} className="text-blue-600" />
            {consultation.studentName || consultation.studentId || 'Unnamed'}
          </p>
          <p className="text-slate-500 dark:text-slate-400 mt-0.5" style={{ fontSize: 12 }}>
            {[consultation.courseOrOffice, consultation.age && `${consultation.age} yrs`, consultation.sex]
              .filter(Boolean).join(' · ') || 'No profile details'}
          </p>
          <p className="text-slate-500 dark:text-slate-400 mt-1" style={{ fontSize: 12 }}>
            <span style={{ fontWeight: 600 }}>Chief complaint:</span> {consultation.chiefComplaint || consultation.reason || 'Not recorded'}
          </p>
        </div>

        <p className="text-slate-500 uppercase tracking-wider" style={{ fontSize: 10, fontWeight: 700 }}>Vital Signs</p>
        <div className="grid grid-cols-2 gap-3">
          {vital('bp', 'BP (mmHg)', '120/80')}
          {vital('temp', 'Temp (°C)', '36.8')}
          {vital('pr', 'PR (bpm)', '72')}
          {vital('rr', 'RR (bpm)', '18')}
          {vital('o2sat', 'O2 Sat (%)', '98')}
          {vital('bloodType', 'Blood Type', 'O+')}
        </div>

        <label className="block">
          <span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Assessment</span>
          <textarea
            value={form.assessment}
            onChange={(e) => setForm((f) => ({ ...f, assessment: e.target.value }))}
            placeholder="Observations from the initial check…"
            className={`${fieldClass} resize-none`}
            rows={3}
            style={{ fontSize: 13 }}
            disabled={readOnly}
          />
        </label>

        {consultation.recordedBy && (
          <p className="text-slate-400" style={{ fontSize: 11 }}>
            Recorded by {consultation.recordedBy}
            {consultation.recordedAt ? ` on ${new Date(consultation.recordedAt).toLocaleString()}` : ''}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-blue-100 dark:border-slate-600 text-slate-600 dark:text-slate-300" style={{ fontSize: 13 }}>
            {readOnly ? 'Close' : 'Cancel'}
          </button>
          {!readOnly && (
            <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 text-white" style={{ fontSize: 13, fontWeight: 500 }}>
              Save record
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
