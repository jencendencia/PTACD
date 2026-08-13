import { useEffect, useState } from 'react';
import type { DistributionRule, FeeComponent, Fund } from '../../shared/types';
import { api, errMsg } from '../lib/api';
import { Modal, Spinner, Toast, fmtMoney } from '../components/shared';

export function FundsScreen() {
  const [funds, setFunds] = useState<Fund[] | null>(null);
  const [components, setComponents] = useState<FeeComponent[]>([]);
  const [rules, setRules] = useState<DistributionRule[]>([]);
  const [showAddFund, setShowAddFund] = useState(false);
  const [fundToDelete, setFundToDelete] = useState<Fund | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = () => {
    void api.listFunds().then(setFunds);
    void api.listFeeComponents().then(setComponents);
    void api.listDistributionRules().then(setRules);
  };

  useEffect(() => {
    load();
  }, []);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const setPercentage = async (componentId: number, fundId: number, percentage: number) => {
    try {
      await api.saveDistributionRule({ component_id: componentId, fund_id: fundId, percentage });
      load();
    } catch (err) {
      window.alert(errMsg(err));
    }
  };

  const removeFund = async (f: Fund) => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteFund(f.id);
      setFundToDelete(null);
      notify('Fund deleted');
      load();
    } catch (err) {
      setDeleteError(errMsg(err));
    } finally {
      setDeleting(false);
    }
  };

  if (funds === null) return <Spinner label="Loading funds…" />;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Funds & Distribution</h2>
          <p className="text-dim">Chart of accounts + per-component percentage split for collections</p>
        </div>
        <div className="page-actions">
          <button className="btn-primary" onClick={() => setShowAddFund(true)}>+ Add fund</button>
        </div>
      </div>

      <div className="card">
        <h3>Distribution rules</h3>
        <p className="field-hint">For each fee component, set how much of every collection goes to each fund. Percentages per component must total 100%.</p>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Component</th>
                <th className="num">Amount</th>
                <th>Billing</th>
                {funds.map((f) => (
                  <th key={f.id} className="num">{f.name} %</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {components.map((c) => (
                <tr key={c.id}>
                  <td>{c.label} {c.term && <span className="pill pill-dim">{c.term}</span>}</td>
                  <td className="num">{fmtMoney(c.amount)}</td>
                  <td><span className="pill pill-info">{c.applies === 'per_family' ? 'PER FAMILY' : 'PER CHILD'}</span></td>
                  {funds.map((f) => {
                    const rule = rules.find((r) => r.component_id === c.id && r.fund_id === f.id);
                    return (
                      <td key={f.id} className="num">
                        <input
                          className="pct-input"
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          value={rule?.percentage ?? ''}
                          placeholder="—"
                          onChange={(e) => void setPercentage(c.id, f.id, Number(e.target.value))}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
              {components.length === 0 && (
                <tr><td colSpan={2 + funds.length} className="empty-cell">No fee components configured.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>Funds</h3>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Description</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {funds.map((f) => (
                <tr key={f.id}>
                  <td>{f.name}</td>
                  <td className="text-dim">{f.description || '—'}</td>
                  <td><span className={`pill ${f.is_active ? 'pill-success' : 'pill-dim'}`}>{f.is_active ? 'ACTIVE' : 'INACTIVE'}</span></td>
                  <td><button className="btn-icon danger" title="Delete fund" onClick={() => { setDeleteError(null); setFundToDelete(f); }}>🗑</button></td>
                </tr>
              ))}
              {funds.length === 0 && <tr><td colSpan={4} className="empty-cell">No funds yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {fundToDelete && (
        <Modal title="Delete fund" onClose={() => { if (!deleting) setFundToDelete(null); }}>
          <p>
            Are you sure you want to delete <strong>{fundToDelete.name}</strong>? This cannot be undone.
          </p>
          <p className="field-hint">Funds that have distribution rules, disbursements or advances attached cannot be deleted.</p>
          {deleteError && <p className="field-hint sms-error">{deleteError}</p>}
          <div className="form-actions">
            <button className="btn-ghost" onClick={() => setFundToDelete(null)} disabled={deleting}>Cancel</button>
            <button className="btn-danger" onClick={() => void removeFund(fundToDelete)} disabled={deleting}>
              {deleting ? 'Deleting…' : '🗑 Delete fund'}
            </button>
          </div>
        </Modal>
      )}

      {showAddFund && (
        <AddFundModal
          onClose={() => setShowAddFund(false)}
          onSaved={() => {
            setShowAddFund(false);
            notify('Fund added');
            load();
          }}
        />
      )}

      {toast && <Toast message={toast} />}
    </div>
  );
}

function AddFundModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) return setError('Fund name is required.');
    try {
      await api.saveFund({ name: name.trim(), description });
      onSaved();
    } catch (err) {
      setError(errMsg(err));
    }
  };

  return (
    <Modal title="Add fund" onClose={onClose}>
      <div className="form">
        <div className="field">
          <label>Fund name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Classroom Fund" autoFocus />
        </div>
        <div className="field">
          <label>Description (optional)</label>
          <input value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        {error && <p className="field-hint sms-error">{error}</p>}
        <div className="form-actions">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => void save()}>Add fund</button>
        </div>
      </div>
    </Modal>
  );
}
