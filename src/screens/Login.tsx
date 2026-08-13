import { useEffect, useState } from 'react';
import type { PtaUser, SchoolInfo } from '../../shared/types';
import { api } from '../lib/api';

export function LoginScreen({ onLogin }: { onLogin: (user: PtaUser) => void }) {
  const [school, setSchool] = useState<SchoolInfo | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api.getSchoolInfo().then(setSchool).catch(() => undefined);
  }, []);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.ptaLogin(username, password);
      if (res.ok && res.user) {
        onLogin(res.user);
      } else {
        setError(res.error ?? 'Login failed.');
      }
    } catch (err) {
      setError(`Could not reach the app: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        {school?.logo_url ? (
          <img className="login-logo-img" src={school.logo_url} alt="School logo" />
        ) : (
          <div className="login-logo">🎓</div>
        )}
        <h1>{school?.school_name || 'PTA CD'}</h1>
        <p className="text-dim">Parent-Teacher Association — Collection & Disbursement</p>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="field">
            <label>Username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
          {error && <p className="field-hint sms-error">{error}</p>}
          <button className="btn-primary login-btn" type="submit" disabled={busy || !username || !password}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="text-dim login-hint">
          Demo accounts: admin/admin · president/president · treasurer/treasurer
        </p>
      </div>
    </div>
  );
}
