import { useQuery } from '@tanstack/react-query';
import { fetchReportBundle, type ReportBundle } from '@/lib/queries/report-data';

/**
 * Building-wide bundle used by the Survey + Audit report page.
 *
 * Cached briefly (matches the global staleTime: 30s) so opening Survey then
 * Audit in two tabs doesn't double-fetch. We don't put it through the offline
 * cache - the report is an online-only export action, not an in-the-field
 * read.
 */
export const reportDataKeys = {
  byBuilding: (buildingId: string) => ['report-data', 'by-building', buildingId] as const,
};

export function useReportData(buildingId: string | undefined) {
  return useQuery<ReportBundle | null>({
    queryKey: buildingId
      ? reportDataKeys.byBuilding(buildingId)
      : ['report-data', 'by-building', 'none'],
    queryFn: () =>
      buildingId ? fetchReportBundle(buildingId) : Promise.resolve(null),
    enabled: !!buildingId,
  });
}
