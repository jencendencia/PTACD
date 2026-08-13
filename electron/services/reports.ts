// Financial reports: fund balances, family/parent balances, per-section
// collection efficiency, collections summary, and the individual Statement of
// Account (charges + payments + running balance).
import { db } from '../db/connection';
import { get } from '../db/settings';
import type {
  CollectionsSummaryRow,
  Family,
  FamilyBalanceRow,
  FundBalanceRow,
  PtaDashboard,
  SectionCollectionRow,
  SectionFamilyRow,
  StatementLine,
  StatementOfAccount,
} from '../../shared/types';

export async function fundBalances(): Promise<FundBalanceRow[]> {
  const rows = await db.query<{
    fund_id: number;
    fund_name: string;
    collected: number;
    disbursed: number;
    advances_out: number;
    additional: number;
  }[]>(
    `SELECT f.id AS fund_id, f.name AS fund_name,
       COALESCE((SELECT SUM(amount) FROM pta_fund_allocations WHERE fund_id = f.id), 0) AS collected,
       COALESCE((SELECT SUM(amount) FROM pta_disbursements WHERE fund_id = f.id AND status = 'PAID'), 0) AS disbursed,
       COALESCE((SELECT SUM(amount - returned_amount) FROM pta_advances WHERE fund_id = f.id), 0) AS advances_out,
       COALESCE((SELECT SUM(additional_release) FROM pta_advances WHERE fund_id = f.id), 0) AS additional
     FROM pta_funds f
     WHERE f.is_active = 1
     ORDER BY f.name`,
  );
  return rows.map((r) => {
    const collected = Number(r.collected);
    const disbursed = Number(r.disbursed);
    const advancesOut = Number(r.advances_out);
    const additional = Number(r.additional);
    return {
      fund_id: r.fund_id,
      fund_name: r.fund_name,
      collected,
      disbursed,
      advances_out: advancesOut,
      balance: Math.round((collected - disbursed - advancesOut - additional) * 100) / 100,
    };
  });
}

export async function familyBalances(search?: string): Promise<FamilyBalanceRow[]> {
  const params: unknown[] = [get().school_year];
  let where = 'c.school_year = ?';
  if (search && String(search).trim()) {
    where += ' AND (f.guardian_name LIKE ? OR EXISTS (SELECT 1 FROM students s WHERE s.id = c.student_id AND s.full_name LIKE ?))';
    const like = `%${String(search).trim()}%`;
    params.push(like, like);
  }
  const rows = await db.query<{
    family_id: number;
    guardian_name: string;
    student_count: number;
    total_charges: number;
    total_paid: number;
  }[]>(
    `SELECT f.id AS family_id, f.guardian_name, f.student_count,
       COALESCE(SUM(c.amount), 0) AS total_charges,
       COALESCE(SUM(c.paid_amount), 0) AS total_paid
     FROM pta_families f
     LEFT JOIN pta_charges c ON c.family_id = f.id
     WHERE ${where}
     GROUP BY f.id, f.guardian_name, f.student_count
     ORDER BY f.guardian_name`,
    params,
  );
  return rows.map((r) => {
    const totalCharges = Number(r.total_charges);
    const totalPaid = Number(r.total_paid);
    return {
      family_id: r.family_id,
      guardian_name: r.guardian_name,
      student_count: Number(r.student_count),
      total_charges: totalCharges,
      total_paid: totalPaid,
      balance: Math.round((totalCharges - totalPaid) * 100) / 100,
    };
  });
}

export async function sectionCollections(schoolYear: string): Promise<SectionCollectionRow[]> {
  const rows = await db.query<{
    grade_section: string;
    students: number;
    total_charges: number;
    total_paid: number;
  }[]>(
    `SELECT s.grade_section,
       COUNT(DISTINCT s.id) AS students,
       COALESCE(SUM(c.amount), 0) AS total_charges,
       COALESCE(SUM(c.paid_amount), 0) AS total_paid
     FROM students s
     LEFT JOIN pta_charges c ON c.student_id = s.id AND c.school_year = ?
     WHERE s.is_active = 1 AND s.grade_section <> ''
     GROUP BY s.grade_section
     ORDER BY s.grade_section`,
    [schoolYear],
  );
  return rows.map((r) => {
    const totalCharges = Number(r.total_charges);
    const totalPaid = Number(r.total_paid);
    return {
      grade_section: r.grade_section,
      students: Number(r.students),
      total_charges: totalCharges,
      total_paid: totalPaid,
      balance: Math.round((totalCharges - totalPaid) * 100) / 100,
    };
  });
}

