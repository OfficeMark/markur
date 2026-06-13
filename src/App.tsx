import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as RadixTooltip from '@radix-ui/react-tooltip';
import { AlertCircle, Loader2 } from 'lucide-react';
import { ThemeProvider } from '@/components/waymarks/ThemeProvider';
import { AuthProvider } from '@/lib/AuthProvider';
import { PermissionsProvider } from '@/lib/PermissionsProvider';
import { ActionHintsProvider } from '@/lib/action-hints-context';
import { Home } from '@/routes/Home';
import { ProtectedRoute } from '@/routes/ProtectedRoute';
import { OfflineSync } from '@/components/waymarks/OfflineSync';
import { ErrorBoundary } from '@/components/waymarks/ErrorBoundary';
import { CookieConsent } from '@/components/waymarks/CookieConsent';
import { handleQueryError, onSessionLost } from '@/lib/queryErrorHandler';

// Code-splitting (M12): non-critical routes are lazy-loaded so the initial
// bundle stays lean. Floor in particular pulls pdfjs-dist (~1.4 MB raw),
// which used to ship in main.js even when the user never opened a floor.
// Home + ProtectedRoute stay eager because they're hit immediately after
// the auth check.
const Building = lazy(() => import('@/routes/Building').then((m) => ({ default: m.Building })));
const Floor = lazy(() => import('@/routes/Floor').then((m) => ({ default: m.Floor })));
const FloorCatalogue = lazy(() =>
  import('@/routes/FloorCatalogue').then((m) => ({ default: m.FloorCatalogue }))
);
const Report = lazy(() => import('@/routes/Report').then((m) => ({ default: m.Report })));
const Login = lazy(() => import('@/routes/Login').then((m) => ({ default: m.Login })));
const ResetPassword = lazy(() =>
  import('@/routes/ResetPassword').then((m) => ({ default: m.ResetPassword }))
);
const Trash = lazy(() => import('@/routes/Trash').then((m) => ({ default: m.Trash })));
const BuildingSettings = lazy(() =>
  import('@/routes/BuildingSettings').then((m) => ({ default: m.BuildingSettings }))
);
const AcceptInvitation = lazy(() =>
  import('@/routes/AcceptInvitation').then((m) => ({ default: m.AcceptInvitation }))
);
const BuildingShare = lazy(() =>
  import('@/routes/BuildingShare').then((m) => ({ default: m.BuildingShare }))
);
const Help = lazy(() => import('@/routes/Help').then((m) => ({ default: m.Help })));
const Settings = lazy(() => import('@/routes/Settings').then((m) => ({ default: m.Settings })));
const Privacy = lazy(() => import('@/routes/Privacy').then((m) => ({ default: m.Privacy })));
const Terms = lazy(() => import('@/routes/Terms').then((m) => ({ default: m.Terms })));

// M15 - Admin section (asset types, members, invitations, security, branding).
// Each pane is its own lazy chunk so the admin tooling never lands in the
// initial bundle for users who never visit /admin.
const Admin = lazy(() => import('@/routes/Admin').then((m) => ({ default: m.Admin })));
const AdminAssetTypesPane = lazy(() => import('@/components/waymarks/admin/AdminAssetTypesPane').then((m) => ({ default: m.AdminAssetTypesPane })));
const AdminMembersPane = lazy(() => import('@/components/waymarks/admin/AdminMembersPane').then((m) => ({ default: m.AdminMembersPane })));
const AdminInvitationsPane = lazy(() => import('@/components/waymarks/admin/AdminInvitationsPane').then((m) => ({ default: m.AdminInvitationsPane })));
const AdminSecurityPane = lazy(() => import('@/components/waymarks/admin/AdminSecurityPane').then((m) => ({ default: m.AdminSecurityPane })));
const AdminBrandingPane = lazy(() => import('@/components/waymarks/admin/AdminBrandingPane').then((m) => ({ default: m.AdminBrandingPane })));
const AdminDirectoryPane = lazy(() => import('@/components/waymarks/admin/AdminDirectoryPane').then((m) => ({ default: m.AdminDirectoryPane })));
const AdminDeletedBuildingsPane = lazy(() => import('@/components/waymarks/admin/AdminDeletedBuildingsPane').then((m) => ({ default: m.AdminDeletedBuildingsPane })));

