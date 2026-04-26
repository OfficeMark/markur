import { Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@/components/waymarks/ThemeProvider';
import { AuthProvider } from '@/lib/AuthProvider';
import { PermissionsProvider } from '@/lib/PermissionsProvider';
import { Home } from '@/routes/Home';
import { Login } from '@/routes/Login';
import { ProtectedRoute } from '@/routes/ProtectedRoute';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stale-while-revalidate is the read pattern (per CLAUDE.md). M1 doesn't
      // exercise this much yet — defaults are fine until M2.
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
            </Routes>
          </PermissionsProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
