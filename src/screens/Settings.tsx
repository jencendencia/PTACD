import { useCallback, useEffect, useState } from 'react';
import { PTA_ROLE_LABELS } from '../../shared/types';
import type { FeeComponent, FeeComponentInput, PtaRole, PtaSettings, PtaUpdateStatus, PtaUser, PtaUserInput } from '../../shared/types';
import { api } from '../lib/api';
import { Modal, Spinner, Toast, fmtMoney } from '../components/shared';

const ROLES: PtaRole[] = ['admin', 'president', 'vice_president', 'treasurer', 'secretary', 'auditor'];

export function SettingsScreen() {
  const [settings, setSettings] = useState<PtaSettings | null>(null);
  const [schoolYears, setSchoolYears] = useState<string[]>([]);
  const [components, setComponents] = useState<FeeComponent[] | null>(null);
  const [users, setUsers] = useState<PtaUser[] | null>(null);
  const [showComponent, setShowComponent] = useState<FeeComponent | 'new' | null>(null);
  const [showUser, setShowUser] = useState<'new' | null>(null);
  const [componentToDelete, setComponentToDelete] = useState<FeeComponent | null>(null);
  const [deletingComponent, setDeletingComponent] = useState(false);
  const [deleteComponentError, setDeleteComponentError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  // App updates
  const [appVersion, setAppVersion] = useState('…');
  const [updateStatus, setUpdateStatus] = useState<PtaUpdateStatus>({ status: 'idle' });
  const [updateBusy, setUpdateBusy] = useState(false);
  const [token, setToken] = useState('');
  const [hasToken, setHasToken] = useState(false);
  const [tokenBusy, setTokenBusy] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [printHeaderDraft, setPrintHeaderDraft] = useState('');

  const load = useCallback(() => {
    void api.getPtaSettings().then(setSettings);
    void api.listSchoolYears().then(setSchoolYears);
    void api.listFeeComponents().then(setComponents);
    void api.listPtaUsers().then(setUsers).catch(() => setUsers(null));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Keep the print-header draft in sync when settings load.
  useEffect(() => {
    setPrintHeaderDraft(settings?.print_header ?? '');
  }, [settings]);

  // Updates: load the installed version, existing GitHub token (private repos),
  // and subscribe to updater status pushed from the main process.
  useEffect(() => {
    void api.getAppVersion().then(setAppVersion).catch(() => undefined);
    void api.getGithubToken().then((t) => setHasToken(Boolean(t))).catch(() => undefined);
    return api.onUpdateStatus(setUpdateStatus);
  }, []);

  const notify = (msg: string, tone: 'success' | 'error' = 'success') => {
    setToast({ message: msg, tone });
    setTimeout(() => setToast(null), 3000);
  };

  const saveSchoolYear = async (year: string) => {
    if (!settings) return;
    await api.updatePtaSettings({ school_year: year });
    await api.recomputeCharges();
    notify('School year saved — charges recomputed');
    load();
  };

  const savePrefixes = async (patch: Partial<PtaSettings>) => {
    if (!settings) return;
    await api.updatePtaSettings(patch);
    notify('Saved');
    load();
  };

  const savePrintHeader = async () => {
    if (!settings) return;
    await api.updatePtaSettings({ print_header: printHeaderDraft.trim() });
    notify('Print header saved');
    load();
  };

  const deleteComponent = async (c: FeeComponent) => {
    setDeletingComponent(true);
    setDeleteComponentError(null);
    try {
      await api.deleteFeeComponent(c.id);
      setComponentToDelete(null);
      notify('Component deleted');
      load();
    } catch (err) {
      setDeleteComponentError((err as Error).message);
    } finally {
      setDeletingComponent(false);
    }
  };

  // ---- Updates -------------------------------------------------------------------------
  const checkForUpdates = async () => {
    if (updateBusy) return;
    setUpdateBusy(true);
    try {
      setUpdateStatus(await api.checkForUpdates());
    } catch (err) {
      setUpdateStatus({ status: 'error', message: (err as Error).message });
    } finally {
      setUpdateBusy(false);
    }
  };

  const downloadUpdate = async () => {
    if (updateBusy) return;
    setUpdateBusy(true);
    setUpdateStatus({ status: 'downloading', percent: 0, bytesPerSecond: 0, transferred: 0, total: 0 });
    try {
      await api.downloadUpdate();
    } catch (err) {
      setUpdateStatus({ status: 'error', message: (err as Error).message });
    } finally {
      setUpdateBusy(false);
    }
  };

  const saveToken = async () => {
    if (tokenBusy) return;
    setTokenBusy(true);
    try {
      await api.setGithubToken(token.trim());
      setHasToken(true);
      setToken('');
      setShowToken(false);
      notify('GitHub token saved');
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setTokenBusy(false);
    }
  };

  const clearToken = async () => {
    if (tokenBusy) return;
    setTokenBusy(true);
    try {
      await api.clearGithubToken();
      setHasToken(false);
      setToken('');
      notify('GitHub token cleared');
    } catch (err) {
      notify((err as Error).message, 'error');
    } finally {
      setTokenBusy(false);
    }
  };

  if (!settings) return <Spinner label="Loading settings…" />;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>Settings</h2>
          <p className="text-dim">School year, fee components, receipts numbering, and officer accounts</p>
        </div>
      </div>

      <div className="settings-grid">
        <div className="card">
          <h3>School year</h3>
          <p className="field-hint">Charges are computed for this school year. Changing it recomputes all charges.</p>
          <div className="field">
            <select value={settings.school_year} onChange={(e) => void saveSchoolYear(e.target.value)}>
              {schoolYears.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="card">
          <h3>Receipt numbering</h3>
          <div className="field-row">
            <div className="field">
              <label>OR prefix</label>
              <input value={settings.or_prefix} onChange={(e) => void savePrefixes({ or_prefix: e.target.value })} />
            </div>
            <div className="field">
              <label>DV prefix</label>
              <input value={settings.dv_prefix} onChange={(e) => void savePrefixes({ dv_prefix: e.target.value })} />
            </div>
          </div>
          <p className="field-hint">Numbers auto-increment per school year, e.g. OR-2026-0001.</p>
        </div>

        <div className="card">
          <h3>Print header</h3>
          <p className="field-hint">
            Letterhead text shown beside the school logo at the top of printed statements of account
            and official receipts. Leave empty to show the school name.
          </p>
          <div className="field">
            <textarea
              rows={2}
              value={printHeaderDraft}
              onChange={(e) => setPrintHeaderDraft(e.target.value)}
              placeholder="e.g. Lucena National High School — PTA Office, Brgy. Isabang, Lucena City"
            />
          </div>
          <div className="form-actions">
            <button className="btn-ghost" onClick={() => void savePrintHeader()}>Save header</button>
          </div>
        </div>

        <div className="card">
          <h3>Fee components</h3>
          <p className="field-hint">
            Per-family components (e.g. Membership) are billed once per family; per-child components are billed for each student.
            Example: 650 = 200 membership + 200 misc + 250 other.
          </p>
          <table className="table">
            <thead>
              <tr><th>Code</th><th>Label</th><th className="num">Amount</th><th>Billing</th><th>Term</th><th></th></tr>
            </thead>
            <tbody>
              {components?.map((c) => (
                <tr key={c.id}>
                  <td className="mono">{c.code}</td>
                  <td>{c.label}</td>
                  <td className="num">{fmtMoney(c.amount)}</td>
                  <td><span className="pill pill-info">{c.applies === 'per_family' ? 'FAMILY' : 'CHILD'}</span></td>
                  <td>{c.term || '—'}</td>
                  <td>
                    <button className="btn-icon" title="Edit" onClick={() => setShowComponent(c)}>✎</button>
                    <button
                      className="btn-icon danger"
                      title="Delete component"
                      onClick={() => {
                        setDeleteComponentError(null);
                        setComponentToDelete(c);
                      }}
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
              {components?.length === 0 && <tr><td colSpan={6} className="empty-cell">No components.</td></tr>}
            </tbody>
            {components && components.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={2}>Total of all fees</td>
                  <td className="num">{fmtMoney(components.reduce((s, c) => s + Number(c.amount), 0))}</td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            )}
          </table>
          <div className="form-actions">
            <button className="btn-ghost" onClick={() => setShowComponent('new')}>+ Add component</button>
            <button className="btn-ghost" onClick={() => void api.recomputeCharges().then(() => notify('Charges recomputed'))}>
              ♻ Recompute charges
            </button>
          </div>
        </div>

        <div className="card">
          <h3>Officer accounts</h3>
          <p className="field-hint">PTA officers sign in to this app. Roles gate approvals and reports.</p>
          <table className="table">
            <thead>
              <tr><th>Username</th><th>Full name</th><th>Role</th></tr>
            </thead>
            <tbody>
              {users?.map((u) => (
                <tr key={u.id}>
                  <td className="mono">{u.username}</td>
                  <td>{u.full_name}</td>
                  <td><span className="pill pill-dim">{PTA_ROLE_LABELS[u.role]}</span></td>
                </tr>
              ))}
              {users?.length === 0 && <tr><td colSpan={3} className="empty-cell">No officer accounts.</td></tr>}
            </tbody>
          </table>
          <div className="form-actions">
            <button className="btn-ghost" onClick={() => setShowUser('new')}>+ Add officer</button>
          </div>
        </div>

        <div className="card">
          <h3>Updates</h3>
          <p className="field-hint">
            New versions are distributed through GitHub Releases and installed by the app.
          </p>
          <div className="update-row">
            <span className="text-dim">Installed version</span>
            <strong className="mono">{appVersion}</strong>
          </div>

          {updateStatus.status !== 'idle' && (
            <div className={`update-status ${updateTone(updateStatus)}`}>{updateText(updateStatus)}</div>
          )}
          {updateStatus.status === 'downloading' && (
            <div className="update-progress" title={`${Math.round(updateStatus.percent)}%`}>
              <div className="update-progress-fill" style={{ width: `${Math.min(100, updateStatus.percent)}%` }} />
            </div>
          )}

          <div className="form-actions">
            {updateStatus.status === 'available' && (
              <button className="btn-primary" onClick={() => void downloadUpdate()} disabled={updateBusy}>
                ⬇ Download update {updateStatus.version}
              </button>
            )}
            {updateStatus.status === 'downloaded' && (
              <button className="btn-primary" onClick={() => void api.installUpdate()}>
                🔄 Restart &amp; install
              </button>
            )}
            <button
              className="btn-ghost"
              onClick={() => void checkForUpdates()}
              disabled={updateBusy || updateStatus.status === 'checking' || updateStatus.status === 'downloading'}
            >
              {updateStatus.status === 'checking' ? 'Checking…' : '🔍 Check for updates'}
            </button>
          </div>

          <details className="token-accordion" open={showToken} onToggle={(e) => setShowToken(e.currentTarget.open)}>
            <summary>GitHub token (private repos only)</summary>
            <p className="field-hint">
              Public releases need no token. If this app's repo is private, paste a fine-grained token with read
              access to contents so updates can be downloaded.
            </p>
            {hasToken && <p className="field-hint pos">✓ A token is saved on this machine.</p>}
            <div className="token-row">
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="ghp_…"
                disabled={tokenBusy}
              />
              <button className="btn-ghost sm" onClick={() => void saveToken()} disabled={tokenBusy || !token.trim()}>
                {tokenBusy ? 'Saving…' : 'Save'}
              </button>
              <button className="btn-ghost sm" onClick={() => void clearToken()} disabled={tokenBusy || !hasToken}>
                Clear
              </button>
            </div>
          </details>
        </div>
      </div>

      {showComponent && (
        <ComponentModal
          existing={showComponent === 'new' ? null : showComponent}
          onClose={() => setShowComponent(null)}
          onSaved={() => {
            setShowComponent(null);
            notify('Component saved — recompute charges to apply');
            load();
          }}
        />
      )}
      {componentToDelete && (
        <Modal title="Delete fee component" onClose={() => { if (!deletingComponent) setComponentToDelete(null); }}>
          <p>
            Are you sure you want to delete <strong>{componentToDelete.code} — {componentToDelete.label}</strong>?
            This cannot be undone.
          </p>
          <p className="field-hint">
            Its distribution rules are removed automatically. Components that already have charges cannot be deleted.
          </p>
          {deleteComponentError && <p className="field-hint sms-error">{deleteComponentError}</p>}
          <div className="form-actions">
            <button className="btn-ghost" onClick={() => setComponentToDelete(null)} disabled={deletingComponent}>Cancel</button>
            <button className="btn-danger" onClick={() => void deleteComponent(componentToDelete)} disabled={deletingComponent}>
              {deletingComponent ? 'Deleting…' : '🗑 Delete component'}
            </button>
          </div>
        </Modal>
      )}
      {showUser && (
        <UserModal
          onClose={() => setShowUser(null)}
          onSaved={() => {
            setShowUser(null);
            notify('Officer account added');
            load();
          }}
        />
      )}

      {toast && <Toast message={toast.message} tone={toast.tone} />}
    </div>
  );
}

function updateText(s: PtaUpdateStatus): string {
  switch (s.status) {
    case 'idle':
      return '';
    case 'checking':
      return 'Checking for updates…';
    case 'not-available':
      return `You're on the latest version (${s.version}).`;
    case 'available':
      return `Update v${s.version} is available.`;
    case 'downloading':
      return `Downloading… ${Math.round(s.percent)}%`;
    case 'downloaded':
      return `Update v${s.version} downloaded. Restart the app to install it.`;
    case 'error':
      return `Update failed: ${s.message}`;
    case 'unavailable':
      return s.message;
  }
}

function updateTone(s: PtaUpdateStatus): string {
  if (s.status === 'error' || s.status === 'unavailable') return 'err';
  if (s.status === 'available' || s.status === 'downloaded') return 'ok';
  return 'info';
}

function ComponentModal({
  existing,
  onClose,
  onSaved,
}: {
  existing: FeeComponent | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FeeComponentInput>({
    code: existing?.code ?? '',
    label: existing?.label ?? '',
    amount: existing?.amount ?? 0,
    applies: existing?.applies ?? 'per_child',
    term: existing?.term ?? '',
    is_active: existing?.is_active ?? true,
    sort_order: existing?.sort_order ?? 0,
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof FeeComponentInput, v: string | number | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.code.trim() || !form.label.trim()) return setError('Code and label are required.');
    try {
      await api.saveFeeComponent({ ...form, code: form.code.trim(), label: form.label.trim() });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Modal title={existing ? `Edit — ${existing.label}` : 'Add fee component'} onClose={onClose}>
      <div className="form">
        <div className="field-row">
          <div className="field">
            <label>Code</label>
            <input
              value={form.code}
              onChange={(e) => set('code', e.target.value.toUpperCase())}
              placeholder="e.g. MISC"
              disabled={!!existing}
              title={existing ? 'Code cannot be changed' : undefined}
            />
            {existing && (
              <p className="field-hint">Code and term can't be changed after creation. To change them, delete this component and add a new one.</p>
            )}
          </div>
          <div className="field">
            <label>Amount (₱)</label>
            <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => set('amount', Number(e.target.value))} />
          </div>
        </div>
        <div className="field">
          <label>Label</label>
          <input value={form.label} onChange={(e) => set('label', e.target.value)} placeholder="e.g. Miscellaneous" />
        </div>
        <div className="field-row">
          <div className="field">
            <label>Billing</label>
            <select value={form.applies} onChange={(e) => set('applies', e.target.value)}>
              <option value="per_child">Per child</option>
              <option value="per_family">Per family (once)</option>
            </select>
          </div>
          <div className="field">
            <label>Term (optional)</label>
            <input
              value={form.term ?? ''}
              onChange={(e) => set('term', e.target.value)}
              placeholder="e.g. 1st"
              disabled={!!existing}
              title={existing ? 'Term cannot be changed' : undefined}
            />
          </div>
        </div>
        {error && <p className="field-hint sms-error">{error}</p>}
        <div className="form-actions">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => void save()}>Save</button>
        </div>
      </div>
    </Modal>
  );
}

function UserModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<PtaUserInput>({ username: '', full_name: '', role: 'secretary', password: '' });
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!form.username.trim() || !form.full_name.trim()) return setError('Username and full name are required.');
    if (String(form.password ?? '').length < 4) return setError('Password must be at least 4 characters.');
    if (form.password !== confirm) return setError('Passwords do not match.');
    try {
      await api.createPtaUser(form);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Modal title="Add officer account" onClose={onClose}>
      <div className="form">
        <div className="field">
          <label>Full name</label>
          <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="e.g. Mrs. Alma Santos" />
        </div>
        <div className="field-row">
          <div className="field">
            <label>Username</label>
            <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
          </div>
          <div className="field">
            <label>Role</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as PtaRole })}>
              {ROLES.map((r) => (
                <option key={r} value={r}>{PTA_ROLE_LABELS[r]}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min 4 characters" />
        </div>
        <div className="field">
          <label>Confirm password</label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Re-enter password" />
        </div>
        {error && <p className="field-hint sms-error">{error}</p>}
        <div className="form-actions">
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={() => void save()}>Add officer</button>
        </div>
      </div>
    </Modal>
  );
}