/** Guardians (families) that have children in a grade_section, with that
 *  section's share of charges, payments and balance for the school year. */
export async function sectionFamilies(schoolYear: string, gradeSection: string): Promise<SectionFamilyRow[]> {
  const rows = await db.query<{
    family_id: number;
    guardian_name: string;
    student_count: number;
    total_charges: number;
    total_paid: number;
  }[]>(
    `SELECT f.id AS family_id, f.guardian_name,
       COUNT(DISTINCT s.id) AS student_count,
       COALESCE(SUM(c.amount), 0) AS total_charges,
       COALESCE(SUM(c.paid_amount), 0) AS total_paid
     FROM students s
     JOIN pta_families f
       ON f.family_key = CASE
         WHEN TRIM(s.guardian_name) <> '' THEN CONCAT(TRIM(s.guardian_name), '|', TRIM(s.guardian_address))
         ELSE CONCAT('SELF|', TRIM(s.student_no))
       END
     LEFT JOIN pta_charges c ON c.student_id = s.id AND c.school_year = ?
     WHERE s.is_active = 1 AND s.grade_section = ?
     GROUP BY f.id, f.guardian_name
     ORDER BY f.guardian_name`,
    [schoolYear, gradeSection],
  );
  return rows.map((r) => {
    const totalCharges = Number(r.total_charges);
    const totalPaid = Number(r.total_paid);
    return {
      family_id: r.family_id,
      guardian_name: r.guardian_name,
      student_count: Number(r.student_count),
      total_charges: totalCharges,
      total_paid: totalPaid,
      balance: Math.round((totalCharges - totalPaid) * 100) / 100,
    };
  });
}

