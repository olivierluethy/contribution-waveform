import { describe, expect, it } from 'vitest';
import { areaPath, bandPath, catmullRomPath, round } from '../lib/curve';

const NON_FINITE = /NaN|Infinity|undefined/;

describe('round', () => {
  it('rounds to two decimals', () => {
    expect(round(1.23456)).toBe(1.23);
  });

  it('maps non-finite values to 0 so no path can contain NaN', () => {
    expect(round(NaN)).toBe(0);
    expect(round(Infinity)).toBe(0);
    expect(round(-Infinity)).toBe(0);
  });
});

describe('catmullRomPath', () => {
  it('returns an empty string for no points', () => {
    expect(catmullRomPath([])).toBe('');
  });

  it('emits a bare moveto for a single point', () => {
    expect(catmullRomPath([{ x: 5, y: 6 }])).toBe('M 5 6');
  });

  it('matches the known fixture for a three-point curve at tension 0.5', () => {
    // Endpoints duplicate the terminal point: p0 = p1 for the first segment,
    // p3 = p2 for the last. With t = 0.5 the control offset is (p2 - p0) / 6.
    const path = catmullRomPath([
      { x: 0, y: 0 },
      { x: 10, y: 20 },
      { x: 20, y: 0 },
    ]);
    expect(path).toBe(
      'M 0 0 C 1.67 3.33, 6.67 20, 10 20 C 13.33 20, 18.33 3.33, 20 0',
    );
  });

  it('produces a straight horizontal line for collinear flat points', () => {
    const path = catmullRomPath([
      { x: 0, y: 10 },
      { x: 10, y: 10 },
      { x: 20, y: 10 },
    ]);
    expect(path).toBe('M 0 10 C 1.67 10, 6.67 10, 10 10 C 13.33 10, 18.33 10, 20 10');
  });

  it('handles a two-point series', () => {
    expect(catmullRomPath([{ x: 0, y: 0 }, { x: 10, y: 10 }])).toBe(
      'M 0 0 C 1.67 1.67, 8.33 8.33, 10 10',
    );
  });

  it('never emits non-finite numbers even for non-finite input', () => {
    const path = catmullRomPath([
      { x: 0, y: NaN },
      { x: 10, y: 5 },
      { x: NaN, y: Infinity },
    ]);
    expect(path).not.toMatch(NON_FINITE);
  });
});

describe('bandPath', () => {
  it('closes the upper curve into the reversed lower curve', () => {
    const path = bandPath(
      [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      [{ x: 0, y: 10 }, { x: 10, y: 10 }],
    );
    expect(path.startsWith('M 0 0 C')).toBe(true);
    expect(path).toContain('L 10 10');
    expect(path.endsWith('Z')).toBe(true);
  });

  it('returns an empty string when either side is empty', () => {
    expect(bandPath([], [{ x: 0, y: 0 }])).toBe('');
    expect(bandPath([{ x: 0, y: 0 }], [])).toBe('');
  });
});

describe('areaPath', () => {
  it('closes the curve down to the edge', () => {
    const path = areaPath([{ x: 0, y: 5 }, { x: 10, y: 5 }], 100);
    expect(path).toBe('M 0 5 C 1.67 5, 8.33 5, 10 5 L 10 100 L 0 100 Z');
  });

  it('returns an empty string for no points', () => {
    expect(areaPath([], 100)).toBe('');
  });
});
