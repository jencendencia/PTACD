// Preload bridge: exposes the PTA API to the renderer via contextBridge.
import { contextBridge, ipcRenderer } from 'electron';
import type {
  Advance,
  AdvanceFilter,
  AdvanceInput,
  Attachment,
  Charge,
  Collection,
  CollectionDetail,
  CollectionFilter,
  CollectionInput,
  CollectionsSummaryRow,
  Disbursement,
  DisbursementFilter,
  DisbursementInput,
  DistributionRule,
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
  PtaApi,
  PtaDashboard,
  PtaDbConfig,
  PtaDbStatus,
  PtaFilePick,
  PtaLicenseResult,
  PtaLicenseStatus,
  PtaLoginResult,
  PtaSettings,
  PtaUpdateStatus,
  PtaUser,
  PtaUserInput,
  SchoolInfo,
  PtaWindowControls,
  SectionCollectionRow,
  SectionFamilyRow,
  StatementOfAccount,
} from '../shared/types';

const api: PtaApi = {
  getDbStatus: () => ipcRenderer.invoke('pta:dbStatus') as Promise<PtaDbStatus>,
  onDbStatusChange: (cb: (status: PtaDbStatus) => void) => {
    const listener = (_e: unknown, status: PtaDbStatus) => cb(status);
    ipcRenderer.on('db:status', listener);
    return () => ipcRenderer.removeListener('db:status', listener);
  },
  connectDb: (config: PtaDbConfig) => ipcRenderer.invoke('pta:dbConnect', config) as Promise<PtaDbStatus>,

  ptaLogin: (username, password) =>
    ipcRenderer.invoke('pta:login', username, password) as Promise<PtaLoginResult>,
  me: () => ipcRenderer.invoke('pta:me') as Promise<PtaUser | null>,
  listPtaUsers: () => ipcRenderer.invoke('pta:listUsers') as Promise<PtaUser[]>,
  createPtaUser: (input: PtaUserInput) => ipcRenderer.invoke('pta:createUser', input) as Promise<PtaUser>,
  updatePtaUser: (id: number, patch: Partial<PtaUserInput>) =>
    ipcRenderer.invoke('pta:updateUser', id, patch) as Promise<PtaUser>,
  deletePtaUser: (id: number) => ipcRenderer.invoke('pta:deleteUser', id) as Promise<void>,
  pickUserPhoto: () => ipcRenderer.invoke('pta:pickUserPhoto') as Promise<PtaFilePick | null>,
  setUserPhoto: (userId: number, file: PtaFilePick) =>
    ipcRenderer.invoke('pta:setUserPhoto', userId, file) as Promise<PtaUser>,
  changePassword: (oldPassword: string, newPassword: string) =>
    ipcRenderer.invoke('pta:changePassword', oldPassword, newPassword) as Promise<void>,
  changeUserPassword: (userId: number, oldPassword: string, newPassword: string) =>
    ipcRenderer.invoke('pta:changeUserPassword', userId, oldPassword, newPassword) as Promise<PtaUser>,

  syncFamilies: () => ipcRenderer.invoke('pta:syncFamilies') as Promise<number>,
  listFamilies: (search?: string) => ipcRenderer.invoke('pta:listFamilies', search) as Promise<Family[]>,
  getFamilyDetail: (familyId: number) =>
    ipcRenderer.invoke('pta:familyDetail', familyId) as Promise<FamilyDetail>,
  familyOutstanding: (familyId: number) =>
    ipcRenderer.invoke('pta:familyOutstanding', familyId) as Promise<FamilyOutstanding>,

  listFeeComponents: () => ipcRenderer.invoke('pta:listComponents') as Promise<FeeComponent[]>,
  saveFeeComponent: (input: FeeComponentInput) =>
    ipcRenderer.invoke('pta:saveComponent', input) as Promise<FeeComponent>,
  deleteFeeComponent: (id: number) => ipcRenderer.invoke('pta:deleteComponent', id) as Promise<void>,
  recomputeCharges: () => ipcRenderer.invoke('pta:recomputeCharges') as Promise<number>,

  listFunds: () => ipcRenderer.invoke('pta:listFunds') as Promise<Fund[]>,
  saveFund: (input: FundInput) => ipcRenderer.invoke('pta:saveFund', input) as Promise<Fund>,
  deleteFund: (id: number) => ipcRenderer.invoke('pta:deleteFund', id) as Promise<void>,
  listDistributionRules: () => ipcRenderer.invoke('pta:listRules') as Promise<DistributionRule[]>,
  saveDistributionRule: (input: DistributionRuleInput) =>
    ipcRenderer.invoke('pta:saveRule', input) as Promise<DistributionRule>,
  deleteDistributionRule: (id: number) => ipcRenderer.invoke('pta:deleteRule', id) as Promise<void>,

  listCharges: (schoolYear: string, familyId?: number) =>
    ipcRenderer.invoke('pta:listCharges', schoolYear, familyId) as Promise<Charge[]>,
  listCollections: (filter?: CollectionFilter) =>
    ipcRenderer.invoke('pta:listCollections', filter) as Promise<{ rows: Collection[]; total: number }>,
  collectionDetail: (id: number) =>
    ipcRenderer.invoke('pta:collectionDetail', id) as Promise<CollectionDetail>,
  createCollection: (input: CollectionInput) =>
    ipcRenderer.invoke('pta:createCollection', input) as Promise<CollectionDetail>,
  voidCollection: (id: number) => ipcRenderer.invoke('pta:voidCollection', id) as Promise<void>,

  listDisbursements: (filter?: DisbursementFilter) =>
    ipcRenderer.invoke('pta:listDisbursements', filter) as Promise<{ rows: Disbursement[]; total: number }>,
  createDisbursement: (input: DisbursementInput) =>
    ipcRenderer.invoke('pta:createDisbursement', input) as Promise<Disbursement>,
  approveDisbursement: (id: number) => ipcRenderer.invoke('pta:approveDisbursement', id) as Promise<Disbursement>,
  payDisbursement: (id: number, referenceNo: string, receivedBy: string) =>
    ipcRenderer.invoke('pta:payDisbursement', id, referenceNo, receivedBy) as Promise<Disbursement>,
  deleteDisbursement: (id: number) => ipcRenderer.invoke('pta:deleteDisbursement', id) as Promise<void>,
  listDisbursementAttachments: (disbursementId: number) =>
    ipcRenderer.invoke('pta:listDisbAttachments', disbursementId) as Promise<Attachment[]>,
  addDisbursementAttachment: (disbursementId: number, file: PtaFilePick) =>
    ipcRenderer.invoke('pta:addDisbAttachment', disbursementId, file) as Promise<Attachment>,
  removeDisbursementAttachment: (attachmentId: number) =>
    ipcRenderer.invoke('pta:removeDisbAttachment', attachmentId) as Promise<void>,

  listAdvances: (filter?: AdvanceFilter) =>
    ipcRenderer.invoke('pta:listAdvances', filter ?? {}) as Promise<Advance[]>,
  createAdvance: (input: AdvanceInput) => ipcRenderer.invoke('pta:createAdvance', input) as Promise<Advance>,
  listLiquidationItems: (advanceId: number) =>
    ipcRenderer.invoke('pta:listLiquidationItems', advanceId) as Promise<LiquidationItem[]>,
  addLiquidationItem: (input: LiquidationItemInput, file?: PtaFilePick | null) =>
    ipcRenderer.invoke('pta:addLiquidationItem', input, file ?? null) as Promise<LiquidationItem>,
  removeLiquidationItem: (id: number) => ipcRenderer.invoke('pta:removeLiquidationItem', id) as Promise<void>,
  closeAdvance: (advanceId: number) => ipcRenderer.invoke('pta:closeAdvance', advanceId) as Promise<Advance>,
  pickAttachmentFile: () => ipcRenderer.invoke('pta:pickAttachmentFile') as Promise<PtaFilePick | null>,
  openAttachment: (attachmentId: number) => ipcRenderer.invoke('pta:openAttachment', attachmentId) as Promise<void>,

  getPtaSettings: () => ipcRenderer.invoke('pta:getSettings') as Promise<PtaSettings>,
  updatePtaSettings: (patch: Partial<PtaSettings>) =>
    ipcRenderer.invoke('pta:updateSettings', patch) as Promise<PtaSettings>,
  listSchoolYears: () => ipcRenderer.invoke('pta:listSchoolYears') as Promise<string[]>,
  getSchoolInfo: () => ipcRenderer.invoke('pta:schoolInfo') as Promise<SchoolInfo>,

  getAppVersion: () => ipcRenderer.invoke('pta:getAppVersion') as Promise<string>,
  checkForUpdates: () => ipcRenderer.invoke('pta:checkForUpdates') as Promise<PtaUpdateStatus>,
  downloadUpdate: () => ipcRenderer.invoke('pta:downloadUpdate') as Promise<void>,
  installUpdate: () => ipcRenderer.invoke('pta:installUpdate') as Promise<void>,
  getGithubToken: () => ipcRenderer.invoke('pta:getGithubToken') as Promise<string | null>,
  setGithubToken: (token: string) => ipcRenderer.invoke('pta:setGithubToken', token) as Promise<void>,
  clearGithubToken: () => ipcRenderer.invoke('pta:clearGithubToken') as Promise<void>,
  onUpdateStatus: (cb: (status: PtaUpdateStatus) => void) => {
    const listener = (_e: unknown, status: PtaUpdateStatus) => cb(status);
    ipcRenderer.on('update:status', listener);
    return () => ipcRenderer.removeListener('update:status', listener);
  },

  checkLicense: () => ipcRenderer.invoke('pta:checkLicense') as Promise<PtaLicenseStatus>,
  activateLicense: (key: string) =>
    ipcRenderer.invoke('pta:activateLicense', key) as Promise<PtaLicenseResult>,
  getMachineId: () => ipcRenderer.invoke('pta:getMachineId') as Promise<string>,

  getDashboard: () => ipcRenderer.invoke('pta:dashboard') as Promise<PtaDashboard>,
  fundBalances: () => ipcRenderer.invoke('pta:fundBalances') as Promise<FundBalanceRow[]>,
  familyBalances: (search?: string) =>
    ipcRenderer.invoke('pta:familyBalances', search) as Promise<FamilyBalanceRow[]>,
  sectionCollections: (schoolYear: string) =>
    ipcRenderer.invoke('pta:sectionCollections', schoolYear) as Promise<SectionCollectionRow[]>,
  sectionFamilies: (schoolYear: string, gradeSection: string) =>
    ipcRenderer.invoke('pta:sectionFamilies', schoolYear, gradeSection) as Promise<SectionFamilyRow[]>,
  collectionsReport: (from?: string, to?: string) =>
    ipcRenderer.invoke('pta:collectionsReport', from, to) as Promise<CollectionsSummaryRow[]>,
  statementOfAccount: (familyId: number, schoolYear: string) =>
    ipcRenderer.invoke('pta:statement', familyId, schoolYear) as Promise<StatementOfAccount>,
};

// Window controls for the custom title bar (frameless window).
const winControls: PtaWindowControls = {
  minimize: () => ipcRenderer.invoke('win:minimize') as Promise<void>,
  toggleMaximize: () => ipcRenderer.invoke('win:toggleMaximize') as Promise<void>,
  close: () => ipcRenderer.invoke('win:close') as Promise<void>,
  isMaximized: () => ipcRenderer.invoke('win:isMaximized') as Promise<boolean>,
  onMaximizedChange: (cb: (maximized: boolean) => void) => {
    const listener = (_e: unknown, v: boolean) => cb(v);
    ipcRenderer.on('win:maximized', listener);
    return () => ipcRenderer.removeListener('win:maximized', listener);
  },
};

contextBridge.exposeInMainWorld('ptaApi', api);
contextBridge.exposeInMainWorld('winControls', winControls);

export type PtaBridge = typeof api;
