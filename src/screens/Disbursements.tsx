import { useCallback, useEffect, useRef, useState } from 'react';
import { PTA_ROLE_LABELS } from '../../shared/types';
import type { Attachment, Disbursement, DisbursementStatus, Fund, PtaFilePick, PtaUser } from '../../shared/types';
import { api, isElectron } from '../lib/api';
import { DisbStatusPill, Modal, Spinner, Toast, fmtDate, fmtMoney, todayIso } from '../components/shared';

export function DisbursementsScreen({ user }: { user: PtaUser }) {
  const [rows, setRows] = useState<Disbursement[] | null>(null);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [statusFilter, setStatusFilter] = useState<DisbursementStatus | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(todayIso());
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [payTarget, setPayTarget] = useState<Disbursement | null>(null);
  const [payRef, setPayRef] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [attTarget, setAttTarget] = useState<Disbursement | null>(null);

  const isApprover = user.role === 'admin' || user.role === 'president' || user.role === 'vice_president';
  const isTreasurer = user.role === 'admin' || user.role === 'treasurer';

  const load = useCallback(() => {
    void api.listDisbursements({ status: statusFilter || undefined, from: from || undefined, to: to || undefined }).then((res) => setRows(res.rows));
  }, [statusFilter, from, to]);

  useEffect(() => {
    load();
    void api.listFunds().then(setFunds);
  }, [load]);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const approve = async (d: Disbursement) => {
    try {
      await api.approveDisbursement(d.id);
      notify(`${d.dv_no} approved`);
      load();
    } catch (err) {
      window.alert((err as Error).message);
    }
  };

  const pay = async () => {
    if (!payTarget) return;
    if (!payRef.trim()) {
      setError('Enter the check/OR reference number.');
      return;
    }
    try {
      await api.payDisbursement(payTarget.id, payRef.trim());
      notify(`${payTarget.dv_no} marked as paid`);
      setPayTarget(null);
      setPayRef('');
      setError(null);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async (d: Disbursement) => {
    if (!window.confirm(`Delete draft ${d.dv_no}?`)) return;
    await api.deleteDisbursement(d.id);
    notify('Draft deleted');
    load();
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Disbursements</h2>
          <p className="text-dim">Draft → Approved (President) → Paid (Treasurer) · auto-numbered DV</p>
        </div>
        <div className="page-actions">
          <button className="btn-primary" onClick={() => setShowCreate(true)}>+ New disbursement</button>
        </div>
      </div>

      <div className="toolbar">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as DisbursementStatus | '')}>
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="APPROVED">Approved</option>
          <option value="PAID">Paid</option>
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="From date" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} title="To date" />
        <button className="btn-ghost" onClick={() => { setFrom(''); setTo(todayIso()); }} title="Reset date range">Clear dates</button>
      </div>

      {rows === null ? (
        <Spinner label="Loading disbursements…" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>DV No.</th>
                <th>Payee</th>
                <th>Purpose</th>
                <th>Fund</th>
                <th className="num">Amount</th>
                <th>Date</th>
                <th>Status</th>
                <th>Docs</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.id}>
                  <td className="mono">{d.dv_no}</td>
                  <td>{d.payee}</td>
                  <td className="text-dim">{d.purpose}</td>
                  <td>{d.fund_name}</td>
                  <td className="num strong">{fmtMoney(d.amount)}</td>
                  <td>{fmtDate(d.date)}</td>
                  <td><DisbStatusPill status={d.status} /></td>
                  <td>
                    <button className="btn-icon" title="Attachments" onClick={() => setAttTarget(d)}>📎</button>
                  </td>
                  <td>
                    <div className="row-actions">
                      {d.status === 'DRAFT' && isApprover && (
                        <button className="btn-ghost sm" onClick={() => void approve(d)} title={`Approve as ${PTA_ROLE_LABELS[user.role]}`}>✓ Approve</button>
                      )}
                      {d.status === 'APPROVED' && isTreasurer && (
                        <button className="btn-ghost sm" onClick={() => setPayTarget(d)}>💵 Mark paid</button>
                      )}
                      {d.status === 'DRAFT' && (
                        <button className="btn-icon danger" title="Delete draft" onClick={() => void remove(d)}>🗑</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={9} className="empty-cell">No disbursements match the filter.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateDisbursementModal
          funds={funds}
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            notify('Disbursement drafted');
            load();
          }}
        />
      )}

      {attTarget && (
        <AttachmentsModal disbursement={attTarget} onClose={() => setAttTarget(null)} notify={notify} />
      )}

      {payTarget && (
        <Modal title={`Mark paid — ${payTarget.dv_no}`} onClose={() => setPayTarget(null)}>
          <p className="text-dim">
            {payTarget.payee} · {fmtMoney(payTarget.amount)} · {payTarget.fund_name}
          </p>
          <div className="field" style={{ marginTop: 12 }}>
            <label>Check / reference number</label>
            <input value={payRef} onChange={(e) => { setPayRef(e.target.value); setError(null); }} placeholder="e.g. Check 000456" autoFocus />
          </div>
          {error && <p className="field-hint sms-error">{error}</p>}
          <div className="form-actions">
            <button className="btn-ghost" onClick={() => setPayTarget(null)}>Cancel</button>
            <button className="btn-primary" onClick={() => void pay()}>Confirm payment</button>
          </div>
        </Modal>
      )}

      {toast && <Toast message={toast} />}
    </div>
  );
}

