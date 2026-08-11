// License activation screen — shown on first launch, before the login screen,
// until this machine is activated with a valid key (see APP_UPDATE_AND_ACTIVATION_PROCESS.md §2).
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

/** Formats input as DTR-XXXX-XXXX-XXXX (16 unambiguous chars, grouped in 4s). */
const fmtKey = (raw: string): string =>
  raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 16)
    .replace(/(.{4})(?=.)/g, '$1-');

export function ActivationScreen({ onActivated }: { onActivated: () => void }) {
  const [key, setKey] = useState('');
  const [machineId, setMachineId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = key.replace(/-/g, '').length === 16;

  useEffect(() => {
    void api.getMachineId().then(setMachineId).catch(() => undefined);
  }, []);

  const submit = async () => {
    if (busy || !valid) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.activateLicense(key);
      if (res.ok) {
        onActivated();
      } else {
        setError(res.error ?? 'Activation failed.');
      }
    } catch (err) {
      setError(`Could not reach the license server: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">🔑</div>
        <h1>Activate PTA CD</h1>
        <p className="text-dim">Enter the license key issued for this machine to unlock the app.</p>
        <form
          className="form"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div className="field">
            <label>License key</label>
            <input
              value={key}
              onChange={(e) => setKey(fmtKey(e.target.value))}
              placeholder="DTR-XXXX-XXXX-XXXX"
              className="mono"
              autoFocus
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          {error && <p className="field-hint sms-error">{error}</p>}
          <button className="btn-primary login-btn" type="submit" disabled={busy || !valid}>
            {busy ? 'Activating…' : 'Activate'}
          </button>
        </form>
        <p className="text-dim login-hint">
          Don't have a key? Contact your PTA administrator. The app stays locked until it's activated.
        </p>
        {machineId && (
          <div className="machine-id" title="This identifier lets your administrator activate this PC">
            <span>This machine's ID</span>
            <code>{machineId}</code>
            <p>Send this ID to your administrator if your key is rejected.</p>
          </div>
        )}
      </div>
    </div>
  );
}
