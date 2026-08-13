// Reusable "Connect to database" modal — shown from the title-bar status pill
// (always available) and from the login screen's offline banner, so a fresh
// install can point the app at the shared MySQL server BEFORE signing in.
import { useEffect, useState } from 'react';
import { api, errMsg } from '../lib/api';
import { Modal } from './shared';

export function DbConnectModal({ onClose }: { onClose: () => void }) {
  const [dbHost, setDbHost] = useState('127.0.0.1');
  const [dbPort, setDbPort] = useState('3306');
  const [dbUser, setDbUser] = useState('root');
  const [dbPassword, setDbPassword] = useState('');
  const [dbDatabase, setDbDatabase] = useState('tapin_school');
  const [connecting, setConnecting] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  // Seed the fields with whatever the app is currently trying to use.
  useEffect(() => {
    api
      .getDbStatus()
      .then((s) => {
        if (!s) return;
        setDbHost(s.host);
        setDbPort(String(s.port));
        setDbUser(s.user);
        setDbDatabase(s.database);
      })
      .catch(() => undefined);
  }, []);

  const connectDb = async () => {
    const config = {
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
      if (status.online) {
        onClose();
        // The backend server may have changed — reload so every screen
        // remounts against the new database. The session is restored via api.me().
        window.location.reload();
      } else {
        setDbError(status.detail);
      }
    } catch (err) {
      setDbError(errMsg(err));
    } finally {
      setConnecting(false);
    }
  };

  return (
    <Modal title="Connect to database" onClose={() => { if (!connecting) onClose(); }}>
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
          <button className="btn-ghost" onClick={() => onClose()} disabled={connecting}>Cancel</button>
          <button className="btn-primary" onClick={() => void connectDb()} disabled={connecting}>
            {connecting ? 'Connecting…' : 'Connect'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
