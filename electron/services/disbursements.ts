// Disbursements with the DRAFT → APPROVED (President) → PAID (Treasurer)
// workflow and auto-numbered Disbursement Vouchers (DV). Each DV can carry
// multiple supporting attachments (invoices, quotations, ORs, …).
import { db } from '../db/connection';
import { get } from '../db/settings';
import { schoolYearStart } from './collections';
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

async function nextDvNo(prefix: string, yearLabel: string): Promise<string> {
  const year = schoolYearStart(yearLabel);
  const rows = await db.query<{ c: number }[]>(
    'SELECT COUNT(*) AS c FROM pta_disbursements WHERE dv_no LIKE ?',
    [`${prefix}${year}-%`],
  );
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
    `SELECT d.id, d.dv_no, d.fund_id, f.name AS fund_name, d.payee, d.purpose, d.amount,
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

  const dvNo = await nextDvNo(get().dv_prefix, get().school_year);
  const date = input.date ? String(input.date).slice(0, 10) : new Date().toISOString().slice(0, 10);
  const res = await db.execute(
    `INSERT INTO pta_disbursements (dv_no, fund_id, payee, purpose, amount, d_date, status, created_by, notes)
     VALUES (?, ?, ?, ?, ?, ?, 'DRAFT', ?, ?)`,
    [dvNo, input.fund_id, payee, purpose, amount, date, actorName, String(input.notes ?? '').trim()],
  );
  const [row] = await db.query<DisbRow[]>(
    `SELECT d.id, d.dv_no, d.fund_id, f.name AS fund_name, d.payee, d.purpose, d.amount,
            d.d_date AS date, d.status, d.created_by, d.approved_by, d.approved_at,
            d.paid_by, d.paid_at, d.reference_no, d.notes, d.created_at
     FROM pta_disbursements d JOIN pta_funds f ON f.id = d.fund_id WHERE d.id = ?`,
    [res.insertId],
  );
  return toDisb(row);
}

export async function approveDisbursement(id: number, actorName: string): Promise<Disbursement> {
  const [row] = await db.query<DisbRow[]>(
    `SELECT d.id, d.dv_no, d.fund_id, f.name AS fund_name, d.payee, d.purpose, d.amount,
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

export async function payDisbursement(id: number, referenceNo: string, actorName: string): Promise<Disbursement> {
  const [row] = await db.query<DisbRow[]>(
    `SELECT d.id, d.dv_no, d.fund_id, f.name AS fund_name, d.payee, d.purpose, d.amount,
            d.d_date AS date, d.status, d.created_by, d.approved_by, d.approved_at,
            d.paid_by, d.paid_at, d.reference_no, d.notes, d.created_at
     FROM pta_disbursements d JOIN pta_funds f ON f.id = d.fund_id WHERE d.id = ?`,
    [id],
  );
  if (!row) throw new Error('Disbursement not found.');
  if (row.status !== 'APPROVED') throw new Error('Only approved disbursements can be paid.');
  await db.execute(
    "UPDATE pta_disbursements SET status = 'PAID', paid_by = ?, paid_at = NOW(), reference_no = ? WHERE id = ?",
    [actorName, String(referenceNo ?? '').trim(), id],
  );
  return {
    ...toDisb(row),
    status: 'PAID',
    paid_by: actorName,
    paid_at: new Date().toISOString(),
    reference_no: String(referenceNo ?? '').trim(),
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
