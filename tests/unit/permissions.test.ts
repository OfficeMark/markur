import { describe, it, expect } from 'vitest';
import { checkCapability, type Grant } from '@/lib/permissions-types';

const userId = 'user-1';
const buildingId = '11111111-1111-1111-1111-111111111111';
const otherBuildingId = '22222222-2222-2222-2222-222222222222';
const floorId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const tenantId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
void userId;

const grants = (...gs: Partial<Grant>[]): Grant[] =>
  gs.map((g, i) => ({
    id: `g-${i}`,
    role: 'building_admin',
    scope_type: 'building',
    scope_id: null,
    expires_at: null,
    ...g,
  }));

describe('checkCapability', () => {
  it('returns false with no grants', () => {
    expect(checkCapability([], 'view', { type: 'building', id: buildingId })).toBe(false);
  });

  it('super_admin has every capability everywhere', () => {
    const g = grants({ role: 'super_admin', scope_type: 'global', scope_id: null });
    expect(checkCapability(g, 'view', { type: 'building', id: buildingId })).toBe(true);
    expect(checkCapability(g, 'delete', { type: 'asset', id: 'asset-1' })).toBe(true);
    expect(checkCapability(g, 'manage_access', { type: 'global' })).toBe(true);
  });

  it('building_admin can edit their building', () => {
    const g = grants({ role: 'building_admin', scope_type: 'building', scope_id: buildingId });
    expect(checkCapability(g, 'edit', { type: 'building', id: buildingId })).toBe(true);
    expect(checkCapability(g, 'configure', { type: 'building', id: buildingId })).toBe(true);
  });

  it('building_admin cannot affect a different building', () => {
    const g = grants({ role: 'building_admin', scope_type: 'building', scope_id: buildingId });
    expect(checkCapability(g, 'edit', { type: 'building', id: otherBuildingId })).toBe(false);
  });

  it('auditor on a floor can audit and flag, not edit', () => {
    const g = grants({ role: 'auditor', scope_type: 'floor', scope_id: floorId });
    expect(checkCapability(g, 'audit', { type: 'floor', id: floorId })).toBe(true);
    expect(checkCapability(g, 'flag', { type: 'floor', id: floorId })).toBe(true);
    expect(checkCapability(g, 'edit', { type: 'floor', id: floorId })).toBe(false);
    expect(checkCapability(g, 'reposition', { type: 'floor', id: floorId })).toBe(false);
  });

  it('tenant_rep on a tenant can view and flag', () => {
    const g = grants({ role: 'tenant_rep', scope_type: 'tenant', scope_id: tenantId });
    expect(checkCapability(g, 'view', { type: 'tenant', id: tenantId })).toBe(true);
    expect(checkCapability(g, 'flag', { type: 'tenant', id: tenantId })).toBe(true);
    expect(checkCapability(g, 'edit', { type: 'tenant', id: tenantId })).toBe(false);
  });

  it('expired grants are ignored', () => {
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const g = grants({
      role: 'building_admin',
      scope_type: 'building',
      scope_id: buildingId,
      expires_at: past,
    });
    expect(checkCapability(g, 'edit', { type: 'building', id: buildingId })).toBe(false);
  });

  it('expired super_admin grant does not bypass', () => {
    const past = new Date(Date.now() - 1).toISOString();
    const g = grants({ role: 'super_admin', scope_type: 'global', scope_id: null, expires_at: past });
    expect(checkCapability(g, 'view', { type: 'building', id: buildingId })).toBe(false);
  });

  it('global "view" requires any active grant', () => {
    const g = grants({ role: 'tenant_rep', scope_type: 'tenant', scope_id: tenantId });
    expect(checkCapability(g, 'view', { type: 'global' })).toBe(true);
    expect(checkCapability([], 'view', { type: 'global' })).toBe(false);
  });
});
