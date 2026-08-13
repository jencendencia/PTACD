// PTA CD shared domain types (renderer + main process).

// ---- Auth / roles -----------------------------------------------------------
export type PtaRole =
  | 'admin'
  | 'president'
  | 'vice_president'
  | 'treasurer'
  | 'secretary'
  | 'auditor';

export const PTA_ROLE_LABELS: Record<PtaRole, string> = {
  admin: 'Admin',
  president: 'President',
  vice_president: 'Vice President',
  treasurer: 'Treasurer',
  secretary: 'Secretary',
  auditor: 'Auditor',
};

export interface PtaUser {
  id: number;
  username: string;
  full_name: string;
  role: PtaRole;
  created_at: string;
}

export interface PtaUserInput {
  username: string;
  full_name: string;
  role: PtaRole;
  password?: string;
}

export interface PtaLoginResult {
  ok: boolean;
  error?: string;
  user?: PtaUser;
}

// ---- Families (mirror of the TapIn guardian model) --------------------------
export interface Family {
  id: number;
  guardian_name: string;
  guardian_address: string;
  parent_phone: string;
  student_count: number;
  is_active: boolean;
  created_at: string;
  /** Outstanding balance (charges − paid) for the current school year. */
  balance: number;
}

export interface FamilyChild {
  student_id: number;
  student_no: string;
  full_name: string;
  grade_section: string;
  is_active: boolean;
}

export interface FamilyDetail extends Family {
  children: FamilyChild[];
  total_charges: number;
  total_paid: number;
  balance: number;
}

// ---- Fee components (collectibles) -------------------------------------------
export interface FeeComponent {
  id: number;
  code: string;
  label: string;
  amount: number;
  /** per_family = billed once per family (e.g. membership); per_child = per student. */
  applies: 'per_family' | 'per_child';
  /** Optional term label ('' | '1st' | '2nd' | …). A term component bills once per term. */
  term: string;
  is_active: boolean;
  sort_order: number;
}

export interface FeeComponentInput {
  code: string;
  label: string;
  amount: number;
  applies: 'per_family' | 'per_child';
  term?: string;
  is_active?: boolean;
  sort_order?: number;
}

// ---- Funds + distribution rules ---------------------------------------------
export interface Fund {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
}

export interface FundInput {
  name: string;
  description?: string;
  is_active?: boolean;
}

export interface DistributionRule {
  id: number;
  component_id: number;
  component_code: string;
  fund_id: number;
  fund_name: string;
  percentage: number;
}

export interface DistributionRuleInput {
  component_id: number;
  fund_id: number;
  percentage: number;
}

// ---- Charges (billed items) ---------------------------------------------------
export type ChargeStatus = 'UNPAID' | 'PARTIAL' | 'PAID';

export interface Charge {
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
  status: ChargeStatus;
}

// ---- Collections ---------------------------------------------------------------
export interface Collection {
  id: number;
  or_no: string;
  family_id: number;
  guardian_name: string;
  school_year: string;
  amount: number;
  collected_at: string;
  collector: string;
  notes: string;
  created_at: string;
}

export interface ChargePayment {
  charge_id: number;
  charge_label: string;
  student_name: string;
  amount: number;
}

export interface FundAllocation {
  fund_id: number;
  fund_name: string;
  amount: number;
}

export interface CollectionDetail extends Collection {
  breakdown: ChargePayment[];
  allocations: FundAllocation[];
}

export interface CollectionInput {
  family_id: number;
  amount: number;
  /** Optional: target a specific child (student) — their charges are settled first. */
  student_id?: number;
  collected_at?: string;
  notes?: string;
}

export interface CollectionFilter {
  from?: string;
  to?: string;
  school_year?: string;
  family_id?: number;
  limit?: number;
  offset?: number;
}

// ---- Disbursements -------------------------------------------------------------
export type DisbursementStatus = 'DRAFT' | 'APPROVED' | 'PAID';

export interface Disbursement {
  id: number;
  dv_no: string;
  fund_id: number;
  fund_name: string;
  payee: string;
  /** Person who received the payment (signs the "Received by" line). */
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
}

export interface DisbursementInput {
  fund_id: number;
  payee: string;
  purpose: string;
  amount: number;
  date?: string;
  notes?: string;
}

