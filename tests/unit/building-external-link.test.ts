import { describe, it, expect } from 'vitest';
import {
  buildingExternalLinkFromSettings,
  externalLinkHidden,
} from '@/lib/building-settings';

describe('buildingExternalLinkFromSettings', () => {
  it('defaults to Officemark when no setting is present', () => {
    expect(buildingExternalLinkFromSettings(null)).toEqual({ mode: 'default', label: '', url: '' });
    expect(buildingExternalLinkFromSettings({})).toEqual({ mode: 'default', label: '', url: '' });
    expect(buildingExternalLinkFromSettings({ pin_shape: 'circle' })).toMatchObject({
      mode: 'default',
    });
  });

  it('reads a custom label + url', () => {
    const link = buildingExternalLinkFromSettings({
      external_link: { mode: 'custom', label: 'Facilities portal', url: 'https://fm.example.com' },
    });
    expect(link).toEqual({ mode: 'custom', label: 'Facilities portal', url: 'https://fm.example.com' });
  });

  it('falls back to default when custom has no url (never a dead button)', () => {
    const link = buildingExternalLinkFromSettings({
      external_link: { mode: 'custom', label: 'Oops', url: '   ' },
    });
    expect(link.mode).toBe('default');
  });

  it('honors hidden', () => {
    const link = buildingExternalLinkFromSettings({ external_link: { mode: 'hidden' } });
    expect(link.mode).toBe('hidden');
    expect(externalLinkHidden(link)).toBe(true);
  });

  it('ignores an unknown mode', () => {
    const link = buildingExternalLinkFromSettings({ external_link: { mode: 'nonsense' } });
    expect(link.mode).toBe('default');
  });
});
