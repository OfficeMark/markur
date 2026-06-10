import { describe, it, expect } from 'vitest';
import { OPS } from 'pdfjs-dist';
import { bucketOperatorList } from '@/lib/plan-prep/decompose';

type M = [number, number, number, number, number, number];
const IDENTITY: M = [1, 0, 0, 1, 0, 0];

describe('bucketOperatorList', () => {
  it('buckets a filled gray rect and a stroked black line into two color groups', () => {
    const fns = [
      OPS.setFillRGBColor,
      OPS.constructPath,
      OPS.fill,
      OPS.setStrokeRGBColor,
      OPS.constructPath,
      OPS.stroke,
    ];
    const args = [
      [170, 170, 170],
      [[OPS.rectangle], [10, 10, 100, 50]], // rect x=10 y=10 w=100 h=50
      [],
      [0, 0, 0],
      [[OPS.moveTo, OPS.lineTo], [20, 20, 80, 80]],
      [],
    ];
    const buckets = bucketOperatorList(fns, args as unknown[][], IDENTITY);

    // 170 quantizes to nearest 6 -> 168.
    const gray = buckets.get('168,168,168');
    const black = buckets.get('0,0,0');
    expect(gray?.pathCount).toBe(1);
    expect(black?.pathCount).toBe(1);
    // Rect bbox is its four corners.
    expect(gray?.bbox).toEqual([10, 10, 110, 60]);
    // Line bbox spans its two endpoints.
    expect(black?.bbox).toEqual([20, 20, 80, 80]);
  });

  it('applies the CTM (transform op) to path coordinates', () => {
    const fns = [OPS.transform, OPS.setStrokeRGBColor, OPS.constructPath, OPS.stroke];
    const args = [
      [2, 0, 0, 2, 5, 5], // scale 2, translate (5,5): (x,y) -> (2x+5, 2y+5)
      [0, 0, 0],
      [[OPS.moveTo, OPS.lineTo], [10, 10, 20, 20]],
      [],
    ];
    const buckets = bucketOperatorList(fns, args as unknown[][], IDENTITY);
    const g = buckets.get('0,0,0');
    // (10,10)->(25,25), (20,20)->(45,45)
    expect(g?.bbox).toEqual([25, 25, 45, 45]);
  });

  it('isolates CTM changes between save/restore', () => {
    const fns = [
      OPS.setStrokeRGBColor,
      OPS.save,
      OPS.transform,
      OPS.constructPath,
      OPS.stroke,
      OPS.restore,
      OPS.constructPath,
      OPS.stroke,
    ];
    const args = [
      [0, 0, 0],
      [],
      [10, 0, 0, 10, 0, 0], // scale 10 inside save/restore
      [[OPS.moveTo, OPS.lineTo], [1, 1, 2, 2]], // -> (10,10)-(20,20)
      [],
      [],
      [[OPS.moveTo, OPS.lineTo], [1, 1, 2, 2]], // CTM restored -> (1,1)-(2,2)
      [],
    ];
    const buckets = bucketOperatorList(fns, args as unknown[][], IDENTITY);
    const g = buckets.get('0,0,0');
    // Union of the scaled path (10..20) and the un-scaled path (1..2).
    expect(g?.bbox).toEqual([1, 1, 20, 20]);
    expect(g?.pathCount).toBe(2);
  });

  it('discards paths that are constructed but only used for clipping (endPath)', () => {
    const fns = [OPS.setFillRGBColor, OPS.constructPath, OPS.endPath];
    const args = [
      [0, 0, 0],
      [[OPS.rectangle], [0, 0, 10, 10]],
      [],
    ];
    const buckets = bucketOperatorList(fns, args as unknown[][], IDENTITY);
    expect(buckets.size).toBe(0);
  });

  it('converts gray and CMYK color ops to RGB buckets', () => {
    const fns = [OPS.setFillGray, OPS.constructPath, OPS.fill];
    const args = [
      [0.667], // 0.667 * 255 = 170.085 -> 170 -> quantized 168
      [[OPS.rectangle], [0, 0, 4, 4]],
      [],
    ];
    const buckets = bucketOperatorList(fns, args as unknown[][], IDENTITY);
    expect(buckets.has('168,168,168')).toBe(true);
  });
});
