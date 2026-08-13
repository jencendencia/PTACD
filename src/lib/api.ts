// Renderer-side API client for PTA CD.
//  - Inside Electron: delegates to window.ptaApi (preload bridge → main process).
//  - In a plain browser (vite dev): uses a full in-memory mock so the entire
//    UI can be developed with no Electron/MySQL.
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
  FundAllocation,
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
  PtaRole,
  PtaSettings,
  PtaUpdateStatus,
  PtaUser,
  PtaUserInput,
  SchoolInfo,
  SectionCollectionRow,
  SectionFamilyRow,
  StatementOfAccount,
} from '../../shared/types';

export const isElectron = typeof window !== 'undefined' && !!(window as unknown as { ptaApi?: PtaApi }).ptaApi;

/** Human-readable error message. Strips Electron's raw IPC rejection wrapper
 *  ("Error invoking remote method 'pta:…': Error: …") so the UI shows the
 *  actual reason instead of the plumbing. */
export function errMsg(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  const match = raw.match(/Error invoking remote method '[^']*': (?:Error: )?(.*)$/s);
  const cleaned = (match ? match[1] : raw).replace(/^Error:\s*/, '');
  return cleaned.trim() || 'Something went wrong.';
}

const nowIso = () => new Date().toISOString();
const round2 = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number) => String(n).padStart(4, '0');

const DEMO_YEAR = '2026 - 2027';
const YEAR_START = '2026';

type MockStudent = {
  id: number;
  student_no: string;
  full_name: string;
  grade_section: string;
  guardian_name: string;
  guardian_address: string;
  parent_phone: string;
  is_active: boolean;
};

const DEMO_STUDENTS: MockStudent[] = [
  { id: 1, student_no: '2026-0101', full_name: 'Juan Dela Cruz', grade_section: 'Grade 7 - Section A', guardian_name: 'Maria Dela Cruz', guardian_address: '123 Mabini St., Manila', parent_phone: '09171234567', is_active: true },
  { id: 2, student_no: '2026-0102', full_name: 'Carlos Dela Cruz', grade_section: 'Grade 7 - Section A', guardian_name: 'Maria Dela Cruz', guardian_address: '123 Mabini St., Manila', parent_phone: '09171234567', is_active: true },
  { id: 3, student_no: '2026-0103', full_name: 'Ana Reyes', grade_section: 'Grade 8 - Section B', guardian_name: 'Antonio Reyes', guardian_address: '456 Rizal Ave., QC', parent_phone: '09182345678', is_active: true },
  { id: 4, student_no: '2026-0104', full_name: 'Bong Reyes', grade_section: 'Grade 8 - Section B', guardian_name: 'Antonio Reyes', guardian_address: '456 Rizal Ave., QC', parent_phone: '09182345678', is_active: true },
  { id: 5, student_no: '2026-0105', full_name: 'Liza Reyes', grade_section: 'Grade 10 - Section D', guardian_name: 'Antonio Reyes', guardian_address: '456 Rizal Ave., QC', parent_phone: '09182345678', is_active: true },
  { id: 6, student_no: '2026-0106', full_name: 'Miguel Torres', grade_section: 'Grade 9 - Section C', guardian_name: '', guardian_address: '', parent_phone: '09195678901', is_active: true },
];

class MockApi implements PtaApi {
  private users: { id: number; username: string; password: string; full_name: string; role: PtaRole; photo: string | null; created_at: string }[];
  private userSeq = 1;
  private currentUser: PtaUser | null = null;

  private students: MockStudent[] = DEMO_STUDENTS;
  private families: Family[] = [];
  private components: FeeComponent[];
  private funds: Fund[];
  private rules: DistributionRule[];
  private charges: Charge[] = [];
  private collections: Collection[] = [];
  private chargePayments: { id: number; collection_id: number; charge_id: number; amount: number }[] = [];
  private fundAllocations: { id: number; collection_id: number; fund_id: number; amount: number }[] = [];
  private disbursements: Disbursement[] = [];
  private advances: Advance[] = [];
  private liquidationItems: (LiquidationItem & { attachment_file?: string })[] = [];
  private settings: PtaSettings = { school_year: DEMO_YEAR, or_prefix: 'OR-', dv_prefix: 'DV-', print_header: '' };
  private seq = { collection: 1, charge: 1, rule: 1, disb: 1, advance: 1, item: 1, cp: 1, fa: 1, att: 1 };
  private attachments: Attachment[] = [];
  private familySeq = 0;

  constructor() {
    this.users = [
      { id: this.userSeq++, username: 'admin', password: 'admin', full_name: 'PTA Administrator', role: 'admin', photo: null, created_at: nowIso() },
      { id: this.userSeq++, username: 'president', password: 'president', full_name: 'Mrs. Alma Santos', role: 'president', photo: null, created_at: nowIso() },
      { id: this.userSeq++, username: 'treasurer', password: 'treasurer', full_name: 'Mr. Ben Cruz', role: 'treasurer', photo: null, created_at: nowIso() },
      { id: this.userSeq++, username: 'secretary', password: 'secretary', full_name: 'Ms. Carol Lim', role: 'secretary', photo: null, created_at: nowIso() },
    ];
    this.components = [
      { id: 1, code: 'MEMBERSHIP', label: 'Membership Fee', amount: 200, applies: 'per_family', term: '', is_active: true, sort_order: 1 },
      { id: 2, code: 'MISC', label: 'Miscellaneous', amount: 200, applies: 'per_child', term: '', is_active: true, sort_order: 2 },
      { id: 3, code: 'OTHER', label: 'Other Collectibles', amount: 250, applies: 'per_child', term: '', is_active: true, sort_order: 3 },
    ];
    this.funds = [{ id: 1, name: 'General Fund', description: 'PTA general operating fund', is_active: true, created_at: nowIso() }];
    this.rules = [
      { id: 1, component_id: 1, component_code: 'MEMBERSHIP', fund_id: 1, fund_name: 'General Fund', percentage: 100 },
      { id: 2, component_id: 2, component_code: 'MISC', fund_id: 1, fund_name: 'General Fund', percentage: 100 },
      { id: 3, component_id: 3, component_code: 'OTHER', fund_id: 1, fund_name: 'General Fund', percentage: 100 },
    ];
    this.syncFamilies();
    this.recomputeCharges();
    // Demo history: Maria pays 650 (settles her membership + one child), etc.
    this.seedDemoCollections();
    this.seedDemoDisbursements();
    this.seedDemoAdvance();
  }

