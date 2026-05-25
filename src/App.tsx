import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './shared/components/Layout';
import { LoadingSpinner } from './shared/components/LoadingSpinner';
import { AuthProvider } from './shared/context/AuthContext';
import { CognitoAuthProvider } from './shared/context/CognitoAuthContext';
import { LinkedAccountsProvider } from './shared/context/LinkedAccountsProvider';
import { LocaleProvider } from './shared/context/LocaleContext';
import { Dashboard } from './pages/Dashboard';
import { NotFound } from './pages/NotFound';

const Profile = lazy(() =>
  import('./pages/Profile').then((m) => ({ default: m.Profile }))
);
const ArcTrackerSection = lazy(() =>
  import('./pages/profile/ArcTrackerSection').then((m) => ({
    default: m.ArcTrackerSection,
  }))
);
const EmbarkSection = lazy(() =>
  import('./pages/profile/EmbarkSection').then((m) => ({
    default: m.EmbarkSection,
  }))
);
const SignIn = lazy(() =>
  import('./pages/SignIn').then((m) => ({ default: m.SignIn }))
);
const SignUp = lazy(() =>
  import('./pages/SignUp').then((m) => ({ default: m.SignUp }))
);
const AuthCallback = lazy(() =>
  import('./pages/AuthCallback').then((m) => ({ default: m.AuthCallback }))
);
const EmbarkCallback = lazy(() =>
  import('./pages/EmbarkCallback').then((m) => ({ default: m.EmbarkCallback }))
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
        <CognitoAuthProvider>
          <AuthProvider>
            <LinkedAccountsProvider>
              <Suspense fallback={<LoadingSpinner />}>
                <Routes>
                  <Route path="/" element={<Layout />}>
                    <Route index element={<Dashboard />} />
                    <Route path="schedule" element={<ScheduleApp />} />
                    <Route path="craft-calculator" element={<CraftCalculatorApp />} />
                    <Route path="quests" element={<QuestsApp />} />
                    <Route path="loot-helper" element={<LootHelperApp />} />
                    <Route path="quartermaster" element={<QuartermasterApp />} />
                    <Route path="profile" element={<Profile />}>
                      <Route index element={<Navigate to="arctracker" replace />} />
                      <Route path="arctracker" element={<ArcTrackerSection />} />
                      <Route path="embark" element={<EmbarkSection />} />
                    </Route>
                    <Route path="auth/sign-in" element={<SignIn />} />
                    <Route path="auth/sign-up" element={<SignUp />} />
                    <Route path="auth/callback" element={<AuthCallback />} />
                    <Route path="embark-callback" element={<EmbarkCallback />} />
                    <Route path="*" element={<NotFound />} />
                  </Route>
                </Routes>
              </Suspense>
            </LinkedAccountsProvider>
          </AuthProvider>
        </CognitoAuthProvider>
      </LocaleProvider>
    </BrowserRouter>
  );
}

export default App;
