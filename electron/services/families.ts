// PTA families — materialized from TapIn students by guardian identity
// (guardian_name + guardian_address), the same rule the guardian QR uses.
// Students without a guardian on file become their own single-child family.
import { db } from '../db/connection';
import { get } from '../db/settings';
import type { Family, FamilyChild, FamilyDetail } from '../../shared/types';

/** Deterministic family key for a student row. */
export function familyKeyOf(guardianName: string, guardianAddress: string, studentNo: string): string {
  const name = String(guardianName ?? '').trim();
  if (name) return `${name}|${String(guardianAddress ?? '').trim()}`;
  return `SELF|${String(studentNo ?? '').trim()}`;
}

type StudentRow = {
  id: number;
  student_no: string;
  full_name: string;
  grade_section: string;
  parent_phone: string;
  guardian_name: string;
  guardian_address: string;
  is_active: number;
};

type FamilyRow = {
  id: number;
  family_key: string;
  guardian_name: string;
  guardian_address: string;
  parent_phone: string;
  student_count: number;
  is_active: number;
  created_at: string;
};

const toFamily = (r: FamilyRow): Family => ({
  id: r.id,
  guardian_name: r.guardian_name,
  guardian_address: r.guardian_address,
  parent_phone: r.parent_phone,
  student_count: r.student_count,
  is_active: !!r.is_active,
  created_at: r.created_at,
});

/** Rebuilds pta_families from the students table. Idempotent; returns count. */
export async function syncFamilies(): Promise<number> {
  const students = await db.query<StudentRow[]>(
    'SELECT id, student_no, full_name, grade_section, parent_phone, guardian_name, guardian_address, is_active FROM students',
  );
  const existing = await db.query<{ id: number; family_key: string }[]>(
    'SELECT id, family_key FROM pta_families',
  );
  const idByKey = new Map(existing.map((f) => [f.family_key, f.id]));

  const groups = new Map<string, StudentRow[]>();
  for (const s of students) {
    const key = familyKeyOf(s.guardian_name, s.guardian_address, s.student_no);
    const arr = groups.get(key) ?? [];
    arr.push(s);
    groups.set(key, arr);
  }

  for (const [key, members] of groups) {
    const active = members.filter((m) => !!m.is_active);
    const phone = members.find((m) => m.parent_phone.trim())?.parent_phone ?? '';
    const firstName = members[0]?.guardian_name?.trim() || members[0]?.full_name;
    const address = members[0]?.guardian_address?.trim() ?? '';
    if (idByKey.has(key)) {
      await db.execute(
        `UPDATE pta_families
         SET guardian_name = ?, guardian_address = ?, parent_phone = ?, student_count = ?, is_active = ?
         WHERE id = ?`,
        [firstName, address, phone, active.length, active.length > 0 ? 1 : 0, idByKey.get(key)],
      );
    } else {
      const res = await db.execute(
        `INSERT INTO pta_families (family_key, guardian_name, guardian_address, parent_phone, student_count, is_active)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [key, firstName, address, phone, active.length, active.length > 0 ? 1 : 0],
      );
      idByKey.set(key, res.insertId);
    }
  }

  // Purge stale families — rows whose family_key no longer maps to any student
  // (e.g. SELF entries left over from a roster that had no guardian names, or
  // test rows). Never delete families carrying financial history: pta_charges
  // and pta_collections reference family_id with ON DELETE CASCADE, so purging
  // one would destroy their receipts. Skip the purge when the roster is empty
  // — an empty students table at boot is a transient state, and wiping every
  // history-free family then would silently churn family ids.
  const keys = [...groups.keys()];
  if (keys.length > 0) {
    const placeholders = keys.map(() => '?').join(',');
    const noFinancialHistory =
      `NOT EXISTS (SELECT 1 FROM pta_charges c WHERE c.family_id = pta_families.id)
       AND NOT EXISTS (SELECT 1 FROM pta_collections col WHERE col.family_id = pta_families.id)`;
    await db.execute(
      `DELETE FROM pta_families
       WHERE family_key NOT IN (${placeholders}) AND ${noFinancialHistory}`,
      keys,
    );
    // Kept-but-stale families (financial history, but no matching student in
    // the current roster) keep their receipts but are no longer active — zero
    // their child count and mark them inactive so lists/balances stay truthful.
    await db.execute(
      `UPDATE pta_families
       SET student_count = 0, is_active = 0
       WHERE family_key NOT IN (${placeholders})`,
      keys,
    );
  }
  return groups.size;
}

export async function listFamilies(search?: string): Promise<Family[]> {
  const params: unknown[] = [];
  let where = '';
  if (search && String(search).trim()) {
    const like = `%${String(search).trim()}%`;
    where = `WHERE f.guardian_name LIKE ? OR f.guardian_address LIKE ? OR EXISTS (
      SELECT 1 FROM students s WHERE s.is_active = 1 AND s.guardian_name = f.guardian_name AND s.guardian_address = f.guardian_address AND s.full_name LIKE ?
    ) OR EXISTS (
      SELECT 1 FROM students s2 WHERE s2.is_active = 1 AND s2.guardian_name = '' AND s2.full_name = f.guardian_name AND s2.full_name LIKE ?
    )`;
    params.push(like, like, like, like);
  }
  const rows = await db.query<FamilyRow[]>(
    `SELECT * FROM pta_families f ${where} ORDER BY f.guardian_name`,
    params,
  );
  return rows.map(toFamily);
}

export async function getFamilyDetail(familyId: number): Promise<FamilyDetail> {
  const [familyRow] = await db.query<FamilyRow[]>('SELECT * FROM pta_families WHERE id = ?', [familyId]);
  if (!familyRow) throw new Error('Family not found.');
  const family = toFamily(familyRow);

  const children = await db.query<FamilyChild[]>(
    `SELECT s.id AS student_id, s.student_no, s.full_name, s.grade_section, !!s.is_active AS is_active
     FROM students s
     WHERE s.guardian_name = ? AND s.guardian_address = ?
        OR (s.guardian_name = '' AND s.full_name = ? AND s.guardian_address = '')
     ORDER BY s.is_active DESC, s.full_name`,
    [familyRow.guardian_name, familyRow.guardian_address, familyRow.guardian_name],
  );

  const year = get().school_year;
  const totals = await db.query<{ total_charges: number; total_paid: number }[]>(
    `SELECT COALESCE(SUM(amount), 0) AS total_charges, COALESCE(SUM(paid_amount), 0) AS total_paid
     FROM pta_charges WHERE family_id = ? AND school_year = ?`,
    [familyId, year],
  );
  const t = totals[0] ?? { total_charges: 0, total_paid: 0 };
  return {
    ...family,
    children: children.map((c) => ({ ...c, is_active: !!c.is_active })),
    total_charges: Number(t.total_charges),
    total_paid: Number(t.total_paid),
    balance: Number(t.total_charges) - Number(t.total_paid),
  };
}
