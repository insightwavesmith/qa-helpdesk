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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="tickets" element={<TicketsPage />} />
            <Route path="activity" element={<ActivityPage />} />
            <Route path="costs" element={<CostsPage />} />
            <Route path="org" element={<OrgChartPage />} />
            <Route path="chains" element={<ChainsPage />} />
            <Route path="agents" element={<AgentsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
