// PTA officer accounts. Separate from TapIn School's users table so the two
// apps never conflict. Default admin (admin / admin) is seeded on first boot.
import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { db } from '../db/connection';
import type { PtaFilePick, PtaLoginResult, PtaRole, PtaUser, PtaUserInput } from '../../shared/types';

const ITERATIONS = 120000;
const KEY_LEN = 32;
const DIGEST = 'sha256';

const ROLES: PtaRole[] = ['admin', 'president', 'vice_president', 'treasurer', 'secretary', 'auditor'];

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(password, salt, ITERATIONS, KEY_LEN, DIGEST).toString('hex');
  return `pbkdf2$${ITERATIONS}$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [scheme, iterStr, salt, expected] = stored.split('$');
  if (scheme !== 'pbkdf2' || !salt || !expected) return false;
  const iterations = Math.max(1, Number(iterStr || ITERATIONS));
  const actual = pbkdf2Sync(password, salt, iterations, expected.length / 2, DIGEST).toString('hex');
  const a = Buffer.from(actual, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

type UserRow = {
  id: number;
  username: string;
  password_hash: string | null;
  full_name: string;
  role: PtaRole;
  photo: string | null;
  created_at: string;
};

const toUser = (r: UserRow): PtaUser => ({
  id: r.id,
  username: r.username,
  full_name: r.full_name,
  role: r.role,
  photo: r.photo ?? null,
  created_at: r.created_at,
});

export async function seedDefaultAdmin(): Promise<void> {
  await db.execute(
    'INSERT IGNORE INTO pta_users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)',
    ['admin', hashPassword('admin'), 'PTA Administrator', 'admin'],
  );
}

export async function login(username: string, password: string): Promise<PtaLoginResult> {
  const rows = await db.query<UserRow[]>(
    'SELECT * FROM pta_users WHERE username = ? LIMIT 1',
    [String(username ?? '').trim()],
  );
  const user = rows[0];
  if (!user || !verifyPassword(String(password ?? ''), user.password_hash)) {
    return { ok: false, error: 'Invalid username or password.' };
  }
  return { ok: true, user: toUser(user) };
}

export async function listUsers(): Promise<PtaUser[]> {
  const rows = await db.query<UserRow[]>('SELECT * FROM pta_users ORDER BY username');
  return rows.map(toUser);
}

export async function createUser(input: PtaUserInput): Promise<PtaUser> {
  const username = String(input.username ?? '').trim();
  const fullName = String(input.full_name ?? '').trim();
  if (!username || !fullName) throw new Error('Username and full name are required.');
  const role: PtaRole = ROLES.includes(input.role as PtaRole) ? (input.role as PtaRole) : 'secretary';
  const password = String(input.password ?? '');
  if (password.length < 4) throw new Error('Password must be at least 4 characters.');
  const res = await db.execute(
    'INSERT INTO pta_users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)',
    [username, hashPassword(password), fullName, role],
  );
  const [row] = await db.query<UserRow[]>('SELECT * FROM pta_users WHERE id = ?', [res.insertId]);
  return toUser(row);
}

export async function updateUser(id: number, patch: Partial<PtaUserInput>): Promise<PtaUser> {
  const [existing] = await db.query<UserRow[]>('SELECT * FROM pta_users WHERE id = ?', [id]);
  if (!existing) throw new Error('User not found.');
  const sets: string[] = [];
  const params: unknown[] = [];
  if ('username' in patch && patch.username !== undefined) {
    const username = String(patch.username).trim();
    if (!username) throw new Error('Username is required.');
    sets.push('username = ?');
    params.push(username);
  }
  if ('full_name' in patch && patch.full_name !== undefined) {
    sets.push('full_name = ?');
    params.push(String(patch.full_name).trim());
  }
  if ('role' in patch && patch.role !== undefined) {
    if (!ROLES.includes(patch.role as PtaRole)) throw new Error('Invalid role.');
    sets.push('role = ?');
    params.push(patch.role);
  }
  if ('password' in patch && patch.password) {
    if (String(patch.password).length < 4) throw new Error('Password must be at least 4 characters.');
    sets.push('password_hash = ?');
    params.push(hashPassword(String(patch.password)));
  }
  // Photo is managed by setUserPhoto (file → data URL); here we only allow
  // removing it (photo: null).
  if ('photo' in patch && patch.photo === null) {
    sets.push('photo = NULL');
  }
  if (sets.length) {
    params.push(id);
    await db.execute(`UPDATE pta_users SET ${sets.join(', ')} WHERE id = ?`, params);
  }
  const [row] = await db.query<UserRow[]>('SELECT * FROM pta_users WHERE id = ?', [id]);
  return toUser(row);
}

export async function deleteUser(id: number): Promise<void> {
  const [row] = await db.query<UserRow[]>('SELECT * FROM pta_users WHERE id = ?', [id]);
  if (!row) throw new Error('User not found.');
  if (row.role === 'admin') {
    const admins = await db.query<UserRow[]>("SELECT id FROM pta_users WHERE role = 'admin'");
    if (admins.length <= 1) throw new Error('Cannot delete the last admin account.');
  }
  await db.execute('DELETE FROM pta_users WHERE id = ?', [id]);
}

/** Max profile-photo size (2 MB) — keeps the MEDIUMTEXT column and IPC small. */
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

const photoMime = (name: string): string => {
  const ext = path.extname(name).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
};

/** Reads a picked photo file and returns it as a PtaFilePick carrying the
 *  contents as a data URL, so the renderer can preview it before saving.
 *  Enforces the size limit here (at pick time) rather than only at save. */
export async function readUserPhotoFile(filePath: string): Promise<PtaFilePick> {
  const stat = await fs.stat(filePath);
  if (stat.size > MAX_PHOTO_BYTES) throw new Error('Photo must be 2 MB or smaller.');
  const mime = photoMime(path.basename(filePath));
  const buf = await fs.readFile(filePath);
  return {
    name: path.basename(filePath),
    path: filePath,
    mime,
    size: stat.size,
    dataUrl: `data:${mime};base64,${buf.toString('base64')}`,
  };
}

/** Stores a picked photo as a data URL on the user's row (shared DB ⇒ every
 *  machine sees the same photo). Prefers an already-encoded data URL (the
 *  picker and browser mock both provide one); falls back to reading the path. */
export async function setUserPhoto(userId: number, file: PtaFilePick): Promise<PtaUser> {
  let dataUrl = file.dataUrl;
  if (!dataUrl) {
    if (!file.path) throw new Error('No photo file to upload.');
    const stat = await fs.stat(file.path);
    if (stat.size > MAX_PHOTO_BYTES) throw new Error('Photo must be 2 MB or smaller.');
    const buf = await fs.readFile(file.path);
    dataUrl = `data:${photoMime(file.name)};base64,${buf.toString('base64')}`;
  }
  await db.execute('UPDATE pta_users SET photo = ? WHERE id = ?', [dataUrl, userId]);
  const [row] = await db.query<UserRow[]>('SELECT * FROM pta_users WHERE id = ?', [userId]);
  if (!row) throw new Error('User not found.');
  return toUser(row);
}

/** Self-service password change — the caller's current password must match. */
export async function changePassword(userId: number, oldPassword: string, newPassword: string): Promise<void> {
  const [row] = await db.query<UserRow[]>('SELECT * FROM pta_users WHERE id = ?', [userId]);
  if (!row) throw new Error('User not found.');
  if (!verifyPassword(String(oldPassword ?? ''), row.password_hash)) {
    throw new Error('Current password is incorrect.');
  }
  const next = String(newPassword ?? '');
  if (next.length < 4) throw new Error('New password must be at least 4 characters.');
  await db.execute('UPDATE pta_users SET password_hash = ? WHERE id = ?', [hashPassword(next), userId]);
}

/** Admin changes an officer's password — the officer's CURRENT password must
 *  be verified first (same rule as self-service). Returns the updated user. */
export async function changeUserPassword(userId: number, oldPassword: string, newPassword: string): Promise<PtaUser> {
  await changePassword(userId, oldPassword, newPassword);
  const [row] = await db.query<UserRow[]>('SELECT * FROM pta_users WHERE id = ?', [userId]);
  if (!row) throw new Error('User not found.');
  return toUser(row);
}
