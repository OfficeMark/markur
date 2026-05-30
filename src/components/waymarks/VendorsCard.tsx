import { useState } from 'react';
import { AlertCircle, ExternalLink, Mail, Pencil, Plus, Trash2, Truck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  useCreateVendor,
  useDeleteVendor,
  useUpdateVendor,
  useVendors,
} from '@/hooks/useVendors';
import type { Vendor } from '@/types/database';

/**
 * Vendors directory card (M34, Phase 0). Admin-managed suppliers an asset can
 * reference (item 2) and that "Order signs" targets (item 3). Org-scoped; the
 * /admin route gates this to super_admin / building_admin.
 */

const FIELD =
  'h-9 w-full rounded-md border border-black/10 bg-surface px-3 text-sm text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold dark:border-white/10';

export function VendorsCard() {
  const vendors = useVendors();
  const orgId = vendors.orgId;
  const create = useCreateVendor();
  const update = useUpdateVendor();
  const remove = useDeleteVendor();

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Vendor | null>(null);

  async function onAdd() {
    if (!orgId) return;
    if (!name.trim()) {
      setError('A vendor name is required.');
      return;
    }
    setError(null);
    try {
      await create.mutateAsync({ owner_org_id: orgId, name, email, url });
      setName('');
      setEmail('');
      setUrl('');
      setAdding(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the vendor.');
    }
  }

  return (
    <section className="rounded-lg border border-black/10 bg-surface p-5">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
            <Truck size={12} aria-hidden /> Vendors
          </p>
          <h2 className="mt-1 font-semibold text-lg">Suppliers</h2>
          <p className="mt-1 text-xs text-text-muted">
            Suppliers you can attach to a pin (an asset can have more than one)
            and reuse when ordering signs.
          </p>
        </div>
        <Button
          size="sm"
          variant="gold"
          iconLeft={<Plus size={12} aria-hidden />}
          onClick={() => {
            setAdding((v) => !v);
            setError(null);
          }}
          disabled={!orgId}
          className="whitespace-nowrap"
        >
          Add vendor
        </Button>
      </header>

      {!orgId && (
        <p className="mb-3 flex items-start gap-2 rounded-md border border-warning/30 bg-warning-bg px-3 py-2 text-xs text-warning">
          <AlertCircle size={12} aria-hidden className="mt-0.5 shrink-0" />
          <span>You don't have an organization yet. Create a building first.</span>
        </p>
      )}

      {adding && orgId && (
        <div className="mb-4 space-y-2 rounded-md border border-waymarks-gold/40 bg-waymarks-gold-soft p-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Vendor name (e.g. Acme Sign Co.)"
            maxLength={160}
            className={FIELD}
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email (optional)"
            maxLength={200}
            className={FIELD}
          />
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Order link / supplier URL (optional)"
            maxLength={500}
            className={FIELD}
          />
          {error && (
            <p className="flex items-start gap-2 text-xs text-danger">
              <AlertCircle size={12} aria-hidden className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" variant="secondary" onClick={() => setAdding(false)} disabled={create.isPending}>
              Cancel
            </Button>
            <Button size="sm" variant="gold" loading={create.isPending} onClick={() => void onAdd()}>
              Save vendor
            </Button>
          </div>
        </div>
      )}

      {vendors.isLoading && <p className="text-xs text-text-faint">Loading vendors…</p>}
      {!vendors.isLoading && vendors.list.length === 0 && orgId && (
        <p className="text-xs text-text-faint">No vendors yet.</p>
      )}

      <ul className="space-y-1.5">
        {vendors.list.map((v) =>
          editingId === v.id ? (
            <EditRow
              key={v.id}
              vendor={v}
              busy={update.isPending}
              onCancel={() => setEditingId(null)}
              onSave={async (patch) => {
                await update.mutateAsync({ id: v.id, patch });
                setEditingId(null);
              }}
            />
          ) : (
            <li
              key={v.id}
              className="flex items-center gap-3 rounded-md border border-black/5 bg-bg p-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{v.name}</p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-text-muted">
                  {v.email && (
                    <span className="inline-flex items-center gap-1">
                      <Mail size={10} aria-hidden /> {v.email}
                    </span>
                  )}
                  {v.url && (
                    <span className="inline-flex items-center gap-1 text-waymarks-gold">
                      <ExternalLink size={10} aria-hidden /> link
                    </span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingId(v.id)}
                aria-label={`Edit ${v.name}`}
                className="rounded p-1.5 text-text-muted hover:bg-black/5 hover:text-text"
              >
                <Pencil size={14} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setPendingDelete(v)}
                aria-label={`Delete ${v.name}`}
                className="rounded p-1.5 text-text-muted hover:bg-danger/10 hover:text-danger"
              >
                <Trash2 size={14} aria-hidden />
              </button>
            </li>
          )
        )}
      </ul>

      {pendingDelete && (
        <ConfirmDelete
          title={`Delete ${pendingDelete.name}?`}
          body="This vendor will be removed from the directory and unlinked from any pins that referenced it."
          busy={remove.isPending}
          onCancel={() => setPendingDelete(null)}
          onConfirm={async () => {
            await remove.mutateAsync(pendingDelete.id);
            setPendingDelete(null);
          }}
        />
      )}
    </section>
  );
}

function EditRow(props: {
  vendor: Vendor;
  busy: boolean;
  onCancel: () => void;
  onSave: (patch: { name: string; email: string | null; url: string | null }) => void | Promise<void>;
}) {
  const [name, setName] = useState(props.vendor.name);
  const [email, setEmail] = useState(props.vendor.email ?? '');
  const [url, setUrl] = useState(props.vendor.url ?? '');
  return (
    <li className="space-y-2 rounded-md border border-waymarks-gold/40 bg-waymarks-gold-soft p-3">
      <input value={name} onChange={(e) => setName(e.target.value)} maxLength={160} className={FIELD} />
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email (optional)"
        maxLength={200}
        className={FIELD}
      />
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Order link / supplier URL (optional)"
        maxLength={500}
        className={FIELD}
      />
      <div className="flex justify-end gap-2 pt-1">
        <Button size="sm" variant="secondary" onClick={props.onCancel} disabled={props.busy}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="gold"
          loading={props.busy}
          disabled={!name.trim()}
          onClick={() =>
            void props.onSave({
              name: name.trim(),
              email: email.trim() || null,
              url: url.trim() || null,
            })
          }
        >
          Save
        </Button>
      </div>
    </li>
  );
}

function ConfirmDelete(props: {
  title: string;
  body: string;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-lg border border-black/10 bg-surface p-5 shadow-lg">
        <h3 className="font-semibold text-lg">{props.title}</h3>
        <p className="mt-2 text-sm text-text-muted">{props.body}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={props.onCancel} disabled={props.busy}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="danger"
            loading={props.busy}
            onClick={props.onConfirm}
            iconLeft={<Trash2 size={12} aria-hidden />}
          >
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}
