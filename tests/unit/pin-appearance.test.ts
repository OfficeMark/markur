import { describe, it, expect } from 'vitest';
import { pinAppearanceFromSettings } from '@/lib/pin-appearance';

describe('pinAppearanceFromSettings', () => {
  it('defaults to a small circle when settings are empty/missing', () => {
    for (const input of [null, undefined, {}, 'garbage', 42, [], [1, 2]]) {
      expect(pinAppearanceFromSettings(input)).toEqual({ pinShape: 'circle', pinSize: 'small' });
    }
  });

  it('the default size is the SMALL end (dense walls crowd at medium)', () => {
    expect(pinAppearanceFromSettings({}).pinSize).toBe('small');
  });

  it('reads valid stored values', () => {
    expect(pinAppearanceFromSettings({ pin_shape: 'diamond', pin_size: 'large' })).toEqual({
      pinShape: 'diamond',
      pinSize: 'large',
    });
    expect(pinAppearanceFromSettings({ pin_shape: 'square', pin_size: 'medium' })).toEqual({
      pinShape: 'square',
      pinSize: 'medium',
    });
  });

  it('falls back to defaults for unknown values, per-key', () => {
    expect(pinAppearanceFromSettings({ pin_shape: 'star', pin_size: 'huge' })).toEqual({
      pinShape: 'circle',
      pinSize: 'small',
    });
    // valid shape, bad size → keep the good one, default the bad one
    expect(pinAppearanceFromSettings({ pin_shape: 'square', pin_size: 'xl' })).toEqual({
      pinShape: 'square',
      pinSize: 'small',
    });
  });

  it('ignores other settings keys', () => {
    expect(
      pinAppearanceFromSettings({ pin_shape: 'diamond', pin_size: 'medium', audit_cycle_days: 30 })
    ).toEqual({ pinShape: 'diamond', pinSize: 'medium' });
  });
});
