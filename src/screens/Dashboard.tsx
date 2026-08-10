import { useEffect, useState } from 'react';
import { PTA_ROLE_LABELS } from '../../shared/types';
import type { PtaDashboard, PtaUser } from '../../shared/types';
import { api } from '../lib/api';
import { fmtMoney, Spinner } from '../components/shared';

export function DashboardScreen({ user, onGo }: { user: PtaUser; onGo: (tab: string) => void }) {
  const [data, setData] = useState<PtaDashboard | null>(null);

  useEffect(() => {
    void api.getDashboard().then(setData).catch(() => undefined);
  }, []);

  if (!data) return <Spinner label="Loading dashboard…" />;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Dashboard</h2>
          <p className="text-dim">
            Signed in as <strong>{user.full_name}</strong> · {PTA_ROLE_LABELS[user.role]}
          </p>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <span className="stat-label">Collected today</span>
          <span className="stat-value">{fmtMoney(data.todayCollections)}</span>
          <span className="text-dim">{data.todayCollectionsCount} receipt{data.todayCollectionsCount === 1 ? '' : 's'}</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Pending approvals</span>
          <span className="stat-value">{data.pendingApprovals}</span>
          <span className="text-dim">disbursements not yet paid</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">Top outstanding</span>
          <span className="stat-value">{fmtMoney(data.topBalances.reduce((s, b) => s + b.balance, 0))}</span>
          <span className="text-dim">from {data.topBalances.length} families</span>
        </div>
      </div>

      <div className="dash-cols">
        <div className="card">
          <div className="card-head">
            <h3>Fund balances</h3>
            <button className="btn-ghost" onClick={() => onGo('funds')}>Manage →</button>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Fund</th>
                <th className="num">Collected</th>
                <th className="num">Disbursed</th>
                <th className="num">Advances</th>
                <th className="num">Balance</th>
              </tr>
            </thead>
            <tbody>
              {data.funds.map((f) => (
                <tr key={f.fund_id}>
                  <td>{f.fund_name}</td>
                  <td className="num">{fmtMoney(f.collected)}</td>
                  <td className="num">{fmtMoney(f.disbursed)}</td>
                  <td className="num">{fmtMoney(f.advances_out)}</td>
                  <td className="num strong">{fmtMoney(f.balance)}</td>
                </tr>
              ))}
              {data.funds.length === 0 && (
                <tr><td colSpan={5} className="empty-cell">No funds yet — add one under Funds & Distribution.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Highest outstanding balances</h3>
            <button className="btn-ghost" onClick={() => onGo('families')}>Families →</button>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Family</th>
                <th className="num">Children</th>
                <th className="num">Balance</th>
              </tr>
            </thead>
            <tbody>
              {data.topBalances.map((b) => (
                <tr key={b.family_id}>
                  <td>{b.guardian_name}</td>
                  <td className="num">{b.student_count}</td>
                  <td className="num strong">{fmtMoney(b.balance)}</td>
                </tr>
              ))}
              {data.topBalances.length === 0 && (
                <tr><td colSpan={3} className="empty-cell">All families are settled. 🎉</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="quick-row">
        <button className="btn-primary" onClick={() => onGo('collections')}>💰 Record collection</button>
        <button className="btn-ghost" onClick={() => onGo('disbursements')}>💸 New disbursement</button>
        <button className="btn-ghost" onClick={() => onGo('reports')}>📄 Financial reports</button>
      </div>
    </div>
  );
}
