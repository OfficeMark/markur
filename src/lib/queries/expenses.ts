import { supabase } from '@/lib/supabase';
import type { AssetExpense } from '@/types/database';

/**
 * Read/write helpers for `public.asset_expenses` — what a sign or repair cost,
 * and whether it's recoverable from the tenant or a building expense. Thin by
 * design (Feature 2): no budgets, approvals, categories, or tax. CAD only.
 *
 * Isolation is derived server-side (asset → floor → building → owner_org) via
 * RLS — there is NO organization_id column, so we insert asset-level fields
 * only. RLS: visible/addable/editable with `edit` on the building; delete is
 * admin-only. created_by defaults to auth.uid() server-side.
 */

export const BILLABLE_TO = ['tenant', 'building'] as const;
export type BillableTo = (typeof BILLABLE_TO)[number];

export function isBillableTo(v: unknown): v is BillableTo {
  return v === 'tenant' || v === 'building';
}

/** CAD is hard-coded (Feature 2 — no multi-currency). */
export function formatCad(amount: number): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(amount);
}

export const BILLABLE_LABEL: Record<BillableTo, string> = {
  tenant: 'Tenant-billable',
  building: 'Building expense',
};

/** One asset's expenses, newest first. */
export async function listExpensesForAsset(assetId: string): Promise<AssetExpense[]> {
  const { data, error } = await supabase
    .from('asset_expenses')
    .select('*')
    .eq('asset_id', assetId)
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export type CreateExpenseInput = {
  asset_id: string;
  amount: number;
  /** ISO date, 'YYYY-MM-DD'. */
  expense_date: string;
  billable_to: BillableTo;
  invoice_ref?: string | null;
  note?: string | null;
  /** Optional link to the flag this expense settles. */
  flag_id?: string | null;
};

export async function createExpense(input: CreateExpenseInput): Promise<AssetExpense> {
  const { data, error } = await supabase
    .from('asset_expenses')
    .insert({
      asset_id: input.asset_id,
      amount: input.amount,
      expense_date: input.expense_date,
      billable_to: input.billable_to,
      invoice_ref: input.invoice_ref?.trim() || null,
      note: input.note?.trim() || null,
      flag_id: input.flag_id ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/** Delete an expense (admin-only per RLS). Hard delete — logged by trigger. */
export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabase.from('asset_expenses').delete().eq('id', id);
  if (error) throw error;
}
