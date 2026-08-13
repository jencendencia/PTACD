// Disbursements with the DRAFT → APPROVED (President) → PAID (Treasurer)
// workflow and auto-numbered Disbursement Vouchers (DV). Each DV can carry
// multiple supporting attachments (invoices, quotations, ORs, …).
import type { PoolConnection } from 'mysql2/promise';
import { db } from '../db/connection';
import { get } from '../db/settings';
import { schoolYearStart } from './collections';
import { withRetry } from './db-retry';
import { listAttachments, removeAttachment, saveAttachment } from './attachments';
import type {
  Attachment,
  Disbursement,
  DisbursementFilter,
  DisbursementInput,
  DisbursementStatus,
  PtaFilePick,
} from '../../shared/types';

type DisbRow = {
  id: number;
  dv_no: string;
  fund_id: number;
  fund_name: string;
  payee: string;
  received_by: string;
  purpose: string;
  amount: number;
  date: string;
  status: DisbursementStatus;
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  paid_by: string | null;
  paid_at: string | null;
  reference_no: string;
  notes: string;
  created_at: string;
};

const toDisb = (r: DisbRow): Disbursement => ({
  id: r.id,
  dv_no: r.dv_no,
  fund_id: r.fund_id,
  fund_name: r.fund_name,
  payee: r.payee,
  received_by: r.received_by ?? '',
  purpose: r.purpose,
  amount: Number(r.amount),
  date: r.date,
  status: r.status,
  created_by: r.created_by,
  approved_by: r.approved_by,
  approved_at: r.approved_at,
  paid_by: r.paid_by,
  paid_at: r.paid_at,
  reference_no: r.reference_no,
  notes: r.notes,
  created_at: r.created_at,
});

/** Counts existing vouchers for the prefix+year on the caller's connection.
 *  Callers MUST hold the `pta:dv-no:<prefix><year>` GET_LOCK (acquired before
 *  the transaction, released after commit) so two machines can't mint the
 *  same voucher number. */
async function nextDvNo(conn: PoolConnection, prefix: string, yearLabel: string): Promise<string> {
  const year = schoolYearStart(yearLabel);
  const rows = (await conn.query(
    'SELECT COUNT(*) AS c FROM pta_disbursements WHERE dv_no LIKE ?',
    [`${prefix}${year}-%`],
  ))[0] as unknown as { c: number }[];
  const n = Number(rows[0]?.c ?? 0) + 1;
  return `${prefix}${year}-${String(n).padStart(4, '0')}`;
}

