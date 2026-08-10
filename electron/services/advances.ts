// Cash advances + liquidation. An advance is issued from a fund to an officer;
// liquidation lists expense items with optional receipt attachments. Closing
// auto-computes returned cash (fund credit) or additional release (fund cost).
import { db } from '../db/connection';
import { removeAttachment, saveAttachment } from './attachments';
import type {
  Advance,
  AdvanceFilter,
  AdvanceInput,
  LiquidationItem,
  LiquidationItemInput,
  PtaFilePick,
} from '../../shared/types';

type AdvanceRow = {
  id: number;
  fund_id: number;
  fund_name: string;
  recipient: string;
  purpose: string;
  amount: number;
  date_issued: string;
  status: string;
  liquidated_amount: number;
  returned_amount: number;
  additional_release: number;
  created_by: string;
  created_at: string;
};

type ItemRow = {
  id: number;
  advance_id: number;
  date: string;
  description: string;
  amount: number;
  attachment_id: number | null;
  attachment_name: string | null;
};

const toAdvance = (r: AdvanceRow): Advance => ({
  id: r.id,
  fund_id: r.fund_id,
  fund_name: r.fund_name,
  recipient: r.recipient,
  purpose: r.purpose,
  amount: Number(r.amount),
  date_issued: r.date_issued,
  status: r.status as Advance['status'],
  liquidated_amount: Number(r.liquidated_amount),
  returned_amount: Number(r.returned_amount),
  additional_release: Number(r.additional_release),
  created_by: r.created_by,
  created_at: r.created_at,
});

const ADVANCE_SELECT = `
  SELECT a.id, a.fund_id, f.name AS fund_name, a.recipient, a.purpose, a.amount,
         a.date_issued, a.status,
         COALESCE((SELECT SUM(amount) FROM pta_liquidation_items WHERE advance_id = a.id), 0) AS liquidated_amount,
         a.returned_amount, a.additional_release, a.created_by, a.created_at
  FROM pta_advances a JOIN pta_funds f ON f.id = a.fund_id`;

export async function listAdvances(filter: AdvanceFilter = {}): Promise<Advance[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.from) {
    where.push('a.date_issued >= ?');
    params.push(filter.from);
  }
  if (filter.to) {
    where.push('a.date_issued <= ?');
    params.push(filter.to);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = await db.query<AdvanceRow[]>(
    `${ADVANCE_SELECT} ${whereSql} ORDER BY a.id DESC`,
    params,
  );
  return rows.map(toAdvance);
}

export async function createAdvance(input: AdvanceInput, actorName: string): Promise<Advance> {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Amount must be greater than 0.');
  const recipient = String(input.recipient ?? '').trim();
  const purpose = String(input.purpose ?? '').trim();
  if (!recipient || !purpose) throw new Error('Recipient and purpose are required.');
  const fund = await db.query<{ id: number }[]>('SELECT id FROM pta_funds WHERE id = ?', [input.fund_id]);
  if (!fund[0]) throw new Error('Fund not found.');

  const date = input.date_issued ? String(input.date_issued).slice(0, 10) : new Date().toISOString().slice(0, 10);
  const res = await db.execute(
    `INSERT INTO pta_advances (fund_id, recipient, purpose, amount, date_issued, status, created_by)
     VALUES (?, ?, ?, ?, ?, 'ISSUED', ?)`,
    [input.fund_id, recipient, purpose, amount, date, actorName],
  );
  const [row] = await db.query<AdvanceRow[]>(`${ADVANCE_SELECT} WHERE a.id = ?`, [res.insertId]);
  return toAdvance(row);
}

export async function listLiquidationItems(advanceId: number): Promise<LiquidationItem[]> {
  const rows = await db.query<ItemRow[]>(
    `SELECT i.id, i.advance_id, i.l_date AS date, i.description, i.amount,
            i.attachment_id, a.file_name AS attachment_name
     FROM pta_liquidation_items i
     LEFT JOIN pta_attachments a ON a.id = i.attachment_id
     WHERE i.advance_id = ?
     ORDER BY i.l_date, i.id`,
    [advanceId],
  );
  return rows.map((r) => ({ ...r, amount: Number(r.amount) }));
}

