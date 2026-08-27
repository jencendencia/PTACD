// Collections: record a family payment with an auto-numbered Official Receipt,
// apply it FIFO across the family's unpaid charges, and auto-distribute the
// settled amounts into funds using each component's distribution rules.
import type { PoolConnection } from 'mysql2/promise';
import { db } from '../db/connection';
import { get } from '../db/settings';
import { rulesByComponent } from './funds';
import { withRetry } from './db-retry';
import type {
  Charge,
  ChargePayment,
  Collection,
  CollectionDetail,
  CollectionFilter,
  CollectionInput,
  FundAllocation,
  ManualAllocation,
} from '../../shared/types';

const round2 = (n: number) => Math.round(n * 100) / 100;

export function schoolYearStart(yearLabel: string): string {
  const m = String(yearLabel).match(/\d{4}/);
  return m ? m[0] : String(new Date().getFullYear());
}

/** Counts existing receipts for the prefix+year on the caller's connection.
 *  Callers MUST hold the `pta:or-no:<prefix><year>` GET_LOCK (acquired before
 *  the transaction, released after commit) so the count never runs against a
 *  half-visible set — two machines can't mint the same receipt number. */
async function nextOrNo(conn: PoolConnection, prefix: string, yearLabel: string): Promise<string> {
  const year = schoolYearStart(yearLabel);
  const rows = (await conn.query(
    'SELECT COUNT(*) AS c FROM pta_collections WHERE or_no LIKE ?',
    [`${prefix}${year}-%`],
  ))[0] as unknown as { c: number }[];
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
  // Family's remaining outstanding balance after this receipt (all years), so
  // the OR printout can show what the guardian still owes.
  const balRows = await db.query<{ bal: number }[]>(
    `SELECT COALESCE(SUM(c.amount - c.paid_amount), 0) AS bal
     FROM pta_charges c WHERE c.family_id = ?`,
    [row.family_id],
  );
  const familyBalance = Math.round(Number(balRows[0]?.bal ?? 0) * 100) / 100;
  return {
    ...toCollection(row),
    breakdown: breakdown.map((b) => ({ ...b, amount: Number(b.amount) })),
    allocations: allocations.map((a) => ({ ...a, amount: Number(a.amount) })),
    family_balance: familyBalance,
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

  // Distribution rules are read-only — fetch once before the write transaction.
  const rules = await rulesByComponent();

  // The collection, its charge payments, and the fund allocations commit in
  // ONE transaction on one connection: a failure mid-way can't leave a receipt
  // with missing payments (or payments without allocations). The family's
  // unpaid charges are locked (FOR UPDATE) so two cashiers paying the same
  // family serialize — the balance check and paid_amount increments see each
  // other's committed data. Deadlocks (1213/1205 — normal when two machines
  // write related rows) are retried; the transaction guarantees a retried
  // attempt starts clean, so nothing is double-recorded. The OR number is
  // minted under GET_LOCK held until commit (two machines can never produce
  // the same receipt number); the UNIQUE key on or_no is the backstop.
  const lockName = `pta:or-no:${settings.or_prefix}${schoolYearStart(year)}`;
  const collectionId = await withRetry(() =>
    db.withConnection(async (conn) => {
      const got = (await conn.query('SELECT GET_LOCK(?, 10) AS got', [lockName]))[0] as unknown as {
        got: number;
      }[];
      if (got[0]?.got !== 1) {
        throw new Error('Receipt numbering is busy on another machine — please try again.');
      }
      try {
        await conn.beginTransaction();

        // Lock this family's unpaid charges (FIFO order across years when the
        // cashier chose 'all years'). A concurrent cashier blocks here until
        // this transaction commits, so the validation below and the relative
        // paid_amount increments always see committed data. pay_year narrows
        // the scope: omitted → current year (default), '*' → every year
        // (oldest first), anything else → that school year only.
        // pay_year narrows the scope: omitted → current year (default),
        // '*' → every year (oldest first), anything else → that year only.
        // In every case the rows are locked FOR UPDATE and ordered oldest first.
        const payYear = input.pay_year === '*' ? undefined : input.pay_year;
        const unpaid = (await conn.query(
          `SELECT c.id, c.student_id, c.component_id, c.term, c.amount, c.paid_amount
           FROM pta_charges c WHERE c.family_id = ? AND c.paid_amount < c.amount AND c.school_year = ?
           ORDER BY c.school_year, c.created_at, c.id FOR UPDATE`,
          [familyId, payYear ?? year],
        ))[0] as unknown as Charge[];
        const scopeLabel = payYear ? ` for ${payYear}` : input.pay_year === '*' ? '' : ' for the school year';
        const totalUnpaid = unpaid.reduce((s, c) => s + (Number(c.amount) - Number(c.paid_amount)), 0);
        if (totalUnpaid <= 0) throw new Error(`This family has no outstanding charges${scopeLabel}.`);
        if (amount > totalUnpaid + 0.001) {
          throw new Error(`Payment exceeds the family's balance (${totalUnpaid.toFixed(2)}).`);
        }
        // When a specific child is targeted, settle that child's charges first
        // (FIFO), then spill the remainder over to the rest of the family.
        const orderedCharges = studentId
          ? [
              ...unpaid.filter((c) => c.student_id === studentId),
              ...unpaid.filter((c) => c.student_id !== studentId),
            ]
          : unpaid;
        if (studentId && !unpaid.some((c) => c.student_id === studentId)) {
          throw new Error(`Selected child has no outstanding charges${scopeLabel}.`);
        }

        // Apply the payment across charges: manual allocation (user picks
        // which charges) or auto-FIFO (oldest unpaid first).
        let payments: { charge: Charge; amount: number }[] = [];
        if (input.manual_allocations && input.manual_allocations.length > 0) {
          // Manual mode: the user specified exactly which charges to pay.
          const allocs = input.manual_allocations;
          const totalAllocated = allocs.reduce((s, a) => s + Number(a.amount), 0);
          if (Math.abs(round2(totalAllocated) - amount) > 0.001) {
            throw new Error(`Manual allocations (${totalAllocated.toFixed(2)}) do not match the payment amount (${amount.toFixed(2)}).`);
          }
          // Build a lookup of the family's unpaid charges (already locked FOR UPDATE).
          const unpaidMap = new Map<number, Charge>();
          for (const c of unpaid) unpaidMap.set(c.id, c);
          for (const alloc of allocs) {
            const charge = unpaidMap.get(alloc.charge_id);
            if (!charge) throw new Error(`Charge #${alloc.charge_id} not found or already fully paid.`);
            const due = Number(charge.amount) - Number(charge.paid_amount);
            const allocAmt = round2(Number(alloc.amount));
            if (allocAmt <= 0) throw new Error(`Allocation amount for charge #${alloc.charge_id} must be greater than 0.`);
            if (allocAmt > due + 0.001) {
              throw new Error(`Allocation for "${charge.component_id}" (${allocAmt.toFixed(2)}) exceeds the remaining balance (${due.toFixed(2)}).`);
            }
            payments.push({ charge, amount: allocAmt });
          }
        } else {
          // Auto-FIFO mode.
          let remaining = amount;
          for (const c of orderedCharges) {
            if (remaining <= 0.0001) break;
            const due = Number(c.amount) - Number(c.paid_amount);
            const take = Math.min(due, remaining);
            payments.push({ charge: c, amount: round2(take) });
            remaining = round2(remaining - take);
          }
        }

        // Insert the collection + OR number (allocated under the lock above).
        const orNo = await nextOrNo(conn, settings.or_prefix, year);
        const collectedAt = input.collected_at
          ? `${String(input.collected_at).slice(0, 10)} 12:00:00`
          : new Date().toISOString().slice(0, 19).replace('T', ' ');
        const res = (await conn.execute(
          `INSERT INTO pta_collections (or_no, family_id, school_year, amount, collected_at, collector, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [orNo, familyId, year, amount, collectedAt, actorName, String(input.notes ?? '').trim()],
        ))[0] as unknown as { insertId: number };
        const collectionId = res.insertId;

        // Record charge payments + bump paid_amount. Relative increment: never
        // overwrite with a stale absolute value (a concurrent payment would be
        // lost otherwise). The FOR UPDATE lock serializes concurrent payers.
        for (const p of payments) {
          await conn.execute(
            'INSERT INTO pta_charge_payments (collection_id, charge_id, amount) VALUES (?, ?, ?)',
            [collectionId, p.charge.id, p.amount],
          );
          await conn.execute('UPDATE pta_charges SET paid_amount = paid_amount + ? WHERE id = ?', [
            p.amount,
            p.charge.id,
          ]);
        }

        // Distribute into funds per component rules (awaited, inside the txn —
        // previously fire-and-forget, which could silently lose allocations).
        for (const p of payments) {
          const compRules = rules.get(p.charge.component_id) ?? [];
          if (!compRules.length) continue;
          let allocated = 0;
          for (let i = 0; i < compRules.length; i++) {
            const rule = compRules[i];
            const isLast = i === compRules.length - 1;
            const share = isLast ? round2(p.amount - allocated) : round2((p.amount * rule.percentage) / 100);
            if (share > 0) {
              await conn.execute(
                'INSERT INTO pta_fund_allocations (collection_id, fund_id, amount) VALUES (?, ?, ?)',
                [collectionId, rule.fund_id, share],
              );
            }
            allocated = round2(allocated + share);
          }
        }

        await conn.commit();
        return collectionId;
      } catch (err) {
        await conn.rollback().catch(() => undefined);
        throw err;
      } finally {
        await conn.query('SELECT RELEASE_LOCK(?) AS rel', [lockName]).catch(() => undefined);
      }
    }),
  );
  if (!collectionId) throw new Error('Database is offline.');
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
