import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useBuildings } from '@/hooks/useBuildings';
import {
  createContact,
  deleteContact,
  listContactsForOrg,
  updateContact,
  type NewContactInput,
  type UpdateContactPatch,
} from '@/lib/queries/contacts';

/**
 * Contacts directory hook (M34). Org id is derived the same way as
 * useMembers/useAssetTypes: the first building the user can see that carries an
 * owner_org_id. All current data lives under one org, so this is unambiguous.
 */

export const contactKeys = {
  all: ['contacts'] as const,
  byOrg: (orgId: string | null) => [...contactKeys.all, 'by-org', orgId] as const,
};

export function useOrgId(): string | null {
  const { data: buildings } = useBuildings();
  return useMemo<string | null>(() => {
    if (!buildings) return null;
    return buildings.find((b) => b.owner_org_id)?.owner_org_id ?? null;
  }, [buildings]);
}

export function useContacts() {
  const orgId = useOrgId();
  const query = useQuery({
    queryKey: contactKeys.byOrg(orgId),
    queryFn: () => listContactsForOrg(orgId),
    enabled: orgId !== null,
    // Org-level + rarely changes — cache for the session so the Add-asset panel
    // and asset drawer read it warm instead of refetching on every open.
    staleTime: 5 * 60_000,
  });
  return { ...query, orgId, list: query.data ?? [] };
}

export function useCreateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewContactInput) => createContact(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: contactKeys.all }),
  });
}

export function useUpdateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; patch: UpdateContactPatch }) =>
      updateContact(vars.id, vars.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: contactKeys.all }),
  });
}

export function useDeleteContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteContact(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: contactKeys.all }),
  });
}
