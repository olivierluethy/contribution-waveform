import { areaPath, bandPath, catmullRomPath, round } from './curve.js';
import type { Point } from './curve.js';
import { ALL_GUTTER, ALL_ROW_HEIGHT, allYearsHeight, FONT_STACK } from './themes.js';
import type { Geometry, Theme } from './themes.js';
import type { PlotPoint, PlotSeries } from './transform.js';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * One-shot draw-in. The base rules are the FINISHED state (`stroke-dashoffset: 0`,
 * `opacity: 1`) and the keyframes only rewind from there, so a renderer that
 * ignores CSS animation shows a complete image rather than a blank one.
 * `pathLength="1000"` on the curve normalises the dash maths — no measurement needed.
 */
export const ANIMATION_CSS = `
.wf-curve { stroke-dasharray: 1000; stroke-dashoffset: 0; animation: wf-draw 1.4s ease-out 1 both; }
.wf-fade { opacity: 1; animation: wf-fade-in 0.6s ease-out 0.6s 1 both; }
@keyframes wf-draw { from { stroke-dashoffset: 1000; } to { stroke-dashoffset: 0; } }
@keyframes wf-fade-in { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .wf-curve, .wf-fade { animation: none; }
}
`.trim();

export interface PanelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PanelOptions {
  series: PlotSeries;
  theme: Theme;
  mirror: boolean;
  rect: PanelRect;
  /** Namespaces clip path ids so multiple panels can share one SVG document. */
  idPrefix: string;
  showPeaks: boolean;
}

/**
 * Projects point index `i` (of `n` total points) onto the x-axis of `rect`.
 * Shared by `renderPanel` (for the curve itself) and `renderWave` (for month
 * tick labels), so the two always agree on where a given day sits — a label
 * can never drift from the point it names.
 */
export function xAtFor(rect: PanelRect, n: number): (i: number) => number {
  return (i: number): number =>
    n <= 1 ? rect.x + rect.width / 2 : rect.x + (i * rect.width) / (n - 1);
}

/** Month tick positions. The first point is always labelled so a 31-day window is never bare. */
export function monthTicks(
  points: PlotPoint[],
  xAt: (i: number) => number,
  minGap = 40,
): Array<{ x: number; label: string }> {
  const ticks: Array<{ x: number; label: string }> = [];
  let lastX = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < points.length; i++) {
    const date = points[i]!.date;
    const isMonthStart = date.endsWith('-01');
    if (i !== 0 && !isMonthStart) continue;

    const x = xAt(i);
    if (x - lastX < minGap) continue;

    ticks.push({ x: round(x), label: MONTH_NAMES[Number(date.slice(5, 7)) - 1]! });
    lastX = x;
  }
  return ticks;
}

