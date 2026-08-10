import { useCallback, useEffect, useRef, useState } from 'react';
import type { Advance, Fund, LiquidationItem, PtaFilePick, PtaUser } from '../../shared/types';
import { api, isElectron } from '../lib/api';
import { AdvStatusPill, Modal, Spinner, Toast, fmtDate, fmtMoney, todayIso } from '../components/shared';

export function AdvancesScreen({ user }: { user: PtaUser }) {
  const [rows, setRows] = useState<Advance[] | null>(null);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(todayIso());
  const [showCreate, setShowCreate] = useState(false);
  const [active, setActive] = useState<AdvanceWithItems | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const isTreasurer = user.role === 'admin' || user.role === 'treasurer';

  const load = useCallback(() => {
    void api.listAdvances({ from: from || undefined, to: to || undefined }).then(setRows);
  }, [from, to]);

  useEffect(() => {
    load();
    void api.listFunds().then(setFunds);
  }, [load]);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const openAdvance = async (a: Advance) => {
    const items = await api.listLiquidationItems(a.id);
    setActive({ ...a, items });
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Advances & Liquidation</h2>
          <p className="text-dim">Cash advances from funds, liquidated with expense items + receipt attachments</p>
        </div>
        <div className="page-actions">
          <button className="btn-primary" disabled={!isTreasurer} title={isTreasurer ? undefined : 'Treasurer only'} onClick={() => setShowCreate(true)}>
            + Issue advance
          </button>
        </div>
      </div>

      <div className="toolbar">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="Issued from date" />
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} title="Issued to date" />
        <button className="btn-ghost" onClick={() => { setFrom(''); setTo(todayIso()); }} title="Reset date range">Clear dates</button>
      </div>

      {rows === null ? (
        <Spinner label="Loading advances…" />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Recipient</th>
                <th>Purpose</th>
                <th>Fund</th>
                <th className="num">Amount</th>
                <th className="num">Liquidated</th>
                <th>Issued</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td>{a.recipient}</td>
                  <td className="text-dim">{a.purpose}</td>
                  <td>{a.fund_name}</td>
                  <td className="num strong">{fmtMoney(a.amount)}</td>
                  <td className="num">{fmtMoney(a.liquidated_amount)}</td>
                  <td>{fmtDate(a.date_issued)}</td>
                  <td><AdvStatusPill status={a.status} /></td>
                  <td>
                    <button className="btn-icon" title="Liquidation" onClick={() => void openAdvance(a)}>🧾</button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="empty-cell">No advances yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateAdvanceModal funds={funds} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); notify('Advance issued'); load(); }} />
      )}

      {active && (
        <LiquidationModal
          advance={active}
          isTreasurer={isTreasurer}
          onClose={() => setActive(null)}
          onChanged={(a) => {
            setActive(a);
            load();
          }}
          notify={notify}
        />
      )}

      {toast && <Toast message={toast} />}
    </div>
  );
}

type AdvanceWithItems = Advance & { items: LiquidationItem[] };

function CreateAdvanceModal({ funds, onClose, onSaved }: { funds: Fund[]; onClose: () => void; onSaved: () => void }) {
  const [fundId, setFundId] = useState(funds[0]?.id ?? 0);
  const [recipient, setRecipient] = useState('');
  const [purpose, setPurpose] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const amt = Number(amount);
    if (!recipient.trim() || !purpose.trim()) return setError('Recipient and purpose are required.');
    if (!Number.isFinite(amt) || amt <= 0) return setError('Enter a valid amount.');
    try {
      await api.createAdvance({ fund_id: fundId, recipient: recipient.trim(), purpose: purpose.trim(), amount: amt, date_issued: date || undefined });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Modal title="Issue cash advance" onClose={onClose}>
      <div className="form">
        <div className="field">
          <label>Fund</label>
          <select value={fundId} onChange={(e) => setFundId(Number(e.target.value))}>
            {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Recipient (officer)</label>
          <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="e.g. Mrs. Alma Santos" />
        </div>
        <div className="field">
          <label>Purpose</label>
          <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="e.g. School Fair — food stalls" />
        </div>
        <div className="field-row">
          <div className="field">
            <label>Amount (₱)</label>
            <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="field">
            <label>Date issued</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        {error && <p className="field-hint sms-error">{error}</p>}
        <div className="form-actions">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => void save()}>Issue advance</button>
        </div>
      </div>
    </Modal>
  );
}

