import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './shared/components/Layout';
import { AuthProvider } from './shared/context/AuthContext';
import { Dashboard } from './pages/Dashboard';
import { NotFound } from './pages/NotFound';
import { ProfileSettings } from './pages/ProfileSettings';
import { ScheduleApp } from './apps/schedule';
import { CraftCalculatorApp } from './apps/craft-calculator';
import { QuestsApp } from './apps/quests';
import { LootHelperApp } from './apps/loot-helper';
import { QuartermasterApp } from './apps/quartermaster';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
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
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
