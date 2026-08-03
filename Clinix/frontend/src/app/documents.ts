import { API_URL, apiFetch } from './api';
// ── Per-person document attachments (stored on the backend) ─────────────────────
// Each student / faculty member can hold uploaded files (PDF, docs, images, …).
// Files live on the server; this module is the thin API client used by the UI.

// Default to the host that served the app so other devices on the LAN reach the
// backend automatically; override with VITE_API_URL for a fixed server/domain.

export type OwnerType = 'student' | 'faculty';

export type PersonDoc = {
  id: string;
  ownerType: OwnerType;
  ownerId: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  formId?: string | null;    // linked medical form (if this is a compiled form copy)
  formName?: string | null;
};

/** Direct URL to view (inline) or download a stored file. */
export function fileUrl(id: string, download = false): string {
  return `${API_URL}/documents/${id}/file${download ? '?download=1' : ''}`;
}

/** URL that returns an exact-fidelity PDF rendering of the document (converts on the server). */
export function pdfUrl(id: string): string {
  return `${API_URL}/documents/${id}/pdf`;
}

export async function listDocuments(ownerType: OwnerType, ownerId: string): Promise<PersonDoc[]> {
  const res = await apiFetch(`${API_URL}/documents?ownerType=${encodeURIComponent(ownerType)}&ownerId=${encodeURIComponent(ownerId)}`);
  if (!res.ok) throw new Error('Failed to load documents');
  return res.json();
}

/** All student copies compiled under a medical form. */
export async function listDocumentsByForm(formId: string): Promise<PersonDoc[]> {
  const res = await apiFetch(`${API_URL}/documents?formId=${encodeURIComponent(formId)}`);
  if (!res.ok) throw new Error('Failed to load form copies');
  return res.json();
}

export async function uploadDocument(
  ownerType: OwnerType,
  ownerId: string,
  file: File,
  link?: { formId: string; formName: string },
): Promise<PersonDoc> {
  const fd = new FormData();
  fd.append('ownerType', ownerType);
  fd.append('ownerId', ownerId);
  fd.append('file', file);
  if (link) { fd.append('formId', link.formId); fd.append('formName', link.formName); }
  const res = await apiFetch(`${API_URL}/documents`, { method: 'POST', body: fd });
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}));
    throw new Error(msg.error || 'Upload failed');
  }
  return res.json();
}

export async function deleteDocument(id: string): Promise<void> {
  const res = await apiFetch(`${API_URL}/documents/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) throw new Error('Delete failed');
}
