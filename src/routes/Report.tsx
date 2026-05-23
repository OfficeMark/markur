import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, FileDown, AlertCircle } from 'lucide-react';
import { useReportData } from '@/hooks/useReportData';
import { useAuth } from '@/lib/auth-context';
import {
  buildReportDoc,
  buildReportSections,
  computeReportStats,
  pickReportSaveTarget,
  reportDownloadName,
  reportTitle,
  writeReport,
  type ReportAssetEntry,
  type ReportFloorSection,
  type ReportMode,
} from '@/lib/audit-report';
import { signedAssetPhotoUrl } from '@/lib/queries/asset-photos';
import { signedFlagPhotoUrl } from '@/lib/queries/flags';
import { photoToJpegDataUrl } from '@/lib/photo-to-data-url';

/**
 * Survey + Audit Report page (audit-report-export #1).
 *
 * - `/reports/:buildingId?mode=survey` — the install register.
 * - `/reports/:buildingId?mode=audit`  — flagged + needs-attention focus.
 *
 * Renders the same data as a browser-readable preview AND as a downloadable
 * PDF (pure jsPDF — see src/lib/audit-report.ts). The preview is the live
 * artifact: editing data and refreshing both views refreshes them together.
 *
 * The preview is intentionally simple HTML; the PDF re-renders the data
 * with jsPDF primitives. They share the section / stats builders so they
 * never disagree on what's in the report.
 */

function parseMode(raw: string | null): ReportMode {
  return raw === 'survey' ? 'survey' : 'audit';
}

