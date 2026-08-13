/* Remove fee components and the charge records that reference them.
 *   node scripts/cleanup-fee-components.mjs [CODE ...]
 * Defaults to the MISC and OTHER test components.
 * Deletes in dependency order: charge payments → charges → components
 * (distribution rules cascade automatically).
 */
import { createRequire } from 'module';
import * as path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { db } = require(path.join(root, 'dist-electron/electron/db/connection.js'));

const codes = process.argv.slice(2);
if (!codes.length) codes.push('MISC', 'OTHER');

const ok = await db.connect();
if (!ok) {
  console.error('Could not connect to MySQL:', db.getStatus().detail);
  process.exit(1);
}
console.log('Connected —', db.getStatus().detail);

const codePlaceholders = codes.map(() => '?').join(',');
const existing = await db.query(
  `SELECT id, code, label FROM pta_fee_components WHERE code IN (${codePlaceholders})`,
  codes,
);
if (!existing.length) {
  console.log('No fee components found with codes:', codes.join(', '));
  await db.stop();
  process.exit(0);
}
console.log(
  'Targeting:',
  existing.map((c) => `${c.code} (${c.label}, id=${c.id})`).join(', '),
);

const ids = existing.map((c) => c.id);
const idPlaceholders = ids.map(() => '?').join(',');

const [chargeCount] = await db.query(
  `SELECT COUNT(*) AS n FROM pta_charges WHERE component_id IN (${idPlaceholders})`,
  ids,
);
const [paymentCount] = await db.query(
  `SELECT COUNT(*) AS n FROM pta_charge_payments
   WHERE charge_id IN (SELECT id FROM pta_charges WHERE component_id IN (${idPlaceholders}))`,
  ids,
);
console.log(
  `Will delete: ${Number(paymentCount.n)} charge payment link(s), ${Number(chargeCount.n)} charge(s).`,
);

// 1. Charge payment links (no cascade from the charge side).
const r1 = await db.execute(
  `DELETE cp FROM pta_charge_payments cp
   JOIN pta_charges c ON c.id = cp.charge_id
   WHERE c.component_id IN (${idPlaceholders})`,
  ids,
);
// 2. The charges themselves.
const r2 = await db.execute(
  `DELETE FROM pta_charges WHERE component_id IN (${idPlaceholders})`,
  ids,
);
// 3. The components (distribution rules cascade via fk_pta_rule_component).
const r3 = await db.execute(
  `DELETE FROM pta_fee_components WHERE id IN (${idPlaceholders})`,
  ids,
);

console.log(
  `Deleted ${r1.affectedRows} payment link(s), ${r2.affectedRows} charge(s), ${r3.affectedRows} component(s).`,
);
await db.stop();
