// License / activation service (per-machine licensing, Cloudflare Worker server).
// Flow (mirrors APP_UPDATE_AND_ACTIVATION_PROCESS.md §2.3):
//   renderer → checkLicense()   → reads userData/license.json (cached activation)
//   renderer → activateLicense() → machine ID + key POSTed to the license server;
//                                  on success the license is cached locally.
// The server URL is configurable via the PTA_LICENSE_SERVER env var and defaults
// to the existing dtr-license-server worker (doc §2.3).
import { app, net } from 'electron';
import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { hostname, networkInterfaces, platform, arch, userInfo } from 'os';
import * as path from 'path';
import type { PtaLicenseResult, PtaLicenseStatus } from '../../shared/types';

const DEFAULT_LICENSE_SERVER = 'https://dtr-license-server.jencendencia.workers.dev';
const LICENSE_FILE = 'license.json';
const TIMEOUT_MS = 15000;

export function getLicenseServer(): string {
  return process.env.PTA_LICENSE_SERVER?.trim() || DEFAULT_LICENSE_SERVER;
}

/** sha256(hostname + username + platform + arch + MAC) → first 16 hex chars (doc §2.3). */
export function getMachineId(): string {
  const macs = Object.values(networkInterfaces())
    .flat()
    .filter((i): i is NonNullable<typeof i> => Boolean(i && !i.internal && i.mac && i.mac !== '00:00:00:00:00:00'))
    .map((i) => i.mac.toUpperCase())
    .sort()
    .join(',');
  const raw = `${hostname()}|${userInfo().username}|${platform()}|${arch()}|${macs}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 16).toUpperCase();
}

export function checkLicense(): PtaLicenseStatus {
  const file = path.join(app.getPath('userData'), LICENSE_FILE);
  if (!existsSync(file)) return { activated: false };
  try {
    const data = JSON.parse(readFileSync(file, 'utf8')) as Partial<PtaLicenseStatus>;
    if (data.activated === true && data.licenseKey && data.machineId && data.activatedAt) {
      return {
        activated: true,
        licenseKey: data.licenseKey,
        machineId: data.machineId,
        activatedAt: data.activatedAt,
      };
    }
  } catch {
    /* malformed license file → treat as not activated */
  }
  return { activated: false };
}

export async function activateLicense(key: string): Promise<PtaLicenseResult> {
  const licenseKey = String(key ?? '').trim().toUpperCase();
  if (!licenseKey) return { ok: false, error: 'Enter your license key.' };
  const machineId = getMachineId();

  let res: Response;
  try {
    res = await net.fetch(`${getLicenseServer()}/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: licenseKey, machineId }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    return { ok: false, error: `Could not reach the license server: ${(err as Error).message}` };
  }

  const data = (await res.json().catch(() => null)) as { valid?: boolean; error?: string } | null;
  if (!res.ok || !data || data.valid !== true) {
    return { ok: false, error: (data && data.error) || 'Activation failed. Please check your license key.' };
  }

  const activatedAt = new Date().toISOString();
  const file = path.join(app.getPath('userData'), LICENSE_FILE);
  writeFileSync(file, JSON.stringify({ activated: true, licenseKey, machineId, activatedAt }, null, 2), 'utf8');
  return { ok: true, licenseKey, machineId, activatedAt };
}
