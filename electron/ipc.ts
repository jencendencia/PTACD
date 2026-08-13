// IPC surface for PTA CD. A light main-process session tracks the logged-in
// officer; sensitive actions enforce roles (President approves, Treasurer
// pays, Admin manages users).
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { existsSync, readFileSync, promises as fs } from 'fs';
import {
  checkForUpdates,
  clearGithubToken,
  downloadUpdate,
  getGithubToken,
  initUpdater,
  installUpdate,
  setGithubToken,
} from './services/updates';
import { activateLicense, checkLicense, getMachineId } from './services/license';
import * as path from 'path';
import { db } from './db/connection';
import { get as getSettings, load as loadSettings, update as updateSettings } from './db/settings';
import {
  changePassword,
  changeUserPassword,
  createUser,
  deleteUser,
  listUsers,
  login,
  readUserPhotoFile,
  seedDefaultAdmin,
  setUserPhoto,
  updateUser,
} from './services/auth';
import { getFamilyDetail, listFamilies, outstandingByYear, syncFamilies } from './services/families';
import { withJobLock } from './services/job-lock';
import { listCharges, recomputeCharges } from './services/charges';
import { deleteFund, listFunds, saveFund } from './services/funds';
import {
  deleteDistributionRule,
  listDistributionRules,
  saveDistributionRule,
} from './services/funds';
import { createCollection, collectionDetail, listCollections, voidCollection } from './services/collections';
import {
  addDisbursementAttachment,
  approveDisbursement,
  createDisbursement,
  deleteDisbursement,
  listDisbursementAttachments,
  listDisbursements,
  payDisbursement,
  removeDisbursementAttachment,
} from './services/disbursements';
import {
  addLiquidationItem,
  closeAdvance,
  createAdvance,
  listAdvances,
  listLiquidationItems,
  openAttachment,
  removeLiquidationItem,
  setAttachmentsDir,
} from './services/advances';
import {
  collectionsReport,
  familyBalances,
  fundBalances,
  getDashboard,
  sectionCollections,
  sectionFamilies,
  statementOfAccount,
} from './services/reports';

// Where the user-edited DB connection config is persisted (userData, not the repo).
const DB_CONFIG_FILE = 'db-config.json';
import type {
  Advance,
  AdvanceFilter,
  AdvanceInput,
  Attachment,
  Charge,
  CollectionDetail,
  CollectionFilter,
  CollectionInput,
  CollectionsSummaryRow,
  Disbursement,
  DisbursementFilter,
  DisbursementInput,
  DistributionRuleInput,
  Family,
  FamilyBalanceRow,
  FamilyDetail,
  FamilyOutstanding,
  FeeComponent,
  FeeComponentInput,
  Fund,
  FundBalanceRow,
  FundInput,
  LiquidationItem,
  LiquidationItemInput,
  PtaDashboard,
  PtaDbConfig,
  PtaDbStatus,
  SchoolInfo,
  PtaFilePick,
  PtaLicenseResult,
  PtaLicenseStatus,
  PtaLoginResult,
  PtaRole,
  PtaSettings,
  PtaUser,
  PtaUserInput,
  SectionCollectionRow,
  SectionFamilyRow,
  StatementOfAccount,
} from '../shared/types';

let currentUser: PtaUser | null = null;

function requireUser(): PtaUser {
  if (!currentUser) throw new Error('Not signed in.');
  return currentUser;
}

function requireRoles(...roles: PtaRole[]): PtaUser {
  const u = requireUser();
  if (u.role !== 'admin' && !roles.includes(u.role)) {
    throw new Error(`This action requires the ${roles.join(' or ')} role.`);
  }
  return u;
}

