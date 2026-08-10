import { useCallback, useEffect, useState } from 'react';
import type { CollectionsSummaryRow, FamilyBalanceRow, FundBalanceRow, SectionCollectionRow, SectionFamilyRow } from '../../shared/types';
import { api } from '../lib/api';
import { Modal, Spinner, fmtMoney, todayIso } from '../components/shared';

type Tab = 'funds' | 'collections' | 'parents' | 'sections';

export function ReportsScreen() {
  const [tab, setTab] = useState<Tab>('funds');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(todayIso());
  const [search, setSearch] = useState('');

  const [fundRows, setFundRows] = useState<FundBalanceRow[] | null>(null);
  const [parentRows, setParentRows] = useState<FamilyBalanceRow[] | null>(null);
  const [sectionRows, setSectionRows] = useState<SectionCollectionRow[] | null>(null);
  const [summaryRows, setSummaryRows] = useState<CollectionsSummaryRow[] | null>(null);
  const [sectionDetail, setSectionDetail] = useState<{ section: string; rows: SectionFamilyRow[] } | null>(null);

  const loadFunds = useCallback(() => {
    void api.fundBalances().then(setFundRows);
  }, []);
  const loadParents = useCallback((q = '') => {
    void api.familyBalances(q || undefined).then(setParentRows);
  }, []);
  const loadSections = useCallback(() => {
    void api.getPtaSettings().then((s) => api.sectionCollections(s.school_year)).then(setSectionRows);
  }, []);
  const loadSummary = useCallback((f = '', t = todayIso()) => {
    void api.collectionsReport(f || undefined, t || undefined).then(setSummaryRows);
  }, []);

  const openSection = useCallback((section: string) => {
    void api.getPtaSettings().then((s) => api.sectionFamilies(s.school_year, section)).then((rows) => {
      setSectionDetail({ section, rows });
    });
  }, []);

  useEffect(() => {
    if (tab === 'funds') loadFunds();
    if (tab === 'parents') loadParents();
    if (tab === 'sections') loadSections();
    if (tab === 'collections') loadSummary();
  }, [tab, loadFunds, loadParents, loadSections, loadSummary]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Financial Reports</h2>
          <p className="text-dim">Fund balances, collections, parent balances, and per-section collection efficiency</p>
        </div>
      </div>

      <div className="subnav" role="tablist">
        <button className={`subnav-btn ${tab === 'funds' ? 'active' : ''}`} onClick={() => setTab('funds')}>🏦 Fund balances</button>
        <button className={`subnav-btn ${tab === 'collections' ? 'active' : ''}`} onClick={() => setTab('collections')}>💰 Collections</button>
        <button className={`subnav-btn ${tab === 'parents' ? 'active' : ''}`} onClick={() => setTab('parents')}>👨‍👩‍👧 Parent balances</button>
        <button className={`subnav-btn ${tab === 'sections' ? 'active' : ''}`} onClick={() => setTab('sections')}>🧑‍🏫 Per section</button>
      </div>

      {tab === 'collections' && (
        <div className="toolbar">
          <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); loadSummary(e.target.value, to); }} title="From date" />
          <input type="date" value={to} onChange={(e) => { setTo(e.target.value); loadSummary(from, e.target.value); }} title="To date" />
          <button className="btn-ghost" onClick={() => { setFrom(''); setTo(todayIso()); loadSummary('', todayIso()); }}>Clear</button>
        </div>
      )}
      {tab === 'parents' && (
        <div className="toolbar">
          <input className="search-input" placeholder="Search family…" value={search} onChange={(e) => { setSearch(e.target.value); loadParents(e.target.value); }} />
        </div>
      )}

      {tab === 'funds' && (
        <Table
          cols={['Fund', 'Collected', 'Disbursed', 'Advances out', 'Balance']}
          rows={fundRows?.map((r) => [r.fund_name, fmtMoney(r.collected), fmtMoney(r.disbursed), fmtMoney(r.advances_out), fmtMoney(r.balance)])}
          loading={fundRows === null}
          numCols={[1, 2, 3, 4]}
        />
      )}

      {tab === 'collections' && (
        <Table
          cols={['Component', 'Collected']}
          rows={summaryRows?.map((r) => [r.label, fmtMoney(r.amount)])}
          loading={summaryRows === null}
          numCols={[1]}
          lastStrong
        />
      )}

      {tab === 'parents' && (
        <Table
          cols={['Family', 'Children', 'Total charges', 'Total paid', 'Balance']}
          rows={parentRows?.map((r) => [r.guardian_name, String(r.student_count), fmtMoney(r.total_charges), fmtMoney(r.total_paid), fmtMoney(r.balance)])}
          loading={parentRows === null}
          numCols={[2, 3, 4]}
        />
      )}

      {tab === 'sections' && (
        <Table
          cols={['Section', 'Students', 'Total charges', 'Total paid', 'Balance', '']}
          rows={sectionRows?.map((r) => [r.grade_section, String(r.students), fmtMoney(r.total_charges), fmtMoney(r.total_paid), fmtMoney(r.balance), '👁'])}
          loading={sectionRows === null}
          numCols={[1, 2, 3, 4]}
          rowActions={sectionRows?.map((r) => ({
            label: `View guardians of ${r.grade_section}`,
            onClick: () => void openSection(r.grade_section),
          }))}
        />
      )}

      <div className="form-actions" style={{ marginTop: 16 }}>
        <button className="btn-primary" onClick={() => window.print()}>🖨 Print current report</button>
      </div>

      {sectionDetail && (
        <Modal title={`Section — ${sectionDetail.section}`} onClose={() => setSectionDetail(null)} wide>
          <p className="text-dim">Guardians with children in this section · charges, payments and balances for the school year</p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Guardian</th>
                  <th className="num">Children</th>
                  <th className="num">Total charges</th>
                  <th className="num">Total paid</th>
                  <th className="num">Balance</th>
                </tr>
              </thead>
              <tbody>
                {sectionDetail.rows.map((r) => (
                  <tr key={r.family_id}>
                    <td>{r.guardian_name}</td>
                    <td className="num">{r.student_count}</td>
                    <td className="num">{fmtMoney(r.total_charges)}</td>
                    <td className="num">{fmtMoney(r.total_paid)}</td>
                    <td className={`num strong ${r.balance > 0 ? 'neg' : 'pos'}`}>{fmtMoney(r.balance)}</td>
                  </tr>
                ))}
                {sectionDetail.rows.length === 0 && (
                  <tr><td colSpan={5} className="empty-cell">No guardians with children in this section.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Table({
  cols,
  rows,
  loading,
  numCols,
  lastStrong = false,
  rowActions,
}: {
  cols: string[];
  rows?: string[][];
  loading: boolean;
  numCols: number[];
  lastStrong?: boolean;
  rowActions?: { label: string; onClick: () => void }[];
}) {
  if (loading) return <Spinner label="Loading…" />;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>{cols.map((c, i) => <th key={i} className={numCols.includes(i) ? 'num' : ''}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows?.map((r, i) => (
            <tr
              key={i}
              className={rowActions?.[i] ? 'row-link' : undefined}
              onClick={rowActions?.[i] ? rowActions[i].onClick : undefined}
              title={rowActions?.[i]?.label}
            >
              {r.map((cell, j) => (
                <td
                  key={j}
                  className={`${numCols.includes(j) ? 'num' : ''}${lastStrong && i === (rows?.length ?? 0) - 1 ? ' strong' : ''}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
          {(!rows || rows.length === 0) && (
            <tr><td colSpan={cols.length} className="empty-cell">No data.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