function CreateDisbursementModal({
  funds,
  onClose,
  onSaved,
}: {
  funds: Fund[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fundId, setFundId] = useState(funds[0]?.id ?? 0);
  const [payee, setPayee] = useState('');
  const [purpose, setPurpose] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIso());
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const amt = Number(amount);
    if (!fundId) return setError('Select a fund.');
    if (!payee.trim() || !purpose.trim()) return setError('Payee and purpose are required.');
    if (!Number.isFinite(amt) || amt <= 0) return setError('Enter a valid amount.');
    setBusy(true);
    setError(null);
    try {
      await api.createDisbursement({ fund_id: fundId, payee: payee.trim(), purpose: purpose.trim(), amount: amt, date: date || undefined, notes: notes || undefined });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal title="New disbursement (draft)" onClose={onClose}>
      <div className="form">
        <div className="field">
          <label>Fund</label>
          <select value={fundId} onChange={(e) => setFundId(Number(e.target.value))}>
            {funds.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Payee</label>
          <input value={payee} onChange={(e) => setPayee(e.target.value)} placeholder="e.g. Sta. Maria Print Shop" />
        </div>
        <div className="field">
          <label>Purpose</label>
          <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. PTA ID lanyards" />
        </div>
        <div className="field-row">
          <div className="field">
            <label>Amount (₱)</label>
            <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div className="field">
            <label>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label>Notes (optional)</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {error && <p className="field-hint sms-error">{error}</p>}
        <div className="form-actions">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : 'Save draft'}</button>
        </div>
      </div>
    </Modal>
  );
}

const fmtBytes = (n: number) => {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

function AttachmentsModal({ disbursement, onClose, notify }: { disbursement: Disbursement; onClose: () => void; notify: (msg: string) => void }) {
  const [list, setList] = useState<Attachment[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    void api.listDisbursementAttachments(disbursement.id).then(setList);
  }, [disbursement.id]);

  useEffect(() => {
    load();
  }, [load]);

  const pickFile = async () => {
    if (isElectron) {
      const picked = await api.pickAttachmentFile();
      if (picked) await attach(picked);
    } else {
      fileRef.current?.click();
    }
  };

  const attach = async (file: PtaFilePick) => {
    setBusy(true);
    setError(null);
    try {
      await api.addDisbursementAttachment(disbursement.id, file);
      notify('Attachment added');
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const removeAtt = async (id: number) => {
    if (!window.confirm('Remove this attachment?')) return;
    await api.removeDisbursementAttachment(id);
    notify('Attachment removed');
    load();
  };

  return (
    <Modal title={`Attachments — ${disbursement.dv_no}`} onClose={onClose}>
      <p className="text-dim">{disbursement.payee} · {disbursement.purpose}</p>
      <div className="liq-attach">
        <input
          ref={fileRef}
          type="file"
          accept="image/*,.pdf"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void attach({ name: f.name, path: null, mime: f.type, size: f.size });
            e.target.value = '';
          }}
        />
        <button className="btn-ghost" onClick={() => void pickFile()} disabled={busy}>📎 {busy ? 'Adding…' : 'Attach file'}</button>
        <span className="field-hint">Invoices, quotations, ORs, check copies…</span>
      </div>
      {error && <p className="field-hint sms-error">{error}</p>}
      {list === null ? (
        <Spinner label="Loading attachments…" />
      ) : (
        <table className="table" style={{ marginTop: 12 }}>
          <thead>
            <tr><th>File</th><th>Type</th><th className="num">Size</th><th></th></tr>
          </thead>
          <tbody>
            {list.map((a) => (
              <tr key={a.id}>
                <td>
                  <button className="btn-ghost sm" onClick={() => void api.openAttachment(a.id).catch(() => notify('Cannot open in browser mock mode'))} title="Open">
                    📄 {a.file_name}
                  </button>
                </td>
                <td className="text-dim">{a.mime || '—'}</td>
                <td className="num text-dim">{fmtBytes(a.size)}</td>
                <td>
                  <button className="btn-icon danger" title="Remove" onClick={() => void removeAtt(a.id)}>🗑</button>
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr><td colSpan={4} className="empty-cell">No attachments yet.</td></tr>
            )}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
