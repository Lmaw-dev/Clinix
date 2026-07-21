import { useState, useMemo } from 'react';
import { Plus, Pencil, AlertTriangle, Filter, Search, X, CalendarDays, Archive, ArchiveRestore } from 'lucide-react';
import { InventoryItem, INVENTORY_CATEGORIES, INVENTORY_MONTHS, INVENTORY_YEAR, MonthlyStock, latestRemaining } from '../App';
import { Modal } from './Modal';

const STATUS_OPTIONS = ['In stock', 'Low stock', 'No stock', 'Expiring soon', 'Expired'];

type Props = {
  inventory: InventoryItem[];
  setInventory: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
  globalSearch: string;
  showToast: (m: string) => void;
  addActivity: (m: string) => void;
};

const defaultForm = { name: '', qty: '', unit: '', expiry: '', category: 'Medicines' };

function daysUntil(expiry: string) {
  if (!expiry) return Infinity;
  return (new Date(expiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
}
function isExpired(expiry: string) { return daysUntil(expiry) < 0; }
function isExpiringSoon(expiry: string) { const d = daysUntil(expiry); return d >= 0 && d < 90; } // within 3 months
function isLowStock(qty: number) { return qty > 0 && qty < 5; }

// Alert predicates — shared by the count chips and the click-to-filter behaviour.
// The archived "Medication (Old)" sheet is excluded from live alerts.
const ARCHIVE = 'Medication (Old)';
type AlertKey = 'expired' | 'restock' | 'expiring';
const ALERT_PREDICATES: Record<AlertKey, (i: InventoryItem) => boolean> = {
  expired: (i) => !i.archived && i.category !== ARCHIVE && isExpired(i.expiry),
  restock: (i) => !i.archived && i.category !== ARCHIVE && !isExpired(i.expiry) && i.qty > 0 && i.qty < 5,
  expiring: (i) => !i.archived && i.category !== ARCHIVE && !isExpired(i.expiry) && isExpiringSoon(i.expiry),
};
const ALERT_LABELS: Record<AlertKey, string> = {
  expired: 'expired items', restock: 'low-stock items', expiring: 'items expiring soon',
};

// Status follows the clinic legend: Expired > No stock > Low stock > Expiring soon (3 mo) > In stock.
function stockStatus(item: InventoryItem): { label: string; cls: string } {
  if (isExpired(item.expiry)) return { label: 'Expired', cls: 'bg-red-100 text-red-700' };
  if (item.qty <= 0) return { label: 'No stock', cls: 'bg-slate-100 text-slate-500' };
  if (isLowStock(item.qty)) return { label: 'Low stock', cls: 'bg-amber-100 text-amber-700' };
  if (isExpiringSoon(item.expiry)) return { label: 'Expiring soon', cls: 'bg-yellow-100 text-yellow-800' };
  return { label: 'In stock', cls: 'bg-green-100 text-green-700' };
}

// ── Monthly Remaining/Dispensed log (matches the "Inventory of Medicines 2026" sheet) ──
function MonthlyLog({ item, onClose, onSave }: {
  item: InventoryItem;
  onClose: () => void;
  onSave: (monthly: MonthlyStock[]) => void;
}) {
  const [rows, setRows] = useState<MonthlyStock[]>(() =>
    Array.from({ length: 12 }, (_, i) => item.monthly?.[i] ?? { remaining: null, dispensed: null }),
  );
  const expired = isExpired(item.expiry);

  function setCell(i: number, field: 'remaining' | 'dispensed', value: string) {
    setRows((prev) => {
      const parsed = value === '' ? null : Math.max(0, Math.floor(Number(value) || 0));
      const next = prev.map((r, idx) => (idx === i ? { ...r, [field]: parsed } : r));
      // Rule: when a month goes to 0 remaining (out of stock), the whole prior
      // quantity was dispensed — auto-fill this month's dispensed with it.
      if (field === 'remaining' && parsed === 0) {
        const prevRem = i > 0 ? next[i - 1].remaining : null;
        if (prevRem && prevRem > 0) next[i] = { ...next[i], dispensed: prevRem };
      }
      return next;
    });
  }

  const totalDispensed = rows.reduce((sum, r) => sum + (r.dispensed ?? 0), 0);

  function remainingCls(rem: number | null) {
    if (rem === null) return '';
    if (expired) return 'bg-red-50 text-red-700';
    if (rem <= 0) return 'bg-slate-100 text-slate-500';
    if (rem < 5) return 'bg-yellow-50 text-yellow-800';
    return 'bg-green-50 text-green-700';
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 1000, background: 'rgba(15,23,42,0.6)' }} onClick={onClose}>
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white dark:bg-slate-800 shadow-2xl" style={{ maxHeight: '88vh' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-slate-700 px-5 py-4">
          <div>
            <p className="text-slate-800 dark:text-slate-100" style={{ fontSize: 14, fontWeight: 600 }}>{item.name}</p>
            <p className="text-slate-400" style={{ fontSize: 12 }}>
              Monthly log {INVENTORY_YEAR} · Exp {item.expiry || '—'} · {totalDispensed} dispensed
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700" title="Close"><X size={17} /></button>
        </div>

        <div className="overflow-auto px-5 py-4">
          <table className="w-full">
            <thead>
              <tr className="text-slate-500" style={{ fontSize: 11, fontWeight: 600 }}>
                <th className="text-left uppercase tracking-wider pb-2">Month</th>
                <th className="text-center uppercase tracking-wider pb-2">Remaining</th>
                <th className="text-center uppercase tracking-wider pb-2">Dispensed</th>
              </tr>
            </thead>
            <tbody>
              {INVENTORY_MONTHS.map((m, i) => (
                <tr key={m}>
                  <td className="py-1 pr-2 text-slate-600 dark:text-slate-300" style={{ fontSize: 13 }}>{m}</td>
                  <td className="py-1 px-1">
                    <input
                      type="number" min="0" inputMode="numeric"
                      value={rows[i].remaining ?? ''}
                      onChange={(e) => setCell(i, 'remaining', e.target.value)}
                      className={`w-full rounded-md border border-slate-200 dark:border-slate-600 px-2 py-1.5 text-center outline-none focus:ring-2 focus:ring-blue-100 dark:bg-slate-700 ${remainingCls(rows[i].remaining)}`}
                      style={{ fontSize: 13 }}
                      placeholder="—"
                    />
                  </td>
                  <td className="py-1 px-1">
                    <input
                      type="number" min="0" inputMode="numeric"
                      value={rows[i].dispensed ?? ''}
                      onChange={(e) => setCell(i, 'dispensed', e.target.value)}
                      className="w-full rounded-md border border-slate-200 dark:border-slate-600 px-2 py-1.5 text-center text-slate-700 dark:text-slate-200 dark:bg-slate-700 outline-none focus:ring-2 focus:ring-blue-100"
                      style={{ fontSize: 13 }}
                      placeholder="—"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 dark:border-slate-700 px-5 py-3">
          <button onClick={onClose} className="bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600" style={{ fontSize: 13 }}>Cancel</button>
          <button onClick={() => onSave(rows)} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700" style={{ fontSize: 13, fontWeight: 600 }}>Save log</button>
        </div>
      </div>
    </div>
  );
}

export function InventoryModule({ inventory, setInventory, globalSearch, showToast, addActivity }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [localSearch, setLocalSearch] = useState('');
  const [alertFilter, setAlertFilter] = useState<AlertKey | ''>('');
  const [showArchived, setShowArchived] = useState(false);
  const [logItem, setLogItem] = useState<InventoryItem | null>(null);

  function handleArchive(item: InventoryItem) {
    if (!confirm(`Archive "${item.name}"? It will be hidden from the active list but kept in Archived.`)) return;
    setInventory((prev) => prev.map((i) => i.code === item.code ? { ...i, archived: true } : i));
    showToast(`${item.name} archived`);
    addActivity(`Inventory archived: ${item.name}`);
  }
  function handleRestore(item: InventoryItem) {
    setInventory((prev) => prev.map((i) => i.code === item.code ? { ...i, archived: false } : i));
    showToast(`${item.name} restored`);
    addActivity(`Inventory restored: ${item.name}`);
  }

  // Clicking a warning chip shows exactly those items (and clears the other filters).
  function toggleAlert(key: AlertKey) {
    setAlertFilter((cur) => (cur === key ? '' : key));
    setStatusFilter('');
    setCategoryFilter('');
    setLocalSearch('');
  }

  function saveLog(item: InventoryItem, monthly: MonthlyStock[]) {
    setInventory((prev) => prev.map((i) => i.code === item.code ? { ...i, monthly, qty: latestRemaining(monthly, i.qty) } : i));
    showToast(`Monthly log saved for ${item.name}`);
    addActivity(`Monthly log updated: ${item.name}`);
    setLogItem(null);
  }

  const query = (localSearch || globalSearch).trim().toLowerCase();
  const archivedCount = useMemo(() => inventory.filter((i) => i.archived).length, [inventory]);
  const visible = useMemo(
    () => inventory.filter((i) =>
      (!!i.archived === showArchived) &&
      (!alertFilter || ALERT_PREDICATES[alertFilter](i)) &&
      (!categoryFilter || i.category === categoryFilter) &&
      (!statusFilter || stockStatus(i).label === statusFilter) &&
      [i.code, i.name, i.unit, i.expiry, i.category].join(' ').toLowerCase().includes(query),
    ),
    [inventory, query, statusFilter, categoryFilter, alertFilter, showArchived],
  );

  function openAdd() {
    setForm(defaultForm);
    setEditingCode(null);
    setShowModal(true);
  }

  function openEdit(item: InventoryItem) {
    setForm({ name: item.name, qty: String(item.qty), unit: item.unit, expiry: item.expiry, category: item.category || 'Medicines' });
    setEditingCode(item.code);
    setShowModal(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { showToast('Name required'); return; }
    const qty = Number(form.qty) || 0;
    if (editingCode) {
      setInventory((prev) => prev.map((i) => i.code === editingCode ? { ...i, name: form.name.trim(), qty, unit: form.unit.trim(), expiry: form.expiry, category: form.category } : i));
      showToast('Inventory updated');
      addActivity(`Inventory updated: ${form.name}`);
    } else {
      const code = 'M' + Date.now();
      setInventory((prev) => [...prev, { code, name: form.name.trim(), qty, unit: form.unit.trim(), expiry: form.expiry, category: form.category }]);
      showToast('Inventory item added');
      addActivity(`Inventory added: ${form.name}`);
    }
    setShowModal(false);
    setForm(defaultForm);
    setEditingCode(null);
  }

  // Alert counts (archive excluded via the predicates).
  const expiredCount = inventory.filter(ALERT_PREDICATES.expired).length;
  const restockCount = inventory.filter(ALERT_PREDICATES.restock).length;
  const expiringCount = inventory.filter(ALERT_PREDICATES.expiring).length;
  const fieldClass = 'w-full border border-slate-200 dark:border-slate-600 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';
  const labelClass = 'block text-slate-600 dark:text-slate-400 mb-1';

  return (
    <div className="space-y-5 max-w-screen-xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-slate-900 dark:text-white" style={{ fontWeight: 700, fontSize: 20 }}>Medicine Inventory</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-0.5" style={{ fontSize: 13 }}>Stock levels, expiry tracking, and batch management</p>
        </div>
        <button onClick={openAdd} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 shrink-0" style={{ fontSize: 13 }}>
          <Plus size={15} />Add Medicine
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {/* Search — left */}
        <div className="relative flex-1" style={{ minWidth: 240 }}>
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
            placeholder="Search by name, code, category, or unit..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-9 text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
            style={{ fontSize: 13 }}
          />
          {localSearch && (
            <button onClick={() => setLocalSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600" aria-label="Clear search"><X size={16} /></button>
          )}
        </div>

        {/* Notifications — right (click to show only those items) */}
        {(expiredCount > 0 || restockCount > 0 || expiringCount > 0) && (
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            {expiredCount > 0 && (
              <button type="button" onClick={() => toggleAlert('expired')} title="Show expired items"
                className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 transition-colors ${alertFilter === 'expired' ? 'bg-red-100 border-red-400 ring-2 ring-red-200' : 'bg-red-50 border-red-200 hover:bg-red-100'}`}>
                <AlertTriangle size={15} className="text-red-600 shrink-0" />
                <span className="text-red-700" style={{ fontSize: 13, fontWeight: 500 }}>{expiredCount} expired item{expiredCount !== 1 ? 's' : ''}</span>
              </button>
            )}
            {restockCount > 0 && (
              <button type="button" onClick={() => toggleAlert('restock')} title="Show low-stock items"
                className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 transition-colors ${alertFilter === 'restock' ? 'bg-amber-100 border-amber-400 ring-2 ring-amber-200' : 'bg-amber-50 border-amber-200 hover:bg-amber-100'}`}>
                <AlertTriangle size={15} className="text-amber-600 shrink-0" />
                <span className="text-amber-700" style={{ fontSize: 13, fontWeight: 500 }}>{restockCount} item{restockCount !== 1 ? 's' : ''} low on stock</span>
              </button>
            )}
            {expiringCount > 0 && (
              <button type="button" onClick={() => toggleAlert('expiring')} title="Show items expiring within 3 months"
                className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 transition-colors ${alertFilter === 'expiring' ? 'bg-yellow-100 border-yellow-400 ring-2 ring-yellow-200' : 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100'}`}>
                <AlertTriangle size={15} className="text-yellow-600 shrink-0" />
                <span className="text-yellow-800" style={{ fontSize: 13, fontWeight: 500 }}>{expiringCount} expiring within 3 months</span>
              </button>
            )}
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
          <p className="text-slate-400" style={{ fontSize: 12 }}>
            {alertFilter
              ? <>Showing <span className="text-slate-600 dark:text-slate-300 font-semibold">{visible.length}</span> {ALERT_LABELS[alertFilter]}</>
              : showArchived
                ? <>{visible.length} archived item{visible.length !== 1 ? 's' : ''}</>
                : <>{visible.length} item{visible.length !== 1 ? 's' : ''} in inventory</>}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-slate-500" style={{ fontSize: 12, fontWeight: 600 }}>
              <Filter size={14} />
              Category
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
                style={{ fontSize: 12 }}
              >
                <option value="">All categories</option>
                {INVENTORY_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 text-slate-500" style={{ fontSize: 12, fontWeight: 600 }}>
              Status
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-700 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200"
                style={{ fontSize: 12 }}
              >
                <option value="">All statuses</option>
                {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <button
              onClick={() => { setShowArchived((v) => !v); setAlertFilter(''); }}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 transition-colors ${showArchived ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}
              style={{ fontSize: 12, fontWeight: 600 }}
              title={showArchived ? 'Back to active items' : 'View archived items'}
            >
              <Archive size={13} />
              {showArchived ? 'Viewing archived' : `Archived${archivedCount ? ` (${archivedCount})` : ''}`}
            </button>
            {(statusFilter || categoryFilter || alertFilter) && (
              <button onClick={() => { setStatusFilter(''); setCategoryFilter(''); setAlertFilter(''); }} className="text-blue-600 hover:text-blue-700" style={{ fontSize: 12, fontWeight: 600 }}>
                Clear filters
              </button>
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
                {['Code', 'Item Name', 'Category', 'Qty', 'Unit', 'Expiry', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-slate-500 uppercase tracking-wider" style={{ fontSize: 11, fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {visible.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-slate-400" style={{ fontSize: 13 }}>{showArchived ? 'No archived items' : 'No inventory items found'}</td></tr>
              ) : (
                visible.map((item) => (
                  <tr key={item.code} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="px-5 py-3.5 text-slate-500" style={{ fontSize: 12, fontFamily: 'monospace' }}>{item.code.slice(-8)}</td>
                    <td className="px-5 py-3.5 text-slate-800" style={{ fontSize: 13, fontWeight: 500 }}>{item.name}</td>
                    <td className="px-5 py-3.5" style={{ fontSize: 12 }}>
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 whitespace-nowrap" style={{ fontSize: 11, fontWeight: 500 }}>{item.category || '—'}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={`text-sm ${item.qty <= 0 ? 'text-red-600 font-semibold' : isLowStock(item.qty) ? 'text-amber-600 font-semibold' : 'text-slate-700'}`} style={{ fontSize: 13 }}>
                        {item.qty}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600" style={{ fontSize: 13 }}>{item.unit || '—'}</td>
                    <td className="px-5 py-3.5 text-slate-600 whitespace-nowrap" style={{ fontSize: 13 }}>
                      <span className={isExpired(item.expiry) ? 'text-red-600 font-medium' : isExpiringSoon(item.expiry) ? 'text-yellow-700' : ''}>{item.expiry || '—'}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      {(() => { const s = stockStatus(item); return (
                        <span className={`px-2 py-0.5 rounded-full ${s.cls}`} style={{ fontSize: 11, fontWeight: 500 }}>{s.label}</span>
                      ); })()}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1">
                        <button onClick={() => setLogItem(item)} className="p-1.5 rounded-md hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors" title="Monthly log"><CalendarDays size={14} /></button>
                        <button onClick={() => openEdit(item)} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors" title="Edit"><Pencil size={14} /></button>
                        {item.archived ? (
                          <button onClick={() => handleRestore(item)} className="p-1.5 rounded-md hover:bg-green-50 text-slate-400 hover:text-green-600 transition-colors" title="Restore from archive"><ArchiveRestore size={14} /></button>
                        ) : (
                          <button onClick={() => handleArchive(item)} className="p-1.5 rounded-md hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-colors" title="Archive"><Archive size={14} /></button>
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

      {logItem && <MonthlyLog item={logItem} onClose={() => setLogItem(null)} onSave={(monthly) => saveLog(logItem, monthly)} />}

      <Modal isOpen={showModal} title={editingCode ? 'Edit Medicine' : 'Add Medicine'} onClose={() => { setShowModal(false); setForm(defaultForm); setEditingCode(null); }}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <label><span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Item Name</span><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Paracetamol" className={fieldClass} style={{ fontSize: 13 }} required /></label>
            <label><span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Category</span>
              <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className={fieldClass} style={{ fontSize: 13 }}>
                {INVENTORY_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label><span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Quantity</span><input type="number" min="0" value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))} placeholder="0" className={fieldClass} style={{ fontSize: 13 }} required /></label>
            <label><span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Unit</span><input value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} placeholder="tablet, bottle, pack" className={fieldClass} style={{ fontSize: 13 }} /></label>
          </div>
          <label className="block"><span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Expiry Date <span className="text-slate-400">(leave blank for supplies)</span></span><input type="date" value={form.expiry} onChange={(e) => setForm((f) => ({ ...f, expiry: e.target.value }))} className={fieldClass} style={{ fontSize: 13 }} /></label>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => { setShowModal(false); setForm(defaultForm); setEditingCode(null); }} className="bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors" style={{ fontSize: 13 }}>Cancel</button>
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors" style={{ fontSize: 13 }}>{editingCode ? 'Update' : 'Save'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
