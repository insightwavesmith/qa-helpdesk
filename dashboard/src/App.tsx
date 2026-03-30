import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/Layout';
import { DashboardPage } from './pages/DashboardPage';
import { TicketsPage } from './pages/TicketsPage';
import { ActivityPage } from './pages/ActivityPage';
import { PlaceholderPage } from './pages/PlaceholderPage';

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
            <Route path="costs" element={<PlaceholderPage title="비용 추적" />} />
            <Route path="org" element={<PlaceholderPage title="조직도" />} />
            <Route path="chains" element={<PlaceholderPage title="체인 편집기" />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
