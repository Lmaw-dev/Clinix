// ── Per-person document attachments (stored on the backend) ─────────────────────
// Each student / faculty member can hold uploaded files (PDF, docs, images, …).
// Files live on the server; this module is the thin API client used by the UI.

const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4001/api').replace(/\/$/, '');

export type OwnerType = 'student' | 'faculty';

export type PersonDoc = {
  id: string;
  ownerType: OwnerType;
  ownerId: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
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
  const res = await fetch(`${API_URL}/documents?ownerType=${encodeURIComponent(ownerType)}&ownerId=${encodeURIComponent(ownerId)}`);
  if (!res.ok) throw new Error('Failed to load documents');
  return res.json();
}

export async function uploadDocument(ownerType: OwnerType, ownerId: string, file: File): Promise<PersonDoc> {
  const fd = new FormData();
  fd.append('ownerType', ownerType);
  fd.append('ownerId', ownerId);
  fd.append('file', file);
  const res = await fetch(`${API_URL}/documents`, { method: 'POST', body: fd });
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}));
    throw new Error(msg.error || 'Upload failed');
  }
  return res.json();
}

export async function deleteDocument(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/documents/${id}`, { method: 'DELETE' });
  if (!res.ok && res.status !== 204) throw new Error('Delete failed');
}
