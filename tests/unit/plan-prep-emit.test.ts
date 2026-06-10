import { describe, it, expect } from 'vitest';
import { emitSvg, keptPathCount } from '@/lib/plan-prep/emit';
import type { ColorGroup, VectorPath } from '@/lib/plan-prep/types';

function path(d: string, bbox: VectorPath['bbox']): VectorPath {
  return { d, bbox, strokeWidth: 1 };
}
function group(key: string, paths: VectorPath[]): ColorGroup {
  return { key, color: [0, 0, 0], paths, pathCount: paths.length, bbox: [0, 0, 0, 0] };
}

describe('emitSvg', () => {
  const groups = [
    group('arch', [path('M0 0L10 10', [0, 0, 10, 10])]),
    group('clutter', [path('M100 100L110 110', [100, 100, 110, 110])]),
  ];

  it('produces a viewBox sized to the crop and a Y-flip transform', () => {
    const svg = emitSvg({ groups, keepKeys: ['arch'], crop: [0, 0, 10, 10] });
    expect(svg).toContain('viewBox="0 0 10 10"');
    // Flip Y (PDF is Y-up): translate(-x0, y1) scale(1,-1).
    expect(svg).toContain('translate(0, 10) scale(1,-1)');
    expect(svg).toContain('<path d="M0 0L10 10"');
  });

  it('recolors linework to the neutral plan stroke and a white background', () => {
    const svg = emitSvg({ groups, keepKeys: ['arch'], crop: [0, 0, 10, 10] });
    expect(svg).toContain('fill="#ffffff"'); // background
    expect(svg).toContain('stroke="#4b5563"'); // muted plan stroke
  });

  it('drops kept paths that fall outside the crop frame', () => {
    // Keep both groups, but crop only covers the arch path's region.
    const svg = emitSvg({ groups, keepKeys: ['arch', 'clutter'], crop: [0, 0, 20, 20] });
    expect(svg).toContain('M0 0L10 10');
    expect(svg).not.toContain('M100 100L110 110'); // legend/title-block falls away
  });

  it('excludes groups the user did not keep', () => {
    const svg = emitSvg({ groups, keepKeys: ['clutter'], crop: [0, 0, 200, 200] });
    expect(svg).not.toContain('M0 0L10 10');
    expect(svg).toContain('M100 100L110 110');
  });
});

describe('keptPathCount', () => {
  it('counts only kept groups whose paths intersect the crop', () => {
    const groups = [
      group('arch', [path('a', [0, 0, 10, 10]), path('b', [5, 5, 15, 15])]),
      group('clutter', [path('c', [100, 100, 110, 110])]),
    ];
    expect(keptPathCount({ groups, keepKeys: ['arch'], crop: [0, 0, 20, 20] })).toBe(2);
    expect(keptPathCount({ groups, keepKeys: ['arch', 'clutter'], crop: [0, 0, 20, 20] })).toBe(2);
    expect(keptPathCount({ groups, keepKeys: ['arch', 'clutter'], crop: [0, 0, 200, 200] })).toBe(3);
  });
});