  // ---- helpers -------------------------------------------------------------
  private familyKeyOf(guardianName: string, guardianAddress: string, studentNo: string): string {
    const name = String(guardianName ?? '').trim();
    return name ? `${name}|${String(guardianAddress ?? '').trim()}` : `SELF|${String(studentNo ?? '').trim()}`;
  }

  private toPtaUser(u: { id: number; username: string; full_name: string; role: PtaRole; photo: string | null; created_at: string }): PtaUser {
    return { id: u.id, username: u.username, full_name: u.full_name, role: u.role, photo: u.photo ?? null, created_at: u.created_at };
  }

  private requireUser(): PtaUser {
    if (!this.currentUser) throw new Error('Not signed in.');
    return this.currentUser;
  }

  private requireRoles(...roles: PtaRole[]): PtaUser {
    const u = this.requireUser();
    if (u.role !== 'admin' && !roles.includes(u.role)) throw new Error(`This action requires the ${roles.join(' or ')} role.`);
    return u;
  }

  private actorName(): string {
    const u = this.requireUser();
    return u.full_name || u.username;
  }

  // ---- db status ---------------------------------------------------------------
  private dbConfig: PtaDbConfig = { host: '127.0.0.1', port: 3306, user: 'root', database: 'tapin_school' };

  async getDbStatus(): Promise<PtaDbStatus> {
    const { host, port, user, database } = this.dbConfig;
    return {
      online: true,
      detail: `MySQL ${host}:${port} connected (demo mock)`,
      host,
      port,
      database,
      user,
    };
  }
  onDbStatusChange(_cb: (status: PtaDbStatus) => void): () => void {
    return () => undefined;
  }
  async connectDb(config: PtaDbConfig): Promise<PtaDbStatus> {
    this.dbConfig = {
      host: String(config.host ?? '').trim() || '127.0.0.1',
      port: Number(config.port) || 3306,
      user: String(config.user ?? '').trim() || 'root',
      database: String(config.database ?? '').trim() || 'tapin_school',
    };
    return this.getDbStatus();
  }