export function registerIpc(): void {
  initUpdater();

  // ---- Database status (shown in the custom title bar) ---------------------------
  // Push live status changes to every window so the title bar stays in sync.
  db.on('status', (status: PtaDbStatus) => {
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send('db:status', status);
    }
  });
  ipcMain.handle('pta:dbStatus', (): PtaDbStatus => db.getStatus());
  ipcMain.handle('pta:dbConnect', async (_e, config: PtaDbConfig): Promise<PtaDbStatus> => {
    db.setConfig({
      host: String(config.host ?? '').trim(),
      port: Number(config.port) || 3306,
      user: String(config.user ?? '').trim(),
      password: config.password ?? '',
      database: String(config.database ?? '').trim(),
    });
    const ok = await db.reconnect();
    if (ok) {
      // Remember the working config for next launch.
      const cfg = db.getConfig();
      await fs
        .writeFile(path.join(app.getPath('userData'), DB_CONFIG_FILE), JSON.stringify(cfg, null, 2), 'utf8')
        .catch((err) => console.error('[pta] failed to persist db config:', err));
      // The app may have booted while the DB was unreachable — (re)run the
      // bootstrap (schema, settings, families, charges) against the new server.
      try {
        await bootPta();
      } catch (err) {
        console.error('[pta] post-connect boot failed:', err);
      }
    }
    return db.getStatus();
  });

  // ---- Window controls (custom title bar) ---------------------------------------
  ipcMain.handle('win:minimize', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize();
  });
  ipcMain.handle('win:toggleMaximize', (e) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (!w) return;
    if (w.isMaximized()) w.unmaximize();
    else w.maximize();
  });
  ipcMain.handle('win:close', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close();
  });
  ipcMain.handle('win:isMaximized', (e) => BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false);

  ipcMain.handle('pta:login', async (_e, username: string, password: string): Promise<PtaLoginResult> => {
    const res = await login(username, password);
    if (res.ok && res.user) currentUser = res.user;
    return res;
  });
  ipcMain.handle('pta:logout', () => {
    currentUser = null;
  });
  ipcMain.handle('pta:me', (): PtaUser | null => currentUser);

  // ---- Users (admin only) ---------------------------------------------------
  ipcMain.handle('pta:listUsers', async (): Promise<PtaUser[]> => {
    requireRoles('admin');
    return listUsers();
  });
  ipcMain.handle('pta:createUser', async (_e, input: PtaUserInput): Promise<PtaUser> => {
    requireRoles('admin');
    return createUser(input);
  });
  ipcMain.handle('pta:updateUser', async (_e, id: number, patch: Partial<PtaUserInput>): Promise<PtaUser> => {
    requireRoles('admin');
    const updated = await updateUser(id, patch);
    // Keep the live session in sync when an officer edits their own account
    // (e.g. renames or re-roles themselves) so pta:me on reload is current.
    if (currentUser && updated.id === currentUser.id) currentUser = updated;
    return updated;
  });
  ipcMain.handle('pta:deleteUser', async (_e, id: number): Promise<void> => {
    requireRoles('admin');
    return deleteUser(id);
  });
  // Profile photo picker (image-only dialog). The file is read in main and
  // returned as a data URL so the renderer can preview it before saving;
  // the 2 MB size limit is enforced here, at pick time.
  ipcMain.handle('pta:pickUserPhoto', async (): Promise<PtaFilePick | null> => {
    requireUser();
    const res = await dialog.showOpenDialog({
      title: 'Choose profile photo',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    return readUserPhotoFile(res.filePaths[0]);
  });
  ipcMain.handle('pta:setUserPhoto', async (_e, id: number, file: PtaFilePick): Promise<PtaUser> => {
    // Admins manage everyone's photo; other roles may only set their own.
    const u = requireUser();
    if (u.role !== 'admin' && u.id !== id) throw new Error('You can only change your own photo.');
    const updated = await setUserPhoto(id, file);
    if (currentUser && updated.id === currentUser.id) currentUser = updated;
    return updated;
  });
  // Self-service password change — the old/current password is verified in the service.
  ipcMain.handle('pta:changePassword', async (_e, oldPassword: string, newPassword: string): Promise<void> => {
    const u = requireUser();
    return changePassword(u.id, oldPassword, newPassword);
  });
  // Admin changes an officer's password — the officer's CURRENT password is
  // required and verified, so a password can never be replaced blind.
  ipcMain.handle(
    'pta:changeUserPassword',
    async (_e, id: number, oldPassword: string, newPassword: string): Promise<PtaUser> => {
      requireRoles('admin');
      const updated = await changeUserPassword(id, oldPassword, newPassword);
      if (currentUser && updated.id === currentUser.id) currentUser = updated;
      return updated;
    },
  );

  // ---- Families -------------------------------------------------------------
  ipcMain.handle('pta:syncFamilies', async (): Promise<number> => {
    requireUser();
    // Wait for a peer's in-progress rebuild (up to 30s) so an admin-initiated
    // sync always completes; bootPta uses a skip-if-busy lock instead.
    const n = await withJobLock('pta:bootstrap', () => syncFamilies(), 30);
    if (n === null) throw new Error('Another machine is syncing families right now — try again in a moment.');
    return n;
  });
  ipcMain.handle('pta:listFamilies', async (_e, search?: string): Promise<Family[]> => {
    requireUser();
    return listFamilies(search);
  });
  ipcMain.handle('pta:familyDetail', async (_e, familyId: number): Promise<FamilyDetail> => {
    requireUser();
    return getFamilyDetail(familyId);
  });
  ipcMain.handle('pta:familyOutstanding', async (_e, familyId: number): Promise<FamilyOutstanding> => {
    requireUser();
    return outstandingByYear(familyId);
  });

  // ---- Fee components ---------------------------------------------------------
  ipcMain.handle('pta:listComponents', async (): Promise<FeeComponent[]> => {
    requireUser();
    return db.query<FeeComponent[]>('SELECT * FROM pta_fee_components ORDER BY sort_order, id');
  });
  ipcMain.handle(
    'pta:saveComponent',
    async (_e, input: FeeComponentInput): Promise<FeeComponent> => {
      requireUser();
      const code = String(input.code ?? '').trim().toUpperCase();
      const label = String(input.label ?? '').trim();
      const amount = Number(input.amount);
      if (!code || !label) throw new Error('Code and label are required.');
      if (!Number.isFinite(amount) || amount < 0) throw new Error('Amount is invalid.');
      if (input.applies !== 'per_family' && input.applies !== 'per_child') {
        throw new Error("Billing must be 'per_family' or 'per_child'.");
      }
      const term = String(input.term ?? '').trim();
      await db.execute(
        `INSERT INTO pta_fee_components (code, label, amount, applies, term, is_active, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE label = VALUES(label), amount = VALUES(amount),
           applies = VALUES(applies), is_active = VALUES(is_active), sort_order = VALUES(sort_order)`,
        [code, label, amount, input.applies, term, input.is_active === false ? 0 : 1, input.sort_order ?? 0],
      );
      const [row] = await db.query<FeeComponent[]>(
        'SELECT * FROM pta_fee_components WHERE code = ? AND term = ?',
        [code, term],
      );
      return row;
    },
  );
  ipcMain.handle('pta:deleteComponent', async (_e, id: number): Promise<void> => {
    requireUser();
    const [count] = await db.query<{ n: number }[]>(
      'SELECT COUNT(*) AS n FROM pta_charges WHERE component_id = ?',
      [id],
    );
    if (Number(count?.n ?? 0) > 0) {
      throw new Error('This component already has charges and cannot be deleted.');
    }
    await db.execute('DELETE FROM pta_fee_components WHERE id = ?', [id]);
  });
  ipcMain.handle('pta:recomputeCharges', async (): Promise<number> => {
    requireUser();
    const n = await withJobLock('pta:bootstrap', () => recomputeCharges(), 30);
    if (n === null) throw new Error('Another machine is recomputing charges right now — try again in a moment.');
    return n;
  });

  // ---- Funds & distribution rules ----------------------------------------------
  ipcMain.handle('pta:listFunds', async (): Promise<Fund[]> => {
    requireUser();
    return listFunds();
  });
  ipcMain.handle('pta:saveFund', async (_e, input: FundInput): Promise<Fund> => {
    requireUser();
    return saveFund(input);
  });
  ipcMain.handle('pta:deleteFund', async (_e, id: number): Promise<void> => {
    requireUser();
    try {
      await deleteFund(id);
    } catch (err) {
      throw new Error('Fund is in use (rules, disbursements or advances) and cannot be deleted.');
    }
  });
  ipcMain.handle('pta:listRules', async () => {
    requireUser();
    return listDistributionRules();
  });
  ipcMain.handle('pta:saveRule', async (_e, input: DistributionRuleInput) => {
    requireUser();
    return saveDistributionRule(input);
  });
  ipcMain.handle('pta:deleteRule', async (_e, id: number) => {
    requireUser();
    return deleteDistributionRule(id);
  });

  // ---- Charges & collections ---------------------------------------------------
  ipcMain.handle('pta:listCharges', async (_e, schoolYear: string, familyId?: number): Promise<Charge[]> => {
    requireUser();
    return listCharges(schoolYear, familyId);
  });
  ipcMain.handle('pta:listCollections', async (_e, filter?: CollectionFilter) => {
    requireUser();
    return listCollections(filter);
  });
  ipcMain.handle('pta:collectionDetail', async (_e, id: number): Promise<CollectionDetail> => {
    requireUser();
    return collectionDetail(id);
  });
  ipcMain.handle('pta:createCollection', async (_e, input: CollectionInput): Promise<CollectionDetail> => {
    const u = requireUser();
    return createCollection(input, u.full_name || u.username);
  });
  ipcMain.handle('pta:voidCollection', async (_e, id: number): Promise<void> => {
    requireUser();
    return voidCollection(id);
  });

  // ---- Disbursements -------------------------------------------------------------
  ipcMain.handle('pta:listDisbursements', async (_e, filter?: DisbursementFilter) => {
    requireUser();
    return listDisbursements(filter);
  });
  ipcMain.handle('pta:createDisbursement', async (_e, input: DisbursementInput): Promise<Disbursement> => {
    // Drafts are prepared by the Treasurer.
    const u = requireRoles('treasurer');
    return createDisbursement(input, u.full_name || u.username);
  });
  ipcMain.handle('pta:approveDisbursement', async (_e, id: number): Promise<Disbursement> => {
    // Approval is reserved to the President.
    const u = requireRoles('president');
    return approveDisbursement(id, u.full_name || u.username);
  });
  ipcMain.handle('pta:payDisbursement', async (_e, id: number, referenceNo: string, receivedBy: string): Promise<Disbursement> => {
    const u = requireRoles('treasurer');
    return payDisbursement(id, referenceNo, receivedBy, u.full_name || u.username);
  });
  ipcMain.handle('pta:deleteDisbursement', async (_e, id: number): Promise<void> => {
    requireUser();
    return deleteDisbursement(id);
  });
  ipcMain.handle('pta:listDisbAttachments', async (_e, id: number): Promise<Attachment[]> => {
    requireUser();
    return listDisbursementAttachments(id);
  });
  ipcMain.handle('pta:addDisbAttachment', async (_e, id: number, file: PtaFilePick): Promise<Attachment> => {
    requireUser();
    return addDisbursementAttachment(id, file);
  });
  ipcMain.handle('pta:removeDisbAttachment', async (_e, attachmentId: number): Promise<void> => {
    requireUser();
    return removeDisbursementAttachment(attachmentId);
  });

  // ---- Advances & liquidation ------------------------------------------------------
  ipcMain.handle('pta:listAdvances', async (_e, filter?: AdvanceFilter): Promise<Advance[]> => {
    requireUser();
    return listAdvances(filter ?? {});
  });
  ipcMain.handle('pta:createAdvance', async (_e, input: AdvanceInput): Promise<Advance> => {
    const u = requireRoles('treasurer');
    return createAdvance(input, u.full_name || u.username);
  });
  ipcMain.handle('pta:listLiquidationItems', async (_e, advanceId: number): Promise<LiquidationItem[]> => {
    requireUser();
    return listLiquidationItems(advanceId);
  });
  ipcMain.handle(
    'pta:addLiquidationItem',
    async (_e, input: LiquidationItemInput, file: PtaFilePick | null): Promise<LiquidationItem> => {
      requireUser();
      return addLiquidationItem(input, file);
    },
  );
  ipcMain.handle('pta:removeLiquidationItem', async (_e, id: number): Promise<void> => {
    requireUser();
    return removeLiquidationItem(id);
  });
  ipcMain.handle('pta:closeAdvance', async (_e, advanceId: number): Promise<Advance> => {
    requireRoles('treasurer');
    return closeAdvance(advanceId);
  });
  ipcMain.handle('pta:pickAttachmentFile', async (): Promise<PtaFilePick | null> => {
    requireUser();
    const res = await dialog.showOpenDialog({
      title: 'Attach receipt',
      properties: ['openFile'],
      filters: [
        { name: 'Images & documents', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf'] },
      ],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    const filePath = res.filePaths[0];
    const stat = await fs.stat(filePath);
    return {
      name: path.basename(filePath),
      path: filePath,
      mime: path.extname(filePath).toLowerCase() === '.pdf' ? 'application/pdf' : 'image/*',
      size: stat.size,
    };
  });
  ipcMain.handle('pta:openAttachment', async (_e, attachmentId: number): Promise<void> => {
    requireUser();
    return openAttachment(attachmentId);
  });

  // ---- Settings ---------------------------------------------------------------------
  ipcMain.handle('pta:getSettings', async (): Promise<PtaSettings> => {
    requireUser();
    return getSettings();
  });
  ipcMain.handle('pta:updateSettings', async (_e, patch: Partial<PtaSettings>): Promise<PtaSettings> => {
    requireUser();
    return updateSettings(patch);
  });
  ipcMain.handle('pta:listSchoolYears', async (): Promise<string[]> => {
    requireUser();
    const rows = await db.query<{ name: string }[]>('SELECT name FROM school_years ORDER BY name');
    return rows.map((r) => r.name);
  });
  // School branding — intentionally public (shown on the login screen, so no
  // requireUser here). Read from the shared TapIn School settings table.
  ipcMain.handle('pta:schoolInfo', async (): Promise<SchoolInfo> => {
    const rows = await db.query<{ setting_key: string; setting_value: string }[]>(
      "SELECT setting_key, setting_value FROM settings WHERE setting_key IN ('school_name', 'logo_url')",
    );
    const map = new Map(rows.map((r) => [r.setting_key, r.setting_value]));
    return { school_name: map.get('school_name') ?? '', logo_url: map.get('logo_url') ?? '' };
  });

  // ---- App updates (Settings screen — requires a signed-in user) ------------------------
  ipcMain.handle('pta:getAppVersion', (): string => {
    requireUser();
    return app.getVersion();
  });
  ipcMain.handle('pta:checkForUpdates', () => {
    requireUser();
    return checkForUpdates();
  });
  ipcMain.handle('pta:downloadUpdate', () => {
    requireUser();
    return downloadUpdate();
  });
  ipcMain.handle('pta:installUpdate', () => {
    requireUser();
    installUpdate();
  });
  ipcMain.handle('pta:getGithubToken', (): string | null => {
    requireUser();
    return getGithubToken();
  });
  ipcMain.handle('pta:setGithubToken', (_e, token: string): void => {
    requireUser();
    setGithubToken(token);
  });
  ipcMain.handle('pta:clearGithubToken', (): void => {
    requireUser();
    clearGithubToken();
  });

  // ---- License / activation (before login) -------------------------------------------
  ipcMain.handle('pta:checkLicense', (): PtaLicenseStatus => checkLicense());
  ipcMain.handle('pta:activateLicense', (_e, key: string): Promise<PtaLicenseResult> => activateLicense(key));
  ipcMain.handle('pta:getMachineId', (): string => getMachineId());

  // ---- Reports --------------------------------------------------------------------------
  ipcMain.handle('pta:dashboard', async (): Promise<PtaDashboard> => {
    requireUser();
    return getDashboard();
  });
  ipcMain.handle('pta:fundBalances', async (): Promise<FundBalanceRow[]> => {
    requireUser();
    return fundBalances();
  });
  ipcMain.handle('pta:familyBalances', async (_e, search?: string): Promise<FamilyBalanceRow[]> => {
    requireUser();
    return familyBalances(search);
  });
  ipcMain.handle('pta:sectionCollections', async (_e, schoolYear: string): Promise<SectionCollectionRow[]> => {
    requireUser();
    return sectionCollections(schoolYear);
  });
  ipcMain.handle(
    'pta:sectionFamilies',
    async (_e, schoolYear: string, gradeSection: string): Promise<SectionFamilyRow[]> => {
      requireUser();
      return sectionFamilies(schoolYear, gradeSection);
    },
  );
  ipcMain.handle('pta:collectionsReport', async (_e, from?: string, to?: string): Promise<CollectionsSummaryRow[]> => {
    requireUser();
    return collectionsReport(from, to);
  });
  ipcMain.handle(
    'pta:statement',
    async (_e, familyId: number, schoolYear: string): Promise<StatementOfAccount> => {
      requireUser();
      return statementOfAccount(familyId, schoolYear);
    },
  );
}

/** Loads a previously saved DB connection config (from the title-bar dialog)
 *  so a re-connect survives app restarts. Call before db.start(). */
export function configureDbFromDisk(): void {
  const file = path.join(app.getPath('userData'), DB_CONFIG_FILE);
  if (!existsSync(file)) return;
  try {
    db.setConfig(JSON.parse(readFileSync(file, 'utf8')));
    console.log('[pta] loaded saved db config');
  } catch (err) {
    console.error('[pta] ignoring invalid saved db config:', err);
  }
}

/** Boot sequence: schema, settings, default admin, family sync, charges. */
export async function bootPta(): Promise<void> {
  const { ensureSchema } = await import('./db/schema');
  // Schema migration lock: only one machine may ALTER the shared schema at a
  // time (two machines booting a fresh DB could both run the same ALTER).
  // Waits up to 60s for a busy peer; a skip is retried on the next reconnect.
  await withJobLock('pta:schema', () => ensureSchema(db.query.bind(db)), 60);
  await loadSettings();
  await seedDefaultAdmin();
  const year = getSettings().school_year;
  if (!year) await loadSettings();
  // Attachment storage lives under the app data dir.
  setAttachmentsDir(path.join(app.getPath('userData'), 'attachments'));
  // Family + charge rebuild is idempotent but racy when two machines boot at
  // once (both read "existing" rows and both try the same INSERTs). Leader
  // election: skip when a peer is already rebuilding — the shared tables are
  // correct either way, and the next reconnect re-runs this. The manual
  // buttons use a wait timeout so an admin-initiated sync always completes.
  await withJobLock('pta:bootstrap', async () => {
    await syncFamilies().catch((err) => console.error('[pta] family sync failed:', err));
    await recomputeCharges().catch((err) => console.error('[pta] charge recompute failed:', err));
  }, 0);
}