function RouteFallback() {
  return (
    <div className="flex h-[60vh] items-center justify-center text-text-faint">
      <Loader2 size={28} className="animate-spin" aria-hidden />
      <span className="sr-only">Loading...</span>
    </div>
  );
}

// Global error caches catch the Safari/iOS ITP failure mode (M23): when the
// browser quietly wipes localStorage between requests, the next mutation 401s
// because the JWT is gone. handleQueryError classifies that and triggers
// SessionLostHandler below, which surfaces a banner and redirects to /login.
const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (err) => {
      handleQueryError(err);
    },
  }),
  mutationCache: new MutationCache({
    onError: (err) => {
      handleQueryError(err);
    },
  }),
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

function SessionLostHandler() {
  const navigate = useNavigate();
  const location = useLocation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    return onSessionLost(() => {
      // Already on /login — nothing to redirect to. The user is mid-sign-in
      // and will see their own form-level error.
      if (location.pathname.startsWith('/login')) return;

      setVisible(true);
      const next = location.pathname + location.search;
      const target = `/login?next=${encodeURIComponent(next)}&reason=session-expired`;
      // Brief banner, then redirect — gives the user context for the bounce
      // instead of a silent kick to login.
      window.setTimeout(() => {
        setVisible(false);
        navigate(target, { replace: true });
      }, 1500);
    });
  }, [location.pathname, location.search, navigate]);

  if (!visible) return null;
  return (
    <div
      role="alert"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-[60] flex justify-center px-4 py-3"
    >
      <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning-bg px-4 py-3 text-sm text-warning shadow-md">
        <AlertCircle size={16} aria-hidden className="mt-0.5 shrink-0" />
        <span>Your session expired. Redirecting to sign in…</span>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AuthProvider>
            <PermissionsProvider>
              {/* M32 Step 2: ActionHintsProvider reads profile.show_action_hints
                  for the signed-in user; RadixTooltip.Provider provides the
                  unified hover-delay machinery our <Tooltip> primitive uses.
                  Both must wrap every route that contains tooltipped buttons. */}
              <ActionHintsProvider>
                <RadixTooltip.Provider delayDuration={400} skipDelayDuration={200}>
                  <OfflineSync />
                  <SessionLostHandler />
                  <Suspense fallback={<RouteFallback />}>
                    <Routes>
                  <Route path="/login" element={<Login />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
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
                    path="/buildings/:id/settings"
                    element={
                      <ProtectedRoute>
                        <BuildingSettings />
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
                    path="/floors/:id/catalogue"
                    element={
                      <ProtectedRoute>
                        <FloorCatalogue />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/reports/:buildingId"
                    element={
                      <ProtectedRoute>
                        <Report />
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
                    path="/admin"
                    element={
                      <ProtectedRoute>
                        <Admin />
                      </ProtectedRoute>
                    }
                  >
                    <Route index element={<Navigate to="asset-types" replace />} />
                    <Route path="asset-types" element={<AdminAssetTypesPane />} />
                    <Route path="members" element={<AdminMembersPane />} />
                    <Route path="directory" element={<AdminDirectoryPane />} />
                    <Route path="invitations" element={<AdminInvitationsPane />} />
                    <Route path="security" element={<AdminSecurityPane />} />
                    <Route path="branding" element={<AdminBrandingPane />} />
                    <Route path="deleted-buildings" element={<AdminDeletedBuildingsPane />} />
                  </Route>
                  <Route path="/accept/:token" element={<AcceptInvitation />} />
                  <Route path="/share/:token" element={<BuildingShare />} />
                  <Route path="/legal/privacy" element={<Privacy />} />
                  <Route path="/legal/terms" element={<Terms />} />
                    </Routes>
                  </Suspense>
                  <CookieConsent />
                </RadixTooltip.Provider>
              </ActionHintsProvider>
            </PermissionsProvider>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
