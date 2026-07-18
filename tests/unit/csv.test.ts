import { describe, expect, it } from 'vitest';
import { toCsv } from '@/lib/csv';

describe('csv export (Feature 2)', () => {
  it('joins headers and rows with CRLF', () => {
    const csv = toCsv(['A', 'B'], [['1', '2'], ['3', '4']]);
    expect(csv).toBe('A,B\r\n1,2\r\n3,4');
  });

  it('quotes cells containing commas, quotes, or newlines and escapes quotes', () => {
    const csv = toCsv(
      ['Note'],
      [['has,comma'], ['has "quote"'], ['line\nbreak']]
    );
    expect(csv).toBe('Note\r\n"has,comma"\r\n"has ""quote"""\r\n"line\nbreak"');
  });

  it('renders null/undefined as empty cells and numbers as-is', () => {
    const csv = toCsv(['A', 'B', 'C'], [[null, undefined, 42]]);
    expect(csv).toBe('A,B,C\r\n,,42');
  });
});
