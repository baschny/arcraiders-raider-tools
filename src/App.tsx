import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './shared/components/Layout';
import { Dashboard } from './pages/Dashboard';
import { ScheduleApp } from './apps/schedule';
import { CraftCalculatorApp } from './apps/craft-calculator';
import { QuestsApp } from './apps/quests';
import { LootHelperApp } from './apps/loot-helper';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="schedule" element={<ScheduleApp />} />
          <Route path="craft-calculator" element={<CraftCalculatorApp />} />
          <Route path="quests" element={<QuestsApp />} />
          <Route path="loot-helper" element={<LootHelperApp />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
