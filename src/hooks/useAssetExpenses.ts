import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createExpense,
  deleteExpense,
  listExpensesForAsset,
  type CreateExpenseInput,
} from '@/lib/queries/expenses';
import { getExpenseReport } from '@/lib/queries/expense-report';

export const expenseKeys = {
  all: ['asset_expenses'] as const,
  forAsset: (assetId: string) => [...expenseKeys.all, 'by-asset', assetId] as const,
  report: (buildingId: string, from: string, to: string) =>
    ['expense_report', buildingId, from, to] as const,
};

/**
 * One asset's expenses. Fetched on drawer open (enabled by assetId) — never
 * part of the floor-open cascade, so it doesn't regress floor load.
 */
export function useAssetExpenses(assetId: string | undefined) {
  return useQuery({
    queryKey: assetId ? expenseKeys.forAsset(assetId) : [...expenseKeys.all, 'none'],
    queryFn: () => (assetId ? listExpensesForAsset(assetId) : Promise.resolve([])),
    enabled: !!assetId,
  });
}

export function useAddAssetExpense(assetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateExpenseInput) => createExpense(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: expenseKeys.forAsset(assetId) });
      qc.invalidateQueries({ queryKey: ['expense_report'] });
    },
  });
}

export function useDeleteAssetExpense(assetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteExpense(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: expenseKeys.forAsset(assetId) });
      qc.invalidateQueries({ queryKey: ['expense_report'] });
    },
  });
}

/**
 * Building expense report for a date range (one RPC call). `enabled` lets the
 * report screen defer the call until a building + range are chosen.
 */
export function useExpenseReport(
  buildingId: string | undefined,
  from: string,
  to: string,
  enabled: boolean
) {
  return useQuery({
    queryKey:
      buildingId && enabled
        ? expenseKeys.report(buildingId, from, to)
        : ['expense_report', 'none'],
    queryFn: () =>
      buildingId ? getExpenseReport(buildingId, from, to) : Promise.reject(new Error('no building')),
    enabled: !!buildingId && enabled,
    staleTime: 30_000,
  });
}
