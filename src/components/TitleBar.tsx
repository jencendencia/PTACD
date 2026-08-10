// Custom title bar for the frameless window: a draggable app header on the
// left and minimize / maximize / close controls on the right. The controls
// call the win:* IPC bridge exposed by the preload; in browser mock mode
// (no Electron) the window controls are hidden and only the brand is shown.
import { useEffect, useState } from 'react';
import { api, isElectron } from '../lib/api';
import type { PtaDbStatus, PtaSettings, PtaWindowControls } from '../../shared/types';

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
        <div
          className={`titlebar-db ${db ? (db.online ? 'online' : 'offline') : 'pending'}`}
          title={db ? db.detail : 'Connecting…'}
        >
          <span className="titlebar-db-dot" aria-hidden="true" />
          <span className="titlebar-db-text">{dbText}</span>
        </div>
      </div>
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