function LiquidationModal({
  advance,
  isTreasurer,
  onClose,
  onChanged,
  notify,
}: {
  advance: AdvanceWithItems;
  isTreasurer: boolean;
  onClose: () => void;
  onChanged: (a: AdvanceWithItems) => void;
  notify: (msg: string) => void;
}) {
  const [items, setItems] = useState<LiquidationItem[]>(advance.items);
  const [date, setDate] = useState(todayIso());
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [file, setFile] = useState<PtaFilePick | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const liquidated = items.reduce((s, i) => s + i.amount, 0);
  const remaining = advance.amount - liquidated;
  const closed = advance.status === 'LIQUIDATED' || advance.status === 'RETURNED';

  const pickFile = async () => {
    if (isElectron) {
      const picked = await api.pickAttachmentFile();
      if (picked) setFile(picked);
    } else {
      fileRef.current?.click();
    }
  };

  const addItem = async () => {
    const amt = Number(amount);
    if (!description.trim()) return setError('Description is required.');
    if (!Number.isFinite(amt) || amt <= 0) return setError('Enter a valid expense amount.');
    try {
      const item = await api.addLiquidationItem(
        { advance_id: advance.id, date: date || new Date().toISOString().slice(0, 10), description: description.trim(), amount: amt },
        file,
      );
      const next = [...items, item];
      setItems(next);
      setDescription('');
      setAmount('');
      setDate('');
      setFile(null);
      setError(null);
      const list = await api.listAdvances();
      onChanged({ ...list.find((a) => a.id === advance.id)!, items: next });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const removeItem = async (id: number) => {
    await api.removeLiquidationItem(id);
    const next = items.filter((i) => i.id !== id);
    setItems(next);
    const list = await api.listAdvances();
    onChanged({ ...list.find((a) => a.id === advance.id)!, items: next });
  };

  const close = async () => {
    try {
      const closedAdv = await api.closeAdvance(advance.id);
      notify(`Advance closed — ${closedAdv.returned_amount > 0 ? `returned ${fmtMoney(closedAdv.returned_amount)}` : 'fully liquidated'}`);
      const list = await api.listAdvances();
      onChanged({ ...list.find((a) => a.id === advance.id)!, items });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Modal title={`Liquidation — ${advance.recipient}`} onClose={onClose} wide>
      <p className="text-dim">{advance.purpose} · {advance.fund_name}</p>
      <div className="stat-row">
        <div className="mini-stat"><span className="text-dim">Advance</span><strong>{fmtMoney(advance.amount)}</strong></div>
        <div className="mini-stat"><span className="text-dim">Liquidated</span><strong>{fmtMoney(liquidated)}</strong></div>
        <div className="mini-stat">
          <span className="text-dim">{remaining >= 0 ? 'To return' : 'Additional'}</span>
          <strong className={remaining >= 0 ? 'pos' : 'neg'}>{fmtMoney(Math.abs(remaining))}</strong>
        </div>
      </div>

      {!closed && (
        <div className="liq-form">
          <div className="field-row">
            <div className="field">
              <label>Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="field">
              <label>Expense amount (₱)</label>
              <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>Description</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Booth permits (5 pcs)" />
          </div>
          <div className="liq-attach">
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.pdf"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setFile({ name: f.name, path: null, mime: f.type, size: f.size });
                e.target.value = '';
              }}
            />
            <button className="btn-ghost" onClick={() => void pickFile()}>📎 {file ? `Attached: ${file.name}` : 'Attach receipt'}</button>
            {file && <button className="btn-icon" onClick={() => setFile(null)} title="Remove attachment">✕</button>}
          </div>
          {error && <p className="field-hint sms-error">{error}</p>}
          <div className="form-actions">
            <button className="btn-primary" onClick={() => void addItem()}>+ Add expense item</button>
          </div>
        </div>
      )}

      <table className="table" style={{ marginTop: 12 }}>
        <thead>
          <tr><th>Date</th><th>Description</th><th className="num">Amount</th><th>Receipt</th><th></th></tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id}>
              <td>{fmtDate(i.date)}</td>
              <td>{i.description}</td>
              <td className="num">{fmtMoney(i.amount)}</td>
              <td>{i.attachment_name ? <span className="pill pill-info">📎 {i.attachment_name}</span> : <span className="text-dim">—</span>}</td>
              <td>
                {!closed && (
                  <button className="btn-icon danger" title="Remove" onClick={() => void removeItem(i.id)}>🗑</button>
                )}
              </td>
            </tr>
          ))}
          {items.length === 0 && <tr><td colSpan={5} className="empty-cell">No liquidation items yet.</td></tr>}
        </tbody>
      </table>

      {!closed && isTreasurer && (
        <div className="form-actions" style={{ marginTop: 14 }}>
          <button className="btn-primary" onClick={() => void close()}>
            {remaining >= 0 ? '✓ Close & return balance' : '✓ Close liquidation'}
          </button>
        </div>
      )}
    </Modal>
  );
}
