// PTA CD main process: window, DB boot, IPC registration.
import { app, BrowserWindow, protocol } from 'electron';
import * as path from 'path';
import { promises as fs } from 'fs';
import { db } from './db/connection';
import { bootPta, configureDbFromDisk, registerIpc } from './ipc';

// Serve the school logo over tapin-logo:// (same scheme TapIn School uses) so
// <img src="tapin-logo://logo/school-logo.jpg"> works in the renderer.
protocol.registerSchemesAsPrivileged([
  { scheme: 'tapin-logo', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const LOGO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 1080,
    minHeight: 680,
    title: 'PTA CD — Collection & Disbursement',
    // Frameless window: the renderer draws its own title bar (drag region +
    // window controls) — see src/components/TitleBar.tsx and the win:* IPC.
    // Windows-first: on macOS this also removes the traffic lights (our own
    // controls cover minimize/maximize/close there too).
    frame: false,
    backgroundColor: '#020617',
    icon: path.join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  // Keep the custom title bar's maximize/restore icon in sync with the window.
  win.on('maximize', () => win.webContents.send('win:maximized', true));
  win.on('unmaximize', () => win.webContents.send('win:maximized', false));

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(path.join(__dirname, '../../dist/index.html'));
  }
}

app.whenReady().then(async () => {
  // Serve persisted school logos from disk (tapin-logo://logo/<file>). The logo
  // is saved by TapIn School under its userData folder; fall back to our own.
  protocol.handle('tapin-logo', async (request) => {
    try {
      const url = new URL(request.url);
      const key = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
      const dirs = [
        path.join(app.getPath('appData'), 'TapIn School', 'logos'),
        path.join(app.getPath('userData'), 'logos'),
      ];
      for (const dir of dirs) {
        const filePath = path.resolve(dir, key);
        // Guard against path traversal from a tampered stored URL.
        if (!filePath.startsWith(path.resolve(dir) + path.sep)) return new Response('Forbidden', { status: 403 });
        try {
          const data = await fs.readFile(filePath);
          const mime = LOGO_MIME[path.extname(filePath).slice(1).toLowerCase()] ?? 'application/octet-stream';
          return new Response(new Uint8Array(data), { headers: { 'Content-Type': mime } });
        } catch {
          // not in this dir — try the next candidate
        }
      }
      return new Response('Not found', { status: 404 });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });

  registerIpc();
  createWindow();
  configureDbFromDisk();
  db.start();
  // Bounded wait for the first successful connection, then bootstrap.
  const deadline = Date.now() + 30000;
  while (!db.isOnline() && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (db.isOnline()) {
    try {
      await bootPta();
      console.log('[pta] boot complete — schema, families and charges ready.');
    } catch (err) {
      console.error('[pta] boot failed:', err);
    }
  } else {
    console.error('[pta] database unreachable — PTA features need the shared tapin_school database.');
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
