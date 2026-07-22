import { useState, useEffect, useRef, useCallback } from 'react';
import { FileText, Upload, Download, Trash2, Eye, Loader2, AlertCircle, X } from 'lucide-react';
import {
  OwnerType, PersonDoc, listDocuments, uploadDocument, deleteDocument, fileUrl, pdfUrl,
} from '../documents';

function formatBytes(n: number) {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function matchesType(doc: PersonDoc, mimeNeedle: string, exts: RegExp) {
  return (doc.mimeType || '').includes(mimeNeedle) || exts.test(doc.fileName);
}
const isImage = (d: PersonDoc) => (d.mimeType || '').startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(d.fileName);
const isPdf = (d: PersonDoc) => matchesType(d, 'application/pdf', /\.pdf$/i);
const isDocx = (d: PersonDoc) => matchesType(d, 'wordprocessingml', /\.docx$/i);
const isWord = (d: PersonDoc) => isDocx(d) || matchesType(d, 'msword', /\.doc$/i);
const isText = (d: PersonDoc) => (d.mimeType || '').startsWith('text/') || /\.(txt|csv|md|json|log|xml)$/i.test(d.fileName);

// ── In-app content preview (PDF/image natively; .docx via docx-preview) ─────────
export function DocPreview({ doc, onClose }: { doc: PersonDoc; onClose: () => void }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'unsupported' | 'error'>('loading');
  const [text, setText] = useState('');
  const [errMsg, setErrMsg] = useState('');
  const [pdfSrc, setPdfSrc] = useState('');           // exact PDF rendering (converted on server)
  const [docxBlob, setDocxBlob] = useState<Blob | null>(null); // in-browser fallback
  const docxRef = useRef<HTMLDivElement>(null);
  const url = fileUrl(doc.id);

  // Fetch + decide how to render
  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';
    (async () => {
      try {
        if (isImage(doc) || isPdf(doc)) { setStatus('ready'); return; }
        if (isWord(doc)) {
          // 1) Try exact-fidelity server conversion (LibreOffice/Word → PDF).
          const res = await fetch(pdfUrl(doc.id));
          if (res.ok) {
            const blob = await res.blob();
            if (cancelled) return;
            objectUrl = URL.createObjectURL(blob);
            setPdfSrc(objectUrl);
            setStatus('ready');
            return;
          }
          // 2) Converter unavailable (422): fall back to in-browser docx render.
          if (res.status === 422 && isDocx(doc)) {
            const blob = await (await fetch(url)).blob();
            if (!cancelled) { setDocxBlob(blob); setStatus('ready'); }
            return;
          }
          const info = await res.json().catch(() => ({}));
          throw new Error(info.error || `Preview failed (${res.status})`);
        }
        if (isText(doc)) {
          const t = await (await fetch(url)).text();
          if (!cancelled) { setText(t); setStatus('ready'); }
          return;
        }
        if (!cancelled) setStatus('unsupported');
      } catch (e) {
        if (!cancelled) { setErrMsg(e instanceof Error ? e.message : String(e)); setStatus('error'); }
      }
    })();
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [doc, url]);

  // Render the .docx into the container with full layout (tables, letterhead, fonts)
  useEffect(() => {
    if (!docxBlob || !docxRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const docx = await import('docx-preview');
        if (cancelled || !docxRef.current) return;
        docxRef.current.innerHTML = '';
        await docx.renderAsync(docxBlob, docxRef.current, undefined, {
          className: 'docx',
          inWrapper: true,
          breakPages: true,
        });
      } catch (e) {
        if (!cancelled) { setErrMsg(e instanceof Error ? e.message : String(e)); setStatus('error'); }
      }
    })();
    return () => { cancelled = true; };
  }, [docxBlob, status]);

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 1000, background: 'rgba(15,23,42,0.6)' }}
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white dark:bg-slate-800 shadow-2xl"
        style={{ height: '85vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-700 px-4 py-3">
          <FileText size={16} className="shrink-0 text-blue-600" />
          <p className="min-w-0 flex-1 truncate text-slate-800 dark:text-slate-100" style={{ fontSize: 13, fontWeight: 600 }}>
            {doc.fileName}
          </p>
          <a href={fileUrl(doc.id, true)} title="Download" className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-700">
            <Download size={16} />
          </a>
          <button type="button" onClick={onClose} title="Close" className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700">
            <X size={17} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-900/40">
          {status === 'loading' && (
            <div className="flex h-full items-center justify-center gap-2 text-slate-400" style={{ fontSize: 13 }}>
              <Loader2 size={16} className="animate-spin" /> {isWord(doc) ? 'Rendering document…' : 'Loading preview…'}
            </div>
          )}
          {status === 'ready' && isImage(doc) && (
            <div className="flex h-full items-center justify-center p-4">
              <img src={url} alt={doc.fileName} className="max-h-full max-w-full object-contain" />
            </div>
          )}
          {status === 'ready' && isPdf(doc) && (
            <iframe src={url} title={doc.fileName} className="h-full w-full" style={{ border: 0 }} />
          )}
          {status === 'ready' && isWord(doc) && pdfSrc && (
            <iframe src={pdfSrc} title={doc.fileName} className="h-full w-full" style={{ border: 0 }} />
          )}
          {status === 'ready' && isDocx(doc) && !pdfSrc && (
            <div ref={docxRef} className="docx-host py-4" />
          )}
          {status === 'ready' && isText(doc) && (
            <pre className="whitespace-pre-wrap break-words p-5 text-slate-800 dark:text-slate-100" style={{ fontSize: 13, fontFamily: 'ui-monospace, monospace' }}>{text}</pre>
          )}
          {(status === 'unsupported' || status === 'error') && (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <AlertCircle size={22} className="text-amber-500" />
              <p className="text-slate-600 dark:text-slate-300" style={{ fontSize: 13 }}>
                {status === 'error' ? 'Could not load this file for preview.' : "This file type can't be previewed in-app."}
              </p>
              {status === 'error' && errMsg && (
                <p className="max-w-md break-words text-slate-400" style={{ fontSize: 11 }}>{errMsg}</p>
              )}
              <a href={fileUrl(doc.id, true)} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700" style={{ fontSize: 13, fontWeight: 600 }}>
                <Download size={14} /> Download file
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function PersonDocuments({
  ownerType,
  ownerId,
  showToast,
  canEdit = false,
}: {
  ownerType: OwnerType;
  ownerId: string;
  showToast: (m: string) => void;
  /** When true, shows Upload + Delete controls (Edit mode). When false, view-only. */
  canEdit?: boolean;
}) {
  const [docs, setDocs] = useState<PersonDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<PersonDoc | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setDocs(await listDocuments(ownerType, ownerId));
    } catch {
      setError('Could not reach the file server. Start the backend to manage documents.');
    } finally {
      setLoading(false);
    }
  }, [ownerType, ownerId]);

  useEffect(() => { refresh(); }, [refresh]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadDocument(ownerType, ownerId, file);
      showToast(`Uploaded ${file.name}`);
      await refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function onDelete(doc: PersonDoc) {
    if (!confirm(`Delete "${doc.fileName}"? This cannot be undone.`)) return;
    try {
      await deleteDocument(doc.id);
      showToast('Document deleted');
      await refresh();
    } catch {
      showToast('Delete failed');
    }
  }

  return (
    <>
    <div className="bg-slate-50 dark:bg-slate-700/40 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-slate-400" style={{ fontSize: 11, fontWeight: 500 }}>
          Documents &amp; Files
        </p>
        {canEdit && (
          <>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
              style={{ fontSize: 12, fontWeight: 600 }}
            >
              {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              {uploading ? 'Uploading…' : 'Add file'}
            </button>
            <input ref={inputRef} type="file" onChange={onPick} className="hidden" />
          </>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-slate-400" style={{ fontSize: 12 }}>
          <Loader2 size={14} className="animate-spin" /> Loading documents…
        </div>
      ) : error ? (
        <div className="flex items-start gap-2 py-2 text-amber-600" style={{ fontSize: 12 }}>
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : docs.length === 0 ? (
        <p className="py-3 text-center text-slate-400" style={{ fontSize: 12 }}>
          {canEdit
            ? 'No files yet. Use “Add file” to attach PDFs, documents, or images.'
            : 'No files attached. Edit this record to add files.'}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {docs.map((doc) => (
            <li key={doc.id} className="flex items-center gap-2 rounded-lg bg-white dark:bg-slate-800 px-2.5 py-2 border border-slate-100 dark:border-slate-700">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-900/30">
                <FileText size={15} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-slate-800 dark:text-slate-100" style={{ fontSize: 12, fontWeight: 600 }}>{doc.fileName}</p>
                <p className="text-slate-400" style={{ fontSize: 11 }}>
                  {formatBytes(doc.size)}{doc.uploadedAt ? ` · ${formatDate(doc.uploadedAt)}` : ''}
                </p>
              </div>
              <button type="button" onClick={() => setPreviewDoc(doc)} title="Preview" className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors">
                <Eye size={14} />
              </button>
              <a href={fileUrl(doc.id, true)} title="Download" className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors">
                <Download size={14} />
              </a>
              {canEdit && (
                <button type="button" onClick={() => onDelete(doc)} title="Delete" className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
    {previewDoc && <DocPreview doc={previewDoc} onClose={() => setPreviewDoc(null)} />}
    </>
  );
}
