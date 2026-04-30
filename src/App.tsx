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
import { Help } from '@/routes/Help';
import { Settings } from '@/routes/Settings';
import { Privacy } from '@/routes/Privacy';
import { Terms } from '@/routes/Terms';
import { OfflineSync } from '@/components/waymarks/OfflineSync';
import { ErrorBoundary } from '@/components/waymarks/ErrorBoundary';
import { CookieConsent } from '@/components/waymarks/CookieConsent';

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
    <ErrorBoundary>
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
                  path="/help"
                  element={
                    <ProtectedRoute>
                      <Help />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/settings"
                  element={
                    <ProtectedRoute>
                      <Settings />
                    </ProtectedRoute>
                  }
                />
                <Route
                  path="/accept/:token"
                  element={<AcceptInvitation />}
                />
                <Route path="/legal/privacy" element={<Privacy />} />
                <Route path="/legal/terms" element={<Terms />} />
              </Routes>
              <CookieConsent />
            </PermissionsProvider>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