export function renderPanel(opts: PanelOptions): string {
  const { series, theme: t, mirror, rect, idPrefix, showPeaks } = opts;
  const points = series.points;
  const n = points.length;
  if (n === 0) return '';

  const xAt = xAtFor(rect, n);

  /** Fraction of the plot height a value occupies. `scaleMax` is guaranteed > 0. */
  const norm = (v: number): number => Math.max(0, Math.min(1, v / series.scaleMax));

  const at = (values: (p: PlotPoint) => number, toY: (f: number) => number): Point[] =>
    points.map((p, i) => ({ x: xAt(i), y: toY(norm(values(p))) }));

  const parts: string[] = [];
  const clips: string[] = [];
  const bottom = rect.y + rect.height;
  const centre = rect.y + rect.height / 2;

  if (mirror) {
    // Amplitude measured out from the centre axis in both directions. The
    // baseline envelope is mirrored too, so the deviation fill keeps meaning
    // "this day beat its 30-day average".
    const half = rect.height / 2;
    const up = (f: number) => centre - f * half;
    const down = (f: number) => centre + f * half;

    const dailyUp = at((p) => p.clamped, up);
    const dailyDown = at((p) => p.clamped, down);
    const baseUp = at((p) => p.avg30, up);
    const baseDown = at((p) => p.avg30, down);
    const avg7Up = at((p) => p.avg7, up);
    const avg7Down = at((p) => p.avg7, down);

    clips.push(
      `<clipPath id="${idPrefix}-above"><path d="${areaPath(baseUp, rect.y)}"/></clipPath>`,
      `<clipPath id="${idPrefix}-below"><path d="${areaPath(baseUp, centre)}"/></clipPath>`,
      `<clipPath id="${idPrefix}-above-m"><path d="${areaPath(baseDown, bottom)}"/></clipPath>`,
      `<clipPath id="${idPrefix}-below-m"><path d="${areaPath(baseDown, centre)}"/></clipPath>`,
    );

    // 1. baseline band
    parts.push(
      `<path class="wf-fade" d="${bandPath(baseUp, baseDown)}" fill="${t.band}" fill-opacity="${t.bandOpacity}"/>`,
    );

    // 2. deviation fill, both halves, each split above/below by clip. Painted
    // before the 7-day and daily strokes: the fill's top edge is the daily
    // curve itself, so drawing it on top would lay accent across the wave's
    // own stroke and mute the outline.
    const upperBand = bandPath(dailyUp, baseUp);
    const lowerBand = bandPath(baseDown, dailyDown);
    parts.push(
      `<path class="wf-fade" d="${upperBand}" fill="${t.above}" fill-opacity="${t.aboveOpacity}" clip-path="url(#${idPrefix}-above)"/>`,
      `<path class="wf-fade" d="${upperBand}" fill="${t.below}" fill-opacity="${t.belowOpacity}" clip-path="url(#${idPrefix}-below)"/>`,
      `<path class="wf-fade" d="${lowerBand}" fill="${t.above}" fill-opacity="${t.aboveOpacity}" clip-path="url(#${idPrefix}-above-m)"/>`,
      `<path class="wf-fade" d="${lowerBand}" fill="${t.below}" fill-opacity="${t.belowOpacity}" clip-path="url(#${idPrefix}-below-m)"/>`,
    );

    // 3. rolling 7-day line
    parts.push(
      `<path d="${catmullRomPath(avg7Up)}" fill="none" stroke="${t.avg7}" stroke-width="1" stroke-opacity="0.7" class="wf-fade"/>`,
      `<path d="${catmullRomPath(avg7Down)}" fill="none" stroke="${t.avg7}" stroke-width="1" stroke-opacity="0.7" class="wf-fade"/>`,
    );

    // 4. daily curve (the wave itself)
    parts.push(
      `<path class="wf-curve" pathLength="1000" d="${catmullRomPath(dailyUp)}" fill="none" stroke="${t.daily}" stroke-width="1.5" stroke-linecap="round"/>`,
      `<path class="wf-curve" pathLength="1000" d="${catmullRomPath(dailyDown)}" fill="none" stroke="${t.daily}" stroke-width="1.5" stroke-linecap="round"/>`,
    );

    // 5. peak markers
    if (showPeaks) parts.push(peakMarkers(series, xAt, (p) => up(norm(p)), rect, t));
  } else {
    const toY = (f: number) => bottom - f * rect.height;
    const daily = at((p) => p.clamped, toY);
    const base = at((p) => p.avg30, toY);
    const avg7 = at((p) => p.avg7, toY);

    clips.push(
      `<clipPath id="${idPrefix}-above"><path d="${areaPath(base, rect.y)}"/></clipPath>`,
      `<clipPath id="${idPrefix}-below"><path d="${areaPath(base, bottom)}"/></clipPath>`,
    );

    // 1. baseline band
    parts.push(
      `<path class="wf-fade" d="${areaPath(base, bottom)}" fill="${t.band}" fill-opacity="${t.bandOpacity}"/>`,
    );

    // 2. deviation fill, split above/below by clip. Painted before the
    // 7-day and daily strokes: the fill's top edge is the daily curve
    // itself, so drawing it on top would lay accent across the wave's own
    // stroke and mute the outline.
    const band = bandPath(daily, base);
    parts.push(
      `<path class="wf-fade" d="${band}" fill="${t.above}" fill-opacity="${t.aboveOpacity}" clip-path="url(#${idPrefix}-above)"/>`,
      `<path class="wf-fade" d="${band}" fill="${t.below}" fill-opacity="${t.belowOpacity}" clip-path="url(#${idPrefix}-below)"/>`,
    );

    // 3. rolling 7-day line
    parts.push(
      `<path d="${catmullRomPath(avg7)}" fill="none" stroke="${t.avg7}" stroke-width="1" stroke-opacity="0.7" class="wf-fade"/>`,
    );

    // 4. daily curve (the wave itself)
    parts.push(
      `<path class="wf-curve" pathLength="1000" d="${catmullRomPath(daily)}" fill="none" stroke="${t.daily}" stroke-width="1.5" stroke-linecap="round"/>`,
    );

    // 5. peak markers
    if (showPeaks) parts.push(peakMarkers(series, xAt, (p) => toY(norm(p)), rect, t));
  }

  return `<defs>${clips.join('')}</defs>${parts.join('')}`;
}

