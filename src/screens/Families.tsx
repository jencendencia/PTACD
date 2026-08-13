import { useCallback, useEffect, useState } from 'react';
import type { Family, FamilyDetail, FamilyOutstanding, StatementOfAccount } from '../../shared/types';
import { api, errMsg } from '../lib/api';
import { Modal, PrintHeader, Spinner, Toast, fmtDate, fmtMoney, printModal, todayIso } from '../components/shared';

export function FamiliesScreen() {
  const [families, setFamilies] = useState<Family[] | null>(null);
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<FamilyDetail | null>(null);
  const [statement, setStatement] = useState<StatementOfAccount | null>(null);
  const [outstanding, setOutstanding] = useState<FamilyOutstanding | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);

  const notify = (msg: string, tone: 'success' | 'error' = 'success') => {
    setToast({ message: msg, tone });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback((q = '') => {
    void api.listFamilies(q || undefined).then(setFamilies);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const t = setTimeout(() => load(search), search ? 250 : 0);
    return () => clearTimeout(t);
  }, [search, load]);

  const openDetail = async (id: number) => {
    const d = await api.getFamilyDetail(id);
    setDetail(d);
  };

  const openStatement = async (id: number) => {
    const st = await api.statementOfAccount(id, (await api.getPtaSettings()).school_year);
    setStatement(st);
  };

  const openBalance = async (id: number) => {
    try {
      setOutstanding(await api.familyOutstanding(id));
    } catch (err) {
      notify(errMsg(err), 'error');
    }
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Families & Balances</h2>
          <p className="text-dim">Every family is derived from the TapIn School student roster (guardian identity)</p>
        </div>
      </div>

      <div className="toolbar">
        <input className="search-input" placeholder="Search guardian, address or child name…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn-ghost" onClick={() => void api.syncFamilies().then(() => load(search))}>🔄 Re-sync roster</button>
      </div>

      {families === null ? (
        <Spinner label="Loading families…" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Family (guardian)</th>
                <th>Address</th>
                <th className="num">Children</th>
                <th>Contact</th>
                <th>Statement</th>
                <th className="num">Balance</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {families.map((f) => (
                <tr key={f.id}>
                  <td>{f.guardian_name}</td>
                  <td className="text-dim">{f.guardian_address || '—'}</td>
                  <td className="num">{f.student_count}</td>
                  <td>{f.parent_phone || '—'}</td>
                  <td>
                    <button className="btn-ghost sm" onClick={() => void openStatement(f.id)}>🧾 Statement</button>
                  </td>
                  <td className="num">
                    {f.balance > 0 ? (
                      <button className="balance-link" title="View & pay balance" onClick={() => void openBalance(f.id)}>
                        <span className="neg strong">{fmtMoney(f.balance)}</span>
                        {f.prior_balance > 0 && <span className="prior-badge">incl. {fmtMoney(f.prior_balance)} prior</span>}
                      </button>
                    ) : (
                      <span className="pos strong">{fmtMoney(f.balance)}</span>
                    )}
                  </td>
                  <td>
                    <button className="btn-icon" title="Details" onClick={() => void openDetail(f.id)}>👁</button>
                  </td>
                </tr>
              ))}
              {families.length === 0 && (
                <tr><td colSpan={6} className="empty-cell">No families yet. Tap "Re-sync roster" once the students table has data.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <Modal title={detail.guardian_name} onClose={() => setDetail(null)} wide>
          <p className="text-dim">
            {detail.guardian_address || 'No address'} · {detail.parent_phone || 'No contact'}
          </p>
          <div className="stat-row">
            <div className="mini-stat"><span className="text-dim">Charges</span><strong>{fmtMoney(detail.total_charges)}</strong></div>
            <div className="mini-stat"><span className="text-dim">Paid</span><strong>{fmtMoney(detail.total_paid)}</strong></div>
            <div className="mini-stat"><span className="text-dim">Balance</span><strong className={detail.balance > 0 ? 'neg' : 'pos'}>{fmtMoney(detail.balance)}</strong></div>
          </div>
          <h4>Children</h4>
          <table className="table">
            <thead><tr><th>Student No.</th><th>Name</th><th>Section</th><th>Status</th></tr></thead>
            <tbody>
              {detail.children.map((c) => (
                <tr key={c.student_id}>
                  <td className="mono">{c.student_no}</td>
                  <td>{c.full_name}</td>
                  <td>{c.grade_section || '—'}</td>
                  <td><span className={`pill ${c.is_active ? 'pill-success' : 'pill-danger'}`}>{c.is_active ? 'ACTIVE' : 'INACTIVE'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="form-actions">
            <button className="btn-ghost" onClick={() => void openStatement(detail.id)}>🧾 Statement of account</button>
          </div>
        </Modal>
      )}

      {outstanding && (
        <FamilyBalanceModal
          data={outstanding}
          onClose={() => setOutstanding(null)}
          onPaid={(msg) => {
            setOutstanding(null);
            notify(msg);
            load(search);
          }}
        />
      )}

      {statement && (
        <Modal title={`Statement of Account — ${statement.family.guardian_name}`} onClose={() => setStatement(null)} wide>
          <p className="text-dim">
            SY {statement.school_year} · {statement.family.student_count} child{statement.family.student_count === 1 ? '' : 'ren'}
          </p>
          <div className="statement-print">
            <PrintHeader />
            <h3 className="print-doc-title">Statement of Account — {statement.family.guardian_name}</h3>
            <table className="table">
              <thead>
                <tr><th>Date</th><th>Ref</th><th>Description</th><th className="num">Debit</th><th className="num">Credit</th><th className="num">Balance</th></tr>
              </thead>
              <tbody>
                {statement.lines.map((l) => (
                  <tr key={`${l.ref}-${l.id}`} className={l.ref === 'CHARGE' ? '' : 'payment-row'}>
                    <td>{fmtDate(l.date)}</td>
                    <td className="mono">{l.ref}</td>
                    <td>{l.description}</td>
                    <td className="num">{l.debit ? fmtMoney(l.debit) : ''}</td>
                    <td className="num">{l.credit ? fmtMoney(l.credit) : ''}</td>
                    <td className="num">{fmtMoney(l.balance)}</td>
                  </tr>
                ))}
                {statement.lines.length === 0 && (
                  <tr><td colSpan={6} className="empty-cell">No charges or payments for this school year.</td></tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>Charges this year</td>
                  <td className="num">{fmtMoney(statement.total_charges)}</td>
                  <td className="num">{fmtMoney(statement.total_paid)}</td>
                  <td className="num">{fmtMoney(statement.balance)}</td>
                </tr>
                {statement.balance_forward > 0 && (
                  <>
                    <tr>
                      <td colSpan={3}>Balance forward (prior years)</td>
                      <td className="num">{fmtMoney(statement.balance_forward)}</td>
                      <td className="num" />
                      <td className="num strong">{fmtMoney(statement.balance_forward)}</td>
                    </tr>
                    <tr>
                      <td colSpan={3}>Total balance due</td>
                      <td className="num" />
                      <td className="num" />
                      <td className="num strong">{fmtMoney(statement.balance + statement.balance_forward)}</td>
                    </tr>
                  </>
                )}
              </tfoot>
            </table>
          </div>
          <div className="form-actions">
            <button className="btn-primary" onClick={() => printModal(`Statement of Account — ${statement.family.guardian_name}`)}>🖨 Print statement</button>
          </div>
        </Modal>
      )}

      {toast && <Toast message={toast.message} tone={toast.tone} />}
    </div>
  );
}

/** Balance drill-down: outstanding charges per school year + a payment form.
 *  Payments are receipted in the current school year but settle the selected
 *  year's (or all years', oldest-first) charges. */
function FamilyBalanceModal({
  data,
  onClose,
  onPaid,
}: {
  data: FamilyOutstanding;
  onClose: () => void;
  onPaid: (msg: string) => void;
}) {
  const [payYear, setPayYear] = useState('*');
  const [amount, setAmount] = useState(String(data.total_due));
  const [date, setDate] = useState(todayIso());
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const scopeTotal =
    payYear === '*' ? data.total_due : (data.years.find((y) => y.school_year === payYear)?.total_due ?? 0);

  const changeYear = (y: string) => {
    setPayYear(y);
    const total = y === '*' ? data.total_due : (data.years.find((yr) => yr.school_year === y)?.total_due ?? 0);
    setAmount(String(total));
  };

  const pay = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const detail = await api.createCollection({
        family_id: data.family_id,
        amount: amt,
        pay_year: payYear,
        collected_at: date || undefined,
        notes: notes || undefined,
      });
      onPaid(`Receipt ${detail.or_no} recorded — ${fmtMoney(detail.amount)}`);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Family balance — ${data.guardian_name}`} onClose={onClose} wide>
      <p className="text-dim">Outstanding charges across school years. Payments are receipted in the current school year.</p>
      {data.years.map((y) => (
        <div className="oyear" key={y.school_year}>
          <div className="oyear-head">
            <strong>SY {y.school_year}</strong>
            <span className={y.total_due > 0 ? 'neg strong' : 'pos strong'}>{fmtMoney(y.total_due)}</span>
          </div>
          <table className="table">
            <thead>
              <tr><th>Student</th><th>Charge</th><th className="num">Amount</th><th className="num">Paid</th><th className="num">Balance</th></tr>
            </thead>
            <tbody>
              {y.charges.map((c) => (
                <tr key={c.id}>
                  <td>{c.student_name}</td>
                  <td>{c.component_label}{c.term ? ` · ${c.term}` : ''}</td>
                  <td className="num">{fmtMoney(c.amount)}</td>
                  <td className="num">{fmtMoney(c.paid_amount)}</td>
                  <td className="num strong">{fmtMoney(c.amount - c.paid_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <div className="form">
        <div className="grid-2">
          <div className="field">
            <label>Pay for school year</label>
            <select value={payYear} onChange={(e) => changeYear(e.target.value)}>
              <option value="*">All years (oldest first)</option>
              {data.years.map((y) => (
                <option key={y.school_year} value={y.school_year}>SY {y.school_year}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Amount (₱)</label>
            <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="field">
            <label>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label>Notes (optional)</label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Settling prior-year balance" />
          </div>
        </div>
        {error && <p className="field-hint sms-error">{error}</p>}
        <p className="field-hint">
          Balance for selected scope: <strong>{fmtMoney(scopeTotal)}</strong> — applied to the oldest unpaid charges first.
        </p>
        <div className="form-actions">
          <button className="btn-ghost" onClick={onClose} disabled={saving}>Close</button>
          <button className="btn-primary" onClick={() => void pay()} disabled={saving || scopeTotal <= 0}>
            {saving ? 'Recording…' : '✓ Record & issue OR'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
