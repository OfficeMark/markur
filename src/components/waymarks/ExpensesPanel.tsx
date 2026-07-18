import { useState } from 'react';
import { format } from 'date-fns';
import { AlertCircle, Flag, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  useAddAssetExpense,
  useAssetExpenses,
  useDeleteAssetExpense,
} from '@/hooks/useAssetExpenses';
import { useFlagsForAsset } from '@/hooks/useFlags';
import { BILLABLE_LABEL, formatCad, type BillableTo } from '@/lib/queries/expenses';

/**
 * Expenses section on the pin detail sheet (Feature 2). Editor+ only (the
 * whole band is hidden otherwise). Lists an asset's expenses and adds new ones;
 * delete is admin-only. An expense can be linked to one of the asset's flags.
 *
 * Fetched on drawer open (useAssetExpenses / useFlagsForAsset) — never part of
 * the floor-open cascade.
 */
export function ExpensesPanel({
  assetId,
  canEdit,
  canDelete,
  flagContextId,
}: {
  assetId: string;
  canEdit: boolean;
  canDelete: boolean;
  /** Pre-select this flag when adding from a flag context. */
  flagContextId?: string | null;
}) {
  const list = useAssetExpenses(assetId);
  const flags = useFlagsForAsset(assetId);
  const add = useAddAssetExpense(assetId);
  const del = useDeleteAssetExpense(assetId);

  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [billableTo, setBillableTo] = useState<BillableTo>('tenant');
  const [invoiceRef, setInvoiceRef] = useState('');
  const [note, setNote] = useState('');
  const [flagId, setFlagId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const expenses = list.data ?? [];
  const flagList = flags.data ?? [];
  const total = expenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const flagById = new Map(flagList.map((f) => [f.id, f]));

  function openForm() {
    setAmount('');
    setDate(format(new Date(), 'yyyy-MM-dd'));
    setBillableTo('tenant');
    setInvoiceRef('');
    setNote('');
    setFlagId(flagContextId ?? '');
    setError(null);
    setAdding(true);
  }

  function closeForm() {
    setAdding(false);
    setError(null);
  }

  async function onAdd() {
    const parsed = Number(amount);
    if (!amount.trim() || Number.isNaN(parsed) || parsed < 0) {
      setError('Enter an amount of 0 or more.');
      return;
    }
    setError(null);
    try {
      await add.mutateAsync({
        asset_id: assetId,
        amount: parsed,
        expense_date: date,
        billable_to: billableTo,
        invoice_ref: invoiceRef,
        note,
        flag_id: flagId || null,
      });
      closeForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the expense.');
    }
  }

  const inputCls =
    'h-9 w-full rounded-md border border-black/10 bg-surface px-3 text-sm text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold';

  return (
    <div className="space-y-2 rounded-md border border-black/10 bg-bg p-2.5 dark:border-white/10">
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium uppercase tracking-[0.14em] text-[10px] text-text-faint">
          Expenses
        </p>
        {expenses.length > 0 && (
          <p className="font-mono text-xs text-text-muted">{formatCad(total)} total</p>
        )}
      </div>

      {list.isLoading ? (
        <p className="text-xs text-text-faint">Loading…</p>
      ) : expenses.length === 0 && !adding ? (
        <p className="text-xs text-text-faint">No expenses recorded.</p>
      ) : (
        <ul className="space-y-1.5">
          {expenses.map((e) => {
            const linkedFlag = e.flag_id ? flagById.get(e.flag_id) : null;
            return (
              <li
                key={e.id}
                className="flex items-start justify-between gap-2 rounded-md bg-surface px-2.5 py-1.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-text">
                      {formatCad(Number(e.amount))}
                    </span>
                    <BillableChip value={e.billable_to} />
                  </div>
                  <p className="mt-0.5 text-xs text-text-faint">
                    {e.expense_date}
                    {e.invoice_ref ? ` · Ref ${e.invoice_ref}` : ''}
                  </p>
                  {e.note && <p className="mt-0.5 text-xs text-text-muted">{e.note}</p>}
                  {e.flag_id && (
                    <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-danger">
                      <Flag size={11} aria-hidden />
                      {linkedFlag
                        ? `Linked to flag: ${truncate(linkedFlag.description, 40)}`
                        : 'Linked to a flag'}
                    </p>
                  )}
                </div>
                {canDelete &&
                  (confirmDeleteId === e.id ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        size="sm"
                        variant="danger"
                        loading={del.isPending}
                        onClick={async () => {
                          try {
                            await del.mutateAsync(e.id);
                          } finally {
                            setConfirmDeleteId(null);
                          }
                        }}
                      >
                        Delete
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(e.id)}
                      aria-label="Delete expense"
                      className="shrink-0 rounded p-1 text-text-muted hover:bg-danger/10 hover:text-danger"
                    >
                      <Trash2 size={12} aria-hidden />
                    </button>
                  ))}
              </li>
            );
          })}
        </ul>
      )}

      {canEdit && !adding && (
        <button
          type="button"
          onClick={openForm}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-dashed border-black/15 bg-bg px-3 text-xs font-medium text-text-muted transition-colors hover:border-waymarks-gold hover:text-waymarks-gold dark:border-white/15"
        >
          <Plus size={12} aria-hidden />
          Add expense
        </button>
      )}

      {canEdit && adding && (
        <div className="space-y-2.5 rounded-md border border-waymarks-gold/40 bg-surface p-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.14em] text-text-faint">
                Amount (CAD)
              </span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                // eslint-disable-next-line jsx-a11y/no-autofocus -- focuses when the inline form opens
                autoFocus
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.14em] text-text-faint">
                Date
              </span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputCls}
              />
            </label>
          </div>

          <div>
            <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.14em] text-text-faint">
              Billable to
            </span>
            <div role="radiogroup" className="inline-flex rounded-md border border-black/10 p-0.5 dark:border-white/15">
              {(['tenant', 'building'] as const).map((b) => (
                <button
                  key={b}
                  type="button"
                  role="radio"
                  aria-checked={billableTo === b}
                  onClick={() => setBillableTo(b)}
                  className={
                    'rounded-[5px] px-3 py-1 text-xs transition-colors ' +
                    (billableTo === b
                      ? 'bg-waymarks-ink text-white'
                      : 'text-text-muted hover:text-text')
                  }
                >
                  {BILLABLE_LABEL[b]}
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.14em] text-text-faint">
              Invoice ref (optional)
            </span>
            <input
              type="text"
              value={invoiceRef}
              onChange={(e) => setInvoiceRef(e.target.value)}
              maxLength={120}
              placeholder="e.g. INV-1042"
              className={inputCls}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.14em] text-text-faint">
              Note (optional)
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={2000}
              rows={2}
              placeholder="What was this for?"
              className="w-full rounded-md border border-black/10 bg-surface px-3 py-2 text-sm text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold"
            />
          </label>

          {flagList.length > 0 && (
            <label className="block">
              <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.14em] text-text-faint">
                Link to flag (optional)
              </span>
              <select
                value={flagId}
                onChange={(e) => setFlagId(e.target.value)}
                className={inputCls}
              >
                <option value="">Not linked</option>
                {flagList.map((f) => (
                  <option key={f.id} value={f.id}>
                    {truncate(f.description, 60)}
                  </option>
                ))}
              </select>
            </label>
          )}

          {error && (
            <p className="flex items-start gap-1.5 rounded-md border border-danger/30 bg-danger-bg px-2.5 py-1.5 text-xs text-danger">
              <AlertCircle size={12} aria-hidden className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="secondary"
              iconLeft={<X size={12} aria-hidden />}
              onClick={closeForm}
              disabled={add.isPending}
            >
              Cancel
            </Button>
            <Button size="sm" variant="gold" loading={add.isPending} onClick={() => void onAdd()}>
              Save expense
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function BillableChip({ value }: { value: string }) {
  const isTenant = value === 'tenant';
  const label = value === 'tenant' || value === 'building' ? BILLABLE_LABEL[value] : value;
  return (
    <span
      className={
        'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ' +
        (isTenant
          ? 'bg-waymarks-gold/15 text-waymarks-gold-deep'
          : 'bg-text-muted/15 text-text-muted')
      }
    >
      {label}
    </span>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}
