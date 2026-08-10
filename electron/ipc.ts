// IPC surface for PTA CD. A light main-process session tracks the logged-in
// officer; sensitive actions enforce roles (President approves, Treasurer
// pays, Admin manages users).
import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { existsSync, readFileSync, promises as fs } from 'fs';
import * as path from 'path';
import { db } from './db/connection';
import { get as getSettings, load as loadSettings, update as updateSettings } from './db/settings';
import {
  createUser,
  deleteUser,
  listUsers,
  login,
  seedDefaultAdmin,
  updateUser,
} from './services/auth';
import { getFamilyDetail, listFamilies, syncFamilies } from './services/families';
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
  PtaFilePick,
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
    return updateUser(id, patch);
  });
  ipcMain.handle('pta:deleteUser', async (_e, id: number): Promise<void> => {
    requireRoles('admin');
    return deleteUser(id);
  });

  // ---- Families -------------------------------------------------------------
  ipcMain.handle('pta:syncFamilies', async (): Promise<number> => {
    requireUser();
    return syncFamilies();
  });
  ipcMain.handle('pta:listFamilies', async (_e, search?: string): Promise<Family[]> => {
    requireUser();
    return listFamilies(search);
  });
  ipcMain.handle('pta:familyDetail', async (_e, familyId: number): Promise<FamilyDetail> => {
    requireUser();
    return getFamilyDetail(familyId);
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
    await db.execute('DELETE FROM pta_fee_components WHERE id = ?', [id]);
  });
  ipcMain.handle('pta:recomputeCharges', async (): Promise<number> => {
    requireUser();
    return recomputeCharges();
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
    const u = requireUser();
    return createDisbursement(input, u.full_name || u.username);
  });
  ipcMain.handle('pta:approveDisbursement', async (_e, id: number): Promise<Disbursement> => {
    const u = requireRoles('president', 'vice_president');
    return approveDisbursement(id, u.full_name || u.username);
  });
  ipcMain.handle('pta:payDisbursement', async (_e, id: number, referenceNo: string): Promise<Disbursement> => {
    const u = requireRoles('treasurer');
    return payDisbursement(id, referenceNo, u.full_name || u.username);
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
  await ensureSchema(db.query.bind(db));
  await loadSettings();
  await seedDefaultAdmin();
  const year = getSettings().school_year;
  if (!year) await loadSettings();
  // Attachment storage lives under the app data dir.
  setAttachmentsDir(path.join(app.getPath('userData'), 'attachments'));
  // Family + charge bootstrap (safe even when the students table is new/empty).
  await syncFamilies().catch((err) => console.error('[pta] family sync failed:', err));
  await recomputeCharges().catch((err) => console.error('[pta] charge recompute failed:', err));
}
