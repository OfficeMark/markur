import { useState } from 'react';
import { AlertCircle, Building, Mail, Pencil, Plus, Trash2, User } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  useContacts,
  useCreateContact,
  useDeleteContact,
  useUpdateContact,
} from '@/hooks/useContacts';
import type { ContactKind } from '@/lib/queries/contacts';
import type { Contact } from '@/types/database';

/**
 * Contacts directory card (M34, Phase 0). Admin-managed people / departments
 * the org can attach to a pin or flag (item 1) and reuse for "Order signs".
 * Org-scoped; the /admin route already gates this to super_admin / building_admin.
 */

const FIELD =
  'h-9 w-full rounded-md border border-black/10 bg-surface px-3 text-sm text-text outline-none focus:border-waymarks-gold focus:ring-2 focus:ring-waymarks-gold dark:border-white/10';

export function ContactsCard() {
  const contacts = useContacts();
  const orgId = contacts.orgId;
  const create = useCreateContact();
  const update = useUpdateContact();
  const remove = useDeleteContact();

  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<ContactKind>('person');
  const [label, setLabel] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Contact | null>(null);

  async function onAdd() {
    if (!orgId) return;
    if (!label.trim()) {
      setError('A name or department label is required.');
      return;
    }
    setError(null);
    try {
      await create.mutateAsync({ owner_org_id: orgId, kind, label, email });
      setLabel('');
      setEmail('');
      setKind('person');
      setAdding(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the contact.');
    }
  }

  return (
    <section className="rounded-lg border border-black/10 bg-surface p-5">
      <header className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-text-faint">
            <User size={12} aria-hidden /> Contacts
          </p>
          <h2 className="mt-1 font-semibold text-lg">People &amp; departments</h2>
          <p className="mt-1 text-xs text-text-muted">
            Reusable contacts you can attach to a pin or a flag, and reuse when
            ordering signs.
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
          Add contact
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
          <div className="flex gap-2">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as ContactKind)}
              className={FIELD + ' max-w-[9rem]'}
              aria-label="Contact kind"
            >
              <option value="person">Person</option>
              <option value="department">Department</option>
            </select>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={kind === 'person' ? 'e.g. Jane Doe' : 'e.g. Facilities'}
              maxLength={160}
              className={FIELD}
            />
          </div>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email (optional)"
            maxLength={200}
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
              Save contact
            </Button>
          </div>
        </div>
      )}

      {contacts.isLoading && <p className="text-xs text-text-faint">Loading contacts…</p>}
      {!contacts.isLoading && contacts.list.length === 0 && orgId && (
        <p className="text-xs text-text-faint">No contacts yet.</p>
      )}

      <ul className="space-y-1.5">
        {contacts.list.map((c) =>
          editingId === c.id ? (
            <EditRow
              key={c.id}
              contact={c}
              busy={update.isPending}
              onCancel={() => setEditingId(null)}
              onSave={async (patch) => {
                await update.mutateAsync({ id: c.id, patch });
                setEditingId(null);
              }}
            />
          ) : (
            <li
              key={c.id}
              className="flex items-center gap-3 rounded-md border border-black/5 bg-bg p-2"
            >
              <span className="shrink-0 text-text-faint" aria-hidden>
                {c.kind === 'department' ? <Building size={14} /> : <User size={14} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{c.label}</p>
                {c.email && (
                  <p className="flex items-center gap-1 truncate text-xs text-text-muted">
                    <Mail size={10} aria-hidden /> {c.email}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setEditingId(c.id)}
                aria-label={`Edit ${c.label}`}
                className="rounded p-1.5 text-text-muted hover:bg-black/5 hover:text-text"
              >
                <Pencil size={14} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setPendingDelete(c)}
                aria-label={`Delete ${c.label}`}
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
          title={`Delete ${pendingDelete.label}?`}
          body="This contact will be removed from the directory. Any pin or flag that referenced it will simply show no contact."
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
  contact: Contact;
  busy: boolean;
  onCancel: () => void;
  onSave: (patch: { kind: ContactKind; label: string; email: string | null }) => void | Promise<void>;
}) {
  const [kind, setKind] = useState<ContactKind>(props.contact.kind as ContactKind);
  const [label, setLabel] = useState(props.contact.label);
  const [email, setEmail] = useState(props.contact.email ?? '');
  return (
    <li className="space-y-2 rounded-md border border-waymarks-gold/40 bg-waymarks-gold-soft p-3">
      <div className="flex gap-2">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as ContactKind)}
          className={FIELD + ' max-w-[9rem]'}
          aria-label="Contact kind"
        >
          <option value="person">Person</option>
          <option value="department">Department</option>
        </select>
        <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={160} className={FIELD} />
      </div>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email (optional)"
        maxLength={200}
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
          onClick={() =>
            void props.onSave({ kind, label: label.trim(), email: email.trim() || null })
          }
          disabled={!label.trim()}
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
