import { useCallback, useEffect, useRef, useState } from 'react';
import type { Charge, Collection, CollectionDetail, Family, FamilyChild, FamilyOutstanding, ManualAllocation } from '../../shared/types';
import { api, errMsg } from '../lib/api';
import { Modal, PrintHeader, SearchSelect, Spinner, Toast, fmtDateTime, fmtMoney, printModal, todayIso } from '../components/shared';

export function CollectionsScreen() {
  const [rows, setRows] = useState<Collection[] | null>(null);
  const [families, setFamilies] = useState<Family[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [familyId, setFamilyId] = useState(0);
  const [children, setChildren] = useState<FamilyChild[] | null>(null);
  const [studentId, setStudentId] = useState(0);
  // '' = current school year (default); '*' = all years; otherwise a specific year.
  const [payYear, setPayYear] = useState('');
  const [outstanding, setOutstanding] = useState<FamilyOutstanding | null>(null);
  const [schoolYear, setSchoolYear] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIso());
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<CollectionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [toastTone, setToastTone] = useState<'success' | 'error'>('success');
  // Tracks which receipt the pending detail fetch belongs to, so closing the
  // modal mid-load can't let a stale response re-open it.
  const detailRequest = useRef<number | null>(null);
  const [receiptToVoid, setReceiptToVoid] = useState<Collection | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);
  // Manual distribution mode
  const [distMode, setDistMode] = useState<'auto' | 'manual'>('auto');
  const [manualOpen, setManualOpen] = useState(false);
  const [unpaidCharges, setUnpaidCharges] = useState<Charge[]>([]);
  const [manualAllocs, setManualAllocs] = useState<ManualAllocation[]>([]);

  const PAGE = 20;
  const load = useCallback((off = 0) => {
    void api
      .listCollections({ limit: PAGE, offset: off })
      .then((res) => {
        setRows(res.rows);
        setTotal(res.total);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
    void api.listFamilies().then(setFamilies).catch(() => undefined);
    void api.getPtaSettings().then((s) => setSchoolYear(s.school_year)).catch(() => undefined);
  }, [load]);

  // Prior-year balances (everything except the current school year).
  const priorYears = outstanding?.years.filter((y) => y.school_year !== schoolYear) ?? [];
  const currentDue = outstanding?.years.find((y) => y.school_year === schoolYear)?.total_due ?? 0;
  const priorDue = priorYears.reduce((s, y) => s + y.total_due, 0);

  const notify = (msg: string, tone: 'success' | 'error' = 'success') => {
    setToast(msg);
    setToastTone(tone);
    setTimeout(() => setToast(null), 3000);
  };

  const onFamilySelect = (fid: number) => {
    setFamilyId(fid);
    setStudentId(0);
    setPayYear('');
    setAmount('');
    setError(null);
    setManualAllocs([]);
    if (fid) {
      api
        .getFamilyDetail(fid)
        .then((d) => setChildren(d.children))
        .catch(() => setChildren([]));
      api
        .familyOutstanding(fid)
        .then(setOutstanding)
        .catch(() => setOutstanding(null));
    } else {
      setChildren(null);
      setOutstanding(null);
      setUnpaidCharges([]);
    }
  };

  /** Fetch unpaid charges for the manual distribution modal. */
  const fetchUnpaid = async () => {
    if (!familyId) return;
    const year = payYear === '*' ? schoolYear : payYear || schoolYear;
    try {
      const charges = await api.listCharges(year, familyId);
      const unpaid = charges.filter((c) => c.paid_amount < c.amount);
      setUnpaidCharges(unpaid);
      // Pre-fill with current manual allocs (preserving user edits)
      setManualAllocs((prev) =>
        prev.filter((a) => unpaid.some((c) => c.id === a.charge_id)),
      );
    } catch {
      setUnpaidCharges([]);
    }
  };

  const openDetail = async (r: Collection) => {
    detailRequest.current = r.id;
    setDetailLoading(true);
    setDetail(null);
    try {
      const d = await api.collectionDetail(r.id);
      if (detailRequest.current === r.id) setDetail(d);
    } catch (err) {
      if (detailRequest.current === r.id) notify(errMsg(err), 'error');
    } finally {
      if (detailRequest.current === r.id) setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    detailRequest.current = null;
    setDetail(null);
    setDetailLoading(false);
  };

  const save = async () => {
    if (!familyId) {
      setError('Select a family.');
      return;
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const detailRow = await api.createCollection({
        family_id: familyId,
        student_id: studentId || undefined,
        amount: amt,
        pay_year: payYear || undefined,
        collected_at: date || undefined,
        notes: notes || undefined,
        manual_allocations: distMode === 'manual' && manualAllocs.length > 0 ? manualAllocs : undefined,
      });
      setDetail(detailRow);
      setAmount('');
      setNotes('');
      setFamilyId(0);
      setChildren(null);
      setStudentId(0);
      setManualAllocs([]);
      setUnpaidCharges([]);
      setDistMode('auto');
      setOffset(0);
      load(0);
      // Re-fetch families so the dropdown shows the updated balance.
      void api.listFamilies().then(setFamilies).catch(() => {});
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const voidRow = async (r: Collection) => {
    setVoiding(true);
    setVoidError(null);
    try {
      await api.voidCollection(r.id);
      setReceiptToVoid(null);
      notify('Collection voided');
      load(offset);
    } catch (err) {
      setVoidError(errMsg(err));
    } finally {
      setVoiding(false);
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Collections</h2>
          <p className="text-dim">{total} receipts recorded</p>
        </div>
      </div>

      <div className="card form-card">
        <h3>Record collection</h3>
        <div className="grid-2">
          <div className="field">
            <label>Family (guardian)</label>
            <SearchSelect
              value={familyId || null}
              onSelect={(v) => onFamilySelect(v ?? 0)}
              options={families.map((f) => ({
                value: f.id,
                label: `${f.guardian_name}${f.student_count > 1 ? ` (${f.student_count} children)` : ''} — ${fmtMoney(f.balance)}`,
                searchText: f.guardian_address,
              }))}
              placeholder="Type to search guardian or address…"
              emptyText="No family matches your search"
            />
          </div>
          <div className="field">
            <label>Amount (₱)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 650"
            />
          </div>
          {familyId > 0 && outstanding && (
            <div className="field field-full">
              <div className="balance-strip">
                <span className="text-dim">Outstanding balance:</span>
                <strong className={outstanding.total_due > 0 ? 'neg strong' : 'pos strong'}>{fmtMoney(outstanding.total_due)}</strong>
                {priorYears.length > 0 && (
                  <span className="text-dim">· {fmtMoney(currentDue)} this year · {fmtMoney(priorDue)} prior years</span>
                )}
                {outstanding.total_due > 0 && (
                  <button
                    className="btn-ghost sm"
                    onClick={() => {
                      setPayYear('*');
                      setAmount(String(outstanding.total_due));
                    }}
                  >
                    Use full balance
                  </button>
                )}
              </div>
              <p className="field-hint">Parents may pay partial — enter any amount up to the balance above.</p>
            </div>
          )}
          {children !== null && (
            <div className="field field-full">
              <label>Child (optional)</label>
              <select value={studentId} onChange={(e) => { setStudentId(Number(e.target.value)); setError(null); }}>
                <option value={0}>— All children (auto-apply) —</option>
                {children.map((c) => (
                  <option key={c.student_id} value={c.student_id}>
                    {c.full_name} — {c.grade_section}
                  </option>
                ))}
              </select>
            </div>
          )}
          {priorYears.length > 0 && (
            <div className="field field-full">
              <label>Pay for school year</label>
              <select value={payYear} onChange={(e) => { setPayYear(e.target.value); setError(null); }}>
                <option value="">Current school year</option>
                <option value="*">All years (oldest first)</option>
                {priorYears.map((y) => (
                  <option key={y.school_year} value={y.school_year}>SY {y.school_year} (has balance)</option>
                ))}
              </select>
              <p className="field-hint">This family has prior-year balances. Pick a year to settle that balance, or choose "All years" to settle everything.</p>
            </div>
          )}
          <div className="field">
            <label>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label>Notes (optional)</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Cash — first payment" />
          </div>
          {familyId > 0 && (
            <div className="field field-full">
              <label>Distribution</label>
              <div className="dist-toggle">
                <button
                  type="button"
                  className={`dist-toggle-btn ${distMode === 'auto' ? 'on' : ''}`}
                  onClick={() => { setDistMode('auto'); setManualAllocs([]); }}
                >
                  ⚡ Auto (FIFO)
                </button>
                <button
                  type="button"
                  className={`dist-toggle-btn ${distMode === 'manual' ? 'on' : ''}`}
                  onClick={() => {
                    setDistMode('manual');
                    void fetchUnpaid().then(() => setManualOpen(true));
                  }}
                >
                  ✏️ Manual
                </button>
              </div>
              {distMode === 'manual' && manualAllocs.length > 0 && (
                <div className="manual-summary">
                  <span className="text-dim">Manual allocation:</span>
                  {manualAllocs.map((a) => {
                    const ch = unpaidCharges.find((c) => c.id === a.charge_id);
                    return (
                      <span key={a.charge_id} className="chip" style={{ cursor: 'default' }}>
                        {ch ? `${ch.component_label}` : `Charge #${a.charge_id}`}: {fmtMoney(a.amount)}
                      </span>
                    );
                  })}
                  <span className="text-dim" style={{ marginLeft: 4 }}>
                    Total: {fmtMoney(manualAllocs.reduce((s, a) => s + a.amount, 0))}
                  </span>
                  <button type="button" className="btn-ghost sm" onClick={() => setManualOpen(true)}>Edit</button>
                </div>
              )}
            </div>
          )}
        </div>
        {error && <p className="field-hint sms-error">{error}</p>}
        <p className="field-hint">
          {distMode === 'auto'
            ? 'The payment is auto-applied to the family\u2019s oldest unpaid charges (membership once per family, then per child) and distributed to funds by the configured rules.'
            : 'You chose manual distribution — only the selected charges will be settled.'}
          {studentId > 0 && ' When a specific child is selected, their charges are settled first.'}
          {payYear === '*' && " The payment settles every year's balance, oldest first."}
          {payYear && payYear !== '*' && ` The payment settles the SY ${payYear} balance only.`}
        </p>
        <div className="form-actions">
          <button className="btn-primary" onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : '✓ Record & issue OR'}
          </button>
        </div>
      </div>

      {rows === null ? (
        <Spinner label="Loading collections…" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>OR No.</th>
                <th>Family</th>
                <th className="num">Amount</th>
                <th>Date</th>
                <th>Collected by</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.or_no}</td>
                  <td>{r.guardian_name}</td>
                  <td className="num strong">{fmtMoney(r.amount)}</td>
                  <td>{fmtDateTime(r.collected_at)}</td>
                  <td>{r.collector}</td>
                  <td className="text-dim">{r.notes || '—'}</td>
                  <td>
                    <div className="row-actions">
                      <button className="btn-icon" title="View breakdown & distribution" onClick={() => void openDetail(r)}>👁</button>
                      <button className="btn-icon danger" title="Void" onClick={() => { setVoidError(null); setReceiptToVoid(r); }}>🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={7} className="empty-cell">No collections yet — record the first payment above.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="pager">
        <button className="btn-ghost" disabled={offset === 0} onClick={() => { setOffset(Math.max(0, offset - PAGE)); load(Math.max(0, offset - PAGE)); }}>
          ← Prev
        </button>
        <span className="text-dim">Page {Math.floor(offset / PAGE) + 1} of {Math.max(1, Math.ceil(total / PAGE))}</span>
        <button className="btn-ghost" disabled={offset + PAGE >= total} onClick={() => { setOffset(offset + PAGE); load(offset + PAGE); }}>
          Next →
        </button>
      </div>

      {(detail || detailLoading) && (
        <Modal title={detail ? `Official Receipt ${detail.or_no} — ${detail.guardian_name}` : 'Official Receipt'} onClose={closeDetail}>
          {detailLoading || !detail ? (
            <Spinner label="Loading breakdown…" />
          ) : (
            <div className="receipt">
              <PrintHeader />
              <h3 className="print-doc-title">Official Receipt {detail.or_no}</h3>
              <p className="receipt-line"><span>Family</span><strong>{detail.guardian_name}</strong></p>
              <p className="receipt-line"><span>Amount</span><strong>{fmtMoney(detail.amount)}</strong></p>
              <p className="receipt-line"><span>Balance after payment</span><strong className={detail.family_balance > 0 ? 'neg' : 'pos'}>{fmtMoney(detail.family_balance)}</strong></p>
              <p className="receipt-line"><span>Date</span><span>{fmtDateTime(detail.collected_at)}</span></p>
              <p className="receipt-line"><span>Collected by</span><span>{detail.collector}</span></p>
              <h4>Applied to charges</h4>
              <table className="table">
                <thead><tr><th>Charge</th><th>Student</th><th className="num">Amount</th></tr></thead>
                <tbody>
                  {(detail.breakdown ?? []).map((b, i) => (
                    <tr key={i}><td>{b.charge_label}</td><td>{b.student_name}</td><td className="num">{fmtMoney(b.amount)}</td></tr>
                  ))}
                </tbody>
              </table>
              <h4>Fund distribution</h4>
              <table className="table">
                <thead><tr><th>Fund</th><th className="num">Amount</th></tr></thead>
                <tbody>
                  {(detail.allocations ?? []).map((a, i) => (
                    <tr key={i}><td>{a.fund_name}</td><td className="num">{fmtMoney(a.amount)}</td></tr>
                  ))}
                </tbody>
              </table>
              <div className="form-actions">
                <button className="btn-primary" onClick={() => printModal(`Official Receipt ${detail.or_no} — ${detail.guardian_name}`)}>🖨 Print receipt</button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {receiptToVoid && (
        <Modal title="Void receipt" onClose={() => { if (!voiding) setReceiptToVoid(null); }}>
          <p>
            Are you sure you want to void <strong>{receiptToVoid.or_no}</strong> ({fmtMoney(receiptToVoid.amount)} — {receiptToVoid.guardian_name})?
          </p>
          <p className="field-hint">The payment is reversed on the family's balance and the OR number is kept for the record.</p>
          {voidError && <p className="field-hint sms-error">{voidError}</p>}
          <div className="form-actions">
            <button className="btn-ghost" onClick={() => setReceiptToVoid(null)} disabled={voiding}>Cancel</button>
            <button className="btn-danger" onClick={() => void voidRow(receiptToVoid)} disabled={voiding}>
              {voiding ? 'Voiding…' : '🗑 Void receipt'}
            </button>
          </div>
        </Modal>
      )}

      {manualOpen && (
        <ManualDistributionModal
          charges={unpaidCharges}
          allocs={manualAllocs}
          totalPayment={Number(amount) || 0}
          onConfirm={(allocs) => {
            setManualAllocs(allocs);
            setManualOpen(false);
          }}
          onClose={() => setManualOpen(false)}
        />
      )}

      {toast && <Toast message={toast} tone={toastTone} />}
    </div>
  );
}

/**
 * Modal for manual payment distribution: the user picks which unpaid charges
 * to pay and how much for each. The total must equal the payment amount.
 */
function ManualDistributionModal({
  charges,
  allocs: initialAllocs,
  totalPayment,
  onConfirm,
  onClose,
}: {
  charges: Charge[];
  allocs: ManualAllocation[];
  totalPayment: number;
  onConfirm: (allocs: ManualAllocation[]) => void;
  onClose: () => void;
}) {
  // Build a map of charge_id → amount from the initial allocations.
  const initMap = new Map(initialAllocs.map((a) => [a.charge_id, a.amount]));
  const [amounts, setAmounts] = useState<Record<number, string>>(() => {
    const m: Record<number, string> = {};
    for (const c of charges) {
      const a = initMap.get(c.id);
      m[c.id] = a != null ? String(a) : '';
    }
    return m;
  });
  const [error, setError] = useState<string | null>(null);

  const totalAllocated = Object.values(amounts)
    .map((v) => Number(v) || 0)
    .reduce((s, n) => s + n, 0);
  const remaining = Math.round((totalPayment - totalAllocated) * 100) / 100;
  const isValid = Math.abs(remaining) < 0.001 && totalAllocated > 0;

  const setAlloc = (chargeId: number, val: string) => {
    // Allow only valid numbers
    if (val && !/^[\d.]*$/.test(val)) return;
    setAmounts((prev) => ({ ...prev, [chargeId]: val }));
    setError(null);
  };

  /** Distribute the remaining amount across empty charges using FIFO. */
  const autoFill = () => {
    // Build the list of charges with their current allocation.
    let left = Math.round(remaining * 100) / 100;
    if (left <= 0.001) return;
    const next: Record<number, string> = { ...amounts };
    for (const c of charges) {
      if (left <= 0.001) break;
      const cur = Number(next[c.id]) || 0;
      const due = Math.round((Number(c.amount) - Number(c.paid_amount)) * 100) / 100;
      const room = Math.round((due - cur) * 100) / 100;
      if (room <= 0.001) continue;
      const take = Math.min(room, left);
      next[c.id] = String(Math.round((cur + take) * 100) / 100);
      left = Math.round((left - take) * 100) / 100;
    }
    setAmounts(next);
  };

  /** Check a charge for the full remaining balance. */
  const checkFull = (c: Charge) => {
    const due = Math.round((Number(c.amount) - Number(c.paid_amount)) * 100) / 100;
    setAmounts((prev) => ({ ...prev, [c.id]: String(due) }));
  };

  const confirm = () => {
    if (!isValid) {
      setError(
        remaining > 0
          ? `Still ${fmtMoney(remaining)} unallocated. Assign the full amount.`
          : `Allocations exceed the payment by ${fmtMoney(-remaining)}.`,
      );
      return;
    }
    const allocs: ManualAllocation[] = [];
    for (const c of charges) {
      const val = Number(amounts[c.id]) || 0;
      if (val > 0) allocs.push({ charge_id: c.id, amount: Math.round(val * 100) / 100 });
    }
    onConfirm(allocs);
  };

  return (
    <Modal title="Manual payment distribution" onClose={onClose} wide>
      <p className="field-hint" style={{ marginTop: 0 }}>
        Pick which charges to pay and how much for each. The total must equal the payment amount of <strong>{fmtMoney(totalPayment)}</strong>.
      </p>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Charge</th>
              <th>Student</th>
              <th className="num">Amount</th>
              <th className="num">Paid</th>
              <th className="num">Balance</th>
              <th className="num">Your allocation</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {charges.map((c) => {
              const due = Math.round((Number(c.amount) - Number(c.paid_amount)) * 100) / 100;
              const allocVal = Number(amounts[c.id]) || 0;
              const overAlloc = allocVal > due + 0.001;
              return (
                <tr key={c.id} className={overAlloc ? 'row-error' : ''}>
                  <td>{c.component_label}{c.term ? ` (${c.term})` : ''}</td>
                  <td>{c.student_name}</td>
                  <td className="num">{fmtMoney(c.amount)}</td>
                  <td className="num">{fmtMoney(c.paid_amount)}</td>
                  <td className="num strong">{fmtMoney(due)}</td>
                  <td className="num">
                    <input
                      type="number"
                      min="0"
                      max={due}
                      step="0.01"
                      className="alloc-input"
                      value={amounts[c.id] ?? ''}
                      onChange={(e) => setAlloc(c.id, e.target.value)}
                      placeholder="0.00"
                    />
                  </td>
                  <td>
                    <button type="button" className="btn-ghost sm" onClick={() => checkFull(c)} title="Pay full balance">
                      Full
                    </button>
                  </td>
                </tr>
              );
            })}
            {charges.length === 0 && (
              <tr><td colSpan={7} className="empty-cell">No unpaid charges for this family.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="manual-dist-footer">
        <div className="manual-dist-totals">
          <span className="text-dim">Payment:</span> <strong>{fmtMoney(totalPayment)}</strong>
          <span className="text-dim" style={{ marginLeft: 12 }}>Allocated:</span> <strong className={isValid ? 'pos' : ''}>{fmtMoney(totalAllocated)}</strong>
          <span className="text-dim" style={{ marginLeft: 12 }}>Remaining:</span> <strong className={remaining > 0.001 ? 'neg' : ''}>{fmtMoney(Math.max(0, remaining))}</strong>
        </div>
        <button type="button" className="btn-ghost" onClick={autoFill} disabled={remaining <= 0.001}>
          Auto-fill remaining
        </button>
      </div>
      {error && <p className="field-hint sms-error">{error}</p>}
      <div className="form-actions">
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={confirm} disabled={charges.length === 0}>
          ✓ Confirm allocation
        </button>
      </div>
    </Modal>
  );
}