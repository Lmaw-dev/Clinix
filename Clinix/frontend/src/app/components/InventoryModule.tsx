import { useState, useMemo } from 'react';
import { Plus, Pencil, AlertTriangle } from 'lucide-react';
import { InventoryItem } from '../App';
import { Modal } from './Modal';

type Props = {
  inventory: InventoryItem[];
  setInventory: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
  globalSearch: string;
  showToast: (m: string) => void;
  addActivity: (m: string) => void;
};

const defaultForm = { name: '', qty: '', unit: '', expiry: '' };

function isLowStock(qty: number) { return qty >= 0 && qty < 5; }
function isExpiringSoon(expiry: string) {
  if (!expiry) return false;
  const d = new Date(expiry);
  const diff = (d.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff < 30;
}

export function InventoryModule({ inventory, setInventory, globalSearch, showToast, addActivity }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [editingCode, setEditingCode] = useState<string | null>(null);

  const query = globalSearch.trim().toLowerCase();
  const visible = useMemo(
    () => inventory.filter((i) => [i.code, i.name, i.unit, i.expiry].join(' ').toLowerCase().includes(query)),
    [inventory, query],
  );

  function openAdd() {
    setForm(defaultForm);
    setEditingCode(null);
    setShowModal(true);
  }

  function openEdit(item: InventoryItem) {
    setForm({ name: item.name, qty: String(item.qty), unit: item.unit, expiry: item.expiry });
    setEditingCode(item.code);
    setShowModal(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { showToast('Name required'); return; }
    const qty = Number(form.qty) || 0;
    if (editingCode) {
      setInventory((prev) => prev.map((i) => i.code === editingCode ? { ...i, name: form.name.trim(), qty, unit: form.unit.trim(), expiry: form.expiry } : i));
      showToast('Inventory updated');
      addActivity(`Inventory updated: ${form.name}`);
    } else {
      const code = 'M' + Date.now();
      setInventory((prev) => [...prev, { code, name: form.name.trim(), qty, unit: form.unit.trim(), expiry: form.expiry }]);
      showToast('Inventory item added');
      addActivity(`Inventory added: ${form.name}`);
    }
    setShowModal(false);
    setForm(defaultForm);
    setEditingCode(null);
  }

  const lowCount = inventory.filter((i) => isLowStock(i.qty)).length;
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

      {lowCount > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertTriangle size={16} className="text-amber-600 shrink-0" />
          <p className="text-amber-700" style={{ fontSize: 13 }}>
            {lowCount} item{lowCount !== 1 ? 's' : ''} with low stock (fewer than 5 units)
          </p>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700">
        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700">
          <p className="text-slate-400" style={{ fontSize: 12 }}>{visible.length} item{visible.length !== 1 ? 's' : ''} in inventory</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-700">
                {['Code', 'Medicine Name', 'Qty', 'Unit', 'Expiry', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-slate-500 uppercase tracking-wider" style={{ fontSize: 11, fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {visible.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400" style={{ fontSize: 13 }}>No inventory items found</td></tr>
              ) : (
                visible.map((item) => (
                  <tr key={item.code} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                    <td className="px-5 py-3.5 text-slate-500" style={{ fontSize: 12, fontFamily: 'monospace' }}>{item.code.slice(-8)}</td>
                    <td className="px-5 py-3.5 text-slate-800" style={{ fontSize: 13, fontWeight: 500 }}>{item.name}</td>
                    <td className="px-5 py-3.5">
                      <span className={`text-sm ${isLowStock(item.qty) ? 'text-amber-600 font-semibold' : 'text-slate-700'}`} style={{ fontSize: 13 }}>
                        {item.qty}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600" style={{ fontSize: 13 }}>{item.unit || '—'}</td>
                    <td className="px-5 py-3.5 text-slate-600 whitespace-nowrap" style={{ fontSize: 13 }}>
                      <span className={isExpiringSoon(item.expiry) ? 'text-red-600' : ''}>{item.expiry || '—'}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      {isLowStock(item.qty) ? (
                        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700" style={{ fontSize: 11, fontWeight: 500 }}>Low stock</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700" style={{ fontSize: 11, fontWeight: 500 }}>In stock</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      <button onClick={() => openEdit(item)} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"><Pencil size={14} /></button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={showModal} title={editingCode ? 'Edit Medicine' : 'Add Medicine'} onClose={() => { setShowModal(false); setForm(defaultForm); setEditingCode(null); }}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <label><span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Medicine Name</span><input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Paracetamol" className={fieldClass} style={{ fontSize: 13 }} required /></label>
            <label><span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Quantity</span><input type="number" min="0" value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))} placeholder="0" className={fieldClass} style={{ fontSize: 13 }} required /></label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <label><span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Unit</span><input value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} placeholder="tablets, mL, pcs" className={fieldClass} style={{ fontSize: 13 }} /></label>
            <label><span className={labelClass} style={{ fontSize: 12, fontWeight: 500 }}>Expiry Date</span><input type="date" value={form.expiry} onChange={(e) => setForm((f) => ({ ...f, expiry: e.target.value }))} className={fieldClass} style={{ fontSize: 13 }} /></label>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => { setShowModal(false); setForm(defaultForm); setEditingCode(null); }} className="bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors" style={{ fontSize: 13 }}>Cancel</button>
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors" style={{ fontSize: 13 }}>{editingCode ? 'Update' : 'Save'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
