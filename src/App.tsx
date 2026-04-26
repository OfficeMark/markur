import { Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/components/waymarks/ThemeProvider';
import { AuthProvider } from '@/lib/AuthProvider';
import { PermissionsProvider } from '@/lib/PermissionsProvider';
import { Home } from '@/routes/Home';
import { Building } from '@/routes/Building';
import { Floor } from '@/routes/Floor';
import { Login } from '@/routes/Login';
import { ProtectedRoute } from '@/routes/ProtectedRoute';
import { Trash } from '@/routes/Trash';
import { AcceptInvitation } from '@/routes/AcceptInvitation';
import { OfflineSync } from '@/components/waymarks/OfflineSync';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stale-while-revalidate is the read pattern (per CLAUDE.md). Defaults
      // are reasonable; per-table tuning lands as we add features.
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <PermissionsProvider>
            <OfflineSync />
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Home />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/buildings/:id"
                element={
                  <ProtectedRoute>
                    <Building />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/buildings/:id/trash"
                element={
                  <ProtectedRoute>
                    <Trash />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/floors/:id"
                element={
                  <ProtectedRoute>
                    <Floor />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/accept/:token"
                element={<AcceptInvitation />}
              />
            </Routes>
          </PermissionsProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
