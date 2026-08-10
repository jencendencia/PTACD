// Funds (chart of accounts) and per-component distribution rules.
import { db } from '../db/connection';
import type { DistributionRule, DistributionRuleInput, Fund, FundInput } from '../../shared/types';

type FundRow = {
  id: number;
  name: string;
  description: string;
  is_active: number;
  created_at: string;
};

const toFund = (r: FundRow): Fund => ({
  id: r.id,
  name: r.name,
  description: r.description,
  is_active: !!r.is_active,
  created_at: r.created_at,
});

export async function listFunds(): Promise<Fund[]> {
  const rows = await db.query<FundRow[]>('SELECT * FROM pta_funds ORDER BY name');
  return rows.map(toFund);
}

export async function saveFund(input: FundInput): Promise<Fund> {
  const name = String(input.name ?? '').trim();
  if (!name) throw new Error('Fund name is required.');
  const res = await db.execute(
    `INSERT INTO pta_funds (name, description, is_active) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE description = VALUES(description), is_active = VALUES(is_active)`,
    [name, String(input.description ?? '').trim(), input.is_active === false ? 0 : 1],
  );
  const id = res.insertId || (await db.query<{ id: number }[]>('SELECT id FROM pta_funds WHERE name = ?', [name]))[0].id;
  const [row] = await db.query<FundRow[]>('SELECT * FROM pta_funds WHERE id = ?', [id]);
  return toFund(row);
}

export async function deleteFund(id: number): Promise<void> {
  await db.execute('DELETE FROM pta_funds WHERE id = ?', [id]);
}

type RuleRow = {
  id: number;
  component_id: number;
  component_code: string;
  fund_id: number;
  fund_name: string;
  percentage: number;
};

const toRule = (r: RuleRow): DistributionRule => ({
  id: r.id,
  component_id: r.component_id,
  component_code: r.component_code,
  fund_id: r.fund_id,
  fund_name: r.fund_name,
  percentage: Number(r.percentage),
});

export async function listDistributionRules(): Promise<DistributionRule[]> {
  const rows = await db.query<RuleRow[]>(
    `SELECT r.id, r.component_id, c.code AS component_code, r.fund_id, f.name AS fund_name, r.percentage
     FROM pta_distribution_rules r
     JOIN pta_fee_components c ON c.id = r.component_id
     JOIN pta_funds f ON f.id = r.fund_id
     ORDER BY c.sort_order, f.name`,
  );
  return rows.map(toRule);
}

/** Upserts a rule, refusing to exceed 100% total for the component. */
export async function saveDistributionRule(input: DistributionRuleInput): Promise<DistributionRule> {
  const percentage = Number(input.percentage);
  if (!Number.isFinite(percentage) || percentage <= 0) throw new Error('Percentage must be greater than 0.');
  if (percentage > 100) throw new Error('Percentage cannot exceed 100.');

  const other = await db.query<{ total: number }[]>(
    `SELECT COALESCE(SUM(percentage), 0) AS total
     FROM pta_distribution_rules
     WHERE component_id = ? AND fund_id <> ?`,
    [input.component_id, input.fund_id],
  );
  const total = Number(other[0]?.total ?? 0);
  if (total + percentage > 100.001) {
    throw new Error(`Distribution would exceed 100% for this component (already ${total.toFixed(2)}%).`);
  }

  await db.execute(
    `INSERT INTO pta_distribution_rules (component_id, fund_id, percentage) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE percentage = VALUES(percentage)`,
    [input.component_id, input.fund_id, percentage],
  );
  const [row] = await db.query<RuleRow[]>(
    `SELECT r.id, r.component_id, c.code AS component_code, r.fund_id, f.name AS fund_name, r.percentage
     FROM pta_distribution_rules r
     JOIN pta_fee_components c ON c.id = r.component_id
     JOIN pta_funds f ON f.id = r.fund_id
     WHERE r.component_id = ? AND r.fund_id = ?`,
    [input.component_id, input.fund_id],
  );
  return toRule(row);
}

export async function deleteDistributionRule(id: number): Promise<void> {
  await db.execute('DELETE FROM pta_distribution_rules WHERE id = ?', [id]);
}

/** Rules keyed by component_id for the collection engine. */
export async function rulesByComponent(): Promise<Map<number, { fund_id: number; percentage: number }[]>> {
  const rules = await listDistributionRules();
  const map = new Map<number, { fund_id: number; percentage: number }[]>();
  for (const r of rules) {
    const arr = map.get(r.component_id) ?? [];
    arr.push({ fund_id: r.fund_id, percentage: r.percentage });
    map.set(r.component_id, arr);
  }
  return map;
}
