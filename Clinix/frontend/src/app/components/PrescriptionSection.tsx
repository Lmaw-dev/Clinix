import { useState, useMemo, useRef, useEffect } from 'react';
import { Pill, Plus, Trash2, AlertTriangle, Sparkles, ShieldAlert, PackageX, BookmarkPlus, Stethoscope } from 'lucide-react';
import { InventoryItem } from '../App';
import {
  Prescription, dispensePrescription, deletePrescriptionApi, OutOfStockError,
  aiStatusApi, suggestMedicinesApi, type MedicineSuggestion, type SuggestionResult,
  protocolForComplaint, saveProtocolEntry, type FormularyEntry,
} from '../store';

// ── Prescribing from the consultation ────────────────────────────────────────
// Management stays a free-text field — the nurse writes what she wants. This
// section sits underneath it and captures the *structured* part: which medicine
// left the shelf and how much of it, so the inventory count is a consequence of
// treating a patient rather than something anybody has to remember to subtract.
//
// The medicine is typed, not picked from a dropdown: a clinic list runs to
// dozens of items and the nurse already knows the name. Matches are suggested as
// she types, and only a suggestion can be chosen — a free-typed name would not
// be tied to a stock row and could not be deducted.

type Props = {
  consultationId: string;
  // Clinical text used for suggestions. Nothing identifying is passed — see
  // the AI section below.
  purpose?: string;
  chiefComplaint?: string;
  assessment?: string;
  age?: string;
  sex?: string;
  patientId?: string;
  patientName?: string;
  inventory: InventoryItem[];
  setInventory: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
  prescriptions: Prescription[];
  setPrescriptions: React.Dispatch<React.SetStateAction<Prescription[]>>;
  currentUser: string;
  showToast: (m: string) => void;
  addActivity: (m: string) => void;
  readOnly?: boolean;
};

/** Dispensable stock: medicines that are neither archived nor already empty. */
function isDispensable(item: InventoryItem): boolean {
  return !item.archived && item.qty > 0;
}

