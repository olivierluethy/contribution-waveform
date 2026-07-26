import { describe, expect, it } from 'vitest';
import { buildSeries, addDays } from '../src/transform.js';
import type { ContributionDay } from '../src/transform.js';
import { theme, YEAR_GEOMETRY } from '../src/themes.js';
import { ANIMATION_CSS, escapeXml, monthTicks, renderPanel } from '../src/render.js';

const NON_FINITE = /NaN|Infinity|undefined/;
const RECT = { x: 44, y: 26, width: 816, height: 144 };
const T = theme('dark', '#7c3aed');

function series(counts: number[], from = '2024-01-01') {
  const all: ContributionDay[] = counts.map((count, i) => ({ date: addDays(from, i), count }));
  return buildSeries(all, from, addDays(from, counts.length - 1), 3);
}

/**
 * Maps each `<clipPath id="...">` to the horizontal edge its region closes
 * to. `areaPath(curve, edgeY)` always ends its `d` with
 * `L <x> <edgeY> L <x> <edgeY> Z`, so the last `L ... <edge> Z` pins the
 * region: "above" clips close to a smaller y (nearer the panel top) and
 * "below" clips close to a larger y (nearer the panel bottom or the mirror's
 * centre axis).
 */
function clipEdges(svg: string): Record<string, number> {
  const edges: Record<string, number> = {};
  for (const m of svg.matchAll(/<clipPath id="([^"]+)"><path d="([^"]*)"\/><\/clipPath>/g)) {
    const edge = m[2]!.match(/L\s+-?\d+(?:\.\d+)?\s+(-?\d+(?:\.\d+)?)\s+Z$/);
    if (!edge) throw new Error(`clip "${m[1]}" has no closing edge: ${m[2]}`);
    edges[m[1]!] = Number(edge[1]);
  }
  return edges;
}

/** Maps each clip-path id to the fill colour of the path that references it. */
function fillByClip(svg: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const m of svg.matchAll(/<path[^>]*\sfill="([^"]+)"[^>]*\sclip-path="url\(#([^)]+)\)"/g)) {
    map[m[2]!] = m[1]!;
  }
  return map;
}

describe('escapeXml', () => {
  it('escapes the five XML entities', () => {
    expect(escapeXml(`<&>"'`)).toBe('&lt;&amp;&gt;&quot;&apos;');
  });
});

