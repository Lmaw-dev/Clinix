import { useState, useEffect, useCallback } from 'react';
import { Plus, ShieldCheck, Trash2, KeyRound, UserCog, Lock, Loader2, AlertCircle } from 'lucide-react';
import { Account, Role, ROLE_LABELS, listAccountsApi, createAccountApi, updateAccountApi, deleteAccountApi } from '../auth';
import { Modal } from './Modal';
import { confirmDialog } from './ConfirmDialog';

type Props = {
  role: Role;
  currentUser: string;
  showToast: (m: string) => void;
  addActivity: (m: string) => void;
};

const CREATABLE_ROLES: Role[] = ['assistant', 'staff'];

const ROLE_BADGE: Record<Role, string> = {
  admin: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  assistant: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  staff: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
};

const emptyForm = {
  role: 'staff' as Role, empId: '', username: '', password: '',
  firstName: '', lastName: '', middleName: '', birthdate: '', email: '', address: '', contact: '',
};

export function AccountsModule({ role, currentUser, showToast, addActivity }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [resetFor, setResetFor] = useState<Account | null>(null);
  const [newPw, setNewPw] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    // Admin accounts are not listed here — the admin manages other people's
    // accounts, and changes their own password in Settings → Security.
    try { setAccounts((await listAccountsApi()).filter((a) => a.role !== 'admin')); }
    catch { setError('Could not reach the server. Start the backend to manage accounts.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  if (role !== 'admin') {
    return (
      <div className="max-w-screen-xl">
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-blue-100 dark:border-slate-700 py-16 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 dark:bg-slate-700/40"><Lock size={22} className="text-slate-300" /></div>
          <p className="text-slate-500" style={{ fontSize: 14, fontWeight: 600 }}>Restricted</p>
          <p className="text-slate-400 mt-1" style={{ fontSize: 12 }}>Only the main administrator can manage accounts.</p>
        </div>
      </div>
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.username.trim()) { showToast('Enter a username'); return; }
    if (/\s/.test(form.username.trim())) { showToast('Username cannot contain spaces'); return; }
    if (form.password.length < 4) { showToast('Password must be at least 4 characters'); return; }
    setSaving(true);
    try {
      await createAccountApi({ ...form, username: form.username.trim() });
      showToast(`Account "${form.username.trim()}" created`);
      addActivity(`Account created: ${form.username.trim()} (${ROLE_LABELS[form.role]})`);
      setForm(emptyForm);
      setShowCreate(false);
      await refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  }

  function canDelete(a: Account) {
    return a.role !== 'admin' && a.username !== currentUser;
  }

  async function handleDelete(a: Account) {
    if (!canDelete(a) || !a.id) return;
    if (!(await confirmDialog({
      title: `Delete "${a.username}"?`,
      message: 'This account will be removed and the user will no longer be able to sign in.',
      confirmLabel: 'Delete account',
      danger: true,
    }))) return;
    try {
      await deleteAccountApi(a.id);
      showToast(`Account "${a.username}" deleted`);
      addActivity(`Account deleted: ${a.username}`);
      await refresh();
    } catch { showToast('Delete failed'); }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (!resetFor?.id) return;
    if (newPw.length < 4) { showToast('Password must be at least 4 characters'); return; }
    try {
      await updateAccountApi(resetFor.id, { password: newPw });
      showToast(`Password updated for "${resetFor.username}"`);
      addActivity(`Password reset: ${resetFor.username}`);
      setResetFor(null); setNewPw('');
    } catch { showToast('Update failed'); }
  }

  const field = 'w-full border border-blue-100 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-black dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500';
  const label = 'block text-slate-600 dark:text-slate-400 mb-1';

  return (
    <div className="space-y-5 max-w-screen-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-black dark:text-white flex items-center gap-2" style={{ fontWeight: 700, fontSize: 20 }}>
            <ShieldCheck size={20} className="text-blue-600" /> Accounts
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-0.5" style={{ fontSize: 13 }}>
            Create and manage staff &amp; assistant accounts — change your own password in Settings → Security
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 shrink-0" style={{ fontSize: 13 }}>
          <Plus size={15} />Create Account
        </button>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden border border-blue-100 dark:border-slate-700">
        <div className="px-5 py-3 border-b border-blue-100 dark:border-slate-700">
          <p className="text-slate-400" style={{ fontSize: 12 }}>{accounts.length} account{accounts.length !== 1 ? 's' : ''}</p>
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-slate-400" style={{ fontSize: 13 }}><Loader2 size={16} className="animate-spin" /> Loading accounts…</div>
        ) : error ? (
          <div className="flex items-center justify-center gap-2 py-12 text-yellow-600" style={{ fontSize: 13 }}><AlertCircle size={16} /> {error}</div>
        ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-blue-50 dark:bg-slate-800/60 border-b border-blue-100 dark:border-slate-700">
                {['Username', 'Name', 'Role', 'Email / Contact', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-slate-500 uppercase tracking-wider" style={{ fontSize: 11, fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {accounts.length === 0 && (
                <tr><td colSpan={5} className="py-12 text-center text-slate-400" style={{ fontSize: 13 }}>
                  No staff or assistant accounts yet — click “Create Account” to add one.
                </td></tr>
              )}
              {accounts.map((a) => (
                <tr key={a.id || a.username} className="hover:bg-blue-50 dark:hover:bg-slate-700/30 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-slate-700 text-slate-500"><UserCog size={15} /></div>
                      <span className="text-black dark:text-slate-100" style={{ fontSize: 13, fontWeight: 600 }}>
                        {a.username}{a.username === currentUser && <span className="ml-2 text-slate-400" style={{ fontSize: 11, fontWeight: 400 }}>(you)</span>}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-slate-600 dark:text-slate-300" style={{ fontSize: 13 }}>{[a.firstName, a.middleName, a.lastName].filter(Boolean).join(' ') || '—'}</td>
                  <td className="px-5 py-3.5"><span className={`inline-flex px-2 py-0.5 rounded-full ${ROLE_BADGE[a.role]}`} style={{ fontSize: 11, fontWeight: 600 }}>{ROLE_LABELS[a.role]}</span></td>
                  <td className="px-5 py-3.5 text-slate-500" style={{ fontSize: 12 }}>{[a.email, a.contact].filter(Boolean).join(' · ') || '—'}</td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-1">
                      <button onClick={() => { setResetFor(a); setNewPw(''); }} className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Reset password"><KeyRound size={15} /></button>
                      <button onClick={() => handleDelete(a)} disabled={!canDelete(a)} className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400" title={canDelete(a) ? 'Delete account' : 'Protected account'}><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {/* Create account */}
      <Modal isOpen={showCreate} title="Create Account" onClose={() => setShowCreate(false)} maxWidth="max-w-3xl" scrollBody>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <label className="block"><span className={label} style={{ fontSize: 12, fontWeight: 500 }}>ID</span><input value={form.empId} onChange={(e) => setForm((f) => ({ ...f, empId: e.target.value }))} placeholder="EMP-001 (optional)" className={field} style={{ fontSize: 13 }} /></label>
            <label className="block"><span className={label} style={{ fontSize: 12, fontWeight: 500 }}>Role</span>
              <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))} className={field} style={{ fontSize: 13 }}>
                {CREATABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className="block"><span className={label} style={{ fontSize: 12, fontWeight: 500 }}>Username</span><input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} placeholder="jdelacruz" className={field} style={{ fontSize: 13 }} required /></label>
            <label className="block"><span className={label} style={{ fontSize: 12, fontWeight: 500 }}>Password</span><input value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="At least 4 characters" className={field} style={{ fontSize: 13 }} required /></label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="block"><span className={label} style={{ fontSize: 12, fontWeight: 500 }}>First name</span><input value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} className={field} style={{ fontSize: 13 }} /></label>
            <label className="block"><span className={label} style={{ fontSize: 12, fontWeight: 500 }}>Middle name</span><input value={form.middleName} onChange={(e) => setForm((f) => ({ ...f, middleName: e.target.value }))} className={field} style={{ fontSize: 13 }} /></label>
            <label className="block"><span className={label} style={{ fontSize: 12, fontWeight: 500 }}>Last name</span><input value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} className={field} style={{ fontSize: 13 }} /></label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label className="block"><span className={label} style={{ fontSize: 12, fontWeight: 500 }}>Birthdate</span><input type="date" value={form.birthdate} onChange={(e) => setForm((f) => ({ ...f, birthdate: e.target.value }))} className={field} style={{ fontSize: 13 }} /></label>
            <label className="block"><span className={label} style={{ fontSize: 12, fontWeight: 500 }}>Contact #</span><input value={form.contact} onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))} placeholder="09XX XXX XXXX" className={field} style={{ fontSize: 13 }} /></label>
          </div>
          <label className="block"><span className={label} style={{ fontSize: 12, fontWeight: 500 }}>Email address</span><input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="name@email.com" className={field} style={{ fontSize: 13 }} /></label>
          <label className="block"><span className={label} style={{ fontSize: 12, fontWeight: 500 }}>Address</span><input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} className={field} style={{ fontSize: 13 }} /></label>
          <p className="flex items-center gap-1.5 text-slate-400" style={{ fontSize: 11 }}><Lock size={11} /> All of these fields are stored AES-256 encrypted in the database.</p>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowCreate(false)} className="bg-white dark:bg-slate-700 border border-blue-100 dark:border-slate-600 text-black dark:text-slate-300 px-4 py-2 rounded-lg hover:bg-blue-50" style={{ fontSize: 13 }}>Cancel</button>
            <button type="submit" disabled={saving} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2" style={{ fontSize: 13 }}>{saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create</button>
          </div>
        </form>
      </Modal>

      {/* Reset password */}
      <Modal isOpen={!!resetFor} title={`Reset password — ${resetFor?.username || ''}`} onClose={() => setResetFor(null)}>
        <form onSubmit={handleReset} className="space-y-4">
          <label className="block"><span className={label} style={{ fontSize: 12, fontWeight: 500 }}>New Password</span>
            <input value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="At least 4 characters" className={field} style={{ fontSize: 13 }} required autoFocus />
          </label>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setResetFor(null)} className="bg-white dark:bg-slate-700 border border-blue-100 dark:border-slate-600 text-black dark:text-slate-300 px-4 py-2 rounded-lg hover:bg-blue-50" style={{ fontSize: 13 }}>Cancel</button>
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2" style={{ fontSize: 13 }}><KeyRound size={14} /> Update</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