export interface DisbursementFilter {
  status?: DisbursementStatus | '';
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

// ---- Advances & liquidation -----------------------------------------------------
export type AdvanceStatus = 'ISSUED' | 'PARTIALLY_LIQUIDATED' | 'LIQUIDATED' | 'RETURNED';

export interface Advance {
  id: number;
  fund_id: number;
  fund_name: string;
  recipient: string;
  purpose: string;
  amount: number;
  date_issued: string;
  status: AdvanceStatus;
  liquidated_amount: number;
  returned_amount: number;
  additional_release: number;
  created_by: string;
  created_at: string;
}

export interface AdvanceInput {
  fund_id: number;
  recipient: string;
  purpose: string;
  amount: number;
  date_issued?: string;
}

export interface AdvanceFilter {
  from?: string;
  to?: string;
}

export interface LiquidationItem {
  id: number;
  advance_id: number;
  date: string;
  description: string;
  amount: number;
  attachment_id: number | null;
  attachment_name: string | null;
}

export interface LiquidationItemInput {
  advance_id: number;
  date: string;
  description: string;
  amount: number;
}

export interface Attachment {
  id: number;
  entity: string;
  entity_id: number;
  file_name: string;
  mime: string;
  size: number;
  created_at: string;
}

// ---- Settings ---------------------------------------------------------------------
export interface PtaSettings {
  school_year: string;
  or_prefix: string;
  dv_prefix: string;
  /** Custom letterhead text for printed statements/receipts; empty = default
   *  school logo + name from the shared TapIn School settings. */
  print_header: string;
}

// ---- Reports -----------------------------------------------------------------------
export interface FundBalanceRow {
  fund_id: number;
  fund_name: string;
  collected: number;
  disbursed: number;
  advances_out: number;
  balance: number;
}

export interface FamilyBalanceRow {
  family_id: number;
  guardian_name: string;
  student_count: number;
  total_charges: number;
  total_paid: number;
  balance: number;
}

export interface SectionCollectionRow {
  grade_section: string;
  students: number;
  total_charges: number;
  total_paid: number;
  balance: number;
}

/** One family (guardian) within a single grade_section drill-down. */
export interface SectionFamilyRow {
  family_id: number;
  guardian_name: string;
  /** Children of this family in the section. */
  student_count: number;
  total_charges: number;
  total_paid: number;
  balance: number;
}

export interface CollectionsSummaryRow {
  label: string;
  amount: number;
}

export interface StatementLine {
  id: number;
  date: string;
  ref: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface StatementOfAccount {
  family: Family;
  school_year: string;
  lines: StatementLine[];
  total_charges: number;
  total_paid: number;
  balance: number;
}

// ---- Dashboard ----------------------------------------------------------------------
export interface PtaDashboard {
  funds: FundBalanceRow[];
  todayCollections: number;
  todayCollectionsCount: number;
  pendingApprovals: number;
  topBalances: FamilyBalanceRow[];
}

// ---- Database connection status --------------------------------------------------------
export interface PtaDbStatus {
  online: boolean;
  /** Human-readable status line, e.g. "MySQL 192.168.1.129:3306 connected". */
  detail: string;
  host: string;
  port: number;
  database: string;
  /** Database account currently in use (never the password). */
  user: string;
}

/** Connection settings the user can edit from the title bar to reconnect. */
export interface PtaDbConfig {
  host: string;
  port: number;
  user: string;
  password?: string;
  database: string;
}

// ---- App updates (electron-updater + GitHub Releases) ------------------------------
export type PtaUpdateStatus =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'not-available'; version: string }
  | { status: 'available'; version: string; releaseDate?: string }
  | { status: 'downloading'; percent: number; bytesPerSecond: number; transferred: number; total: number }
  | { status: 'downloaded'; version: string }
  | { status: 'error'; message: string }
  /** Dev / unpackaged app where the updater cannot run. */
  | { status: 'unavailable'; message: string };

// ---- License / activation (per-machine, Cloudflare Worker license server) ----------
export interface PtaLicenseStatus {
  activated: boolean;
  licenseKey?: string;
  machineId?: string;
  activatedAt?: string;
}

export interface PtaLicenseResult {
  ok: boolean;
  error?: string;
  licenseKey?: string;
  machineId?: string;
  activatedAt?: string;
}

// ---- Window controls (custom title bar) ------------------------------------------------
export interface PtaWindowControls {
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
  isMaximized(): Promise<boolean>;
  /** Subscribe to maximize-state changes; returns an unsubscribe function. */
  onMaximizedChange(cb: (maximized: boolean) => void): () => void;
}

// ---- IPC surface ----------------------------------------------------------------------
export interface PtaApi {
  // db status
  getDbStatus(): Promise<PtaDbStatus>;
  /** Subscribe to database status changes; returns an unsubscribe function. */
  onDbStatusChange(cb: (status: PtaDbStatus) => void): () => void;
  /** Reconnect to a different MySQL server (host/port/user/password/database). */
  connectDb(config: PtaDbConfig): Promise<PtaDbStatus>;
  // auth
  ptaLogin(username: string, password: string): Promise<PtaLoginResult>;
  /** Current session in the main process (restores login after a reload). */
  me(): Promise<PtaUser | null>;
  listPtaUsers(): Promise<PtaUser[]>;
  createPtaUser(input: PtaUserInput): Promise<PtaUser>;
  updatePtaUser(id: number, patch: Partial<PtaUserInput>): Promise<PtaUser>;
  deletePtaUser(id: number): Promise<void>;
  // families
  syncFamilies(): Promise<number>;
  listFamilies(search?: string): Promise<Family[]>;
  getFamilyDetail(familyId: number): Promise<FamilyDetail>;
  // components
  listFeeComponents(): Promise<FeeComponent[]>;
  saveFeeComponent(input: FeeComponentInput): Promise<FeeComponent>;
  deleteFeeComponent(id: number): Promise<void>;
  recomputeCharges(): Promise<number>;
  // funds & rules
  listFunds(): Promise<Fund[]>;
  saveFund(input: FundInput): Promise<Fund>;
  deleteFund(id: number): Promise<void>;
  listDistributionRules(): Promise<DistributionRule[]>;
  saveDistributionRule(input: DistributionRuleInput): Promise<DistributionRule>;
  deleteDistributionRule(id: number): Promise<void>;
  // charges & collections
  listCharges(schoolYear: string, familyId?: number): Promise<Charge[]>;
  listCollections(filter?: CollectionFilter): Promise<{ rows: Collection[]; total: number }>;
  collectionDetail(id: number): Promise<CollectionDetail>;
  createCollection(input: CollectionInput): Promise<CollectionDetail>;
  voidCollection(id: number): Promise<void>;
  // disbursements
  listDisbursements(filter?: DisbursementFilter): Promise<{ rows: Disbursement[]; total: number }>;
  createDisbursement(input: DisbursementInput): Promise<Disbursement>;
  approveDisbursement(id: number): Promise<Disbursement>;
  payDisbursement(id: number, referenceNo: string, receivedBy: string): Promise<Disbursement>;
  deleteDisbursement(id: number): Promise<void>;
  listDisbursementAttachments(disbursementId: number): Promise<Attachment[]>;
  addDisbursementAttachment(disbursementId: number, file: PtaFilePick): Promise<Attachment>;
  removeDisbursementAttachment(attachmentId: number): Promise<void>;
  // advances & liquidation
  listAdvances(filter?: { from?: string; to?: string }): Promise<Advance[]>;
  createAdvance(input: AdvanceInput): Promise<Advance>;
  listLiquidationItems(advanceId: number): Promise<LiquidationItem[]>;
  addLiquidationItem(input: LiquidationItemInput, file?: PtaFilePick | null): Promise<LiquidationItem>;
  removeLiquidationItem(id: number): Promise<void>;
  closeAdvance(advanceId: number): Promise<Advance>;
  pickAttachmentFile(): Promise<PtaFilePick | null>;
  openAttachment(attachmentId: number): Promise<void>;
  // settings
  getPtaSettings(): Promise<PtaSettings>;
  updatePtaSettings(patch: Partial<PtaSettings>): Promise<PtaSettings>;
  listSchoolYears(): Promise<string[]>;
  /** School name + logo from the shared TapIn School settings table (public). */
  getSchoolInfo(): Promise<SchoolInfo>;
  // app updates
  getAppVersion(): Promise<string>;
  /** Starts a check; returns the immediate state ('checking' or 'unavailable'). */
  checkForUpdates(): Promise<PtaUpdateStatus>;
  downloadUpdate(): Promise<void>;
  installUpdate(): Promise<void>;
  getGithubToken(): Promise<string | null>;
  setGithubToken(token: string): Promise<void>;
  clearGithubToken(): Promise<void>;
  /** Subscribe to updater status changes; returns an unsubscribe function. */
  onUpdateStatus(cb: (status: PtaUpdateStatus) => void): () => void;
  // license / activation
  checkLicense(): Promise<PtaLicenseStatus>;
  activateLicense(key: string): Promise<PtaLicenseResult>;
  /** Stable per-machine identifier (used by the license server). */
  getMachineId(): Promise<string>;
  // reports
  getDashboard(): Promise<PtaDashboard>;
  fundBalances(): Promise<FundBalanceRow[]>;
  familyBalances(search?: string): Promise<FamilyBalanceRow[]>;
  sectionCollections(schoolYear: string): Promise<SectionCollectionRow[]>;
  sectionFamilies(schoolYear: string, gradeSection: string): Promise<SectionFamilyRow[]>;
  collectionsReport(from?: string, to?: string): Promise<CollectionsSummaryRow[]>;
  statementOfAccount(familyId: number, schoolYear: string): Promise<StatementOfAccount>;
}

/** School branding from the shared TapIn School settings table.
 *  `logo_url` is a tapin-logo:// URL served by the main process. */
export interface SchoolInfo {
  school_name: string;
  logo_url: string;
}

/** A file picked for an attachment. In Electron this is a copied local file path;
 *  in browser mock mode only the name is kept. */
export interface PtaFilePick {
  name: string;
  path: string | null;
  mime: string;
  size: number;
}
