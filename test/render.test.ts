import { describe, expect, it } from 'vitest';
import { buildSeries, addDays } from '../src/transform.js';
import type { ContributionDay } from '../src/transform.js';
import { theme, YEAR_GEOMETRY, MONTH_GEOMETRY, allYearsHeight } from '../src/themes.js';
import {
  ANIMATION_CSS,
  escapeXml,
  monthTicks,
  renderAllYears,
  renderPanel,
  renderWave,
  xAtFor,
} from '../src/render.js';

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

describe('xAtFor', () => {
  it('centres a single point', () => {
    expect(xAtFor(RECT, 1)(0)).toBe(RECT.x + RECT.width / 2);
  });

  it('centres a zero-length series the same way', () => {
    expect(xAtFor(RECT, 0)(0)).toBe(RECT.x + RECT.width / 2);
  });

  it('spreads multiple points evenly from the left edge to the right edge', () => {
    const xAt = xAtFor(RECT, 5);
    expect(xAt(0)).toBe(RECT.x);
    expect(xAt(4)).toBe(RECT.x + RECT.width);
    expect(xAt(2)).toBe(RECT.x + RECT.width / 2);
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

describe('renderWave', () => {
  const base = {
    theme: T,
    username: 'olivierluethy',
    mirror: true,
    geometry: YEAR_GEOMETRY,
    label: 'Trailing year',
  };

  it('emits a well-formed self-contained root element', () => {
    const svg = renderWave({ ...base, series: series([1, 5, 2, 8, 3]) });
    expect(svg.startsWith('<svg ')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox="0 0 880 220"');
    expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
  });

  it('sets no width or height on the root so the README can scale it', () => {
    const svg = renderWave({ ...base, series: series([1, 2, 3]) });
    const root = svg.slice(0, svg.indexOf('>'));
    expect(root).not.toMatch(/\swidth=/);
    expect(root).not.toMatch(/\sheight=/);
  });

  it('uses the month viewBox for the month geometry', () => {
    const svg = renderWave({ ...base, geometry: MONTH_GEOMETRY, series: series([1, 2, 3]) });
    expect(svg).toContain('viewBox="0 0 880 160"');
  });

  it('writes the footer line', () => {
    const svg = renderWave({ ...base, series: series([2, 3, 4]) });
    expect(svg).toContain('@olivierluethy');
    expect(svg).toContain('9 contributions');
    expect(svg).toContain('2024-01-01');
    expect(svg).toContain('2024-01-03');
  });

  it('writes a subtle max label and no y gridlines', () => {
    const svg = renderWave({ ...base, series: series([1, 2, 30]) });
    expect(svg).toContain('max 30');
    expect(svg).not.toContain('<line');
  });

  it('escapes a username containing XML metacharacters', () => {
    const svg = renderWave({ ...base, username: 'a<b&c', series: series([1, 2]) });
    expect(svg).toContain('@a&lt;b&amp;c');
    expect(svg).not.toContain('@a<b&c');
  });

  it('escapes a double quote (and other metacharacters) in the username reaching aria-label', () => {
    // A raw '"' here would terminate the aria-label attribute early and
    // corrupt the root element. escapeXml already handles this correctly;
    // this test guards that against regression.
    const hostile = `a"b<c&d'e`;
    const svg = renderWave({ ...base, username: hostile, series: series([1, 2]) });
    const expectedTitle = escapeXml(
      `${base.label} of GitHub contributions for ${hostile} as a waveform`,
    );

    // The root element must still parse as a single well-formed open tag:
    // the expected attributes, in order, closed immediately by '>'.
    const rootMatch = svg.match(
      /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 880 220" preserveAspectRatio="xMidYMid meet" role="img" aria-label="([^"]*)">/,
    );
    expect(rootMatch).not.toBeNull();
    const ariaValue = rootMatch![1]!;

    expect(ariaValue).toBe(expectedTitle);
    expect(ariaValue).not.toContain('"');
    expect(ariaValue).toContain('&quot;');
    expect(ariaValue).toContain('&lt;');
    expect(ariaValue).toContain('&amp;');
    expect(ariaValue).toContain('&apos;');
  });

  it('renders a zero-contribution user without non-finite numbers', () => {
    const svg = renderWave({ ...base, series: series(Array.from({ length: 365 }, () => 0)) });
    expect(svg).not.toMatch(NON_FINITE);
    expect(svg).toContain('0 contributions');
  });

  it('renders an empty series without throwing', () => {
    const svg = renderWave({ ...base, series: series([]) });
    expect(svg).toContain('</svg>');
    expect(svg).not.toMatch(NON_FINITE);
  });

  it('includes the inline animation stylesheet', () => {
    const svg = renderWave({ ...base, series: series([1, 2, 3]) });
    expect(svg).toContain('<style>');
    expect(svg).toContain('@keyframes wf-draw');
  });

  it('carries an accessible title', () => {
    const svg = renderWave({ ...base, series: series([1, 2, 3]) });
    expect(svg).toContain('<title>');
    expect(svg).toContain('role="img"');
  });
});

describe('shared x-projection contract', () => {
  it("renderWave's month tick lands exactly where renderPanel's curve places the same index", () => {
    // Index 2 (2024-01-01) is both a month start and, with this count
    // pattern, the single detected peak (minSeparation=7 exceeds this
    // 5-point window, so only the highest-count day is chosen). That makes
    // its x coordinate independently observable from two different
    // production code paths for the very same rect and point count:
    // renderPanel's peak marker (which shares the exact `xAt` closure used
    // to place the curve itself) and renderWave's rendered "Jan" tick
    // (which comes from monthTicks fed by `xAtFor`). If the two projections
    // ever drift apart — say `renderPanel` grows padding that `xAtFor`
    // doesn't get, or a hand-rolled closure creeps back into either call
    // site — these two numbers stop matching and this test fails.
    const s = series([1, 1, 9, 1, 1], '2023-12-30');

    const panelSvg = renderPanel({
      series: s,
      theme: T,
      mirror: false,
      rect: RECT, // equals the rect YEAR_GEOMETRY derives below
      idPrefix: 'sync',
      showPeaks: true,
    });
    const peakMatch = panelSvg.match(/<circle[^>]*\scx="(-?\d+(?:\.\d+)?)"/);
    expect(peakMatch).not.toBeNull();
    const peakX = Number(peakMatch![1]);

    const waveSvg = renderWave({
      theme: T,
      username: 'x',
      mirror: false,
      geometry: YEAR_GEOMETRY,
      label: 'Trailing year',
      series: s,
    });
    const tickMatch = waveSvg.match(/<text x="(-?\d+(?:\.\d+)?)"[^>]*>Jan<\/text>/);
    expect(tickMatch).not.toBeNull();
    const tickX = Number(tickMatch![1]);

    expect(tickX).toBe(peakX);
  });
});

describe('renderAllYears', () => {
  const rows = [
    { year: 2023, series: series(Array.from({ length: 200 }, (_, i) => i % 5), '2023-01-01') },
    { year: 2024, series: series(Array.from({ length: 200 }, (_, i) => i % 7), '2024-01-01') },
  ];
  const base = {
    rows,
    theme: T,
    username: 'olivierluethy',
    mirror: true,
    total: 1234,
    from: '2023-01-01',
    to: '2024-07-18',
  };

  it('grows the viewBox height with the year count', () => {
    expect(renderAllYears(base)).toContain(`viewBox="0 0 880 ${allYearsHeight(2)}"`);
  });

  it('labels every year on the left', () => {
    const svg = renderAllYears(base);
    expect(svg).toContain('>2023<');
    expect(svg).toContain('>2024<');
  });

  it('gives each row its own clip path namespace', () => {
    const svg = renderAllYears(base);
    expect(svg).toContain('id="y2023-above"');
    expect(svg).toContain('id="y2024-above"');
  });

  it('shows the combined total in the footer', () => {
    expect(renderAllYears(base)).toContain('1234 contributions');
  });

  it('emits no non-finite numbers', () => {
    expect(renderAllYears(base)).not.toMatch(NON_FINITE);
  });

  it('renders with no rows at all', () => {
    const svg = renderAllYears({ ...base, rows: [], total: 0 });
    expect(svg).toContain('</svg>');
    expect(svg).not.toMatch(NON_FINITE);
  });

  it('escapes a username containing XML metacharacters in the footer', () => {
    const svg = renderAllYears({ ...base, username: 'a<b&c' });
    expect(svg).toContain('@a&lt;b&amp;c');
    expect(svg).not.toContain('@a<b&c');
  });

  it('escapes a double quote (and other metacharacters) in the username reaching aria-label', () => {
    // Same hazard as renderWave: a raw '"' here would terminate the
    // aria-label attribute early and corrupt the root element. renderAllYears
    // has no dedicated test of its own for this — it relies entirely on
    // svgOpen/escapeXml being shared with renderWave, which this pins here
    // directly.
    const hostile = `a"b<c&d'e`;
    const svg = renderAllYears({ ...base, username: hostile });
    const expectedTitle = escapeXml(
      `All years of GitHub contributions for ${hostile} as a waveform`,
    );
    const height = allYearsHeight(rows.length);

    const rootMatch = svg.match(
      new RegExp(
        `^<svg xmlns="http://www\\.w3\\.org/2000/svg" viewBox="0 0 880 ${height}" ` +
          `preserveAspectRatio="xMidYMid meet" role="img" aria-label="([^"]*)">`,
      ),
    );
    expect(rootMatch).not.toBeNull();
    const ariaValue = rootMatch![1]!;

    expect(ariaValue).toBe(expectedTitle);
    expect(ariaValue).not.toContain('"');
    expect(ariaValue).toContain('&quot;');
    expect(ariaValue).toContain('&lt;');
    expect(ariaValue).toContain('&amp;');
    expect(ariaValue).toContain('&apos;');
  });
});
