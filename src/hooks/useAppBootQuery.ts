import { useQuery, type QueryClient } from '@tanstack/react-query';
import { getAppBoot, type AppBoot } from '@/lib/queries/bundles';
import { useAuth } from '@/lib/auth-context';

/**
 * The single get_app_boot query. Every consumer (useAppBoot's seeding wrapper,
 * useBuildings, useOrgBranding, useAssetTypes, useOrgSubscription, the org
 * picker, the permissions provider) calls THIS, so they all share one fetch and
 * one reactive cache entry — and crucially they get the REAL loading state.
 *
 * This lives in its own module (importing only getAppBoot + useAuth) so the
 * per-table hooks can read app_boot without the import cycle they'd hit going
 * through useBundles (which imports their query keys to seed caches).
 */
export const APP_BOOT_KEY = ['app-boot'] as const;

export function useAppBootRaw() {
  const { user } = useAuth();
  return useQuery({
    queryKey: APP_BOOT_KEY,
    queryFn: getAppBoot,
    enabled: !!user,
    staleTime: 5 * 60_000,
  });
}

/**
 * Patch the cached app_boot IN PLACE after an edit, instead of invalidating it.
 * Invalidating refetched the whole boot payload AND re-ran the seeding effect
 * (dozens of setQueryData) → a re-render storm across every subscriber on every
 * building/floor/branding edit. Patching just the changed entry keeps the UI
 * fresh with no refetch — same pattern useAssets uses for pins. No-op until the
 * bundle is loaded.
 */
export function patchAppBoot(qc: QueryClient, fn: (boot: AppBoot) => AppBoot): void {
  qc.setQueryData<AppBoot>(APP_BOOT_KEY, (old) => (old ? fn(old) : old));
}