describe('renderPanel', () => {
  it('emits no non-finite numbers for a normal series', () => {
    const svg = renderPanel({
      series: series([1, 4, 2, 9, 3, 0, 5]),
      theme: T,
      mirror: true,
      rect: RECT,
      idPrefix: 'a',
      showPeaks: true,
    });
    expect(svg).not.toMatch(NON_FINITE);
  });

  it('emits no non-finite numbers for a zero-contribution user', () => {
    const svg = renderPanel({
      series: series(Array.from({ length: 60 }, () => 0)),
      theme: T,
      mirror: true,
      rect: RECT,
      idPrefix: 'b',
      showPeaks: true,
    });
    expect(svg).not.toMatch(NON_FINITE);
  });

  it('emits no non-finite numbers for an empty series', () => {
    const svg = renderPanel({
      series: series([]),
      theme: T,
      mirror: true,
      rect: RECT,
      idPrefix: 'c',
      showPeaks: true,
    });
    expect(svg).not.toMatch(NON_FINITE);
  });

  it('emits no non-finite numbers for a single-day series', () => {
    const svg = renderPanel({
      series: series([5]),
      theme: T,
      mirror: false,
      rect: RECT,
      idPrefix: 'd',
      showPeaks: true,
    });
    expect(svg).not.toMatch(NON_FINITE);
  });

  it('namespaces clip path ids so several panels can share one document', () => {
    const svg = renderPanel({
      series: series([1, 2, 3]),
      theme: T,
      mirror: true,
      rect: RECT,
      idPrefix: 'row7',
      showPeaks: false,
    });
    expect(svg).toContain('id="row7-above"');
    expect(svg).toContain('url(#row7-above)');
  });

  it('emits four clip regions when mirrored and two when not', () => {
    const opts = { series: series([1, 5, 2, 8]), theme: T, rect: RECT, idPrefix: 'm', showPeaks: false };
    const mirrored = renderPanel({ ...opts, mirror: true });
    const flat = renderPanel({ ...opts, mirror: false });
    expect((mirrored.match(/<clipPath/g) ?? []).length).toBe(4);
    expect((flat.match(/<clipPath/g) ?? []).length).toBe(2);
  });

  it('uses the accent for the above-average fill', () => {
    const svg = renderPanel({
      series: series([1, 9, 1, 9]),
      theme: T,
      mirror: true,
      rect: RECT,
      idPrefix: 'e',
      showPeaks: false,
    });
    expect(svg).toContain('fill="#7c3aed"');
  });

  it('unmirrored: pins the above/below clips to the panel top and bottom', () => {
    const svg = renderPanel({
      series: series([1, 9, 1, 9]),
      theme: T,
      mirror: false,
      rect: RECT,
      idPrefix: 'flat',
      showPeaks: false,
    });
    const edges = clipEdges(svg);
    expect(edges['flat-above']).toBe(RECT.y);
    expect(edges['flat-below']).toBe(RECT.y + RECT.height);
  });

  it('unmirrored: pairs the accent fill with the above clip and the muted fill with the below clip', () => {
    const svg = renderPanel({
      series: series([1, 9, 1, 9]),
      theme: T,
      mirror: false,
      rect: RECT,
      idPrefix: 'flat',
      showPeaks: false,
    });
    const fills = fillByClip(svg);
    expect(fills['flat-above']).toBe(T.above);
    expect(fills['flat-below']).toBe(T.below);
    // Sanity: accent and muted are genuinely different colours in this
    // theme, otherwise the assertions above couldn't distinguish a swap.
    expect(T.above).not.toBe(T.below);
  });

  it('mirrored: pins all four clips to the correct edges', () => {
    const svg = renderPanel({
      series: series([1, 9, 1, 9]),
      theme: T,
      mirror: true,
      rect: RECT,
      idPrefix: 'mir',
      showPeaks: false,
    });
    const edges = clipEdges(svg);
    const centre = RECT.y + RECT.height / 2;
    expect(edges['mir-above']).toBe(RECT.y);
    expect(edges['mir-below']).toBe(centre);
    expect(edges['mir-above-m']).toBe(RECT.y + RECT.height);
    expect(edges['mir-below-m']).toBe(centre);
  });

  it('mirrored: pairs every clip with the correct fill colour', () => {
    const svg = renderPanel({
      series: series([1, 9, 1, 9]),
      theme: T,
      mirror: true,
      rect: RECT,
      idPrefix: 'mir',
      showPeaks: false,
    });
    const fills = fillByClip(svg);
    expect(fills['mir-above']).toBe(T.above);
    expect(fills['mir-below']).toBe(T.below);
    expect(fills['mir-above-m']).toBe(T.above);
    expect(fills['mir-below-m']).toBe(T.below);
  });

  it('draws peak markers with their counts', () => {
    const svg = renderPanel({
      series: series([1, 1, 1, 42, 1, 1, 1]),
      theme: T,
      mirror: false,
      rect: RECT,
      idPrefix: 'f',
      showPeaks: true,
    });
    expect(svg).toContain('>42<');
    expect(svg).toContain('<circle');
  });

  it('omits peak markers when showPeaks is false', () => {
    const svg = renderPanel({
      series: series([1, 1, 1, 42, 1, 1, 1]),
      theme: T,
      mirror: false,
      rect: RECT,
      idPrefix: 'g',
      showPeaks: false,
    });
    expect(svg).not.toContain('<circle');
  });

  it('keeps every path coordinate non-negative and inside the frame', () => {
    // A hard square wave is the worst case for Catmull-Rom overshoot.
    const svg = renderPanel({
      series: series([0, 100, 0, 100, 0]),
      theme: T,
      mirror: true,
      rect: RECT,
      idPrefix: 'h',
      showPeaks: false,
    });
    // Every `d` attribute is built from whole (x, y) pairs (`M x y`, `L x y`,
    // and `C` triples of pairs), so concatenating them preserves the
    // alternation: even-indexed numbers are x coordinates, odd-indexed are y.
    // That lets each axis be checked against its own true panel edge, rather
    // than one bound blurring x and y together (or borrowing an unrelated
    // viewBox width, as the old `<= 880` did — RECT's real right/bottom
    // edges are 860/170, not 880).
    const xs: number[] = [];
    const ys: number[] = [];
    for (const m of svg.matchAll(/ d="([^"]*)"/g)) {
      const nums = [...m[1]!.matchAll(/-?\d+(?:\.\d+)?/g)].map((c) => Number(c[0]));
      nums.forEach((v, i) => (i % 2 === 0 ? xs : ys).push(v));
    }
    expect(xs.length).toBeGreaterThan(0);
    expect(ys.length).toBeGreaterThan(0);
    // No tolerance: for this fixture Catmull-Rom control points land exactly
    // on the panel edges and never overshoot (verified empirically), so a
    // fudge factor here would just mask real regressions.
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(RECT.x);
    expect(Math.max(...xs)).toBeLessThanOrEqual(RECT.x + RECT.width);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(RECT.y);
    expect(Math.max(...ys)).toBeLessThanOrEqual(RECT.y + RECT.height);
  });
});

describe('monthTicks', () => {
  const xAt = (i: number) => i * 10;

  it('always labels the first point', () => {
    const s = series([1, 2, 3], '2024-03-15');
    expect(monthTicks(s.points, xAt)[0]!.label).toBe('Mar');
  });

  it('labels each month start', () => {
    const s = series(Array.from({ length: 70 }, () => 1), '2024-01-01');
    expect(monthTicks(s.points, xAt).map((t) => t.label)).toEqual(['Jan', 'Feb', 'Mar']);
  });

  it('drops labels that would collide', () => {
    const s = series(Array.from({ length: 70 }, () => 1), '2024-01-01');
    const tight = monthTicks(s.points, (i) => i * 0.5, 40);
    expect(tight).toHaveLength(1);
  });

  it('returns nothing for an empty series', () => {
    expect(monthTicks([], xAt)).toEqual([]);
  });
});

describe('ANIMATION_CSS', () => {
  it('settles to the finished state so a non-animating renderer shows the full curve', () => {
    expect(ANIMATION_CSS).toContain('stroke-dashoffset: 0');
    expect(ANIMATION_CSS).toContain('opacity: 1');
  });

  it('respects prefers-reduced-motion', () => {
    expect(ANIMATION_CSS).toContain('prefers-reduced-motion');
  });

  it('references nothing external', () => {
    expect(ANIMATION_CSS).not.toMatch(/@import|url\(|http/);
  });
});