export async function collectionsReport(from?: string, to?: string): Promise<CollectionsSummaryRow[]> {
  const where: string[] = ['col.voided = 0'];
  const params: unknown[] = [];
  if (from) {
    where.push('col.collected_at >= ?');
    params.push(`${from} 00:00:00`);
  }
  if (to) {
    where.push('col.collected_at <= ?');
    params.push(`${to} 23:59:59`);
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;
  const rows = await db.query<{ label: string; amount: number }[]>(
    `SELECT CONCAT(f.label, IF(c.term = '', '', CONCAT(' · ', c.term))) AS label,
       SUM(cp.amount) AS amount
     FROM pta_charge_payments cp
     JOIN pta_collections col ON col.id = cp.collection_id
     JOIN pta_charges c ON c.id = cp.charge_id
     JOIN pta_fee_components f ON f.id = c.component_id
     ${whereSql}
     GROUP BY f.label, c.term
     ORDER BY f.label, c.term`,
    params,
  );
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  const summary = rows.map((r) => ({ label: r.label, amount: Number(r.amount) }));
  summary.push({ label: 'TOTAL', amount: Math.round(total * 100) / 100 });
  return summary as CollectionsSummaryRow[];
}

export async function statementOfAccount(familyId: number, schoolYear: string): Promise<StatementOfAccount> {
  const [fam] = await db.query<Family[]>(
    'SELECT id, guardian_name, guardian_address, parent_phone, student_count, is_active, created_at, balance, prior_balance FROM pta_families WHERE id = ?',
    [familyId],
  );
  if (!fam) throw new Error('Family not found.');

  const chargeRows = await db.query<{ id: number; created_at: string; comp: string; term: string; student: string; section: string; amount: number }[]>(
    `SELECT c.id, c.created_at, f.label AS comp, c.term, s.full_name AS student, s.grade_section AS section, c.amount
     FROM pta_charges c
     JOIN pta_fee_components f ON f.id = c.component_id
     JOIN students s ON s.id = c.student_id
     WHERE c.family_id = ? AND c.school_year = ?
     ORDER BY s.full_name, f.sort_order, c.term`,
    [familyId, schoolYear],
  );
  const paymentRows = await db.query<{ id: number; collected_at: string; or_no: string; amount: number }[]>(
    `SELECT col.id, col.collected_at, col.or_no, col.amount
     FROM pta_collections col
     WHERE col.family_id = ? AND col.school_year = ? AND col.voided = 0
     ORDER BY col.collected_at, col.id`,
    [familyId, schoolYear],
  );

  const lines: StatementLine[] = [];
  let running = 0;
  for (const c of chargeRows) {
    const amount = Number(c.amount);
    running = Math.round((running + amount) * 100) / 100;
    lines.push({
      id: c.id,
      date: String(c.created_at).slice(0, 10),
      ref: 'CHARGE',
      description: `${c.comp}${c.term ? ` · ${c.term}` : ''} — ${c.student}${c.section ? ` (${c.section})` : ''}`,
      debit: amount,
      credit: 0,
      balance: running,
    });
  }
  for (const p of paymentRows) {
    const amount = Number(p.amount);
    running = Math.round((running - amount) * 100) / 100;
    lines.push({
      id: p.id,
      date: String(p.collected_at).slice(0, 10),
      ref: p.or_no,
      description: `Payment — Official Receipt ${p.or_no}`,
      debit: 0,
      credit: amount,
      balance: running,
    });
  }
  // Balance carried in from school years earlier than the statement year.
  const stYearStart = Number(String(schoolYear).slice(0, 4)) || 0;
  const priorRows = await db.query<{ school_year: string; due: number }[]>(
    `SELECT c.school_year, SUM(c.amount - c.paid_amount) AS due
     FROM pta_charges c WHERE c.family_id = ? GROUP BY c.school_year`,
    [familyId],
  );
  const balanceForward = Math.round(
    priorRows
      .filter((r) => (Number(String(r.school_year).slice(0, 4)) || 0) < stYearStart)
      .reduce((s, r) => s + Number(r.due ?? 0), 0) * 100,
  ) / 100;
  if (balanceForward > 0) {
    lines.unshift({
      id: 0,
      date: '',
      ref: 'BAL FWD',
      description: 'Balance forward (prior school years)',
      debit: balanceForward,
      credit: 0,
      balance: balanceForward,
    });
  }

  lines.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.ref === 'CHARGE' ? -1 : 1));
  // Recompute running balance after the date sort (includes balance forward).
  let acc = 0;
  for (const l of lines) {
    acc = Math.round((acc + l.debit - l.credit) * 100) / 100;
    l.balance = acc;
  }

  const totalCharges = chargeRows.reduce((s, c) => s + Number(c.amount), 0);
  const totalPaid = paymentRows.reduce((s, p) => s + Number(p.amount), 0);
  return {
    family: { ...fam, is_active: !!fam.is_active },
    school_year: schoolYear,
    lines,
    total_charges: Math.round(totalCharges * 100) / 100,
    total_paid: Math.round(totalPaid * 100) / 100,
    balance: Math.round((totalCharges - totalPaid) * 100) / 100,
    balance_forward: balanceForward,
  };
}

export async function getDashboard(): Promise<PtaDashboard> {
  const funds = (await fundBalances()).slice(0, 5);
  const today = new Date().toISOString().slice(0, 10);
  const todayRows = await db.query<{ total: number; c: number }[]>(
    `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS c
     FROM pta_collections WHERE voided = 0 AND collected_at >= ? AND collected_at <= ?`,
    [`${today} 00:00:00`, `${today} 23:59:59`],
  );
  const pending = await db.query<{ c: number }[]>(
    "SELECT COUNT(*) AS c FROM pta_disbursements WHERE status <> 'PAID'",
  );
  const balances = (await familyBalances())
    .filter((b) => b.balance > 0.005)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 5);
  return {
    funds,
    todayCollections: Number(todayRows[0]?.total ?? 0),
    todayCollectionsCount: Number(todayRows[0]?.c ?? 0),
    pendingApprovals: Number(pending[0]?.c ?? 0),
    topBalances: balances,
  };
}
