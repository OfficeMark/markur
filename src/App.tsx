import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { ThemeProvider } from '@/components/waymarks/ThemeProvider';
import { AuthProvider } from '@/lib/AuthProvider';
import { PermissionsProvider } from '@/lib/PermissionsProvider';
import { Home } from '@/routes/Home';
import { ProtectedRoute } from '@/routes/ProtectedRoute';
import { OfflineSync } from '@/components/waymarks/OfflineSync';
import { ErrorBoundary } from '@/components/waymarks/ErrorBoundary';
import { CookieConsent } from '@/components/waymarks/CookieConsent';

// Code-splitting (M12): non-critical routes are lazy-loaded so the initial
// bundle stays lean. Floor in particular pulls pdfjs-dist (~1.4 MB raw),
// which used to ship in main.js even when the user never opened a floor.
// Home + ProtectedRoute stay eager because they're hit immediately after
// the auth check.
const Building = lazy(() => import('@/routes/Building').then((m) => ({ default: m.Building })));
const Floor = lazy(() => import('@/routes/Floor').then((m) => ({ default: m.Floor })));
const Login = lazy(() => import('@/routes/Login').then((m) => ({ default: m.Login })));
const Trash = lazy(() => import('@/routes/Trash').then((m) => ({ default: m.Trash })));
const AcceptInvitation = lazy(() =>
  import('@/routes/AcceptInvitation').then((m) => ({ default: m.AcceptInvitation }))
);
const Help = lazy(() => import('@/routes/Help').then((m) => ({ default: m.Help })));
const Settings = lazy(() => import('@/routes/Settings').then((m) => ({ default: m.Settings })));
const Privacy = lazy(() => import('@/routes/Privacy').then((m) => ({ default: m.Privacy })));
const Terms = lazy(() => import('@/routes/Terms').then((m) => ({ default: m.Terms })));

function RouteFallback() {
  return (
    <div className="flex h-[60vh] items-center justify-center text-text-faint">
      <Loader2 size={28} className="animate-spin" aria-hidden />
      <span className="sr-only">Loading...</span>
    </div>
  );
}

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
              <Suspense fallback={<RouteFallback />}>
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
                  <Route path="/accept/:token" element={<AcceptInvitation />} />
                  <Route path="/legal/privacy" element={<Privacy />} />
                  <Route path="/legal/terms" element={<Terms />} />
                </Routes>
              </Suspense>
              <CookieConsent />
            </PermissionsProvider>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
