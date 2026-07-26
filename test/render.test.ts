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
    const coords = [...svg.matchAll(/ d="([^"]*)"/g)].flatMap((m) =>
      [...m[1]!.matchAll(/-?\d+(?:\.\d+)?/g)].map((c) => Number(c[0])),
    );
    expect(coords.length).toBeGreaterThan(0);
    expect(Math.min(...coords)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...coords)).toBeLessThanOrEqual(880);
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
