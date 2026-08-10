// Collections: record a family payment with an auto-numbered Official Receipt,
// apply it FIFO across the family's unpaid charges, and auto-distribute the
// settled amounts into funds using each component's distribution rules.
import { db } from '../db/connection';
import { get } from '../db/settings';
import { rulesByComponent } from './funds';
import { unpaidChargesForFamily } from './charges';
import type {
  Charge,
  ChargePayment,
  Collection,
  CollectionDetail,
  CollectionFilter,
  CollectionInput,
  FundAllocation,
} from '../../shared/types';

const round2 = (n: number) => Math.round(n * 100) / 100;

export function schoolYearStart(yearLabel: string): string {
  const m = String(yearLabel).match(/\d{4}/);
  return m ? m[0] : String(new Date().getFullYear());
}

async function nextOrNo(prefix: string, yearLabel: string): Promise<string> {
  const year = schoolYearStart(yearLabel);
  const rows = await db.query<{ c: number }[]>(
    'SELECT COUNT(*) AS c FROM pta_collections WHERE or_no LIKE ?',
    [`${prefix}${year}-%`],
  );
  const n = Number(rows[0]?.c ?? 0) + 1;
  return `${prefix}${year}-${String(n).padStart(4, '0')}`;
}

type CollectionRow = {
  id: number;
  or_no: string;
  family_id: number;
  guardian_name: string;
  school_year: string;
  amount: number;
  collected_at: string;
  collector: string;
  notes: string;
  created_at: string;
};

const toCollection = (r: CollectionRow): Collection => ({
  id: r.id,
  or_no: r.or_no,
  family_id: r.family_id,
  guardian_name: r.guardian_name,
  school_year: r.school_year,
  amount: Number(r.amount),
  collected_at: r.collected_at,
  collector: r.collector,
  notes: r.notes,
  created_at: r.created_at,
});