export async function addLiquidationItem(
  input: LiquidationItemInput,
  file: PtaFilePick | null,
): Promise<LiquidationItem> {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Expense amount must be greater than 0.');
  const description = String(input.description ?? '').trim();
  if (!description) throw new Error('Description is required.');
  const advance = await db.query<{ id: number; status: string }[]>(
    'SELECT id, status FROM pta_advances WHERE id = ?',
    [input.advance_id],
  );
  if (!advance[0]) throw new Error('Advance not found.');
  if (advance[0].status === 'LIQUIDATED' || advance[0].status === 'RETURNED') {
    throw new Error('This advance is already closed.');
  }

  let attachmentId: number | null = null;
  if (file) {
    attachmentId = await saveAttachment('advance', input.advance_id, file);
  }
  const date = String(input.date).slice(0, 10) || new Date().toISOString().slice(0, 10);
  const res = await db.execute(
    'INSERT INTO pta_liquidation_items (advance_id, l_date, description, amount, attachment_id) VALUES (?, ?, ?, ?, ?)',
    [input.advance_id, date, description, amount, attachmentId],
  );
  const [row] = await db.query<ItemRow[]>(
    `SELECT i.id, i.advance_id, i.l_date AS date, i.description, i.amount,
            i.attachment_id, a.file_name AS attachment_name
     FROM pta_liquidation_items i
     LEFT JOIN pta_attachments a ON a.id = i.attachment_id
     WHERE i.id = ?`,
    [res.insertId],
  );
  await refreshStatus(input.advance_id);
  return { ...row!, amount: Number(row!.amount) };
}

export async function removeLiquidationItem(id: number): Promise<void> {
  const [row] = await db.query<{ advance_id: number; attachment_id: number | null }[]>(
    'SELECT advance_id, attachment_id FROM pta_liquidation_items WHERE id = ?',
    [id],
  );
  if (!row) throw new Error('Item not found.');
  if (row.attachment_id) {
    // attachment_id has no FK to pta_attachments, so tolerate an already-missing row.
    await removeAttachment(row.attachment_id).catch(() => undefined);
  }
  await db.execute('DELETE FROM pta_liquidation_items WHERE id = ?', [id]);
  await refreshStatus(row.advance_id);
}

/** Recomputes the advance status from its items (ISSUED / PARTIALLY_LIQUIDATED). */
async function refreshStatus(advanceId: number): Promise<void> {
  const [a] = await db.query<{ amount: number; status: string }[]>(
    'SELECT amount, status FROM pta_advances WHERE id = ?',
    [advanceId],
  );
  if (!a || a.status === 'LIQUIDATED' || a.status === 'RETURNED') return;
  const [tot] = await db.query<{ total: number }[]>(
    'SELECT COALESCE(SUM(amount), 0) AS total FROM pta_liquidation_items WHERE advance_id = ?',
    [advanceId],
  );
  const total = Number(tot.total);
  const status = total <= 0 ? 'ISSUED' : total < Number(a.amount) - 0.001 ? 'PARTIALLY_LIQUIDATED' : 'LIQUIDATED';
  await db.execute('UPDATE pta_advances SET status = ? WHERE id = ?', [status, advanceId]);
}

/** Closes an advance: returned cash (fund credit) or additional release (fund
 *  cost) is auto-computed from the liquidation items vs the advance amount. */
export async function closeAdvance(advanceId: number): Promise<Advance> {
  const [a] = await db.query<AdvanceRow[]>(`${ADVANCE_SELECT} WHERE a.id = ?`, [advanceId]);
  if (!a) throw new Error('Advance not found.');
  if (a.status === 'LIQUIDATED' || a.status === 'RETURNED') throw new Error('Advance is already closed.');
  const liquidated = Number(a.liquidated_amount);
  const amount = Number(a.amount);
  const returned = Math.max(0, Math.round((amount - liquidated) * 100) / 100);
  const additional = Math.max(0, Math.round((liquidated - amount) * 100) / 100);
  const status = returned > 0 ? 'RETURNED' : 'LIQUIDATED';
  await db.execute(
    'UPDATE pta_advances SET returned_amount = ?, additional_release = ?, status = ? WHERE id = ?',
    [returned, additional, status, advanceId],
  );
  const [row] = await db.query<AdvanceRow[]>(`${ADVANCE_SELECT} WHERE a.id = ?`, [advanceId]);
  return toAdvance(row);
}

export { getAttachment, openAttachment, setAttachmentsDir } from './attachments';