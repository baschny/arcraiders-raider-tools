import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './shared/components/Layout';
import { LoadingSpinner } from './shared/components/LoadingSpinner';
import { AuthProvider } from './shared/context/AuthContext';
import { LocaleProvider } from './shared/context/LocaleContext';
import { Dashboard } from './pages/Dashboard';
import { NotFound } from './pages/NotFound';

const ProfileSettings = lazy(() =>
  import('./pages/ProfileSettings').then((m) => ({ default: m.ProfileSettings }))
);
const ScheduleApp = lazy(() =>
  import('./apps/schedule').then((m) => ({ default: m.ScheduleApp }))
);
const CraftCalculatorApp = lazy(() =>
  import('./apps/craft-calculator').then((m) => ({ default: m.CraftCalculatorApp }))
);
const QuestsApp = lazy(() =>
  import('./apps/quests').then((m) => ({ default: m.QuestsApp }))
);
const LootHelperApp = lazy(() =>
  import('./apps/loot-helper').then((m) => ({ default: m.LootHelperApp }))
);
const QuartermasterApp = lazy(() =>
  import('./apps/quartermaster').then((m) => ({ default: m.QuartermasterApp }))
);

function App() {
  return (
    <BrowserRouter>
      <LocaleProvider>
        <AuthProvider>
          <Suspense fallback={<LoadingSpinner />}>
            <Routes>
              <Route path="/" element={<Layout />}>
                <Route index element={<Dashboard />} />
                <Route path="schedule" element={<ScheduleApp />} />
                <Route path="craft-calculator" element={<CraftCalculatorApp />} />
                <Route path="quests" element={<QuestsApp />} />
                <Route path="loot-helper" element={<LootHelperApp />} />
                <Route path="quartermaster" element={<QuartermasterApp />} />
                <Route path="settings/profile" element={<ProfileSettings />} />
                <Route path="*" element={<NotFound />} />
              </Route>
            </Routes>
          </Suspense>
        </AuthProvider>
      </LocaleProvider>
    </BrowserRouter>
  );
}

export default App;
