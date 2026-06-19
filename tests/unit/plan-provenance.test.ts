import { describe, it, expect } from 'vitest';
import {
  planProvenanceLabel,
  isPlanProvenance,
  PLAN_PROVENANCE_OPTIONS,
} from '@/lib/plan-provenance';

describe('planProvenanceLabel — locked wordings', () => {
  it('not_specified shows no label', () => {
    expect(planProvenanceLabel('not_specified')).toBeNull();
  });

  it('returns the exact locked strings', () => {
    expect(planProvenanceLabel('client_provided')).toBe('Client-provided plans');
    expect(planProvenanceLabel('recreated_from_reference')).toBe(
      'Client plans unavailable — recreated from site reference'
    );
    expect(planProvenanceLabel('recreated_from_scan')).toBe('Recreated from client print/scan');
  });

  it('null / undefined / unknown → null', () => {
    expect(planProvenanceLabel(null)).toBeNull();
    expect(planProvenanceLabel(undefined)).toBeNull();
    expect(planProvenanceLabel('something_else')).toBeNull();
  });
});

describe('isPlanProvenance', () => {
  it('accepts the four keys, rejects others', () => {
    expect(isPlanProvenance('client_provided')).toBe(true);
    expect(isPlanProvenance('not_specified')).toBe(true);
    expect(isPlanProvenance('nope')).toBe(false);
    expect(isPlanProvenance(null)).toBe(false);
  });

  it('every option key is valid and has a label', () => {
    expect(PLAN_PROVENANCE_OPTIONS).toHaveLength(4);
    for (const o of PLAN_PROVENANCE_OPTIONS) {
      expect(isPlanProvenance(o.key)).toBe(true);
      expect(o.label.length).toBeGreaterThan(0);
    }
  });
});