export function PrescriptionSection({
  consultationId, purpose, chiefComplaint, assessment, age, sex,
  patientId, patientName, inventory, setInventory,
  prescriptions, setPrescriptions, currentUser, showToast, addActivity, readOnly = false,
}: Props) {
  const mine = useMemo(
    () => prescriptions.filter((p) => p.consultationId === consultationId),
    [prescriptions, consultationId],
  );

  // Stays open on its own once something has been dispensed, so reopening the
  // record never hides medicine that was already handed out.
  const [enabled, setEnabled] = useState(mine.length > 0);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<InventoryItem | null>(null);
  const [qty, setQty] = useState('');
  const [dosage, setDosage] = useState('');
  const [busy, setBusy] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (mine.length) setEnabled(true); }, [mine.length]);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || picked) return [];
    return inventory
      .filter(isDispensable)
      .filter((i) => i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q))
      .slice(0, 6);
  }, [query, picked, inventory]);

  useEffect(() => { setHighlight(0); }, [query]);

  function choose(item: InventoryItem) {
    setPicked(item);
    setQuery(item.name);
  }

  function clearPick() {
    setPicked(null);
    setQuery('');
    setQty('');
    setDosage('');
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!suggestions.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((h) => (h + 1) % suggestions.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(suggestions[highlight]); }
    else if (e.key === 'Escape') { setQuery(''); }
  }

  async function dispense() {
    if (!picked) { showToast('Choose a medicine from the suggestions'); return; }
    const amount = Number(qty);
    if (!Number.isInteger(amount) || amount <= 0) { showToast('Enter how many to dispense'); return; }
    if (amount > picked.qty) { showToast(`Only ${picked.qty} ${picked.unit || 'left'} in stock`); return; }

    setBusy(true);
    try {
      // The server writes the prescription and deducts the stock together, so
      // there is no window where one exists without the other.
      const { id, remaining } = await dispensePrescription({
        consultationId,
        patientId,
        patientName,
        itemCode: picked.code,
        itemName: picked.name,
        quantity: amount,
        dosage: dosage.trim(),
        dispensedBy: currentUser || 'nurse',
      });

      setInventory((prev) => prev.map((i) => (i.code === picked.code ? { ...i, qty: remaining } : i)));
      setPrescriptions((prev) => [
        { id, consultationId, patientId, patientName, itemCode: picked.code, itemName: picked.name, quantity: amount, dosage: dosage.trim() },
        ...prev,
      ]);
      showToast(`${amount} ${picked.unit || ''} ${picked.name} dispensed`.replace(/\s+/g, ' '));
      addActivity(`Dispensed ${amount} ${picked.name} to ${patientName || patientId || 'a patient'}`);
      clearPick();
    } catch (err) {
      if (err instanceof OutOfStockError) {
        // Someone else took stock between loading the screen and dispensing.
        setInventory((prev) => prev.map((i) => (i.code === picked.code ? { ...i, qty: err.available } : i)));
        showToast(err.message);
      } else {
        showToast(err instanceof Error ? err.message : 'Could not dispense the medicine');
      }
    } finally {
      setBusy(false);
    }
  }

  async function undo(p: Prescription) {
    if (!p.id) return;
    setBusy(true);
    try {
      await deletePrescriptionApi(p.id);
      setPrescriptions((prev) => prev.filter((x) => x.id !== p.id));
      setInventory((prev) => prev.map((i) => (i.code === p.itemCode ? { ...i, qty: i.qty + p.quantity } : i)));
      showToast(`${p.itemName} returned to stock`);
    } catch {
      showToast('Could not undo — check the connection to the server');
    } finally {
      setBusy(false);
    }
  }

  // ── Suggestions ────────────────────────────────────────────────────────────
  // A reference the nurse can consult, not a decision. Suggestions are never
  // dispensed automatically: picking one only fills in the medicine field, and
  // a drug the clinic does not stock is shown plainly as unavailable rather
  // than hidden, because knowing what to buy is part of the answer.
  const [aiOn, setAiOn] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [advice, setAdvice] = useState<SuggestionResult | null>(null);

  useEffect(() => { aiStatusApi().then(setAiOn); }, []);

  // The clinic's own protocol is checked automatically whenever the record is
  // opened: it costs nothing, needs no network beyond the local server, and is
  // the answer the nurse already decided on. The AI stays behind a button.
  const [protocol, setProtocol] = useState<FormularyEntry[]>([]);
  useEffect(() => {
    let cancelled = false;
    protocolForComplaint(chiefComplaint || '').then((rows) => { if (!cancelled) setProtocol(rows); });
    return () => { cancelled = true; };
  }, [chiefComplaint]);

  function useProtocol(entry: FormularyEntry) {
    const item = inventory.find((i) => i.code === entry.itemCode);
    if (!item) { showToast(`${entry.itemName} is not in the inventory`); return; }
    choose(item);
    if (entry.dose) setDosage(entry.dose);
  }

  /** Capture what was just dispensed as protocol for next time. */
  async function saveAsProtocol(p: Prescription) {
    const complaint = (chiefComplaint || '').trim();
    if (!complaint) { showToast('No complaint recorded to file this under'); return; }
    try {
      await saveProtocolEntry({
        complaint,
        itemCode: p.itemCode,
        itemName: p.itemName || '',
        dose: p.dosage || '',
        addedBy: currentUser || 'nurse',
      });
      showToast(`Saved to clinic protocol for "${complaint}"`);
      setProtocol(await protocolForComplaint(complaint));
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save to protocol');
    }
  }

  async function askForSuggestions() {
    setAiBusy(true);
    try {
      // Only clinical text is passed — no name, ID, birthdate or contact.
      const result = await suggestMedicinesApi({ purpose, chiefComplaint, assessment, age, sex });
      setAdvice(result);
      if (!result.suggestions.length && !result.redFlags.length) {
        showToast('No suggestions for this complaint');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not get suggestions');
    } finally {
      setAiBusy(false);
    }
  }

  /** Fill the medicine field from a suggestion the clinic actually stocks. */
  function useSuggestion(s: MedicineSuggestion) {
    const item = inventory.find((i) => i.code === s.itemCode);
    if (!item) { showToast(`${s.genericName} is not in the inventory`); return; }
    choose(item);
    if (s.typicalDose) setDosage(s.typicalDose);
  }

  const fieldClass = 'w-full border border-blue-100 dark:border-slate-600 rounded-lg px-3 py-2 text-black dark:text-slate-200 bg-white dark:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="rounded-lg border border-blue-100 dark:border-slate-600 p-3">
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={enabled}
          disabled={readOnly || mine.length > 0}
          onChange={(e) => { setEnabled(e.target.checked); if (!e.target.checked) clearPick(); }}
          className="w-4 h-4 accent-blue-600"
        />
        <span className="flex items-center gap-1.5 text-black dark:text-slate-200" style={{ fontSize: 13, fontWeight: 600 }}>
          <Pill size={14} className="text-blue-600" /> Prescription
        </span>
        <span className="text-slate-400" style={{ fontSize: 11 }}>
          medicine taken from inventory
        </span>
      </label>

      {enabled && (
        <div className="mt-3 space-y-2.5">
          {!readOnly && protocol.length > 0 && (
            <div className="rounded-lg bg-emerald-50 dark:bg-slate-700/40 border border-emerald-100 dark:border-slate-600 p-2.5">
              <span className="flex items-center gap-1.5 text-emerald-800 dark:text-emerald-300" style={{ fontSize: 12, fontWeight: 600 }}>
                <Stethoscope size={13} /> Clinic protocol
              </span>
              <p className="text-slate-500 mt-0.5 mb-2" style={{ fontSize: 10.5 }}>
                What this clinic gives for this complaint — recorded by your own staff.
              </p>
              <div className="space-y-1.5">
                {protocol.map((entry) => (
                  <div key={entry.id} className="flex items-start justify-between gap-2 rounded-md bg-white dark:bg-slate-700 border border-emerald-100 dark:border-slate-600 px-2.5 py-1.5">
                    <div className="min-w-0">
                      <p className="text-black dark:text-slate-200 truncate" style={{ fontSize: 12.5, fontWeight: 600 }}>{entry.itemName}</p>
                      {entry.dose && <p className="text-slate-500 truncate" style={{ fontSize: 10.5 }}>{entry.dose}</p>}
                      {entry.addedBy && <p className="text-slate-400" style={{ fontSize: 10 }}>added by {entry.addedBy}</p>}
                    </div>
                    {entry.inStock ? (
                      <button type="button" onClick={() => useProtocol(entry)} disabled={busy}
                        className="shrink-0 px-2 py-1 rounded-md border border-emerald-300 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50"
                        style={{ fontSize: 10.5, fontWeight: 600 }}>
                        Use ({entry.available} {entry.unit})
                      </button>
                    ) : (
                      <span className="shrink-0 flex items-center gap-1 text-slate-400" style={{ fontSize: 10.5 }}>
                        <PackageX size={11} /> out of stock
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!readOnly && aiOn && (
            <div className="rounded-lg bg-violet-50 dark:bg-slate-700/40 border border-violet-100 dark:border-slate-600 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-violet-800 dark:text-violet-300" style={{ fontSize: 12, fontWeight: 600 }}>
                  <Sparkles size={13} /> Suggested medicines
                </span>
                <button
                  type="button"
                  onClick={askForSuggestions}
                  disabled={aiBusy || busy}
                  className="px-2.5 py-1 rounded-md bg-violet-600 text-white disabled:opacity-60"
                  style={{ fontSize: 11, fontWeight: 600 }}
                >
                  {aiBusy ? 'Thinking…' : advice ? 'Ask again' : 'Suggest'}
                </button>
              </div>
              <p className="text-slate-500 mt-1" style={{ fontSize: 10.5 }}>
                Based on the complaint and assessment only — no patient name or ID is sent.
                Suggestions are a reference; you decide what is given.
              </p>

              {advice && (
                <div className="mt-2.5 space-y-2">
                  {advice.referralAdvised && (
                    <p className="flex items-start gap-1.5 rounded-md bg-red-50 dark:bg-red-900/20 px-2 py-1.5 text-red-700 dark:text-red-300" style={{ fontSize: 11.5, fontWeight: 600 }}>
                      <ShieldAlert size={13} className="mt-0.5 shrink-0" />
                      Referral advised — this may need a doctor rather than medicine.
                    </p>
                  )}

                  {advice.redFlags.length > 0 && (
                    <ul className="rounded-md bg-amber-50 dark:bg-amber-900/20 px-2 py-1.5 space-y-0.5">
                      {advice.redFlags.map((f) => (
                        <li key={f} className="flex items-start gap-1.5 text-amber-800 dark:text-amber-300" style={{ fontSize: 11.5 }}>
                          <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {f}
                        </li>
                      ))}
                    </ul>
                  )}

                  {advice.suggestions.map((s) => (
                    <div key={s.genericName} className="rounded-md bg-white dark:bg-slate-700 border border-violet-100 dark:border-slate-600 px-2.5 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-black dark:text-slate-200" style={{ fontSize: 12.5, fontWeight: 600 }}>{s.genericName}</p>
                          <p className="text-slate-500" style={{ fontSize: 10.5 }}>{s.drugClass}{s.typicalDose ? ` · ${s.typicalDose}` : ''}</p>
                        </div>
                        {s.inStock ? (
                          <button
                            type="button"
                            onClick={() => useSuggestion(s)}
                            disabled={busy}
                            className="shrink-0 px-2 py-1 rounded-md border border-violet-300 text-violet-700 dark:text-violet-300 hover:bg-violet-50"
                            style={{ fontSize: 10.5, fontWeight: 600 }}
                          >
                            Use ({s.available} {s.unit})
                          </button>
                        ) : (
                          <span className="shrink-0 flex items-center gap-1 text-slate-400" style={{ fontSize: 10.5 }}>
                            <PackageX size={11} /> not in stock
                          </span>
                        )}
                      </div>
                      {s.rationale && <p className="text-slate-600 dark:text-slate-400 mt-1" style={{ fontSize: 11 }}>{s.rationale}</p>}
                      {s.cautions && (
                        <p className="text-amber-700 dark:text-amber-400 mt-0.5" style={{ fontSize: 10.5 }}>
                          Caution: {s.cautions}
                        </p>
                      )}
                    </div>
                  ))}

                  {advice.notes && <p className="text-slate-500" style={{ fontSize: 11 }}>{advice.notes}</p>}
                </div>
              )}
            </div>
          )}

          {!readOnly && (
            <>
              <div className="relative" ref={boxRef}>
                <input
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setPicked(null); }}
                  onKeyDown={onKeyDown}
                  placeholder="Type a medicine name…"
                  className={fieldClass}
                  style={{ fontSize: 13 }}
                  disabled={busy}
                />
                {suggestions.length > 0 && (
                  <ul className="absolute z-20 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-blue-100 dark:border-slate-600 bg-white dark:bg-slate-700 shadow-lg">
                    {suggestions.map((s, idx) => (
                      <li key={s.code}>
                        <button
                          type="button"
                          onMouseEnter={() => setHighlight(idx)}
                          onClick={() => choose(s)}
                          className={`w-full text-left px-3 py-2 flex justify-between items-center gap-2 ${idx === highlight ? 'bg-blue-50 dark:bg-slate-600' : ''}`}
                        >
                          <span className="text-black dark:text-slate-200" style={{ fontSize: 13 }}>{s.name}</span>
                          <span className="text-slate-400 shrink-0" style={{ fontSize: 11 }}>
                            {s.qty} {s.unit} left
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {query.trim() && !picked && suggestions.length === 0 && (
                  <p className="mt-1 flex items-center gap-1.5 text-amber-600" style={{ fontSize: 11 }}>
                    <AlertTriangle size={12} />
                    Nothing in stock matches "{query.trim()}"
                  </p>
                )}
              </div>

              {picked && (
                <>
                  <div className="flex items-center justify-between rounded-lg bg-blue-50 dark:bg-slate-700/40 px-3 py-2">
                    <span className="text-black dark:text-slate-200" style={{ fontSize: 13, fontWeight: 600 }}>{picked.name}</span>
                    <span className="text-slate-500" style={{ fontSize: 11 }}>{picked.qty} {picked.unit} available</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      value={qty}
                      onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder={`Qty (${picked.unit || 'pcs'})`}
                      inputMode="numeric"
                      className={fieldClass}
                      style={{ fontSize: 13 }}
                      disabled={busy}
                    />
                    <input
                      value={dosage}
                      onChange={(e) => setDosage(e.target.value)}
                      placeholder="Dosage / sig (optional)"
                      className={`${fieldClass} col-span-2`}
                      style={{ fontSize: 13 }}
                      disabled={busy}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={clearPick} disabled={busy} className="px-3 py-1.5 rounded-lg border border-blue-100 dark:border-slate-600 text-slate-600 dark:text-slate-300" style={{ fontSize: 12 }}>
                      Clear
                    </button>
                    <button type="button" onClick={dispense} disabled={busy} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white disabled:opacity-60" style={{ fontSize: 12, fontWeight: 600 }}>
                      <Plus size={13} /> {busy ? 'Dispensing…' : 'Dispense'}
                    </button>
                  </div>
                </>
              )}
            </>
          )}

          {mine.length > 0 && (
            <ul className="space-y-1.5 pt-1">
              {mine.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 rounded-lg bg-blue-50 dark:bg-slate-700/40 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-black dark:text-slate-200 truncate" style={{ fontSize: 13 }}>
                      {p.itemName} <span className="text-slate-500">×{p.quantity}</span>
                    </p>
                    {p.dosage && <p className="text-slate-500 truncate" style={{ fontSize: 11 }}>{p.dosage}</p>}
                  </div>
                  {!readOnly && (
                    <div className="flex shrink-0 items-center">
                      <button
                        type="button"
                        onClick={() => saveAsProtocol(p)}
                        disabled={busy || !chiefComplaint}
                        title={chiefComplaint ? `Save as this clinic's protocol for "${chiefComplaint}"` : 'No complaint recorded to file this under'}
                        className="p-1.5 rounded-md text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 disabled:opacity-40"
                      >
                        <BookmarkPlus size={14} />
                      </button>
                      <button type="button" onClick={() => undo(p)} disabled={busy} title="Undo and return to stock" className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}

          {mine.length === 0 && readOnly && (
            <p className="text-slate-400" style={{ fontSize: 12 }}>No medicine dispensed.</p>
          )}
        </div>
      )}
    </div>
  );
}
