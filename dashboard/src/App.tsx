import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { TicketsPage } from './pages/TicketsPage';
import { ActivityPage } from './pages/ActivityPage';
import { CostsPage } from './pages/CostsPage';
import { OrgChartPage } from './pages/OrgChartPage';
import { ChainsPage } from './pages/ChainsPage';
import { AgentsPage } from './pages/AgentsPage';
import { RoutinesPage } from './pages/RoutinesPage';
import { WidgetPage } from './pages/WidgetPage';
import { BrickOverviewPage } from './pages/brick/BrickOverviewPage';
import { BrickCanvasPage } from './pages/brick/BrickCanvasPage';
import { BlockCatalogPage } from './pages/brick/BlockCatalogPage';
import { TeamManagePage } from './pages/brick/TeamManagePage';
import { TeamDetailPage } from './pages/brick/TeamDetailPage';
import { PresetListPage } from './pages/brick/PresetListPage';
import { PresetEditorPage } from './pages/brick/PresetEditorPage';
import { RunHistoryPage } from './pages/brick/RunHistoryPage';
import { RunDetailPage } from './pages/brick/RunDetailPage';
import { LearningHarnessPage } from './pages/brick/LearningHarnessPage';
import { useLiveUpdates } from './hooks/useLiveUpdates';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      retry: 1,
    },
  },
});

function LiveUpdatesInit() {
  useLiveUpdates();
  return null;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LiveUpdatesInit />
      <BrowserRouter>
        <Routes>
          {/* 모바일 위젯 (Layout 없음) */}
          <Route path="widget" element={<WidgetPage />} />

          {/* 기본 대시보드 (Layout 포함) */}
          <Route element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="tickets" element={<TicketsPage />} />
            <Route path="activity" element={<ActivityPage />} />
            <Route path="costs" element={<CostsPage />} />
            <Route path="org" element={<OrgChartPage />} />
            <Route path="chains" element={<ChainsPage />} />
            <Route path="agents" element={<AgentsPage />} />
            <Route path="routines" element={<RoutinesPage />} />
            <Route path="brick" element={<BrickOverviewPage />} />
            <Route path="brick/canvas/:id" element={<BrickCanvasPage />} />
            <Route path="brick/blocks" element={<BlockCatalogPage />} />
            <Route path="brick/teams" element={<TeamManagePage />} />
            <Route path="brick/teams/:id" element={<TeamDetailPage />} />
            <Route path="brick/presets" element={<PresetListPage />} />
            <Route path="brick/presets/:id" element={<PresetEditorPage />} />
            <Route path="brick/runs" element={<RunHistoryPage />} />
            <Route path="brick/runs/:id" element={<RunDetailPage />} />
            <Route path="brick/learning" element={<LearningHarnessPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