export async function listDisbursements(filter: DisbursementFilter = {}): Promise<{ rows: Disbursement[]; total: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.status) {
    where.push('d.status = ?');
    params.push(filter.status);
  }
  if (filter.from) {
    where.push('d.d_date >= ?');
    params.push(filter.from);
  }
  if (filter.to) {
    where.push('d.d_date <= ?');
    params.push(filter.to);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const totalRows = await db.query<{ c: number }[]>(
    `SELECT COUNT(*) AS c FROM pta_disbursements d ${whereSql}`,
    params,
  );
  const total = Number(totalRows[0]?.c ?? 0);
  const limit = Math.min(filter.limit ?? 50, 500);
  const offset = filter.offset ?? 0;
  const rows = await db.query<DisbRow[]>(
    `SELECT d.id, d.dv_no, d.fund_id, f.name AS fund_name, d.payee, d.received_by, d.purpose, d.amount,
            d.d_date AS date, d.status, d.created_by, d.approved_by, d.approved_at,
            d.paid_by, d.paid_at, d.reference_no, d.notes, d.created_at
     FROM pta_disbursements d
     JOIN pta_funds f ON f.id = d.fund_id
     ${whereSql}
     ORDER BY d.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  return { rows: rows.map(toDisb), total };
}

export async function createDisbursement(input: DisbursementInput, actorName: string): Promise<Disbursement> {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Amount must be greater than 0.');
  const payee = String(input.payee ?? '').trim();
  const purpose = String(input.purpose ?? '').trim();
  if (!payee || !purpose) throw new Error('Payee and purpose are required.');

  const fund = await db.query<{ id: number }[]>('SELECT id FROM pta_funds WHERE id = ?', [input.fund_id]);
  if (!fund[0]) throw new Error('Fund not found.');

  // DV number minted under GET_LOCK (held until commit) so two machines can't
  // issue the same voucher number; the UNIQUE key on dv_no is the backstop.
  // Number allocation + insert commit together on one connection.
  const settings = get();
  const year = settings.school_year;
  const lockName = `pta:dv-no:${settings.dv_prefix}${schoolYearStart(year)}`;
  const insertedId = await withRetry(() =>
    db.withConnection(async (conn) => {
      const got = (await conn.query('SELECT GET_LOCK(?, 10) AS got', [lockName]))[0] as unknown as {
        got: number;
      }[];
      if (got[0]?.got !== 1) {
        throw new Error('Voucher numbering is busy on another machine — please try again.');
      }
      try {
        await conn.beginTransaction();
        const dvNo = await nextDvNo(conn, settings.dv_prefix, year);
        const date = input.date ? String(input.date).slice(0, 10) : new Date().toISOString().slice(0, 10);
        const res = (await conn.execute(
          `INSERT INTO pta_disbursements (dv_no, fund_id, payee, received_by, purpose, amount, d_date, status, created_by, notes)
           VALUES (?, ?, ?, '', ?, ?, ?, 'DRAFT', ?, ?)`,
          [dvNo, input.fund_id, payee, purpose, amount, date, actorName, String(input.notes ?? '').trim()],
        ))[0] as unknown as { insertId: number };
        await conn.commit();
        return res.insertId;
      } catch (err) {
        await conn.rollback().catch(() => undefined);
        throw err;
      } finally {
        await conn.query('SELECT RELEASE_LOCK(?) AS rel', [lockName]).catch(() => undefined);
      }
    }),
  );
  if (!insertedId) throw new Error('Database is offline.');
  const [row] = await db.query<DisbRow[]>(
    `SELECT d.id, d.dv_no, d.fund_id, f.name AS fund_name, d.payee, d.received_by, d.purpose, d.amount,
            d.d_date AS date, d.status, d.created_by, d.approved_by, d.approved_at,
            d.paid_by, d.paid_at, d.reference_no, d.notes, d.created_at
     FROM pta_disbursements d JOIN pta_funds f ON f.id = d.fund_id WHERE d.id = ?`,
    [insertedId],
  );
  return toDisb(row);
}

export async function approveDisbursement(id: number, actorName: string): Promise<Disbursement> {
  const [row] = await db.query<DisbRow[]>(
    `SELECT d.id, d.dv_no, d.fund_id, f.name AS fund_name, d.payee, d.received_by, d.purpose, d.amount,
            d.d_date AS date, d.status, d.created_by, d.approved_by, d.approved_at,
            d.paid_by, d.paid_at, d.reference_no, d.notes, d.created_at
     FROM pta_disbursements d JOIN pta_funds f ON f.id = d.fund_id WHERE d.id = ?`,
    [id],
  );
  if (!row) throw new Error('Disbursement not found.');
  if (row.status !== 'DRAFT') throw new Error('Only draft disbursements can be approved.');
  await db.execute(
    "UPDATE pta_disbursements SET status = 'APPROVED', approved_by = ?, approved_at = NOW() WHERE id = ?",
    [actorName, id],
  );
  return { ...toDisb(row), status: 'APPROVED', approved_by: actorName, approved_at: new Date().toISOString() };
}

export async function payDisbursement(id: number, referenceNo: string, receivedBy: string, actorName: string): Promise<Disbursement> {
  const [row] = await db.query<DisbRow[]>(
    `SELECT d.id, d.dv_no, d.fund_id, f.name AS fund_name, d.payee, d.received_by, d.purpose, d.amount,
            d.d_date AS date, d.status, d.created_by, d.approved_by, d.approved_at,
            d.paid_by, d.paid_at, d.reference_no, d.notes, d.created_at
     FROM pta_disbursements d JOIN pta_funds f ON f.id = d.fund_id WHERE d.id = ?`,
    [id],
  );
  if (!row) throw new Error('Disbursement not found.');
  if (row.status !== 'APPROVED') throw new Error('Only approved disbursements can be paid.');
  await db.execute(
    "UPDATE pta_disbursements SET status = 'PAID', paid_by = ?, paid_at = NOW(), reference_no = ?, received_by = ? WHERE id = ?",
    [actorName, String(referenceNo ?? '').trim(), String(receivedBy ?? '').trim(), id],
  );
  return {
    ...toDisb(row),
    status: 'PAID',
    paid_by: actorName,
    paid_at: new Date().toISOString(),
    reference_no: String(referenceNo ?? '').trim(),
    received_by: String(receivedBy ?? '').trim(),
  };
}

export async function deleteDisbursement(id: number): Promise<void> {
  const [row] = await db.query<{ status: DisbursementStatus }[]>(
    'SELECT status FROM pta_disbursements WHERE id = ?',
    [id],
  );
  if (!row) throw new Error('Disbursement not found.');
  if (row.status !== 'DRAFT') throw new Error('Only draft disbursements can be deleted.');
  await db.execute('DELETE FROM pta_disbursements WHERE id = ?', [id]);
}

// ---- Attachments (supporting documents) --------------------------------------

export async function listDisbursementAttachments(disbursementId: number): Promise<Attachment[]> {
  return listAttachments('disbursement', disbursementId);
}

export async function addDisbursementAttachment(disbursementId: number, file: PtaFilePick): Promise<Attachment> {
  const [row] = await db.query<{ id: number }[]>(
    'SELECT id FROM pta_disbursements WHERE id = ?',
    [disbursementId],
  );
  if (!row) throw new Error('Disbursement not found.');
  const id = await saveAttachment('disbursement', disbursementId, file);
  const [att] = await db.query<Attachment[]>(
    'SELECT id, entity, entity_id, file_name, mime, size, created_at FROM pta_attachments WHERE id = ?',
    [id],
  );
  return att;
}

export async function removeDisbursementAttachment(attachmentId: number): Promise<void> {
  await removeAttachment(attachmentId);
}
