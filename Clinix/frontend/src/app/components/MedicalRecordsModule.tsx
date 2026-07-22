import { useState, useMemo, useRef } from 'react';
import {
  Upload, FileText, Eye, Download, Trash2, Loader2, FolderOpen, UserPlus, ArrowLeft, ChevronRight,
} from 'lucide-react';
import { MedForm, MedFormEntry, Student } from '../App';
import { Modal } from './Modal';
import { DocPreview } from './PersonDocuments';
import {
  PersonDoc, OwnerType, uploadDocument, deleteDocument, fileUrl,
} from '../documents';

type Props = {
  forms: MedForm[];
  setForms: React.Dispatch<React.SetStateAction<MedForm[]>>;
  students: Student[];
  globalSearch: string;
  showToast: (m: string) => void;
  addActivity: (m: string) => void;
};

// The documents backend keys files by (ownerType, ownerId). We store both the
// blank template and every student copy under the form's id.
const OWNER: OwnerType = 'faculty'; // any string works; the backend treats it as an opaque key
function formOwnerId(formId: string) { return `medform:${formId}`; }

// Build a minimal PersonDoc so DocPreview can render (it keys off id + file name).
function asDoc(docId: string, fileName: string): PersonDoc {
  return { id: docId, ownerType: OWNER, ownerId: '', fileName, mimeType: '', size: 0, uploadedAt: '' };
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function MedicalRecordsModule({ forms, setForms, students, globalSearch, showToast, addActivity }: Props) {
  const [showUpload, setShowUpload] = useState(false);
  const [uName, setUName] = useState('');
  const [uDesc, setUDesc] = useState('');
  const [uploading, setUploading] = useState(false);
  const uFileRef = useRef<HTMLInputElement>(null);

  const [viewId, setViewId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PersonDoc | null>(null);

  // Add-student-copy state (inside the form detail)
  const [entryStudent, setEntryStudent] = useState('');
  const [entryUploading, setEntryUploading] = useState(false);
  const entryFileRef = useRef<HTMLInputElement>(null);

  const query = globalSearch.trim().toLowerCase();
  const visible = useMemo(
    () => forms.filter((f) => [f.name, f.description, f.templateFileName].join(' ').toLowerCase().includes(query)),
    [forms, query],
  );
  const viewForm = forms.find((f) => f.id === viewId) || null;

  // ── Upload a new form (the original/blank copy) ──
  async function handleUploadForm(e: React.FormEvent) {
    e.preventDefault();
    const name = uName.trim();
    const file = uFileRef.current?.files?.[0];
    if (!name) { showToast('Enter a form name'); return; }
    if (!file) { showToast('Choose the form file to upload'); return; }
    setUploading(true);
    try {
      const id = String(Date.now());
      const doc = await uploadDocument(OWNER, formOwnerId(id), file);
      const form: MedForm = {
        id, name, description: uDesc.trim(),
        date: new Date().toISOString().slice(0, 10),
        templateDocId: doc.id, templateFileName: file.name, entries: [],
      };
      setForms((prev) => [form, ...prev]);
      showToast(`Form "${name}" uploaded`);
      addActivity(`Medical form uploaded: ${name}`);
      setShowUpload(false);
      setUName(''); setUDesc('');
      if (uFileRef.current) uFileRef.current.value = '';
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Upload failed — is the backend running?');
    } finally {
      setUploading(false);
    }
  }

  // ── Add a student's filled copy under a form ──
  async function handleAddEntry(form: MedForm) {
    const file = entryFileRef.current?.files?.[0];
    const student = students.find((s) => s.studentId === entryStudent);
    if (!student) { showToast('Select a student'); return; }
    if (!file) { showToast('Choose the student\'s form file'); return; }
    setEntryUploading(true);
    try {
      const doc = await uploadDocument(OWNER, formOwnerId(form.id), file);
      const entry: MedFormEntry = {
        studentId: student.studentId, studentName: student.name,
        docId: doc.id, fileName: file.name, uploadedAt: new Date().toISOString(),
      };
      setForms((prev) => prev.map((f) => f.id === form.id ? { ...f, entries: [entry, ...f.entries] } : f));
      showToast(`Added ${student.name}'s copy`);
      addActivity(`Form "${form.name}": added copy for ${student.name}`);
      setEntryStudent('');
      if (entryFileRef.current) entryFileRef.current.value = '';
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setEntryUploading(false);
    }
  }

  async function handleRemoveEntry(form: MedForm, entry: MedFormEntry) {
    if (!confirm(`Remove ${entry.studentName}'s copy?`)) return;
    setForms((prev) => prev.map((f) => f.id === form.id ? { ...f, entries: f.entries.filter((x) => x.docId !== entry.docId) } : f));
    deleteDocument(entry.docId).catch(() => {});
    showToast('Copy removed');
  }

  async function handleDeleteForm(form: MedForm) {
    if (!confirm(`Delete the form "${form.name}" and all ${form.entries.length} student copies? This cannot be undone.`)) return;
    // best-effort file cleanup
    deleteDocument(form.templateDocId).catch(() => {});
    form.entries.forEach((en) => deleteDocument(en.docId).catch(() => {}));
    setForms((prev) => prev.filter((f) => f.id !== form.id));
    setViewId(null);
    showToast(`Form "${form.name}" deleted`);
    addActivity(`Medical form deleted: ${form.name}`);
  }

  const btnGhost = 'p-1.5 rounded-md text-slate-400 transition-colors';

  return (
    <div className="space-y-5 max-w-screen-xl">
      {/* ── Breadcrumb (file-explorer style) ── */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          {viewForm && (
            <button onClick={() => setViewId(null)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-600 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700" title="Back to Medical Forms">
              <ArrowLeft size={16} />
            </button>
          )}
          <nav className="flex items-center gap-1.5 min-w-0">
            <button onClick={() => setViewId(null)} disabled={!viewForm} className={`shrink-0 ${viewForm ? 'text-slate-500 hover:text-blue-600' : 'text-slate-900 dark:text-white'}`} style={{ fontSize: viewForm ? 14 : 20, fontWeight: 700 }}>
              Medical Forms
            </button>
            {viewForm && <ChevronRight size={16} className="shrink-0 text-slate-300" />}
            {viewForm && <span className="truncate text-slate-900 dark:text-white" style={{ fontSize: 14, fontWeight: 700 }}>{viewForm.name}</span>}
          </nav>
        </div>
        {!viewForm ? (
          <button onClick={() => setShowUpload(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 shrink-0" style={{ fontSize: 13 }}>
            <Upload size={15} />Upload Form
          </button>
        ) : (
          <button onClick={() => handleDeleteForm(viewForm)} className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-900 px-3 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 shrink-0" style={{ fontSize: 13 }}>
            <Trash2 size={14} /> Delete form
          </button>
        )}
      </div>

      {/* ── Folder grid (root) ── */}
      {!viewForm && (
        <p className="text-slate-500 dark:text-slate-400" style={{ fontSize: 13, marginTop: -8 }}>
          Upload a form once, keep the original, and compile each student's copy under it
        </p>
      )}
      {!viewForm && (visible.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 py-16 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 dark:bg-slate-700/40">
            <FolderOpen size={24} className="text-slate-300" />
          </div>
          <p className="text-slate-500" style={{ fontSize: 14, fontWeight: 600 }}>No forms yet</p>
          <p className="text-slate-400 mt-1" style={{ fontSize: 12 }}>Click “Upload Form” to add a form file to the clinic library.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
          {visible.map((f) => (
            <button
              key={f.id}
              onClick={() => setViewId(f.id)}
              className="text-left bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 hover:border-blue-300 hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-50 dark:bg-orange-900/20">
                  <FolderOpen size={20} className="text-orange-600" />
                </div>
                <span className="rounded-full bg-slate-100 dark:bg-slate-700 px-2.5 py-1 text-slate-600 dark:text-slate-300" style={{ fontSize: 11, fontWeight: 600 }}>
                  {f.entries.length} cop{f.entries.length === 1 ? 'y' : 'ies'}
                </span>
              </div>
              <p className="mt-3 text-slate-800 dark:text-slate-100 truncate" style={{ fontSize: 14, fontWeight: 600 }}>{f.name}</p>
              <p className="text-slate-400 line-clamp-2" style={{ fontSize: 12, minHeight: 32 }}>{f.description || f.templateFileName}</p>
              <p className="mt-2 text-slate-400" style={{ fontSize: 11 }}>Uploaded {fmtDate(f.date)}</p>
            </button>
          ))}
        </div>
      ))}

      {/* ── Upload Form modal ── */}
      <Modal isOpen={showUpload} title="Upload Medical Form" onClose={() => setShowUpload(false)}>
        <form onSubmit={handleUploadForm} className="space-y-4">
          <label className="block">
            <span className="block text-slate-600 dark:text-slate-400 mb-1" style={{ fontSize: 12, fontWeight: 500 }}>Form Name</span>
            <input value={uName} onChange={(e) => setUName(e.target.value)} placeholder="e.g. Clinic Consultation Record" className="w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500" style={{ fontSize: 13 }} required />
          </label>
          <label className="block">
            <span className="block text-slate-600 dark:text-slate-400 mb-1" style={{ fontSize: 12, fontWeight: 500 }}>Description <span className="text-slate-400">(optional)</span></span>
            <input value={uDesc} onChange={(e) => setUDesc(e.target.value)} placeholder="What this form is for" className="w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500" style={{ fontSize: 13 }} />
          </label>
          <label className="block">
            <span className="block text-slate-600 dark:text-slate-400 mb-1" style={{ fontSize: 12, fontWeight: 500 }}>Form File <span className="text-slate-400">(the original / blank copy)</span></span>
            <input ref={uFileRef} type="file" className="block w-full text-slate-600 dark:text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-blue-700 hover:file:bg-blue-100" style={{ fontSize: 13 }} required />
          </label>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowUpload(false)} className="bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg hover:bg-slate-50" style={{ fontSize: 13 }}>Cancel</button>
            <button type="submit" disabled={uploading} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2" style={{ fontSize: 13 }}>
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Form detail (inline, folder contents) ── */}
      {viewForm && (
        <div className="space-y-4">
          {viewForm.description && <p className="text-slate-500" style={{ fontSize: 13, marginTop: -8 }}>{viewForm.description}</p>}

          {/* Original copy */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
            <p className="text-slate-400 mb-2" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Original copy</p>
            <div className="flex items-center gap-2 rounded-lg bg-slate-50 dark:bg-slate-700/40 px-3 py-2.5">
              <FileText size={16} className="shrink-0 text-orange-600" />
              <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-slate-200" style={{ fontSize: 13 }}>{viewForm.templateFileName}</span>
              <button onClick={() => setPreview(asDoc(viewForm.templateDocId, viewForm.templateFileName))} className={`${btnGhost} hover:text-blue-600 hover:bg-blue-50`} title="Preview"><Eye size={15} /></button>
              <a href={fileUrl(viewForm.templateDocId, true)} className={`${btnGhost} hover:text-blue-600 hover:bg-blue-50`} title="Download"><Download size={15} /></a>
            </div>
          </div>

          {/* Compiled student copies */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
            <p className="text-slate-400 mb-3" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Student copies · {viewForm.entries.length}
            </p>

            {/* Add a student copy */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <select value={entryStudent} onChange={(e) => setEntryStudent(e.target.value)} className="flex-1 min-w-[160px] rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-3 py-2 text-slate-700 dark:text-slate-200" style={{ fontSize: 13 }}>
                <option value="">Select student…</option>
                {students.map((s) => <option key={s.studentId} value={s.studentId}>{s.name} · {s.studentId}</option>)}
              </select>
              <input ref={entryFileRef} type="file" className="text-slate-600 dark:text-slate-300 file:mr-2 file:rounded-md file:border-0 file:bg-slate-100 file:px-2 file:py-1.5 file:text-slate-700" style={{ fontSize: 13, maxWidth: 220 }} />
              <button onClick={() => handleAddEntry(viewForm)} disabled={entryUploading} className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-60" style={{ fontSize: 13, fontWeight: 600 }}>
                {entryUploading ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />} Add copy
              </button>
            </div>

            {viewForm.entries.length === 0 ? (
              <p className="py-6 text-center text-slate-400" style={{ fontSize: 13 }}>No student copies yet. Pick a student and upload their filled form above.</p>
            ) : (
              <ul className="space-y-1.5">
                {viewForm.entries.map((en) => (
                  <li key={en.docId} className="flex items-center gap-2 rounded-lg bg-slate-50 dark:bg-slate-700/40 px-3 py-2.5">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600"><FileText size={16} /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-slate-800 dark:text-slate-100" style={{ fontSize: 13, fontWeight: 600 }}>{en.studentName}</p>
                      <p className="truncate text-slate-400" style={{ fontSize: 11 }}>{en.studentId} · {en.fileName}</p>
                    </div>
                    <button onClick={() => setPreview(asDoc(en.docId, en.fileName))} className={`${btnGhost} hover:text-blue-600 hover:bg-blue-50`} title="Preview"><Eye size={15} /></button>
                    <a href={fileUrl(en.docId, true)} className={`${btnGhost} hover:text-blue-600 hover:bg-blue-50`} title="Download"><Download size={15} /></a>
                    <button onClick={() => handleRemoveEntry(viewForm, en)} className={`${btnGhost} hover:text-red-600 hover:bg-red-50`} title="Remove"><Trash2 size={15} /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Shared file preview */}
      {preview && <DocPreview doc={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