export function Report() {
  const { buildingId } = useParams<{ buildingId: string }>();
  const [search] = useSearchParams();
  const mode = parseMode(search.get('mode'));
  const { profile, user } = useAuth();
  const { data: bundle, isLoading, error } = useReportData(buildingId);

  const sections = useMemo<ReportFloorSection[]>(() => {
    if (!bundle) return [];
    return buildReportSections(
      bundle.floors,
      bundle.assetsByFloor,
      bundle.flagsByAsset
    );
  }, [bundle]);

  const stats = useMemo(() => computeReportStats(sections), [sections]);

  const [exportState, setExportState] = useState<'idle' | 'building' | 'error'>('idle');
  const [exportError, setExportError] = useState<string | null>(null);

  const generatedBy = profile?.display_name?.trim() || user?.email || null;

  const handleDownload = useCallback(async () => {
    if (!bundle) return;
    setExportError(null);

    // Open the OS Save dialog up front while the click activation is still
    // live -- photo loading below can take seconds.
    const generatedOn = new Date();
    const suggested = reportDownloadName(bundle.building.name, mode, generatedOn);
    const target = await pickReportSaveTarget(suggested);
    if (target.kind === 'cancelled') return;

    setExportState('building');
    try {
      // Resolve cover photos for every asset that has one.
      const photoEntries = await Promise.all(
        Array.from(bundle.firstPhotoByAsset.entries()).map(async ([assetId, path]) => {
          try {
            const signed = await signedAssetPhotoUrl(path);
            const dataUrl = await photoToJpegDataUrl(signed);
            return [assetId, dataUrl] as const;
          } catch {
            return [assetId, null] as const;
          }
        })
      );
      const photoByAsset = new Map(photoEntries);

      // For Audit mode, resolve flag-evidence photos too.
      const sectionsWithPhotos: ReportFloorSection[] = await Promise.all(
        sections.map(async (section) => ({
          floor: section.floor,
          entries: await Promise.all(
            section.entries.map(async (entry): Promise<ReportAssetEntry> => {
              const photoDataUrl = photoByAsset.get(entry.asset.id) ?? null;
              if (mode !== 'audit' || entry.flags.length === 0) {
                return { ...entry, photoDataUrl };
              }
              const flags = await Promise.all(
                entry.flags.map(async (flag) => {
                  const urls = (Array.isArray(flag.photo_urls)
                    ? (flag.photo_urls as unknown[])
                    : []
                  ).filter((u): u is string => typeof u === 'string');
                  const dataUrls = await Promise.all(
                    urls.map(async (path) => {
                      try {
                        const signed = await signedFlagPhotoUrl(path);
                        return await photoToJpegDataUrl(signed);
                      } catch {
                        return null;
                      }
                    })
                  );
                  return {
                    ...flag,
                    photoDataUrls: dataUrls.filter((u): u is string => u != null),
                  };
                })
              );
              return { ...entry, photoDataUrl, flags };
            })
          ),
        }))
      );

      const doc = buildReportDoc({
        mode,
        building: bundle.building,
        generatedBy,
        generatedOn,
        sections: sectionsWithPhotos,
        stats,
      });
      await writeReport(doc, target, suggested);
      setExportState('idle');
    } catch (e) {
      setExportError(
        e instanceof Error ? e.message : 'Could not build the report PDF.'
      );
      setExportState('error');
    }
  }, [bundle, mode, sections, generatedBy, stats]);

  // Keep the browser tab title in sync so the user can find this tab if they
  // open both Survey and Audit reports at once.
  useEffect(() => {
    if (!bundle) return;
    const t = `${reportTitle(mode)} — ${bundle.building.name}`;
    const prev = document.title;
    document.title = t;
    return () => {
      document.title = prev;
    };
  }, [bundle, mode]);

  if (isLoading) {
    return (
      <ReportShell mode={mode}>
        <div className="mx-auto max-w-3xl py-16 text-center text-sm text-text-muted">
          Loading report…
        </div>
      </ReportShell>
    );
  }

  if (error || !bundle) {
    return (
      <ReportShell mode={mode}>
        <div className="mx-auto max-w-3xl py-16 text-center">
          <h1 className="font-semibold text-2xl text-text">Report not available</h1>
          <p className="mt-2 text-sm text-text-muted">
            The building may have been removed, or you may not have access.
          </p>
          <Link
            to="/"
            className="mt-6 inline-flex items-center gap-1 text-sm text-waymarks-gold hover:underline"
          >
            <ArrowLeft size={14} aria-hidden /> Back to buildings
          </Link>
        </div>
      </ReportShell>
    );
  }

  return (
    <ReportShell mode={mode}>
      <article className="mx-auto max-w-[820px] bg-white px-8 py-10 text-[#1d1b1a] shadow-sm print:shadow-none print:max-w-none print:px-0 print:py-0">
        {/* Toolbar — hidden on print. Keep the Download button prominent so the
            user can save before they read; the preview below is just confirmation. */}
        <div className="report-toolbar mb-8 flex flex-wrap items-center justify-between gap-3 border-b border-black/10 pb-4 print:hidden">
          <div className="flex items-center gap-3">
            <Link
              to={`/buildings/${bundle.building.id}`}
              className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text"
            >
              <ArrowLeft size={12} aria-hidden /> Back to building
            </Link>
            <span className="text-xs text-text-faint">
              {reportTitle(mode)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleDownload()}
              disabled={exportState === 'building'}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-waymarks-gold px-3 text-xs font-medium text-waymarks-ink hover:bg-waymarks-gold-deep disabled:opacity-60"
            >
              <FileDown size={12} aria-hidden />
              {exportState === 'building' ? 'Preparing PDF…' : 'Download PDF'}
            </button>
          </div>
        </div>
        {exportError && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-2 rounded-md border border-warning/40 bg-warning-bg px-3 py-2 text-xs text-warning print:hidden"
          >
            <AlertCircle size={12} aria-hidden className="mt-0.5 shrink-0" />
            <span>Could not build the PDF: {exportError}</span>
          </div>
        )}

        <ReportCover
          mode={mode}
          buildingName={bundle.building.name}
          addressLine={formatAddress(bundle.building.address, bundle.building.city, bundle.building.region)}
          generatedOn={new Date()}
          generatedBy={generatedBy}
        />

        <ReportSummary mode={mode} sections={sections} stats={stats} />

        {sections.map((section) => (
          <ReportFloor
            key={section.floor.id}
            section={section}
            mode={mode}
            photoPaths={bundle.firstPhotoByAsset}
          />
        ))}
      </article>
    </ReportShell>
  );
}

