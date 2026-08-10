/* Bootstrap the PTA CD schema inside the shared tapin_school database.
 *   node scripts/init-db.mjs
 * Reads DB_* env vars (defaults: 127.0.0.1 / root / no password / tapin_school).
 */
import { createRequire } from 'module';
import * as path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { db } = require(path.join(root, 'dist-electron/electron/db/connection.js'));
const { ensureSchema } = require(path.join(root, 'dist-electron/electron/db/schema.js'));

const ok = await db.connect();
if (!ok) {
  console.error('Could not connect to MySQL:', db.getStatus().detail);
  process.exit(1);
}
console.log('Connected —', db.getStatus().detail);
await ensureSchema(db.query.bind(db));
console.log('PTA schema ensured (idempotent).');
await db.stop();
