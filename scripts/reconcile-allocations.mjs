/* Reconcile pta_fund_allocations against actually-settled charges.
 *   node scripts/reconcile-allocations.mjs
 * For every collection where allocated != settled, deletes the stale
 * allocations and rebuilds them from the charge payments that still exist,
 * using the same per-component distribution rules as createCollection.
 * This repairs drift caused by deleting charges (e.g. old MISC/OTHER test
 * components) whose fund allocations were left behind.
 */
import { createRequire } from 'module';
import * as path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { db } = require(path.join(root, 'dist-electron/electron/db/connection.js'));

const round2 = (n) => Math.round(n * 100) / 100;

await db.connect();

const collections = await db.query(
  `SELECT c.id AS collection_id,
     COALESCE((SELECT SUM(cp.amount) FROM pta_charge_payments cp WHERE cp.collection_id = c.id), 0) AS settled,
     COALESCE((SELECT SUM(a.amount) FROM pta_fund_allocations a WHERE a.collection_id = c.id), 0) AS allocated
   FROM pta_collections c ORDER BY c.id`,
);

const ruleRows = await db.query(
  'SELECT component_id, fund_id, percentage FROM pta_distribution_rules',
);
const rules = new Map();
for (const r of ruleRows) {
  if (!rules.has(r.component_id)) rules.set(r.component_id, []);
  rules.get(r.component_id).push({ fund_id: r.fund_id, percentage: Number(r.percentage) });
}

let fixed = 0;
for (const c of collections) {
  const settled = Number(c.settled);
  const allocated = Number(c.allocated);
  if (Math.abs(settled - allocated) < 0.005) continue;

  console.log(`Collection ${c.collection_id}: settled ${settled.toFixed(2)} vs allocated ${allocated.toFixed(2)} — rebuilding...`);
  await db.execute('DELETE FROM pta_fund_allocations WHERE collection_id = ?', [c.collection_id]);

  const payments = await db.query(
    `SELECT c.component_id, cp.amount FROM pta_charge_payments cp
     JOIN pta_charges c ON c.id = cp.charge_id
     WHERE cp.collection_id = ?`,
    [c.collection_id],
  );
  const byFund = new Map();
  for (const p of payments) {
    const compRules = rules.get(p.component_id) ?? [];
    if (!compRules.length) continue; // no rules → not allocated (mirrors createCollection)
    let used = 0;
    compRules.forEach((rule, i) => {
      const isLast = i === compRules.length - 1;
      const share = isLast ? round2(Number(p.amount) - used) : round2((Number(p.amount) * rule.percentage) / 100);
      if (share > 0) byFund.set(rule.fund_id, round2((byFund.get(rule.fund_id) ?? 0) + share));
      used = round2(used + share);
    });
  }
  for (const [fundId, amount] of byFund) {
    await db.execute(
      'INSERT INTO pta_fund_allocations (collection_id, fund_id, amount) VALUES (?, ?, ?)',
      [c.collection_id, fundId, amount],
    );
  }
  fixed++;
}

console.log(`Done. Reconciled ${fixed} collection(s).`);
await db.stop();
