// License activation screen — shown on first launch, before the login screen,
// until this machine is activated with a valid key (see APP_UPDATE_AND_ACTIVATION_PROCESS.md §2).
import { useEffect, useState } from 'react';
import { api, errMsg } from '../lib/api';

const KEY_PREFIX = 'DTR';
// Real server keys are 5 segments (DTR-XXXX-XXXX-XXXX-XXXX); our scaffolded
// worker issues 4-segment keys (DTR-XXXX-XXXX-XXXX). Accept both, never truncate.
const KEY_RE = /^DTR-[A-HJ-NP-Z2-9]{4}(-[A-HJ-NP-Z2-9]{4}){2,3}$/;

/** Formats input as DTR-XXXX-XXXX (…) — keeps the DTR prefix, groups the rest in 4s. */
const fmtKey = (raw: string): string => {
  const clean = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!clean) return '';
  const hasPrefix = clean.startsWith(KEY_PREFIX);
  const rest = hasPrefix ? clean.slice(KEY_PREFIX.length, KEY_PREFIX.length + 16) : clean.slice(0, 16);
  const groups = rest.match(/.{1,4}/g) ?? [];
  return hasPrefix ? [KEY_PREFIX, ...groups].join('-') : groups.join('-');
};

export function ActivationScreen({ onActivated }: { onActivated: () => void }) {
  const [key, setKey] = useState('');
  const [machineId, setMachineId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const valid = KEY_RE.test(key);

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
      setError(`Could not reach the license server: ${errMsg(err)}`);
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
              placeholder="DTR-XXXX-XXXX-XXXX-XXXX"
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
