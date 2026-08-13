import { useCallback, useEffect, useState } from 'react';
import type { Family, FamilyDetail, StatementOfAccount } from '../../shared/types';
import { api } from '../lib/api';
import { Modal, PrintHeader, Spinner, fmtDate, fmtMoney, printModal } from '../components/shared';

export function FamiliesScreen() {
  const [families, setFamilies] = useState<Family[] | null>(null);
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<FamilyDetail | null>(null);
  const [statement, setStatement] = useState<StatementOfAccount | null>(null);

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
                    <span className={f.balance > 0 ? 'neg' : 'pos'}>{fmtMoney(f.balance)}</span>
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
                  <td colSpan={3}>Balance due</td>
                  <td className="num">{fmtMoney(statement.total_charges)}</td>
                  <td className="num">{fmtMoney(statement.total_paid)}</td>
                  <td className="num strong">{fmtMoney(statement.balance)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="form-actions">
            <button className="btn-primary" onClick={() => printModal(`Statement of Account — ${statement.family.guardian_name}`)}>🖨 Print statement</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
