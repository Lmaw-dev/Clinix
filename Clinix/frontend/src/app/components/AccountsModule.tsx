import { useState } from 'react';
import { Plus, ShieldCheck, Trash2, KeyRound, UserCog, Lock } from 'lucide-react';
import { Account, Role, ROLE_LABELS, loadAccounts, saveAccounts } from '../auth';
import { Modal } from './Modal';

type Props = {
  role: Role;
  currentUser: string;
  showToast: (m: string) => void;
  addActivity: (m: string) => void;
};

// Admin may create these roles (not another main admin).
const CREATABLE_ROLES: Role[] = ['assistant', 'staff'];

const ROLE_BADGE: Record<Role, string> = {
  admin: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  assistant: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  staff: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
};

export function AccountsModule({ role, currentUser, showToast, addActivity }: Props) {
  const [accounts, setAccounts] = useState<Account[]>(() => loadAccounts());
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<{ username: string; password: string; role: Role }>({ username: '', password: '', role: 'staff' });
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [newPw, setNewPw] = useState('');

  function persist(next: Account[]) {
    setAccounts(next);
    saveAccounts(next);
  }

  if (role !== 'admin') {
    return (
      <div className="max-w-screen-xl">
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 py-16 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 dark:bg-slate-700/40"><Lock size={22} className="text-slate-300" /></div>
          <p className="text-slate-500" style={{ fontSize: 14, fontWeight: 600 }}>Restricted</p>
          <p className="text-slate-400 mt-1" style={{ fontSize: 12 }}>Only the main administrator can manage accounts.</p>
        </div>
      </div>
    );
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const username = form.username.trim();
    if (!username) { showToast('Enter a username'); return; }
    if (/\s/.test(username)) { showToast('Username cannot contain spaces'); return; }
    if (accounts.some((a) => a.username.toLowerCase() === username.toLowerCase())) { showToast('That username already exists'); return; }
    if (form.password.length < 4) { showToast('Password must be at least 4 characters'); return; }
    const acct: Account = { username, password: form.password, role: form.role };
    persist([...accounts, acct]);
    showToast(`Account "${username}" created`);
    addActivity(`Account created: ${username} (${ROLE_LABELS[form.role]})`);
    setForm({ username: '', password: '', role: 'staff' });
    setShowCreate(false);
  }

  function canDelete(a: Account) {
    return a.role !== 'admin' && a.username !== currentUser;
  }

  function handleDelete(a: Account) {
    if (!canDelete(a)) return;
    if (!confirm(`Delete the account "${a.username}"? They will no longer be able to sign in.`)) return;
    persist(accounts.filter((x) => x.username !== a.username));
    showToast(`Account "${a.username}" deleted`);
    addActivity(`Account deleted: ${a.username}`);
  }

  function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (!resetFor) return;
    if (newPw.length < 4) { showToast('Password must be at least 4 characters'); return; }
    persist(accounts.map((a) => a.username === resetFor ? { ...a, password: newPw } : a));
    showToast(`Password updated for "${resetFor}"`);
    addActivity(`Password reset: ${resetFor}`);
    setResetFor(null);
    setNewPw('');
  }

  const field = 'w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500';
  const label = 'block text-slate-600 dark:text-slate-400 mb-1';

  return (
    <div className="space-y-5 max-w-screen-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-slate-900 dark:text-white flex items-center gap-2" style={{ fontWeight: 700, fontSize: 20 }}>
            <ShieldCheck size={20} className="text-blue-600" /> Accounts
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-0.5" style={{ fontSize: 13 }}>
            Create and manage staff and assistant accounts (admin only)
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 shrink-0" style={{ fontSize: 13 }}>
          <Plus size={15} />Create Account
        </button>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700">
          <p className="text-slate-400" style={{ fontSize: 12 }}>{accounts.length} account{accounts.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
                {['Username', 'Role', 'Access', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-slate-500 uppercase tracking-wider" style={{ fontSize: 11, fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {accounts.map((a) => (
                <tr key={a.username} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500"><UserCog size={15} /></div>
                      <span className="text-slate-800 dark:text-slate-100" style={{ fontSize: 13, fontWeight: 600 }}>
                        {a.username}
                        {a.username === currentUser && <span className="ml-2 text-slate-400" style={{ fontSize: 11, fontWeight: 400 }}>(you)</span>}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex px-2 py-0.5 rounded-full ${ROLE_BADGE[a.role]}`} style={{ fontSize: 11, fontWeight: 600 }}>{ROLE_LABELS[a.role]}</span>
                  </td>
                  <td className="px-5 py-3.5 text-slate-500" style={{ fontSize: 12 }}>
                    {a.role === 'staff' ? 'Dashboard · Consultations · Reports' : a.role === 'assistant' ? 'All pages except Accounts' : 'Full access'}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-1">
                      <button onClick={() => { setResetFor(a.username); setNewPw(''); }} className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Reset password"><KeyRound size={15} /></button>
                      <button onClick={() => handleDelete(a)} disabled={!canDelete(a)} className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400" title={canDelete(a) ? 'Delete account' : 'Protected account'}><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create account */}
      <Modal isOpen={showCreate} title="Create Account" onClose={() => setShowCreate(false)}>
        <form onSubmit={handleCreate} className="space-y-4">
          <label className="block"><span className={label} style={{ fontSize: 12, fontWeight: 500 }}>Username</span>
            <input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} placeholder="e.g. jdelacruz" className={field} style={{ fontSize: 13 }} required />
          </label>
          <label className="block"><span className={label} style={{ fontSize: 12, fontWeight: 500 }}>Password</span>
            <input value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} placeholder="At least 4 characters" className={field} style={{ fontSize: 13 }} required />
          </label>
          <label className="block"><span className={label} style={{ fontSize: 12, fontWeight: 500 }}>Role</span>
            <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))} className={field} style={{ fontSize: 13 }}>
              {CREATABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
            <p className="text-slate-400 mt-1" style={{ fontSize: 11 }}>
              {form.role === 'staff' ? 'Can view Dashboard, Consultation Logs, and Reports only.' : 'Can access everything except this Accounts page and confidential info.'}
            </p>
          </label>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowCreate(false)} className="bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg hover:bg-slate-50" style={{ fontSize: 13 }}>Cancel</button>
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2" style={{ fontSize: 13 }}><Plus size={14} /> Create</button>
          </div>
        </form>
      </Modal>

      {/* Reset password */}
      <Modal isOpen={!!resetFor} title={`Reset password — ${resetFor || ''}`} onClose={() => setResetFor(null)}>
        <form onSubmit={handleReset} className="space-y-4">
          <label className="block"><span className={label} style={{ fontSize: 12, fontWeight: 500 }}>New Password</span>
            <input value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="At least 4 characters" className={field} style={{ fontSize: 13 }} required autoFocus />
          </label>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setResetFor(null)} className="bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg hover:bg-slate-50" style={{ fontSize: 13 }}>Cancel</button>
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2" style={{ fontSize: 13 }}><KeyRound size={14} /> Update</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
