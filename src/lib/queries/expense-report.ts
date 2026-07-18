import { supabase } from '@/lib/supabase';

/**
 * Building expense report (Feature 2). One `get_expense_report` RPC call
 * returns the totals split (tenant-billable vs building expense), a count, and
 * the line items for a building over a date range. SECURITY INVOKER — RLS
 * applies (anon revoked), so a user only sees expenses they're allowed to.
 */

export type ExpenseReportItem = {
  id: string;
  expense_date: string;
  amount: number;
  billable_to: string;
  invoice_ref: string | null;
  note: string | null;
  flag_id: string | null;
  asset_id: string;
  asset_name: string;
  pin_number: number | null;
  floor_id: string;
  floor_label: string;
};

export type ExpenseReport = {
  total_tenant: number;
  total_building: number;
  count: number;
  items: ExpenseReportItem[];
};

/** `p_from`/`p_to` are inclusive ISO dates ('YYYY-MM-DD'). */
export async function getExpenseReport(
  buildingId: string,
  from: string,
  to: string
): Promise<ExpenseReport> {
  const { data, error } = await supabase.rpc('get_expense_report', {
    p_building_id: buildingId,
    p_from: from,
    p_to: to,
  });
  if (error) throw error;
  // The RPC returns jsonb; normalize numeric fields defensively.
  const r = (data ?? {}) as Partial<ExpenseReport>;
  return {
    total_tenant: Number(r.total_tenant ?? 0),
    total_building: Number(r.total_building ?? 0),
    count: Number(r.count ?? 0),
    items: Array.isArray(r.items) ? (r.items as ExpenseReportItem[]) : [],
  };
}
