import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useOrgId } from '@/hooks/useContacts';
import {
  createVendor,
  deleteVendor,
  listVendorsForOrg,
  updateVendor,
  type NewVendorInput,
  type UpdateVendorPatch,
} from '@/lib/queries/vendors';

/** Vendors directory hook (M34). Shares the org-id derivation with useContacts. */

export const vendorKeys = {
  all: ['vendors'] as const,
  byOrg: (orgId: string | null) => [...vendorKeys.all, 'by-org', orgId] as const,
};

export function useVendors() {
  const orgId = useOrgId();
  const query = useQuery({
    queryKey: vendorKeys.byOrg(orgId),
    queryFn: () => listVendorsForOrg(orgId),
    enabled: orgId !== null,
    staleTime: 30_000,
  });
  return { ...query, orgId, list: query.data ?? [] };
}

export function useCreateVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NewVendorInput) => createVendor(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: vendorKeys.all }),
  });
}

export function useUpdateVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; patch: UpdateVendorPatch }) =>
      updateVendor(vars.id, vars.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: vendorKeys.all }),
  });
}

export function useDeleteVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteVendor(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: vendorKeys.all }),
  });
}
