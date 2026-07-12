import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { format, subDays } from 'date-fns';
import { AlertCircle, ArrowLeft, Download, Receipt } from 'lucide-react';
import { AppShell } from '@/components/waymarks/AppShell';
import { Button } from '@/components/ui/Button';
import { useBuildings } from '@/hooks/useBuildings';
import { useExpenseReport } from '@/hooks/useAssetExpenses';
import { useCan } from '@/lib/permissions-context';
import { formatCad } from '@/lib/queries/expenses';
import { toCsv, downloadCsv } from '@/lib/csv';
import type { ExpenseReportItem } from '@/lib/queries/expense-report';

/**
 * Building expense report (Feature 2). Pick a building + date range, one
 * `get_expense_report` RPC call, totals split tenant-billable vs building
 * expense, a line-item list, and a client-side CSV export. Editor+ only
 * (RLS returns nothing to others; we also gate the UI).
 */
export function ExpenseReport() {
  const [params, setParams] = useSearchParams();
  const { data: buildings = [] } = useBuildings();

  const sortedBuildings = useMemo(
    () => [...buildings].sort((a, b) => a.name.localeCompare(b.name)),
    [buildings]
  );

  const [buildingId, setBuildingId] = useState<string>(params.get('building') ?? '');
  const [from, setFrom] = useState<string>(format(subDays(new Date(), 90), 'yyyy-MM-dd'));
  const [to, setTo] = useState<string>(format(new Date(), 'yyyy-MM-dd'));

  // Default to the first building once the list loads (if none pre-selected).
  useEffect(() => {
    if (!buildingId && sortedBuildings.length > 0) {
      setBuildingId(sortedBuildings[0]!.id);
    }
  }, [buildingId, sortedBuildings]);

  useEffect(() => {
    document.title = 'Expense report · Markur';
  }, []);

  const canEdit = useCan('edit', { type: 'building', id: buildingId });
  const report = useExpenseReport(buildingId || undefined, from, to, !!buildingId && canEdit);

  const buildingName =
    sortedBuildings.find((b) => b.id === buildingId)?.name ?? 'Building';

  function onPickBuilding(id: string) {
    setBuildingId(id);
    const next = new URLSearchParams(params);
    if (id) next.set('building', id);
    else next.delete('building');
    setParams(next, { replace: true });
  }

  function onExportCsv() {
    const items = report.data?.items ?? [];
    const headers = [
      'Date',
      'Amount (CAD)',
      'Billable to',
      'Invoice ref',
      'Note',
      'Floor',
      'Pin',
      'Asset',
      'Linked to flag',
    ];
    const rows = items.map((it: ExpenseReportItem) => [
      it.expense_date,
      Number(it.amount).toFixed(2),
      it.billable_to,
      it.invoice_ref ?? '',
      it.note ?? '',
      it.floor_label,
      it.pin_number ?? '',
      it.asset_name,
      it.flag_id ? 'yes' : 'no',
    ]);
    const csv = toCsv(headers, rows);
    const stamp = format(new Date(), 'yyyy-MM-dd');
    downloadCsv(`Markur-Expenses-${sanitize(buildingName)}-${from}_to_${to}-${stamp}.csv`, csv);
  }

  const data = report.data;
  const items = data?.items ?? [];
  const inputCls =
    'h-9 rounded-md border border-black/10 bg-surface px-3 text-sm text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold dark:border-white/15';

  return (
    <AppShell>
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <Link
          to="/"
          className="mb-3 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-text-muted transition-colors hover:bg-black/5 hover:text-text dark:hover:bg-white/5"
        >
          <ArrowLeft size={12} aria-hidden />
          <span>Back to Markur</span>
        </Link>

        <header className="mb-5">
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
            <Receipt size={12} aria-hidden /> Expense report
          </p>
          <h1 className="mt-1 font-semibold text-2xl">What signage cost, and what's recoverable</h1>
          <p className="mt-1.5 text-sm text-text-muted">
            Pick a building and date range. Totals split what's billable to tenants
            from building expenses. Amounts in CAD.
          </p>
        </header>

        {/* Controls */}
        <div className="mb-5 flex flex-wrap items-end gap-3 rounded-lg border border-black/10 bg-surface p-4 dark:border-white/10">
          <label className="block">
            <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.14em] text-text-faint">
              Building
            </span>
            <select
              value={buildingId}
              onChange={(e) => onPickBuilding(e.target.value)}
              className={inputCls}
            >
              {sortedBuildings.length === 0 && <option value="">No buildings</option>}
              {sortedBuildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.14em] text-text-faint">
              From
            </span>
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.14em] text-text-faint">
              To
            </span>
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={inputCls} />
          </label>
          <div className="ml-auto">
            <Button
              variant="secondary"
              iconLeft={<Download size={12} aria-hidden />}
              onClick={onExportCsv}
              disabled={items.length === 0}
            >
              Export CSV
            </Button>
          </div>
        </div>

        {!canEdit && buildingId ? (
          <p className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning-bg px-3 py-2 text-sm text-warning">
            <AlertCircle size={14} aria-hidden className="mt-0.5 shrink-0" />
            <span>You don't have access to expenses for this building.</span>
          </p>
        ) : report.isLoading ? (
          <p className="text-sm text-text-faint">Loading…</p>
        ) : report.error ? (
          <p className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-bg px-3 py-2 text-sm text-danger">
            <AlertCircle size={14} aria-hidden className="mt-0.5 shrink-0" />
            <span>Could not load the report: {report.error instanceof Error ? report.error.message : 'Unknown error'}</span>
          </p>
        ) : (
          <>
            {/* Totals */}
            <div className="mb-5 grid gap-3 sm:grid-cols-3">
              <TotalCard label="Tenant-billable" value={formatCad(data?.total_tenant ?? 0)} accent />
              <TotalCard label="Building expense" value={formatCad(data?.total_building ?? 0)} />
              <TotalCard
                label="Total recorded"
                value={formatCad((data?.total_tenant ?? 0) + (data?.total_building ?? 0))}
                hint={`${data?.count ?? 0} expense${(data?.count ?? 0) === 1 ? '' : 's'}`}
              />
            </div>

            {/* Line items */}
            {items.length === 0 ? (
              <p className="rounded-lg border border-black/10 bg-surface px-4 py-8 text-center text-sm text-text-faint dark:border-white/10">
                No expenses recorded for {buildingName} in this range.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
                <table className="w-full min-w-[42rem] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-black/10 bg-surface text-left text-[11px] uppercase tracking-[0.12em] text-text-faint dark:border-white/10">
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Amount</th>
                      <th className="px-3 py-2 font-medium">Billable</th>
                      <th className="px-3 py-2 font-medium">Floor · Pin</th>
                      <th className="px-3 py-2 font-medium">Asset</th>
                      <th className="px-3 py-2 font-medium">Invoice</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.id} className="border-b border-black/5 last:border-0 dark:border-white/5">
                        <td className="whitespace-nowrap px-3 py-2 text-text-muted">{it.expense_date}</td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono font-medium text-text">
                          {formatCad(Number(it.amount))}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={
                              'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ' +
                              (it.billable_to === 'tenant'
                                ? 'bg-waymarks-gold/15 text-waymarks-gold-deep'
                                : 'bg-text-muted/15 text-text-muted')
                            }
                          >
                            {it.billable_to === 'tenant' ? 'Tenant' : 'Building'}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-text-muted">
                          {it.floor_label}
                          {it.pin_number != null ? ` · #${it.pin_number}` : ''}
                        </td>
                        <td className="px-3 py-2 text-text">
                          {it.asset_name}
                          {it.flag_id && <span className="ml-1 text-xs text-danger">⚑</span>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-text-muted">
                          {it.invoice_ref ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

function TotalCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={
        'rounded-lg border p-4 ' +
        (accent
          ? 'border-waymarks-gold/30 bg-waymarks-gold-soft dark:bg-white/5'
          : 'border-black/10 bg-surface dark:border-white/10')
      }
    >
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-text-faint">{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold text-text">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-text-muted">{hint}</p>}
    </div>
  );
}

function sanitize(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '') || 'Building';
}
