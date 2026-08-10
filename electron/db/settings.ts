// PTA settings store (school year, OR/DV prefixes). Persisted in pta_settings.
import { db } from './connection';
import type { PtaSettings } from '../../shared/types';

const DEFAULTS: PtaSettings = { school_year: '', or_prefix: 'OR-', dv_prefix: 'DV-' };

let cache: PtaSettings = { ...DEFAULTS };

async function readAll(): Promise<Record<string, string>> {
  const rows = await db.query<{ setting_key: string; setting_value: string }[]>('SELECT setting_key, setting_value FROM pta_settings');
  const out: Record<string, string> = {};
  for (const r of rows) out[r.setting_key] = r.setting_value;
  return out;
}

/** Resolves the current school year: stored PTA setting → shared school_years
 *  current → fallback to the calendar-year pair (e.g. "2026 - 2027"). */
export async function resolveSchoolYear(stored: string): Promise<string> {
  if (stored.trim()) return stored.trim();
  try {
    const rows = await db.query<{ name: string }[]>(
      "SELECT name FROM school_years WHERE is_current = 1 LIMIT 1",
    );
    if (rows[0]?.name) return rows[0].name;
    const all = await db.query<{ name: string }[]>('SELECT name FROM school_years ORDER BY name LIMIT 1');
    if (all[0]?.name) return all[0].name;
  } catch {
    // shared table missing — fall through to calendar-year fallback
  }
  const y = new Date().getFullYear();
  return `${y} - ${y + 1}`;
}

export async function load(): Promise<PtaSettings> {
  const stored = await readAll();
  cache = {
    school_year: await resolveSchoolYear(stored.school_year ?? ''),
    or_prefix: stored.or_prefix || DEFAULTS.or_prefix,
    dv_prefix: stored.dv_prefix || DEFAULTS.dv_prefix,
  };
  return { ...cache };
}

export function get(): PtaSettings {
  return { ...cache };
}

export async function update(patch: Partial<PtaSettings>): Promise<PtaSettings> {
  const next = { ...cache, ...patch };
  await db.execute('INSERT INTO pta_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)', [
    'school_year',
    next.school_year,
  ]);
  await db.execute('INSERT INTO pta_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)', [
    'or_prefix',
    next.or_prefix,
  ]);
  await db.execute('INSERT INTO pta_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)', [
    'dv_prefix',
    next.dv_prefix,
  ]);
  cache = { ...next };
  return { ...cache };
}
