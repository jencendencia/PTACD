// Fee charges — the smallest billed items (student × component × term).
// recomputeCharges() derives them from the active fee components:
//   per_family components (e.g. MEMBERSHIP) are billed once per family
//   (assigned to the family's first active child);
//   per_child components (MISC, OTHER) are billed per active child.
// Term components bill once per term (the component's term field).
import { db } from '../db/connection';
import { familyKeyOf } from './families';
import { get } from '../db/settings';
import type { Charge, FeeComponent } from '../../shared/types';

type ChargeRow = {
  id: number;
  family_id: number;
  student_id: number;
  student_name: string;
  grade_section: string;
  school_year: string;
  component_id: number;
  component_code: string;
  component_label: string;
  term: string;
  amount: number;
  paid_amount: number;
};

export const toCharge = (r: ChargeRow): Charge => {
  const amount = Number(r.amount);
  const paid = Number(r.paid_amount);
  return {
    id: r.id,
    family_id: r.family_id,
    student_id: r.student_id,
    student_name: r.student_name,
    grade_section: r.grade_section,
    school_year: r.school_year,
    component_id: r.component_id,
    component_code: r.component_code,
    component_label: r.component_label,
    term: r.term,
    amount,
    paid_amount: paid,
    status: paid >= amount && amount > 0 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID',
  };
};

/** Rebuilds charges for the current school year from active components.
 *  Preserves paid charges (amount may be refreshed); drops unpaid charges that
 *  no longer apply. Returns the number of charges after recompute. */
export async function recomputeCharges(): Promise<number> {
  const year = get().school_year;

  const students = await db.query<{
    id: number;
    student_no: string;
    full_name: string;
    grade_section: string;
    guardian_name: string;
    guardian_address: string;
    is_active: number;
  }[]>('SELECT id, student_no, full_name, grade_section, guardian_name, guardian_address, is_active FROM students');

  const families = await db.query<{ id: number; family_key: string }[]>(
    'SELECT id, family_key FROM pta_families',
  );
  const familyIdByKey = new Map(families.map((f) => [f.family_key, f.id]));

  const components = await db.query<FeeComponent[]>(
    'SELECT * FROM pta_fee_components WHERE is_active = 1 ORDER BY sort_order',
  );

  // Group active students by family.
  const active = students.filter((s) => !!s.is_active);
  const byFamily = new Map<number, typeof active>();
  const studentFamilyId = new Map<number, number>();
  for (const s of active) {
    const key = familyKeyOf(s.guardian_name, s.guardian_address, s.student_no);
    const fid = familyIdByKey.get(key);
    if (!fid) continue;
    const arr = byFamily.get(fid) ?? [];
    arr.push(s);
    byFamily.set(fid, arr);
    studentFamilyId.set(s.id, fid);
  }

  const existing = await db.query<ChargeRow[]>(
    'SELECT * FROM pta_charges WHERE school_year = ?',
    [year],
  );
  const existingByKey = new Map(
    existing.map((c) => [`${c.student_id}|${c.component_id}|${c.term}`, c]),
  );
  const activeStudentIds = new Set(active.map((s) => s.id));

  // Build the target set.
  type Target = { student_id: number; component_id: number; term: string; amount: number };
  const targets = new Map<string, Target>();
  for (const [, members] of byFamily) {
    const firstId = members.reduce((a, b) => (a < b.id ? a : b.id), members[0].id);
    for (const comp of components) {
      const amount = Number(comp.amount);
      if (amount <= 0) continue;
      const studentsToBill = comp.applies === 'per_family' ? members.filter((m) => m.id === firstId) : members;
      for (const s of studentsToBill) {
        const key = `${s.id}|${comp.id}|${comp.term}`;
        targets.set(key, { student_id: s.id, component_id: comp.id, term: comp.term, amount });
      }
    }
  }

  // Upsert targets. A student's charges follow them: when the roster reassigns
  // a student to a different guardian, move an UNPAID charge's family_id too
  // (kept-but-stale families from syncFamilies then drop out naturally). Paid
  // charges stay put — their receipts (pta_collections.family_id) were recorded
  // against the original family, so moving them would orphan that payment.
  for (const [key, t] of targets) {
    const row = existingByKey.get(key);
    const fid = studentFamilyId.get(t.student_id);
    if (!fid) continue;
    if (row) {
      const amountChanged = Number(row.amount) !== t.amount;
      const familyChanged = row.family_id !== fid && Number(row.paid_amount) === 0;
      if (amountChanged || familyChanged) {
        await db.execute(
          'UPDATE pta_charges SET amount = ?, family_id = ? WHERE id = ?',
          [t.amount, familyChanged ? fid : row.family_id, row.id],
        );
      }
    } else {
      await db.execute(
        `INSERT INTO pta_charges (family_id, student_id, school_year, component_id, term, amount)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [fid, t.student_id, year, t.component_id, t.term, t.amount],
      );
    }
  }

  // Drop unpaid charges that are no longer targeted (amount changed to 0,
  // component deactivated, or student no longer active / family missing).
  for (const row of existing) {
    const key = `${row.student_id}|${row.component_id}|${row.term}`;
    const keep =
      targets.has(key) && (Number(row.amount) > 0 || targets.get(key)?.amount === Number(row.amount));
    if (!keep && Number(row.paid_amount) === 0) {
      if (!activeStudentIds.has(row.student_id)) {
        await db.execute('DELETE FROM pta_charges WHERE id = ?', [row.id]);
      } else if (!targets.has(key)) {
        await db.execute('DELETE FROM pta_charges WHERE id = ?', [row.id]);
      }
    }
  }

  const after = await db.query<{ c: number }[]>('SELECT COUNT(*) AS c FROM pta_charges WHERE school_year = ?', [year]);
  return Number(after[0]?.c ?? 0);
}

export async function listCharges(schoolYear: string, familyId?: number): Promise<Charge[]> {
  const params: unknown[] = [schoolYear];
  let where = 'c.school_year = ?';
  if (familyId) {
    where += ' AND c.family_id = ?';
    params.push(familyId);
  }
  const rows = await db.query<ChargeRow[]>(
    `SELECT c.id, c.family_id, c.student_id, s.full_name AS student_name, s.grade_section,
            c.school_year, c.component_id, f.code AS component_code, f.label AS component_label,
            c.term, c.amount, c.paid_amount
     FROM pta_charges c
     JOIN students s ON s.id = c.student_id
     JOIN pta_fee_components f ON f.id = c.component_id
     WHERE ${where}
     ORDER BY s.full_name, f.sort_order, c.term`,
    params,
  );
  return rows.map(toCharge);
}

/** Unpaid charges for a family, oldest first (FIFO application order). */
export async function unpaidChargesForFamily(familyId: number, year: string): Promise<Charge[]> {
  const rows = await db.query<ChargeRow[]>(
    `SELECT c.id, c.family_id, c.student_id, s.full_name AS student_name, s.grade_section,
            c.school_year, c.component_id, f.code AS component_code, f.label AS component_label,
            c.term, c.amount, c.paid_amount
     FROM pta_charges c
     JOIN students s ON s.id = c.student_id
     JOIN pta_fee_components f ON f.id = c.component_id
     WHERE c.family_id = ? AND c.school_year = ? AND c.paid_amount < c.amount
     ORDER BY c.created_at, c.id`,
    [familyId, year],
  );
  return rows.map(toCharge).filter((c) => c.status !== 'PAID');
}