function ReportShell({
  mode,
  children,
}: {
  mode: ReportMode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="min-h-screen bg-waymarks-cream py-8 print:bg-white print:py-0"
      data-report-mode={mode}
    >
      {children}
    </div>
  );
}

function ReportCover({
  mode,
  buildingName,
  addressLine,
  generatedOn,
  generatedBy,
}: {
  mode: ReportMode;
  buildingName: string;
  addressLine: string | null;
  generatedOn: Date;
  generatedBy: string | null;
}) {
  return (
    <header className="mb-10 border-t-[6px] border-waymarks-gold pt-8 print:break-after-page">
      <h1 className="text-4xl font-bold leading-tight">{reportTitle(mode)}</h1>
      <p className="mt-3 text-xl">{buildingName}</p>
      {addressLine && <p className="mt-1 text-sm text-text-muted">{addressLine}</p>}
      <dl className="mt-10 grid grid-cols-2 gap-y-3 text-sm">
        <dt className="text-[11px] uppercase tracking-wider text-text-faint">
          Report date
        </dt>
        <dt className="text-[11px] uppercase tracking-wider text-text-faint">
          Generated by
        </dt>
        <dd className="text-[#1d1b1a]">
          {generatedOn.toLocaleDateString('en-CA', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </dd>
        <dd className="text-[#1d1b1a]">{generatedBy ?? 'Markur user'}</dd>
      </dl>
    </header>
  );
}

function ReportSummary({
  mode,
  sections,
  stats,
}: {
  mode: ReportMode;
  sections: ReportFloorSection[];
  stats: ReturnType<typeof computeReportStats>;
}) {
  const items: Array<{ label: string; value: number }> = [
    { label: 'Floors', value: sections.length },
    { label: 'Total assets', value: stats.totalAssets },
    { label: 'Signage', value: stats.signageCount },
    { label: 'Facilities', value: stats.facilityCount },
  ];
  if (mode === 'audit') {
    items.push(
      { label: 'Open flags', value: stats.openFlagCount },
      { label: 'Resolved flags', value: stats.resolvedFlagCount },
      { label: 'Needs attention', value: stats.attentionCount },
      { label: 'OK', value: stats.goodCount }
    );
  }
  return (
    <section className="mb-10 border-t border-black/10 pt-8 print:break-after-page">
      <h2 className="text-2xl font-bold">Summary</h2>
      <p className="mt-3 max-w-prose text-sm leading-relaxed">
        {mode === 'audit'
          ? 'This report summarises the current audit state of the building. It includes every flagged asset, the description of each issue raised, and any photo evidence captured during the most recent walkaround.'
          : 'This report is the install record for the building: every asset tracked in Markur, grouped by floor, with cover photos, type, condition, and vendor / supplier information where it has been recorded.'}
      </p>
      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map(({ label, value }) => (
          <div key={label} className="rounded-md border border-black/10 p-3">
            <dt className="text-[10px] uppercase tracking-wider text-text-faint">
              {label}
            </dt>
            <dd className="mt-1 text-2xl font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-6 text-xs uppercase tracking-wider text-text-faint">
        Floors covered
      </p>
      <ul className="mt-2 space-y-1 text-sm">
        {sections.map((s) => (
          <li key={s.floor.id} className="text-text-muted">
            <span className="text-[#1d1b1a]">{s.floor.label}</span>
            <span className="ml-2 text-text-faint">
              {s.entries.length} asset{s.entries.length === 1 ? '' : 's'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReportFloor({
  section,
  mode,
  photoPaths,
}: {
  section: ReportFloorSection;
  mode: ReportMode;
  photoPaths: Map<string, string>;
}) {
  return (
    <section className="mb-10 print:break-before-page">
      <header className="mb-4 flex items-baseline justify-between border-b border-waymarks-gold/60 pb-2">
        <h2 className="text-xl font-bold">{section.floor.label}</h2>
        <span className="text-xs text-text-faint">
          {section.entries.length} asset{section.entries.length === 1 ? '' : 's'}
        </span>
      </header>
      {section.entries.length === 0 ? (
        <p className="text-sm italic text-text-muted">
          No assets recorded on this floor yet.
        </p>
      ) : (
        <ul className="space-y-4">
          {section.entries.map((entry) => (
            <ReportEntry
              key={entry.asset.id}
              entry={entry}
              mode={mode}
              photoPath={photoPaths.get(entry.asset.id) ?? null}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function ReportEntry({
  entry,
  mode,
  photoPath,
}: {
  entry: ReportAssetEntry;
  mode: ReportMode;
  photoPath: string | null;
}) {
  const v = entry.asset.vendor_contact as
    | { name?: string | null; company?: string | null; url?: string | null }
    | null
    | undefined;
  const vendorParts = v ? [v.company, v.name, v.url].filter(Boolean) : [];
  return (
    <li className="rounded-md border border-black/10 p-3 print:break-inside-avoid">
      <div className="flex items-start gap-4">
        <ReportPhoto photoPath={photoPath} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 min-w-[44px] items-center justify-center rounded bg-[#1d1b1a] px-2 text-xs font-bold text-white">
              #{entry.pinLabel}
            </span>
            <span className="truncate text-sm font-semibold">
              {entry.asset.name?.trim() || 'Untitled'}
            </span>
          </div>
          <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-xs text-text-muted">
            <dt>Type</dt>
            <dd className="text-[#1d1b1a]">{entry.typeLabel}</dd>
            <dt>Condition</dt>
            <dd className="text-[#1d1b1a]">{entry.conditionLabel}</dd>
            {entry.asset.location_notes?.trim() && (
              <>
                <dt>Location</dt>
                <dd className="text-[#1d1b1a]">{entry.asset.location_notes}</dd>
              </>
            )}
            {mode === 'survey' && vendorParts.length > 0 && (
              <>
                <dt>Vendor</dt>
                <dd className="text-[#1d1b1a]">{vendorParts.join(' · ')}</dd>
              </>
            )}
          </dl>
        </div>
      </div>
      {mode === 'audit' && entry.flags.length > 0 && (
        <ul className="mt-3 space-y-2">
          {entry.flags.map((flag) => {
            const isOpen = flag.status !== 'resolved' && !flag.resolved_at;
            return (
              <li
                key={flag.id}
                className={
                  'rounded-md border px-3 py-2 text-xs ' +
                  (isOpen
                    ? 'border-waymarks-gold/60 bg-waymarks-gold-soft'
                    : 'border-black/10 bg-black/[0.03]')
                }
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold uppercase tracking-wider">
                    {isOpen ? 'Flagged' : 'Resolved'}
                  </span>
                  {flag.created_at && (
                    <span className="text-text-faint">
                      {new Date(flag.created_at).toLocaleDateString('en-CA')}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[#1d1b1a]">
                  {flag.description || '(no description)'}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

function ReportPhoto({ photoPath }: { photoPath: string | null }) {
  // The bundle already gave us the storage path for each asset's first photo;
  // we only need to sign it. signedAssetPhotoUrl returns a 30-min URL, which is
  // plenty for the lifetime of a single report view.
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!photoPath) {
      setMissing(true);
      setUrl(null);
      return;
    }
    setMissing(false);
    void signedAssetPhotoUrl(photoPath)
      .then((signed) => {
        if (!cancelled) setUrl(signed);
      })
      .catch(() => {
        if (!cancelled) setMissing(true);
      });
    return () => {
      cancelled = true;
    };
  }, [photoPath]);

  if (missing) {
    return (
      <div className="flex h-20 w-28 shrink-0 items-center justify-center rounded bg-black/5 text-[10px] text-text-faint">
        No photo
      </div>
    );
  }
  if (!url) {
    return (
      <div className="h-20 w-28 shrink-0 animate-pulse rounded bg-black/5" aria-hidden />
    );
  }
  return (
    <img
      src={url}
      alt=""
      className="h-20 w-28 shrink-0 rounded object-cover"
      loading="lazy"
    />
  );
}

function formatAddress(
  address: string | null | undefined,
  city: string | null | undefined,
  region: string | null | undefined
): string | null {
  const bits = [address, city, region].filter(Boolean);
  return bits.length > 0 ? bits.join(', ') : null;
}
