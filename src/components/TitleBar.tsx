// Custom title bar for the frameless window: a draggable app header on the
// left and minimize / maximize / close controls on the right. The controls
// call the win:* IPC bridge exposed by the preload; in browser mock mode
// (no Electron) the window controls are hidden and only the brand is shown.
import { useEffect, useState } from 'react';
import { api, isElectron } from '../lib/api';
import type { PtaDbConfig, PtaDbStatus, PtaSettings, PtaWindowControls } from '../../shared/types';
import { Modal } from './shared';

const getControls = (): PtaWindowControls | undefined =>
  (window as unknown as { winControls?: PtaWindowControls }).winControls;

function MinimizeIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <rect x="0" y="4.5" width="10" height="1.2" rx="0.6" fill="currentColor" />
    </svg>
  );
}

function MaximizeIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <rect x="0.5" y="0.5" width="9" height="9" rx="1" fill="none" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <rect x="0.5" y="2.2" width="7.3" height="7.3" rx="0.8" fill="none" stroke="currentColor" strokeWidth="1.1" />
      <path d="M2.8 2.2 V1.4 a0.9 0.9 0 0 1 0.9 -0.9 h5 a0.9 0.9 0 0 1 0.9 0.9 v5 a0.9 0.9 0 0 1 -0.9 0.9 h-0.8" fill="none" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M0.8 0.8 L9.2 9.2 M9.2 0.8 L0.8 9.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function TitleBar({
  settings,
  schoolYears,
  onSwitchYear,
}: {
  settings?: PtaSettings | null;
  schoolYears?: string[];
  onSwitchYear?: (year: string) => void;
}) {
  const [maximized, setMaximized] = useState(false);
  const [db, setDb] = useState<PtaDbStatus | null>(null);
  const [showDbModal, setShowDbModal] = useState(false);
  const [dbHost, setDbHost] = useState('127.0.0.1');
  const [dbPort, setDbPort] = useState('3306');
  const [dbUser, setDbUser] = useState('root');
  const [dbPassword, setDbPassword] = useState('');
  const [dbDatabase, setDbDatabase] = useState('tapin_school');
  const [connecting, setConnecting] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  useEffect(() => {
    if (!isElectron) return;
    const c = getControls();
    if (!c) return;
    c.isMaximized().then(setMaximized).catch(() => undefined);
    return c.onMaximizedChange(setMaximized);
  }, []);

  // Live database server indicator (works in both Electron and mock mode).
  useEffect(() => {
    api
      .getDbStatus()
      .then(setDb)
      .catch(() => undefined);
    return api.onDbStatusChange(setDb);
  }, []);

  const controls = isElectron ? getControls() : undefined;
  const dbText = db
    ? db.online
      ? `${db.host}:${db.port} · ${db.database}`
      : `${db.host}:${db.port} · offline`
    : 'database …';

  const openDbModal = () => {
    setDbHost(db?.host ?? '127.0.0.1');
    setDbPort(String(db?.port ?? 3306));
    setDbUser(db?.user ?? 'root');
    setDbPassword('');
    setDbDatabase(db?.database ?? 'tapin_school');
    setDbError(null);
    setShowDbModal(true);
  };

  const connectDb = async () => {
    const config: PtaDbConfig = {
      host: dbHost.trim(),
      port: Number(dbPort) || 3306,
      user: dbUser.trim(),
      password: dbPassword,
      database: dbDatabase.trim(),
    };
    setConnecting(true);
    setDbError(null);
    try {
      const status = await api.connectDb(config);
      setDb(status);
      if (status.online) {
        setShowDbModal(false);
        // The backend server may have changed — reload so every screen
        // remounts against the new database. The session is restored via api.me().
        window.location.reload();
      } else {
        setDbError(status.detail);
      }
    } catch (err) {
      setDbError((err as Error).message);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <header className="titlebar">
      <div className="titlebar-brand">
        <span className="titlebar-logo" aria-hidden="true">🎓</span>
        <span className="titlebar-name">PTA CD</span>
        <span className="titlebar-divider" aria-hidden="true" />
        <span className="titlebar-sub">Collection &amp; Disbursement</span>
      </div>
      <div className="titlebar-status">
        {settings && schoolYears && onSwitchYear && (
          <label className="titlebar-sy" title="School year — charges & collections apply to this year">
            <span className="titlebar-sy-label">School year</span>
            <select value={settings.school_year} onChange={(e) => onSwitchYear(e.target.value)}>
              {schoolYears.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>
        )}
        <button
          type="button"
          className={`titlebar-db ${db ? (db.online ? 'online' : 'offline') : 'pending'}`}
          title={db ? `${db.detail} — click to change server` : 'Connecting… — click to set server'}
          onClick={openDbModal}
        >
          <span className="titlebar-db-dot" aria-hidden="true" />
          <span className="titlebar-db-text">{dbText}</span>
        </button>
      </div>
      {showDbModal && (
        <Modal title="Connect to database" onClose={() => { if (!connecting) setShowDbModal(false); }}>
          <div className="form">
            <p className="field-hint db-modal-hint">
              Point the app at the MySQL server that holds the shared school database. The config is saved for next launch.
            </p>
            <div className="grid-2">
              <div className="field">
                <label>Host</label>
                <input value={dbHost} onChange={(e) => setDbHost(e.target.value)} placeholder="e.g. 192.168.1.129" autoFocus />
              </div>
              <div className="field">
                <label>Port</label>
                <input value={dbPort} onChange={(e) => setDbPort(e.target.value)} inputMode="numeric" placeholder="3306" />
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label>User</label>
                <input value={dbUser} onChange={(e) => setDbUser(e.target.value)} placeholder="root" />
              </div>
              <div className="field">
                <label>Password</label>
                <input type="password" value={dbPassword} onChange={(e) => setDbPassword(e.target.value)} placeholder="••••••••" />
              </div>
            </div>
            <div className="field">
              <label>Database</label>
              <input value={dbDatabase} onChange={(e) => setDbDatabase(e.target.value)} placeholder="tapin_school" />
            </div>
            {dbError && <p className="field-hint sms-error">{dbError}</p>}
            <div className="form-actions">
              <button className="btn-ghost" onClick={() => setShowDbModal(false)} disabled={connecting}>Cancel</button>
              <button className="btn-primary" onClick={() => void connectDb()} disabled={connecting}>
                {connecting ? 'Connecting…' : 'Connect'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {controls && (
        <div className="titlebar-controls">
          <button className="titlebar-btn" title="Minimize" aria-label="Minimize" onClick={() => void controls.minimize()}>
            <MinimizeIcon />
          </button>
          <button
            className="titlebar-btn"
            title={maximized ? 'Restore' : 'Maximize'}
            aria-label={maximized ? 'Restore' : 'Maximize'}
            onClick={() => void controls.toggleMaximize()}
          >
            {maximized ? <RestoreIcon /> : <MaximizeIcon />}
          </button>
          <button className="titlebar-btn titlebar-close" title="Close" aria-label="Close" onClick={() => void controls.close()}>
            <CloseIcon />
          </button>
        </div>
      )}
    </header>
  );
}
