// Minimal .env loader for the Electron main process (no dotenv dependency).
// Reads KEY=VALUE lines from a .env file next to package.json (cwd or project
// root) and sets them on process.env WITHOUT overriding real environment
// variables. Shared by the app (via connection.ts) and scripts/init-db.mjs,
// so `npm run dev`, `npm start` and `npm run db:init` all behave identically.
import { existsSync, readFileSync } from 'fs';
import * as path from 'path';

const CANDIDATES = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '../../.env'),
];

export function loadEnvFile(): void {
  for (const file of CANDIDATES) {
    if (!existsSync(file)) continue;
    for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith('#') || !line.includes('=')) continue;
      const eq = line.indexOf('=');
      const key = line.slice(0, eq).trim().replace(/^export\s+/i, '');
      if (!key) continue;
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
    break; // first candidate that exists wins
  }
}
