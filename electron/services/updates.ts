// Auto-update service (electron-updater + GitHub Releases).
// Flow (mirrors APP_UPDATE_AND_ACTIVATION_PROCESS.md §1.4):
//   renderer → checkForUpdates() → status events stream back as PtaUpdateStatus
//   renderer → downloadUpdate()  → download-progress events → 'downloaded'
//   renderer → installUpdate()   → autoUpdater.quitAndInstall() → NSIS installer
// For private repos a GitHub token can be stored in userData/github_token.json;
// for public repos any stale GH_TOKEN is cleared so GitHub never returns 401.
import { app, BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import * as path from 'path';
import type { PtaUpdateStatus } from '../../shared/types';

function send(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send(channel, payload);
  }
}

const tokenFile = (): string => path.join(app.getPath('userData'), 'github_token.json');

/** Point the updater at the stored GitHub token (private repos), or clear any
 *  stale GH_TOKEN so public-repo checks don't hit 401s (doc §1.5). */
function applyGithubToken(): void {
  const file = tokenFile();
  if (existsSync(file)) {
    try {
      const { token } = JSON.parse(readFileSync(file, 'utf8')) as { token?: unknown };
      if (typeof token === 'string' && token.trim()) {
        process.env.GH_TOKEN = token.trim();
        return;
      }
    } catch {
      /* ignore malformed token file */
    }
  }
  delete process.env.GH_TOKEN;
}

/** Wire the updater events and settings. Call once at IPC registration. */
export function initUpdater(): void {
  autoUpdater.autoDownload = false; // user must click "Download"
  autoUpdater.autoInstallOnAppQuit = true; // install when the app quits
  autoUpdater.on('checking-for-update', () => {
    send('update:status', { status: 'checking' } satisfies PtaUpdateStatus);
  });
  autoUpdater.on('update-available', (info) => {
    send('update:status', {
      status: 'available',
      version: info.version,
      releaseDate: info.releaseDate,
    } satisfies PtaUpdateStatus);
  });
  autoUpdater.on('update-not-available', (info) => {
    send('update:status', {
      status: 'not-available',
      version: info.version ?? app.getVersion(),
    } satisfies PtaUpdateStatus);
  });
  autoUpdater.on('download-progress', (p) => {
    send('update:status', {
      status: 'downloading',
      percent: p.percent,
      bytesPerSecond: p.bytesPerSecond,
      transferred: p.transferred,
      total: p.total,
    } satisfies PtaUpdateStatus);
  });
  autoUpdater.on('update-downloaded', (info) => {
    send('update:status', {
      status: 'downloaded',
      version: info.version,
    } satisfies PtaUpdateStatus);
  });
  autoUpdater.on('error', (err) => {
    console.error('[pta] updater error:', err);
    send('update:status', {
      status: 'error',
      message: err?.message ?? String(err),
    } satisfies PtaUpdateStatus);
  });
}

export async function checkForUpdates(): Promise<PtaUpdateStatus> {
  if (!app.isPackaged) {
    return { status: 'unavailable', message: 'Updates are only available in the installed app.' };
  }
  applyGithubToken();
  // Do NOT await the check: electron-updater emits update-available /
  // update-not-available BEFORE the promise resolves, so awaiting would let
  // the returned { status: 'checking' } overwrite the event in the renderer.
  // Return immediately and let the update:status events drive the UI.
  autoUpdater.checkForUpdates().catch((err) => {
    // The 'error' event already reports this to the renderer; just log here.
    console.error('[pta] update check failed:', err);
  });
  return { status: 'checking' };
}

export async function downloadUpdate(): Promise<void> {
  await autoUpdater.downloadUpdate();
}

export function installUpdate(): void {
  autoUpdater.quitAndInstall();
}

export function getGithubToken(): string | null {
  const file = tokenFile();
  if (!existsSync(file)) return null;
  try {
    const { token } = JSON.parse(readFileSync(file, 'utf8')) as { token?: unknown };
    return typeof token === 'string' && token.trim() ? token.trim() : null;
  } catch {
    return null;
  }
}

export function setGithubToken(token: string): void {
  const value = String(token ?? '').trim();
  writeFileSync(tokenFile(), JSON.stringify({ token: value }), 'utf8');
}

export function clearGithubToken(): void {
  try {
    unlinkSync(tokenFile());
  } catch {
    /* nothing to clear */
  }
}
