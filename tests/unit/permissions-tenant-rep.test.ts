import { describe, expect, it } from 'vitest';
import { checkCapability, type Grant } from '@/lib/permissions-types';

const NEVER_EXPIRES = null;

function tenantRepGrant(tenantId: string): Grant {
  return {
    id: `g-${tenantId}`,
    role: 'tenant_rep',
    scope_type: 'tenant',
    scope_id: tenantId,
    expires_at: NEVER_EXPIRES,
  };
}

describe('checkCapability — tenant_rep capability matrix', () => {
  const grants = [tenantRepGrant('t-suite-304')];

  it('can view their tenant', () => {
    expect(
      checkCapability(grants, 'view', { type: 'tenant', id: 't-suite-304' })
    ).toBe(true);
  });

  it('cannot view a different tenant', () => {
    expect(
      checkCapability(grants, 'view', { type: 'tenant', id: 't-suite-305' })
    ).toBe(false);
  });

  it('can flag (their tenant)', () => {
    expect(
      checkCapability(grants, 'flag', { type: 'tenant', id: 't-suite-304' })
    ).toBe(true);
  });

  it('cannot edit, reposition, delete, audit, or upload', () => {
    for (const cap of ['edit', 'reposition', 'delete', 'audit', 'upload_plan'] as const) {
      expect(
        checkCapability(grants, cap, { type: 'tenant', id: 't-suite-304' })
      ).toBe(false);
    }
  });

  it('cannot manage_access', () => {
    expect(
      checkCapability(grants, 'manage_access', { type: 'tenant', id: 't-suite-304' })
    ).toBe(false);
  });
});

describe('checkCapability — expired grants are inert', () => {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  it('expired tenant_rep grant returns false', () => {
    const grants: Grant[] = [
      {
        id: 'g-expired',
        role: 'tenant_rep',
        scope_type: 'tenant',
        scope_id: 't-1',
        expires_at: yesterday,
      },
    ];
    expect(checkCapability(grants, 'view', { type: 'tenant', id: 't-1' })).toBe(false);
    expect(checkCapability(grants, 'flag', { type: 'tenant', id: 't-1' })).toBe(false);
  });

  it('expired auditor grant returns false', () => {
    const grants: Grant[] = [
      {
        id: 'g-aud-expired',
        role: 'auditor',
        scope_type: 'floor',
        scope_id: 'f-1',
        expires_at: yesterday,
      },
    ];
    expect(checkCapability(grants, 'audit', { type: 'floor', id: 'f-1' })).toBe(false);
    expect(checkCapability(grants, 'view', { type: 'floor', id: 'f-1' })).toBe(false);
  });

  it('a future expiry is honored as still-active', () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const grants: Grant[] = [
      {
        id: 'g-future',
        role: 'auditor',
        scope_type: 'floor',
        scope_id: 'f-1',
        expires_at: tomorrow,
      },
    ];
    expect(checkCapability(grants, 'audit', { type: 'floor', id: 'f-1' })).toBe(true);
  });
});

describe('checkCapability — building_admin scope isolation', () => {
  const grants: Grant[] = [
    {
      id: 'g-1',
      role: 'building_admin',
      scope_type: 'building',
      scope_id: 'building-A',
      expires_at: null,
    },
  ];

  it('admin on building A can edit building A', () => {
    expect(
      checkCapability(grants, 'edit', { type: 'building', id: 'building-A' })
    ).toBe(true);
  });

  it('admin on building A cannot edit building B', () => {
    expect(
      checkCapability(grants, 'edit', { type: 'building', id: 'building-B' })
    ).toBe(false);
  });
});

describe('checkCapability — auditor scope isolation', () => {
  const grants: Grant[] = [
    {
      id: 'g-1',
      role: 'auditor',
      scope_type: 'floor',
      scope_id: 'floor-2',
      expires_at: null,
    },
  ];

  it('auditor on floor 2 can audit floor 2', () => {
    expect(
      checkCapability(grants, 'audit', { type: 'floor', id: 'floor-2' })
    ).toBe(true);
  });

  it('auditor on floor 2 cannot edit floor 2', () => {
    expect(
      checkCapability(grants, 'edit', { type: 'floor', id: 'floor-2' })
    ).toBe(false);
  });

  it('auditor on floor 2 cannot view floor 3', () => {
    expect(
      checkCapability(grants, 'view', { type: 'floor', id: 'floor-3' })
    ).toBe(false);
  });
});
