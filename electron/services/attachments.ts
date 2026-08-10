// Shared file-attachment store. pta_attachments is a generic table keyed by
// (entity, entity_id), so any feature (disbursements, advances, liquidation
// items) can attach files: receipts, invoices, quotations, authorization
// letters, etc. Files are copied into the app-data attachments directory.
import { promises as fs } from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { db } from '../db/connection';
import type { Attachment, PtaFilePick } from '../../shared/types';

let attachmentsDir = '';
export function setAttachmentsDir(dir: string): void {
  attachmentsDir = dir;
}

export async function saveAttachment(entity: string, entityId: number, file: PtaFilePick): Promise<number> {
  let storedPath = '';
  if (file.path && attachmentsDir) {
    const ext = path.extname(file.name);
    const storedName = `${randomUUID()}${ext}`;
    storedPath = path.join(attachmentsDir, storedName);
    await fs.mkdir(attachmentsDir, { recursive: true });
    await fs.copyFile(file.path, storedPath);
  }
  const res = await db.execute(
    'INSERT INTO pta_attachments (entity, entity_id, file_name, stored_path, mime, size) VALUES (?, ?, ?, ?, ?, ?)',
    [entity, entityId, file.name, storedPath, file.mime || '', file.size || 0],
  );
  return res.insertId;
}

export async function listAttachments(entity: string, entityId: number): Promise<Attachment[]> {
  const rows = await db.query<Attachment[]>(
    'SELECT id, entity, entity_id, file_name, mime, size, created_at FROM pta_attachments WHERE entity = ? AND entity_id = ? ORDER BY id',
    [entity, entityId],
  );
  return rows;
}

export async function getAttachment(attachmentId: number): Promise<Attachment | null> {
  const rows = await db.query<Attachment[]>(
    'SELECT id, entity, entity_id, file_name, mime, size, created_at FROM pta_attachments WHERE id = ?',
    [attachmentId],
  );
  return rows[0] ?? null;
}

/** Deletes the attachment row and its stored file (if any). */
export async function removeAttachment(attachmentId: number): Promise<void> {
  const rows = await db.query<{ stored_path: string }[]>(
    'SELECT stored_path FROM pta_attachments WHERE id = ?',
    [attachmentId],
  );
  if (!rows[0]) throw new Error('Attachment not found.');
  await db.execute('DELETE FROM pta_attachments WHERE id = ?', [attachmentId]);
  if (rows[0].stored_path) {
    await fs.unlink(rows[0].stored_path).catch(() => undefined);
  }
}

export async function openAttachment(attachmentId: number): Promise<void> {
  const rows = await db.query<{ stored_path: string }[]>(
    'SELECT stored_path FROM pta_attachments WHERE id = ?',
    [attachmentId],
  );
  const p = rows[0]?.stored_path;
  if (!p) throw new Error('Attachment has no stored file (browser mock mode).');
  // Lazy import so services stay loadable in plain-node checks.
  const { shell } = await import('electron');
  await shell.openPath(p);
}