  // ---- auth ------------------------------------------------------------------
  async ptaLogin(username: string, password: string): Promise<PtaLoginResult> {
    await delay(350);
    const u = this.users.find((x) => x.username === String(username ?? '').trim() && x.password === String(password ?? ''));
    if (!u) return { ok: false, error: 'Invalid username or password.' };
    this.currentUser = this.toPtaUser(u);
    return { ok: true, user: this.toPtaUser(u) };
  }
  async me(): Promise<PtaUser | null> {
    return this.currentUser ? { ...this.currentUser } : null;
  }
  async listPtaUsers(): Promise<PtaUser[]> {
    this.requireRoles('admin');
    return this.users.map((u) => this.toPtaUser(u));
  }
  async createPtaUser(input: PtaUserInput): Promise<PtaUser> {
    this.requireRoles('admin');
    const username = String(input.username ?? '').trim();
    if (!username || !input.full_name) throw new Error('Username and full name are required.');
    if (this.users.some((u) => u.username === username)) throw new Error('Username already taken.');
    if (String(input.password ?? '').length < 4) throw new Error('Password must be at least 4 characters.');
    const u = { id: this.userSeq++, username, password: String(input.password), full_name: input.full_name, role: input.role, photo: null, created_at: nowIso() };
    this.users.push(u);
    return this.toPtaUser(u);
  }
  async updatePtaUser(id: number, patch: Partial<PtaUserInput>): Promise<PtaUser> {
    this.requireRoles('admin');
    const u = this.users.find((x) => x.id === id);
    if (!u) throw new Error('User not found.');
    if ('username' in patch && patch.username) u.username = String(patch.username).trim();
    if ('full_name' in patch && patch.full_name !== undefined) u.full_name = patch.full_name;
    if ('role' in patch && patch.role) u.role = patch.role;
    if (patch.password) u.password = patch.password;
    if ('photo' in patch) u.photo = patch.photo ?? null;
    return this.toPtaUser(u);
  }
  async pickUserPhoto(): Promise<PtaFilePick | null> {
    return null;
  }
  async setUserPhoto(userId: number, file: PtaFilePick): Promise<PtaUser> {
    this.requireUser();
    const u = this.users.find((x) => x.id === userId);
    if (!u) throw new Error('User not found.');
    if (!file.dataUrl) throw new Error('No photo file to upload.');
    u.photo = file.dataUrl;
    return this.toPtaUser(u);
  }
  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    const u = this.requireUser();
    const rec = this.users.find((x) => x.id === u.id);
    if (!rec || rec.password !== String(oldPassword ?? '')) throw new Error('Current password is incorrect.');
    if (String(newPassword ?? '').length < 4) throw new Error('New password must be at least 4 characters.');
    rec.password = String(newPassword);
  }
  async changeUserPassword(userId: number, oldPassword: string, newPassword: string): Promise<PtaUser> {
    this.requireRoles('admin');
    const u = this.users.find((x) => x.id === userId);
    if (!u) throw new Error('User not found.');
    if (u.password !== String(oldPassword ?? '')) throw new Error('Current password is incorrect.');
    if (String(newPassword ?? '').length < 4) throw new Error('New password must be at least 4 characters.');
    u.password = String(newPassword);
    return this.toPtaUser(u);
  }
  async deletePtaUser(id: number): Promise<void> {
    this.requireRoles('admin');
    const u = this.users.find((x) => x.id === id);
    if (!u) throw new Error('User not found.');
    if (u.role === 'admin' && this.users.filter((x) => x.role === 'admin').length <= 1) {
      throw new Error('Cannot delete the last admin account.');
    }
    this.users = this.users.filter((x) => x.id !== id);
  }

  // ---- families ---------------------------------------------------------------
  async syncFamilies(): Promise<number> {
    const groups = new Map<string, MockStudent[]>();
    for (const s of this.students) {
      const key = this.familyKeyOf(s.guardian_name, s.guardian_address, s.student_no);
      const arr = groups.get(key) ?? [];
      arr.push(s);
      groups.set(key, arr);
    }
    const next: Family[] = [];
    for (const [, members] of groups) {
      const active = members.filter((m) => m.is_active);
      const existing = this.families.find((f) => f.guardian_name === members[0].guardian_name && f.guardian_address === members[0].guardian_address);
      next.push({
        id: existing?.id ?? ++this.familySeq,
        guardian_name: members[0].guardian_name || members[0].full_name,
        guardian_address: members[0].guardian_address ?? '',
        parent_phone: members.find((m) => m.parent_phone)?.parent_phone ?? '',
        student_count: active.length,
        is_active: active.length > 0,
        created_at: existing?.created_at ?? nowIso(),
        balance: 0,
      });
    }
    this.families = next;
    return this.families.length;
  }

  private childrenOf(f: Family): MockStudent[] {
    return this.students.filter(
      (s) => (s.guardian_name === f.guardian_name && s.guardian_address === f.guardian_address) || (!f.guardian_address && s.guardian_name === '' && s.full_name === f.guardian_name),
    );
  }

  async listFamilies(search?: string): Promise<Family[]> {
    this.requireUser();
    let list = [...this.families];
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (f) => f.guardian_name.toLowerCase().includes(q) || f.guardian_address.toLowerCase().includes(q) || this.childrenOf(f).some((c) => c.full_name.toLowerCase().includes(q)),
      );
    }
    return list
      .map((f) => ({
        ...f,
        balance: round2(this.charges.filter((c) => c.family_id === f.id).reduce((s, c) => s + (c.amount - c.paid_amount), 0)),
      }))
      .sort((a, b) => a.guardian_name.localeCompare(b.guardian_name));
  }

  async getFamilyDetail(familyId: number): Promise<FamilyDetail> {
    this.requireUser();
    const f = this.families.find((x) => x.id === familyId);
    if (!f) throw new Error('Family not found.');
    const children = this.childrenOf(f).map((s) => ({
      student_id: s.id,
      student_no: s.student_no,
      full_name: s.full_name,
      grade_section: s.grade_section,
      is_active: s.is_active,
    }));
    const mine = this.charges.filter((c) => c.family_id === familyId);
    const totalCharges = round2(mine.reduce((s, c) => s + c.amount, 0));
    const totalPaid = round2(mine.reduce((s, c) => s + c.paid_amount, 0));
    return { ...f, children, total_charges: totalCharges, total_paid: totalPaid, balance: round2(totalCharges - totalPaid) };
  }

  // ---- fee components -----------------------------------------------------------
  async listFeeComponents(): Promise<FeeComponent[]> {
    this.requireUser();
    return [...this.components].sort((a, b) => a.sort_order - b.sort_order);
  }
  async saveFeeComponent(input: FeeComponentInput): Promise<FeeComponent> {
    this.requireUser();
    const code = String(input.code ?? '').trim().toUpperCase();
    const term = String(input.term ?? '').trim();
    if (!code || !input.label) throw new Error('Code and label are required.');
    const existing = this.components.find((c) => c.code === code && c.term === term);
    const comp: FeeComponent = {
      id: existing?.id ?? this.components.length + 1,
      code,
      label: input.label,
      amount: Number(input.amount),
      applies: input.applies,
      term,
      is_active: input.is_active ?? true,
      sort_order: input.sort_order ?? 0,
    };
    if (existing) this.components = this.components.map((c) => (c.id === existing.id ? comp : c));
    else this.components.push(comp);
    return comp;
  }
  async deleteFeeComponent(id: number): Promise<void> {
    this.requireUser();
    this.components = this.components.filter((c) => c.id !== id);
    this.charges = this.charges.filter((c) => c.component_id !== id);
  }
  async recomputeCharges(): Promise<number> {
    const activeComps = this.components.filter((c) => c.is_active);
    const next: Charge[] = [];
    for (const f of this.families) {
      const kids = this.childrenOf(f).filter((s) => s.is_active);
      if (!kids.length) continue;
      const firstId = kids.reduce((a, b) => (a < b.id ? a : b.id), kids[0].id);
      for (const comp of activeComps) {
        if (Number(comp.amount) <= 0) continue;
        const toBill = comp.applies === 'per_family' ? kids.filter((k) => k.id === firstId) : kids;
        for (const k of toBill) {
          const existing = this.charges.find(
            (c) => c.student_id === k.id && c.component_id === comp.id && c.term === comp.term,
          );
          next.push({
            id: existing?.id ?? this.seq.charge++,
            family_id: f.id,
            student_id: k.id,
            student_name: k.full_name,
            grade_section: k.grade_section,
            school_year: this.settings.school_year,
            component_id: comp.id,
            component_code: comp.code,
            component_label: comp.label,
            term: comp.term,
            amount: Number(comp.amount),
            paid_amount: existing?.paid_amount ?? 0,
            status: 'UNPAID',
          });
        }
      }
    }
    // Preserve paid state for retained charges.
    const paidMap = new Map(this.charges.filter((c) => c.paid_amount > 0).map((c) => [`${c.student_id}|${c.component_id}|${c.term}`, c.paid_amount]));
    for (const c of next) {
      const paid = paidMap.get(`${c.student_id}|${c.component_id}|${c.term}`) ?? 0;
      c.paid_amount = paid;
      c.status = paid >= c.amount ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID';
    }
    this.charges = next;
    return this.charges.length;
  }

  // ---- funds & rules --------------------------------------------------------------
  async listFunds(): Promise<Fund[]> {
    this.requireUser();
    return [...this.funds];
  }
  async saveFund(input: FundInput): Promise<Fund> {
    this.requireUser();
    if (!input.name.trim()) throw new Error('Fund name is required.');
    const existing = this.funds.find((f) => f.name === input.name);
    const fund: Fund = { id: existing?.id ?? this.funds.length + 1, name: input.name, description: input.description ?? '', is_active: input.is_active ?? true, created_at: existing?.created_at ?? nowIso() };
    if (existing) this.funds = this.funds.map((f) => (f.id === existing.id ? fund : f));
    else this.funds.push(fund);
    return fund;
  }
  async deleteFund(id: number): Promise<void> {
    this.requireUser();
    this.funds = this.funds.filter((f) => f.id !== id);
    this.rules = this.rules.filter((r) => r.fund_id !== id);
  }
  async listDistributionRules(): Promise<DistributionRule[]> {
    this.requireUser();
    return [...this.rules];
  }
  async saveDistributionRule(input: DistributionRuleInput): Promise<DistributionRule> {
    this.requireUser();
    const comp = this.components.find((c) => c.id === input.component_id);
    const fund = this.funds.find((f) => f.id === input.fund_id);
    if (!comp || !fund) throw new Error('Component or fund not found.');
    const existing = this.rules.find((r) => r.component_id === input.component_id && r.fund_id === input.fund_id);
    const rule: DistributionRule = { id: existing?.id ?? this.seq.rule++, component_id: comp.id, component_code: comp.code, fund_id: fund.id, fund_name: fund.name, percentage: Number(input.percentage) };
    if (existing) this.rules = this.rules.map((r) => (r.id === existing.id ? rule : r));
    else this.rules.push(rule);
    return rule;
  }
  async deleteDistributionRule(id: number): Promise<void> {
    this.requireUser();
    this.rules = this.rules.filter((r) => r.id !== id);
  }

  // ---- charges & collections ----------------------------------------------------------
  async listCharges(schoolYear: string, familyId?: number): Promise<Charge[]> {
    this.requireUser();
    return this.charges
      .filter((c) => c.school_year === schoolYear && (!familyId || c.family_id === familyId))
      .sort((a, b) => a.student_name.localeCompare(b.student_name));
  }

  async listCollections(filter: CollectionFilter = {}): Promise<{ rows: Collection[]; total: number }> {
    this.requireUser();
    let rows = [...this.collections];
    if (filter.school_year) rows = rows.filter((c) => c.school_year === filter.school_year);
    if (filter.family_id) rows = rows.filter((c) => c.family_id === filter.family_id);
    if (filter.from) rows = rows.filter((c) => c.collected_at.slice(0, 10) >= filter.from!);
    if (filter.to) rows = rows.filter((c) => c.collected_at.slice(0, 10) <= filter.to!);
    rows.sort((a, b) => b.id - a.id);
    const total = rows.length;
    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? 50;
    return { rows: rows.slice(offset, offset + limit), total };
  }

  private familyName(familyId: number): string {
    return this.families.find((f) => f.id === familyId)?.guardian_name ?? 'Unknown';
  }

  async createCollection(input: CollectionInput, actorOverride?: string): Promise<CollectionDetail> {
    const actor = actorOverride ?? this.actorName();
    const amount = round2(Number(input.amount));
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Amount must be greater than 0.');
    const unpaid = this.charges.filter((c) => c.family_id === input.family_id && c.paid_amount < c.amount);
    const totalUnpaid = round2(unpaid.reduce((s, c) => s + c.amount - c.paid_amount, 0));
    if (totalUnpaid <= 0) throw new Error('This family has no outstanding charges.');
    if (amount > totalUnpaid + 0.001) throw new Error(`Payment exceeds the family's balance (${totalUnpaid.toFixed(2)}).`);
    // When a specific child is targeted, settle their charges first (FIFO), then spill over.
    if (input.student_id && !unpaid.some((c) => c.student_id === input.student_id)) {
      throw new Error('Selected child has no outstanding charges for the school year.');
    }
    const orderedUnpaid = input.student_id
      ? [...unpaid.filter((c) => c.student_id === input.student_id), ...unpaid.filter((c) => c.student_id !== input.student_id)]
      : unpaid;

    const orNo = this.nextNo(this.settings.or_prefix);
    const collectedAt = input.collected_at ? `${String(input.collected_at).slice(0, 10)}T12:00:00` : nowIso();
    const collection: Collection = {
      id: this.seq.collection++,
      or_no: orNo,
      family_id: input.family_id,
      guardian_name: this.familyName(input.family_id),
      school_year: this.settings.school_year,
      amount,
      collected_at: collectedAt,
      collector: actor,
      notes: input.notes ?? '',
      created_at: nowIso(),
    };
    this.collections.push(collection);

    // FIFO application + fund distribution.
    let remaining = amount;
    const breakdown = [];
    for (const c of orderedUnpaid) {
      if (remaining <= 0.001) break;
      const take = round2(Math.min(c.amount - c.paid_amount, remaining));
      c.paid_amount = round2(c.paid_amount + take);
      c.status = c.paid_amount >= c.amount ? 'PAID' : 'PARTIAL';
      this.chargePayments.push({ id: this.seq.cp++, collection_id: collection.id, charge_id: c.id, amount: take });
      breakdown.push({ charge_id: c.id, charge_label: `${c.component_label}${c.term ? ` · ${c.term}` : ''}`, student_name: c.student_name, amount: take });
      const compRules = this.rules.filter((r) => r.component_id === c.component_id);
      if (compRules.length) {
        let allocated = 0;
        compRules.forEach((rule, i) => {
          const share = i === compRules.length - 1 ? round2(take - allocated) : round2((take * rule.percentage) / 100);
          if (share > 0) this.fundAllocations.push({ id: this.seq.fa++, collection_id: collection.id, fund_id: rule.fund_id, amount: share });
          allocated = round2(allocated + share);
        });
      }
      remaining = round2(remaining - take);
    }
    return { ...collection, breakdown, allocations: this.allocationsOf(collection.id) };
  }

  /** Fund distribution summarized per fund (one row per fund), matching the SQL's GROUP BY. */
  private allocationsOf(collectionId: number): FundAllocation[] {
    const totals = new Map<number, number>();
    for (const a of this.fundAllocations.filter((x) => x.collection_id === collectionId)) {
      totals.set(a.fund_id, round2((totals.get(a.fund_id) ?? 0) + a.amount));
    }
    return [...totals.entries()]
      .map(([fund_id, amount]) => ({ fund_id, fund_name: this.funds.find((f) => f.id === fund_id)?.name ?? '?', amount }))
      .sort((a, b) => a.fund_name.localeCompare(b.fund_name));
  }

  async collectionDetail(id: number): Promise<CollectionDetail> {
    this.requireUser();
    const col = this.collections.find((c) => c.id === id);
    if (!col) throw new Error('Collection not found.');
    const breakdown = this.chargePayments
      .filter((p) => p.collection_id === id)
      .map((p) => {
        const c = this.charges.find((x) => x.id === p.charge_id);
        return {
          charge_id: p.charge_id,
          charge_label: c ? `${c.component_label}${c.term ? ` · ${c.term}` : ''}` : 'Charge',
          student_name: c?.student_name ?? '',
          amount: p.amount,
        };
      });
    return { ...col, breakdown, allocations: this.allocationsOf(id) };
  }

  private nextNo(prefix: string): string {
    const n = this.collections.filter((c) => c.or_no.startsWith(`${prefix}${YEAR_START}-`)).length + 1;
    return `${prefix}${YEAR_START}-${pad(n)}`;
  }

  async voidCollection(id: number): Promise<void> {
    this.requireUser();
    const col = this.collections.find((c) => c.id === id);
    if (!col) throw new Error('Collection not found.');
    for (const p of this.chargePayments.filter((p) => p.collection_id === id)) {
      const c = this.charges.find((x) => x.id === p.charge_id);
      if (c) {
        c.paid_amount = round2(Math.max(0, c.paid_amount - p.amount));
        c.status = c.paid_amount >= c.amount ? 'PAID' : c.paid_amount > 0 ? 'PARTIAL' : 'UNPAID';
      }
    }
    this.chargePayments = this.chargePayments.filter((p) => p.collection_id !== id);
    this.fundAllocations = this.fundAllocations.filter((a) => a.collection_id !== id);
    this.collections = this.collections.filter((c) => c.id !== id);
  }

  // ---- disbursements -------------------------------------------------------------------
  async listDisbursements(filter: DisbursementFilter = {}): Promise<{ rows: Disbursement[]; total: number }> {
    this.requireUser();
    let rows = [...this.disbursements];
    if (filter.status) rows = rows.filter((d) => d.status === filter.status);
    if (filter.from) rows = rows.filter((d) => d.date >= filter.from!);
    if (filter.to) rows = rows.filter((d) => d.date <= filter.to!);
    rows.sort((a, b) => b.id - a.id);
    const total = rows.length;
    return { rows: rows.slice(filter.offset ?? 0, (filter.offset ?? 0) + (filter.limit ?? 50)), total };
  }
  async createDisbursement(input: DisbursementInput): Promise<Disbursement> {
    this.requireRoles('treasurer');
    const actor = this.actorName();
    const fund = this.funds.find((f) => f.id === input.fund_id);
    if (!fund) throw new Error('Fund not found.');
    const n = this.disbursements.filter((d) => d.dv_no.startsWith(`${this.settings.dv_prefix}${YEAR_START}-`)).length + 1;
    const d: Disbursement = {
      id: this.seq.disb++,
      dv_no: `${this.settings.dv_prefix}${YEAR_START}-${pad(n)}`,
      fund_id: input.fund_id,
      fund_name: fund.name,
      payee: input.payee,
      received_by: '',
      purpose: input.purpose,
      amount: round2(Number(input.amount)),
      date: input.date ?? nowIso().slice(0, 10),
      status: 'DRAFT',
      created_by: actor,
      approved_by: null,
      approved_at: null,
      paid_by: null,
      paid_at: null,
      reference_no: '',
      notes: input.notes ?? '',
      created_at: nowIso(),
    };
    this.disbursements.push(d);
    return d;
  }
  async approveDisbursement(id: number): Promise<Disbursement> {
    this.requireRoles('president');
    const d = this.disbursements.find((x) => x.id === id);
    if (!d) throw new Error('Disbursement not found.');
    if (d.status !== 'DRAFT') throw new Error('Only draft disbursements can be approved.');
    d.status = 'APPROVED';
    d.approved_by = this.actorName();
    d.approved_at = nowIso();
    return d;
  }
  async payDisbursement(id: number, referenceNo: string, receivedBy: string): Promise<Disbursement> {
    this.requireRoles('treasurer');
    const d = this.disbursements.find((x) => x.id === id);
    if (!d) throw new Error('Disbursement not found.');
    if (d.status !== 'APPROVED') throw new Error('Only approved disbursements can be paid.');
    d.status = 'PAID';
    d.paid_by = this.actorName();
    d.paid_at = nowIso();
    d.reference_no = referenceNo;
    d.received_by = receivedBy.trim();
    return d;
  }
  async deleteDisbursement(id: number): Promise<void> {
    this.requireUser();
    const d = this.disbursements.find((x) => x.id === id);
    if (!d) throw new Error('Disbursement not found.');
    if (d.status !== 'DRAFT') throw new Error('Only draft disbursements can be deleted.');
    this.disbursements = this.disbursements.filter((x) => x.id !== id);
  }
  async listDisbursementAttachments(disbursementId: number): Promise<Attachment[]> {
    this.requireUser();
    return this.attachments.filter((a) => a.entity === 'disbursement' && a.entity_id === disbursementId);
  }
  async addDisbursementAttachment(disbursementId: number, file: PtaFilePick): Promise<Attachment> {
    this.requireUser();
    const d = this.disbursements.find((x) => x.id === disbursementId);
    if (!d) throw new Error('Disbursement not found.');
    const att: Attachment = {
      id: this.seq.att++,
      entity: 'disbursement',
      entity_id: disbursementId,
      file_name: file.name,
      mime: file.mime || '',
      size: file.size || 0,
      created_at: nowIso(),
    };
    this.attachments.push(att);
    return att;
  }
  async removeDisbursementAttachment(attachmentId: number): Promise<void> {
    this.requireUser();
    const n = this.attachments.filter((a) => a.id === attachmentId).length;
    if (!n) throw new Error('Attachment not found.');
    this.attachments = this.attachments.filter((a) => a.id !== attachmentId);
  }

  // ---- advances ---------------------------------------------------------------------------
  async listAdvances(filter: AdvanceFilter = {}): Promise<Advance[]> {
    this.requireUser();
    let rows = [...this.advances];
    if (filter.from) rows = rows.filter((a) => a.date_issued >= filter.from!);
    if (filter.to) rows = rows.filter((a) => a.date_issued <= filter.to!);
    return rows.sort((a, b) => b.id - a.id);
  }
  async createAdvance(input: AdvanceInput): Promise<Advance> {
    const actor = this.actorName();
    const fund = this.funds.find((f) => f.id === input.fund_id);
    if (!fund) throw new Error('Fund not found.');
    const a: Advance = {
      id: this.seq.advance++,
      fund_id: input.fund_id,
      fund_name: fund.name,
      recipient: input.recipient,
      purpose: input.purpose,
      amount: round2(Number(input.amount)),
      date_issued: input.date_issued ?? nowIso().slice(0, 10),
      status: 'ISSUED',
      liquidated_amount: 0,
      returned_amount: 0,
      additional_release: 0,
      created_by: actor,
      created_at: nowIso(),
    };
    this.advances.push(a);
    return a;
  }
  async listLiquidationItems(advanceId: number): Promise<LiquidationItem[]> {
    this.requireUser();
    return this.liquidationItems
      .filter((i) => i.advance_id === advanceId)
      .map((i) => ({ id: i.id, advance_id: i.advance_id, date: i.date, description: i.description, amount: i.amount, attachment_id: i.attachment_id, attachment_name: i.attachment_name }));
  }
  async addLiquidationItem(input: LiquidationItemInput, file?: PtaFilePick | null): Promise<LiquidationItem> {
    this.requireUser();
    const adv = this.advances.find((a) => a.id === input.advance_id);
    if (!adv) throw new Error('Advance not found.');
    if (adv.status === 'LIQUIDATED' || adv.status === 'RETURNED') throw new Error('This advance is already closed.');
    const item: LiquidationItem = {
      id: this.seq.item++,
      advance_id: input.advance_id,
      date: input.date || nowIso().slice(0, 10),
      description: input.description,
      amount: round2(Number(input.amount)),
      attachment_id: file ? this.seq.item + 1000 : null,
      attachment_name: file?.name ?? null,
    };
    this.liquidationItems.push(item);
    this.refreshAdvanceStatus(adv);
    return item;
  }
  async removeLiquidationItem(id: number): Promise<void> {
    this.requireUser();
    const item = this.liquidationItems.find((i) => i.id === id);
    if (!item) throw new Error('Item not found.');
    this.liquidationItems = this.liquidationItems.filter((i) => i.id !== id);
    const adv = this.advances.find((a) => a.id === item.advance_id);
    if (adv) this.refreshAdvanceStatus(adv);
  }
  async closeAdvance(advanceId: number): Promise<Advance> {
    this.requireRoles('treasurer');
    const adv = this.advances.find((a) => a.id === advanceId);
    if (!adv) throw new Error('Advance not found.');
    if (adv.status === 'LIQUIDATED' || adv.status === 'RETURNED') throw new Error('Advance is already closed.');
    const liquidated = round2(this.liquidationItems.filter((i) => i.advance_id === advanceId).reduce((s, i) => s + i.amount, 0));
    adv.liquidated_amount = liquidated;
    adv.returned_amount = round2(Math.max(0, adv.amount - liquidated));
    adv.additional_release = round2(Math.max(0, liquidated - adv.amount));
    adv.status = adv.returned_amount > 0 ? 'RETURNED' : 'LIQUIDATED';
    return { ...adv };
  }
  async pickAttachmentFile(): Promise<PtaFilePick | null> {
    return null;
  }
  async openAttachment(): Promise<void> {
    throw new Error('Cannot open attachments in browser mock mode.');
  }
  private refreshAdvanceStatus(a: Advance): void {
    const total = round2(this.liquidationItems.filter((i) => i.advance_id === a.id).reduce((s, i) => s + i.amount, 0));
    a.liquidated_amount = total;
    a.status = total <= 0 ? 'ISSUED' : total < a.amount - 0.001 ? 'PARTIALLY_LIQUIDATED' : 'LIQUIDATED';
  }

  // ---- settings ------------------------------------------------------------------------------
  async getPtaSettings(): Promise<PtaSettings> {
    this.requireUser();
    return { ...this.settings };
  }
  async updatePtaSettings(patch: Partial<PtaSettings>): Promise<PtaSettings> {
    this.requireUser();
    this.settings = { ...this.settings, ...patch };
    return { ...this.settings };
  }
  async listSchoolYears(): Promise<string[]> {
    this.requireUser();
    return [DEMO_YEAR, '2025 - 2026'];
  }
  async getSchoolInfo(): Promise<SchoolInfo> {
    // Public (no login required). Browser mock: name only, no logo file.
    return { school_name: 'Lucena National High School', logo_url: '' };
  }

  // ---- app updates (browser mock: updater lives in the packaged app) --------------------------
  async getAppVersion(): Promise<string> {
    return '0.1.0 (dev mock)';
  }
  async checkForUpdates(): Promise<PtaUpdateStatus> {
    return { status: 'unavailable', message: 'Updates are only available in the installed desktop app.' };
  }
  async downloadUpdate(): Promise<void> {
    throw new Error('Updates are only available in the installed desktop app.');
  }
  async installUpdate(): Promise<void> {
    throw new Error('Updates are only available in the installed desktop app.');
  }
  async getGithubToken(): Promise<string | null> {
    return null;
  }
  async setGithubToken(): Promise<void> {
    /* no-op in mock mode */
  }
  async clearGithubToken(): Promise<void> {
    /* no-op in mock mode */
  }
  onUpdateStatus(): () => void {
    return () => undefined;
  }

  // ---- license / activation (browser mock: always activated so the demo flows) ---------------
  async checkLicense(): Promise<PtaLicenseStatus> {
    return { activated: true, licenseKey: 'DTR-MOCK-MOCK-MOCK', machineId: 'MOCK-MACHINE', activatedAt: nowIso() };
  }
  async activateLicense(_key: string): Promise<PtaLicenseResult> {
    return { ok: false, error: 'Activation is only available in the installed desktop app.' };
  }
  async getMachineId(): Promise<string> {
    return 'DEMO-MACHINE-ID';
  }

  // ---- reports ----------------------------------------------------------------------------------
  async getDashboard(): Promise<PtaDashboard> {
    this.requireUser();
    const funds = await this.fundBalances();
    const today = nowIso().slice(0, 10);
    const todayCols = this.collections.filter((c) => c.collected_at.slice(0, 10) === today);
    const pending = this.disbursements.filter((d) => d.status !== 'PAID').length;
    const balances = (await this.familyBalances()).filter((b) => b.balance > 0.005).sort((a, b) => b.balance - a.balance).slice(0, 5);
    return {
      funds: funds.slice(0, 5),
      todayCollections: round2(todayCols.reduce((s, c) => s + c.amount, 0)),
      todayCollectionsCount: todayCols.length,
      pendingApprovals: pending,
      topBalances: balances,
    };
  }
  async fundBalances(): Promise<FundBalanceRow[]> {
    this.requireUser();
    return this.funds.map((f) => {
      const collected = round2(this.fundAllocations.filter((a) => a.fund_id === f.id).reduce((s, a) => s + a.amount, 0));
      const disbursed = round2(this.disbursements.filter((d) => d.fund_id === f.id && d.status === 'PAID').reduce((s, d) => s + d.amount, 0));
      const advancesOut = round2(this.advances.filter((a) => a.fund_id === f.id).reduce((s, a) => s + a.amount - a.returned_amount, 0));
      const additional = round2(this.advances.filter((a) => a.fund_id === f.id).reduce((s, a) => s + a.additional_release, 0));
      return { fund_id: f.id, fund_name: f.name, collected, disbursed, advances_out: advancesOut, balance: round2(collected - disbursed - advancesOut - additional) };
    });
  }
  async familyBalances(search?: string): Promise<FamilyBalanceRow[]> {
    this.requireUser();
    let rows = this.families.map((f) => {
      const mine = this.charges.filter((c) => c.family_id === f.id);
      const totalCharges = round2(mine.reduce((s, c) => s + c.amount, 0));
      const totalPaid = round2(mine.reduce((s, c) => s + c.paid_amount, 0));
      return { family_id: f.id, guardian_name: f.guardian_name, student_count: f.student_count, total_charges: totalCharges, total_paid: totalPaid, balance: round2(totalCharges - totalPaid) };
    });
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((r) => r.guardian_name.toLowerCase().includes(q));
    }
    return rows.sort((a, b) => a.guardian_name.localeCompare(b.guardian_name));
  }
  async sectionCollections(_schoolYear: string): Promise<SectionCollectionRow[]> {
    this.requireUser();
    const map = new Map<string, SectionCollectionRow>();
    for (const s of this.students) {
      if (!s.is_active || !s.grade_section) continue;
      const row = map.get(s.grade_section) ?? { grade_section: s.grade_section, students: 0, total_charges: 0, total_paid: 0, balance: 0 };
      row.students += 1;
      for (const c of this.charges.filter((x) => x.student_id === s.id)) {
        row.total_charges = round2(row.total_charges + c.amount);
        row.total_paid = round2(row.total_paid + c.paid_amount);
      }
      row.balance = round2(row.total_charges - row.total_paid);
      map.set(s.grade_section, row);
    }
    return [...map.values()].sort((a, b) => a.grade_section.localeCompare(b.grade_section));
  }
  async sectionFamilies(schoolYear: string, gradeSection: string): Promise<SectionFamilyRow[]> {
    this.requireUser();
    const map = new Map<number, SectionFamilyRow>();
    for (const s of this.students) {
      if (!s.is_active || s.grade_section !== gradeSection) continue;
      const fam = this.families.find(
        (f) =>
          (s.guardian_name && f.guardian_name === s.guardian_name && f.guardian_address === s.guardian_address) ||
          (!s.guardian_name && f.guardian_name === s.full_name && f.guardian_address === ''),
      );
      if (!fam) continue;
      const row = map.get(fam.id) ?? { family_id: fam.id, guardian_name: fam.guardian_name, student_count: 0, total_charges: 0, total_paid: 0, balance: 0 };
      row.student_count += 1;
      for (const c of this.charges.filter((x) => x.student_id === s.id && x.school_year === schoolYear)) {
        row.total_charges = round2(row.total_charges + c.amount);
        row.total_paid = round2(row.total_paid + c.paid_amount);
      }
      row.balance = round2(row.total_charges - row.total_paid);
      map.set(fam.id, row);
    }
    return [...map.values()].sort((a, b) => a.guardian_name.localeCompare(b.guardian_name));
  }
  async collectionsReport(from?: string, to?: string): Promise<CollectionsSummaryRow[]> {
    this.requireUser();
    let pays = [...this.chargePayments];
    const cols = this.collections;
    if (from || to) {
      pays = pays.filter((p) => {
        const col = cols.find((c) => c.id === p.collection_id);
        if (!col) return false;
        const day = col.collected_at.slice(0, 10);
        if (from && day < from) return false;
        if (to && day > to) return false;
        return true;
      });
    }
    const byLabel = new Map<string, number>();
    for (const p of pays) {
      const c = this.charges.find((x) => x.id === p.charge_id);
      if (!c) continue;
      const label = `${c.component_label}${c.term ? ` · ${c.term}` : ''}`;
      byLabel.set(label, round2((byLabel.get(label) ?? 0) + p.amount));
    }
    const rows = [...byLabel.entries()].map(([label, amount]) => ({ label, amount }));
    rows.push({ label: 'TOTAL', amount: round2(rows.reduce((s, r) => s + r.amount, 0)) });
    return rows;
  }
  async statementOfAccount(familyId: number, schoolYear: string): Promise<StatementOfAccount> {
    this.requireUser();
    const fam = this.families.find((f) => f.id === familyId);
    if (!fam) throw new Error('Family not found.');
    const mine = this.charges.filter((c) => c.family_id === familyId);
    const pays = this.collections
      .filter((c) => c.family_id === familyId)
      .map((c) => ({ date: c.collected_at.slice(0, 10), ref: c.or_no, debit: 0, credit: c.amount }));
    const lines = [
      ...mine.map((c) => ({ date: '2026-06-01', ref: 'CHARGE', debit: c.amount, credit: 0, description: `${c.component_label}${c.term ? ` · ${c.term}` : ''} — ${c.student_name} (${c.grade_section})` })),
      ...pays.map((p) => ({ date: p.date, ref: p.ref, debit: 0, credit: p.credit, description: `Payment — Official Receipt ${p.ref}` })),
    ]
      .map((l, i) => ({ id: i, balance: 0, ...l }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.ref === 'CHARGE' ? -1 : 1));
    let acc = 0;
    for (const l of lines) {
      acc = round2(acc + l.debit - l.credit);
      l.balance = acc;
    }
    const totalCharges = round2(mine.reduce((s, c) => s + c.amount, 0));
    const totalPaid = round2(pays.reduce((s, p) => s + p.credit, 0));
    return { family: { ...fam }, school_year: schoolYear, lines, total_charges: totalCharges, total_paid: totalPaid, balance: round2(totalCharges - totalPaid) };
  }

  // ---- demo seeding ----------------------------------------------------------------------------
  private seedDemoCollections(): void {
    const maria = this.families.find((f) => f.guardian_name === 'Maria Dela Cruz');
    if (maria) {
      // Charge sheet: Maria = 200 membership + 200 + 250 + 200 + 250 = 1,100.
      void this.createCollection({ family_id: maria.id, amount: 650, collected_at: nowIso().slice(0, 10) }, 'Treasurer').then(() => undefined).catch(() => undefined);
    }
    const reyes = this.families.find((f) => f.guardian_name === 'Antonio Reyes');
    if (reyes) {
      // Reyes family: 200 membership + 3×(200+250) = 1,550; pay 450 for one child.
      void this.createCollection({ family_id: reyes.id, amount: 450, collected_at: nowIso().slice(0, 10) }, 'Treasurer').then(() => undefined).catch(() => undefined);
    }
  }

  private seedDemoDisbursements(): void {
    const fund = this.funds[0];
    if (!fund) return;
    this.disbursements.push(
      { id: this.seq.disb++, dv_no: `${this.settings.dv_prefix}${YEAR_START}-0001`, fund_id: fund.id, fund_name: fund.name, payee: 'Sta. Maria Print Shop', received_by: 'Mr. Rey Santos', purpose: 'PTA ID lanyards for School Fair', amount: 1200, date: nowIso().slice(0, 10), status: 'PAID', created_by: 'Mrs. Alma Santos', approved_by: 'Mrs. Alma Santos', approved_at: nowIso(), paid_by: 'Mr. Ben Cruz', paid_at: nowIso(), reference_no: 'Check 000123', notes: '', created_at: nowIso() },
      { id: this.seq.disb++, dv_no: `${this.settings.dv_prefix}${YEAR_START}-0002`, fund_id: fund.id, fund_name: fund.name, payee: 'Rizal Food Supply', received_by: '', purpose: 'Awards & tokens — Recognition Day', amount: 2500, date: nowIso().slice(0, 10), status: 'DRAFT', created_by: 'Ms. Carol Lim', approved_by: null, approved_at: null, paid_by: null, paid_at: null, reference_no: '', notes: 'Waiting for President approval', created_at: nowIso() },
    );
  }

  private seedDemoAdvance(): void {
    const fund = this.funds[0];
    if (!fund) return;
    const a: Advance = { id: this.seq.advance++, fund_id: fund.id, fund_name: fund.name, recipient: 'Mrs. Alma Santos', purpose: 'School Fair — food stalls cash advance', amount: 3000, date_issued: nowIso().slice(0, 10), status: 'PARTIALLY_LIQUIDATED', liquidated_amount: 1850, returned_amount: 0, additional_release: 0, created_by: 'Mr. Ben Cruz', created_at: nowIso() };
    this.advances.push(a);
    this.liquidationItems.push(
      { id: this.seq.item++, advance_id: a.id, date: nowIso().slice(0, 10), description: 'Booth permits (5 pcs)', amount: 500, attachment_id: null, attachment_name: 'permit-receipt.jpg' },
      { id: this.seq.item++, advance_id: a.id, date: nowIso().slice(0, 10), description: 'Rental of tables & chairs', amount: 1350, attachment_id: null, attachment_name: 'rental-or.pdf' },
    );
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const api: PtaApi = isElectron ? (window as unknown as { ptaApi: PtaApi }).ptaApi : new MockApi();