export async function listCollections(filter: CollectionFilter = {}): Promise<{ rows: Collection[]; total: number }> {
  const where: string[] = ['c.voided = 0'];
  const params: unknown[] = [];
  if (filter.school_year) {
    where.push('c.school_year = ?');
    params.push(filter.school_year);
  }
  if (filter.family_id) {
    where.push('c.family_id = ?');
    params.push(filter.family_id);
  }
  if (filter.from) {
    where.push('c.collected_at >= ?');
    params.push(`${filter.from} 00:00:00`);
  }
  if (filter.to) {
    where.push('c.collected_at <= ?');
    params.push(`${filter.to} 23:59:59`);
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;
  const totalRows = await db.query<{ c: number }[]>(
    `SELECT COUNT(*) AS c FROM pta_collections c ${whereSql}`,
    params,
  );
  const total = Number(totalRows[0]?.c ?? 0);
  const limit = Math.min(filter.limit ?? 50, 500);
  const offset = filter.offset ?? 0;
  const rows = await db.query<CollectionRow[]>(
    `SELECT c.id, c.or_no, c.family_id, f.guardian_name, c.school_year, c.amount,
            c.collected_at, c.collector, c.notes, c.created_at
     FROM pta_collections c
     JOIN pta_families f ON f.id = c.family_id
     ${whereSql}
     ORDER BY c.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  return { rows: rows.map(toCollection), total };
}

export async function collectionDetail(id: number): Promise<CollectionDetail> {
  const [row] = await db.query<CollectionRow[]>(
    `SELECT c.id, c.or_no, c.family_id, f.guardian_name, c.school_year, c.amount,
            c.collected_at, c.collector, c.notes, c.created_at
     FROM pta_collections c
     JOIN pta_families f ON f.id = c.family_id
     WHERE c.id = ?`,
    [id],
  );
  if (!row) throw new Error('Collection not found.');

  const breakdown = await db.query<ChargePayment[]>(
    `SELECT cp.charge_id, CONCAT(f.label, IF(c.term = '', '', CONCAT(' · ', c.term))) AS charge_label,
            s.full_name AS student_name, cp.amount
     FROM pta_charge_payments cp
     JOIN pta_charges c ON c.id = cp.charge_id
     JOIN pta_fee_components f ON f.id = c.component_id
     JOIN students s ON s.id = c.student_id
     WHERE cp.collection_id = ?
     ORDER BY c.id`,
    [id],
  );
  const allocations = await db.query<FundAllocation[]>(
    `SELECT a.fund_id, f.name AS fund_name, SUM(a.amount) AS amount
     FROM pta_fund_allocations a
     JOIN pta_funds f ON f.id = a.fund_id
     WHERE a.collection_id = ?
     GROUP BY a.fund_id, f.name
     ORDER BY f.name`,
    [id],
  );
  return {
    ...toCollection(row),
    breakdown: breakdown.map((b) => ({ ...b, amount: Number(b.amount) })),
    allocations: allocations.map((a) => ({ ...a, amount: Number(a.amount) })),
  };
}

/** Records a collection: applies the amount FIFO to the family's unpaid
 *  charges, then distributes the settled portion into funds by component rules. */
export async function createCollection(input: CollectionInput, actorName: string): Promise<CollectionDetail> {
  const amount = round2(Number(input.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Amount must be greater than 0.');
  const familyId = Number(input.family_id);
  const studentId = input.student_id ? Number(input.student_id) : undefined;
  const year = get().school_year;
  const settings = get();

  const [family] = await db.query<{ id: number }[]>('SELECT id FROM pta_families WHERE id = ?', [familyId]);
  if (!family) throw new Error('Family not found.');

  const charges = await unpaidChargesForFamily(familyId, year);
  const totalUnpaid = charges.reduce((s, c) => s + (c.amount - c.paid_amount), 0);
  if (totalUnpaid <= 0) throw new Error('This family has no outstanding charges for the school year.');
  if (amount > totalUnpaid + 0.001) {
    throw new Error(`Payment exceeds the family's balance (${totalUnpaid.toFixed(2)}).`);
  }

  // When a specific child is targeted, settle that child's charges first
  // (FIFO), then spill the remainder over to the rest of the family.
  const orderedCharges = studentId
    ? [...charges.filter((c) => c.student_id === studentId), ...charges.filter((c) => c.student_id !== studentId)]
    : charges;

  if (studentId && !charges.some((c) => c.student_id === studentId)) {
    throw new Error('Selected child has no outstanding charges for the school year.');
  }

  // 1) Apply the payment across charges (FIFO).
  let remaining = amount;
  const payments: { charge: Charge; amount: number }[] = [];
  for (const c of orderedCharges) {
    if (remaining <= 0.0001) break;
    const due = c.amount - c.paid_amount;
    const take = Math.min(due, remaining);
    payments.push({ charge: c, amount: round2(take) });
    remaining = round2(remaining - take);
  }

  // 2) Insert the collection + OR number.
  const orNo = await nextOrNo(settings.or_prefix, year);
  const collectedAt = input.collected_at ? `${String(input.collected_at).slice(0, 10)} 12:00:00` : new Date().toISOString().slice(0, 19).replace('T', ' ');
  const res = await db.execute(
    `INSERT INTO pta_collections (or_no, family_id, school_year, amount, collected_at, collector, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [orNo, familyId, year, amount, collectedAt, actorName, String(input.notes ?? '').trim()],
  );
  const collectionId = res.insertId;

  // 3) Record charge payments + bump paid_amount.
  const rules = await rulesByComponent();
  for (const p of payments) {
    await db.execute(
      'INSERT INTO pta_charge_payments (collection_id, charge_id, amount) VALUES (?, ?, ?)',
      [collectionId, p.charge.id, p.amount],
    );
    const newPaid = round2(p.charge.paid_amount + p.amount);
    await db.execute('UPDATE pta_charges SET paid_amount = ? WHERE id = ?', [newPaid, p.charge.id]);
  }

  // 4) Distribute into funds per component rules.
  for (const p of payments) {
    const compRules = rules.get(p.charge.component_id) ?? [];
    if (!compRules.length) continue;
    let allocated = 0;
    compRules.forEach((rule, i) => {
      const isLast = i === compRules.length - 1;
      const share = isLast
        ? round2(p.amount - allocated)
        : round2((p.amount * rule.percentage) / 100);
      if (share > 0) {
        void db.execute(
          'INSERT INTO pta_fund_allocations (collection_id, fund_id, amount) VALUES (?, ?, ?)',
          [collectionId, rule.fund_id, share],
        );
      }
      allocated = round2(allocated + share);
    });
  }

  return collectionDetail(collectionId);
}

/** Voids a collection: keeps the OR number for the paper trail, reverses the
 *  charge payments and fund allocations. */
export async function voidCollection(id: number): Promise<void> {
  const payments = await db.query<{ charge_id: number; amount: number }[]>(
    'SELECT charge_id, amount FROM pta_charge_payments WHERE collection_id = ?',
    [id],
  );
  for (const p of payments) {
    await db.execute(
      'UPDATE pta_charges SET paid_amount = GREATEST(0, paid_amount - ?) WHERE id = ?',
      [p.amount, p.charge_id],
    );
  }
  await db.execute('DELETE FROM pta_charge_payments WHERE collection_id = ?', [id]);
  await db.execute('DELETE FROM pta_fund_allocations WHERE collection_id = ?', [id]);
  await db.execute('UPDATE pta_collections SET voided = 1 WHERE id = ?', [id]);
}