function peakMarkers(
  series: PlotSeries,
  xAt: (i: number) => number,
  yAt: (clamped: number) => number,
  rect: PanelRect,
  t: Theme,
): string {
  if (series.peaks.length === 0) return '';

  return series.peaks
    .map((peak) => {
      const point = series.points[peak.index];
      if (!point) return '';
      const x = xAt(peak.index);
      const y = yAt(point.clamped);
      const labelY = Math.max(rect.y + 8, y - 7);

      // Keep the label inside the panel by flipping its anchor near the edges.
      let anchor = 'middle';
      if (x < rect.x + 16) anchor = 'start';
      else if (x > rect.x + rect.width - 16) anchor = 'end';

      return (
        `<circle class="wf-fade" cx="${round(x)}" cy="${round(y)}" r="2.5" fill="${t.peak}"/>` +
        `<text class="wf-fade" x="${round(x)}" y="${round(labelY)}" text-anchor="${anchor}" ` +
        `font-family="${escapeXml(FONT_STACK)}" font-size="9" fill="${t.textDim}">${peak.count}</text>`
      );
    })
    .join('');
}

export interface WaveOptions {
  series: PlotSeries;
  theme: Theme;
  username: string;
  mirror: boolean;
  geometry: Geometry;
  /** Human description used in the accessible title, e.g. "Trailing year". */
  label: string;
}

function svgOpen(width: number, height: number, title: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" ` +
    `preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeXml(title)}">` +
    `<title>${escapeXml(title)}</title>` +
    `<style>${ANIMATION_CSS}</style>`
  );
}

function textEl(
  x: number,
  y: number,
  content: string,
  fill: string,
  size: number,
  anchor = 'start',
): string {
  return (
    `<text x="${round(x)}" y="${round(y)}" text-anchor="${anchor}" font-family="${escapeXml(FONT_STACK)}" ` +
    `font-size="${size}" fill="${fill}">${content}</text>`
  );
}

function footer(username: string, total: number, from: string, to: string): string {
  return `@${escapeXml(username)} · ${total} contributions · ${escapeXml(from)} – ${escapeXml(to)}`;
}

export function renderWave(opts: WaveOptions): string {
  const { series, theme: t, username, mirror, geometry: g, label } = opts;
  const rect: PanelRect = {
    x: g.left,
    y: g.top,
    width: g.width - g.left - g.right,
    height: g.height - g.top - g.bottom,
  };

  const xAt = xAtFor(rect, series.points.length);

  const ticks = monthTicks(series.points, xAt)
    .map((tick) => textEl(tick.x, g.height - g.bottom + 16, tick.label, t.textDim, 9, 'middle'))
    .join('');

  const title = `${label} of GitHub contributions for ${username} as a waveform`;

  return [
    svgOpen(g.width, g.height, title),
    `<rect width="${g.width}" height="${g.height}" fill="${t.bg}"/>`,
    renderPanel({ series, theme: t, mirror, rect, idPrefix: 'w', showPeaks: true }),
    ticks,
    textEl(g.width - g.right, g.top - 10, `max ${series.max}`, t.textDim, 9, 'end'),
    textEl(g.left, g.height - 12, footer(username, series.total, series.from, series.to), t.text, 10),
    '</svg>',
  ].join('');
}

export interface YearRow {
  year: number;
  series: PlotSeries;
}

export interface AllYearsOptions {
  rows: YearRow[];
  theme: Theme;
  username: string;
  mirror: boolean;
  total: number;
  from: string;
  to: string;
}

export function renderAllYears(opts: AllYearsOptions): string {
  const { rows, theme: t, username, mirror, total, from, to } = opts;
  const height = allYearsHeight(rows.length);
  const width = 880;
  const right = 20;
  const top = 20;
  const plotWidth = width - ALL_GUTTER - right;

  const panels = rows
    .map((row, i) => {
      const rect: PanelRect = {
        x: ALL_GUTTER,
        y: top + i * ALL_ROW_HEIGHT,
        width: plotWidth,
        height: ALL_ROW_HEIGHT - 8,
      };
      const label = textEl(
        ALL_GUTTER - 10,
        rect.y + rect.height / 2 + 3,
        String(row.year),
        t.textDim,
        10,
        'end',
      );
      const panel = renderPanel({
        series: row.series,
        theme: t,
        mirror,
        rect,
        idPrefix: `y${row.year}`,
        showPeaks: false,
      });
      return label + panel;
    })
    .join('');

  const title = `All years of GitHub contributions for ${username} as a waveform`;

  return [
    svgOpen(width, height, title),
    `<rect width="${width}" height="${height}" fill="${t.bg}"/>`,
    panels,
    textEl(ALL_GUTTER, height - 14, footer(username, total, from, to), t.text, 10),
    '</svg>',
  ].join('');
}
