// PTA CD shell: login gate + sidebar navigation across all modules.
import { useEffect, useState } from 'react';
import { PTA_ROLE_LABELS } from '../shared/types';
import type { PtaSettings, PtaUser } from '../shared/types';
import { api } from './lib/api';
import { TitleBar } from './components/TitleBar';
import { LoginScreen } from './screens/Login';
import { DashboardScreen } from './screens/Dashboard';
import { CollectionsScreen } from './screens/Collections';
import { FamiliesScreen } from './screens/Families';
import { DisbursementsScreen } from './screens/Disbursements';
import { AdvancesScreen } from './screens/Advances';
import { FundsScreen } from './screens/Funds';
import { ReportsScreen } from './screens/Reports';
import { SettingsScreen } from './screens/Settings';

type Tab = 'dashboard' | 'collections' | 'families' | 'disbursements' | 'advances' | 'funds' | 'reports' | 'settings';

const NAV: { id: Tab; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'collections', label: 'Collections', icon: '💰' },
  { id: 'families', label: 'Families & Balances', icon: '👨‍👩‍👧' },
  { id: 'disbursements', label: 'Disbursements', icon: '💸' },
  { id: 'advances', label: 'Advances & Liquidation', icon: '🧾' },
  { id: 'funds', label: 'Funds & Distribution', icon: '🏦' },
  { id: 'reports', label: 'Reports', icon: '📄' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
];

export default function App() {
  const [user, setUser] = useState<PtaUser | null>(null);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [settings, setSettings] = useState<PtaSettings | null>(null);
  const [schoolYears, setSchoolYears] = useState<string[]>([]);

  // Refresh settings on login and on every tab switch so the sidebar selector
  // and the year-scoped screens stay in sync with changes made in Settings.
  useEffect(() => {
    if (!user) return;
    void api.getPtaSettings().then(setSettings).catch(() => undefined);
    void api.listSchoolYears().then(setSchoolYears).catch(() => undefined);
  }, [user, tab]);

  const switchYear = async (year: string) => {
    if (!settings || year === settings.school_year) return;
    await api.updatePtaSettings({ school_year: year });
    await api.recomputeCharges().catch(() => undefined);
    setSettings({ ...settings, school_year: year });
  };

  const logout = () => {
    setUser(null);
    setTab('dashboard');
  };

  return (
    <div className="pta-frame">
      <TitleBar settings={settings} schoolYears={schoolYears} onSwitchYear={(y) => void switchYear(y)} />
      <div className="pta-body">
        {!user ? (
          <LoginScreen onLogin={(u) => setUser(u)} />
        ) : (
          <div className="pta-app">
            <aside className="pta-sidebar">
              <div className="pta-brand">
                <div className="pta-logo">🎓</div>
                <div>
                  <div className="pta-name">PTA CD</div>
                  <div className="pta-tagline">Collection & Disbursement</div>
                </div>
              </div>
              <nav className="pta-nav">
                {NAV.map((item) => (
                  <button
                    key={item.id}
                    className={`pta-nav-item ${tab === item.id ? 'active' : ''}`}
                    onClick={() => setTab(item.id)}
                  >
                    <span className="pta-nav-icon">{item.icon}</span>
                    {item.label}
                  </button>
                ))}
              </nav>
              <div className="pta-side-foot">
                <div className="pta-user">
                  <div className="pta-user-avatar">{user.full_name.slice(0, 1).toUpperCase() || user.username.slice(0, 1).toUpperCase()}</div>
                  <div className="pta-user-meta">
                    <strong>{user.full_name}</strong>
                    <span className="text-dim">{PTA_ROLE_LABELS[user.role]}</span>
                  </div>
                </div>
                <button className="btn-ghost" onClick={logout}>🔒 Log out</button>
              </div>
            </aside>
            <main className="pta-main" key={settings?.school_year ?? 'sy'}>
              {tab === 'dashboard' && <DashboardScreen user={user} onGo={(t) => setTab(t as Tab)} />}
              {tab === 'collections' && <CollectionsScreen />}
              {tab === 'families' && <FamiliesScreen />}
              {tab === 'disbursements' && <DisbursementsScreen user={user} />}
              {tab === 'advances' && <AdvancesScreen user={user} />}
              {tab === 'funds' && <FundsScreen />}
              {tab === 'reports' && <ReportsScreen />}
              {tab === 'settings' && <SettingsScreen />}
            </main>
          </div>
        )}
      </div>
    </div>
  );
}
