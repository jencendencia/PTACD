// PTA CD main process: window, DB boot, IPC registration.
import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { db } from './db/connection';
import { bootPta, configureDbFromDisk, registerIpc } from './ipc';

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
