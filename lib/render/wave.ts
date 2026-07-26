import { areaPath, bandPath, catmullRomPath, round } from '../curve';
import type { Point } from '../curve';
import type { WaveParams } from '../params';
import { getTheme, type Theme } from '../themes';
import type { PlotPoint, PlotSeries } from '../transform';
import { backgroundPaint, escapeXml, svgCard, textEl } from './card';

export interface PanelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Projects point index `i` (of `n`) onto the x-axis of `rect`. Shared by the
 * panel and the month-tick labels so a label can never drift from the day it
 * names.
 */
export function xAtFor(rect: PanelRect, n: number): (i: number) => number {
  return (i: number): number =>
    n <= 1 ? rect.x + rect.width / 2 : rect.x + (i * rect.width) / (n - 1);
}

/** Abbreviated month names for a locale, resolved once per render. */
function monthLabeller(locale: string): (iso: string) => string {
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' });
  } catch {
    format = new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' });
  }
  return (iso: string) => format.format(new Date(`${iso}T00:00:00Z`));
}

export function monthTicks(
  points: PlotPoint[],
  xAt: (i: number) => number,
  label: (iso: string) => string,
  minGap = 34,
): Array<{ x: number; label: string }> {
  const ticks: Array<{ x: number; label: string }> = [];
  let lastX = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < points.length; i++) {
    const date = points[i]!.date;
    if (i !== 0 && !date.endsWith('-01')) continue;
    const x = xAt(i);
    if (x - lastX < minGap) continue;
    ticks.push({ x: round(x), label: label(date) });
    lastX = x;
  }
  return ticks;
}

interface PanelOptions {
  series: PlotSeries;
  theme: Theme;
  mirror: boolean;
  rect: PanelRect;
  /** Namespaces defs ids so several panels can share one document. */
  idPrefix: string;
  showPeaks: boolean;
  showBaseline: boolean;
  tension: number;
  animate: boolean;
}

export function renderPanel(o: PanelOptions): string {
  const { series, theme: t, mirror, rect, idPrefix, showPeaks, showBaseline, tension } = o;
  const points = series.points;
  const n = points.length;
  if (n === 0) return '';

  const cls = (name: string) => (o.animate ? ` class="${name}"` : '');
  const xAt = xAtFor(rect, n);
  const norm = (v: number): number => Math.max(0, Math.min(1, v / series.scaleMax));
  const at = (pick: (p: PlotPoint) => number, toY: (f: number) => number): Point[] =>
    points.map((p, i) => ({ x: xAt(i), y: toY(norm(pick(p))) }));

  const curve = (pts: Point[]) => catmullRomPath(pts, tension);
  const parts: string[] = [];
  const defs: string[] = [];
  const bottom = rect.y + rect.height;
  const centre = rect.y + rect.height / 2;

  const stroke = (pts: Point[]) =>
    `<path d="${curve(pts)}" fill="none" stroke="${t.avg7}" stroke-width="1" stroke-opacity="0.7"${cls('wf-fade')}/>`;
  const wave = (pts: Point[]) =>
    `<path${cls('wf-curve')} pathLength="1000" d="${curve(pts)}" fill="none" stroke="${t.line}" stroke-width="1.5" stroke-linecap="round"/>`;

  if (mirror) {
    const half = rect.height / 2;
    const up = (f: number) => centre - f * half;
    const down = (f: number) => centre + f * half;

    const dailyUp = at((p) => p.clamped, up);
    const dailyDown = at((p) => p.clamped, down);
    const avg7Up = at((p) => p.avg7, up);
    const avg7Down = at((p) => p.avg7, down);

    if (showBaseline) {
      // The baseline envelope is mirrored along with the wave, which is what
      // keeps the deviation fill meaning "this day beat its rolling average"
      // on both halves rather than becoming decorative symmetry.
      const baseUp = at((p) => p.avg30, up);
      const baseDown = at((p) => p.avg30, down);

      defs.push(
        `<clipPath id="${idPrefix}-a"><path d="${areaPath(baseUp, rect.y)}"/></clipPath>`,
        `<clipPath id="${idPrefix}-b"><path d="${areaPath(baseUp, centre)}"/></clipPath>`,
        `<clipPath id="${idPrefix}-am"><path d="${areaPath(baseDown, bottom)}"/></clipPath>`,
        `<clipPath id="${idPrefix}-bm"><path d="${areaPath(baseDown, centre)}"/></clipPath>`,
      );

      parts.push(
        `<path${cls('wf-fade')} d="${bandPath(baseUp, baseDown)}" fill="${t.band}" fill-opacity="${t.bandOpacity}"/>`,
      );

      // Each band's `d` is identical whether it ends up accent- or muted-filled
      // — only the clip and colour differ. Emit once, reference twice.
      const upId = `${idPrefix}-u`;
      const dnId = `${idPrefix}-d`;
      defs.push(
        `<path id="${upId}" d="${bandPath(dailyUp, baseUp)}"/>`,
        `<path id="${dnId}" d="${bandPath(baseDown, dailyDown)}"/>`,
      );
      parts.push(
        `<use href="#${upId}"${cls('wf-fade')} fill="${t.fillAbove}" fill-opacity="${t.fillAboveOpacity}" clip-path="url(#${idPrefix}-a)"/>`,
        `<use href="#${upId}"${cls('wf-fade')} fill="${t.fillBelow}" fill-opacity="${t.fillBelowOpacity}" clip-path="url(#${idPrefix}-b)"/>`,
        `<use href="#${dnId}"${cls('wf-fade')} fill="${t.fillAbove}" fill-opacity="${t.fillAboveOpacity}" clip-path="url(#${idPrefix}-am)"/>`,
        `<use href="#${dnId}"${cls('wf-fade')} fill="${t.fillBelow}" fill-opacity="${t.fillBelowOpacity}" clip-path="url(#${idPrefix}-bm)"/>`,
      );
    }

    parts.push(stroke(avg7Up), stroke(avg7Down), wave(dailyUp), wave(dailyDown));
    if (showPeaks) parts.push(peakMarkers(series, xAt, (v) => up(norm(v)), rect, t, o.animate));
  } else {
    const toY = (f: number) => bottom - f * rect.height;
    const daily = at((p) => p.clamped, toY);
    const avg7 = at((p) => p.avg7, toY);

    if (showBaseline) {
      const base = at((p) => p.avg30, toY);
      defs.push(
        `<clipPath id="${idPrefix}-a"><path d="${areaPath(base, rect.y)}"/></clipPath>`,
        `<clipPath id="${idPrefix}-b"><path d="${areaPath(base, bottom)}"/></clipPath>`,
      );
      parts.push(
        `<path${cls('wf-fade')} d="${areaPath(base, bottom)}" fill="${t.band}" fill-opacity="${t.bandOpacity}"/>`,
      );

      const bandId = `${idPrefix}-band`;
      defs.push(`<path id="${bandId}" d="${bandPath(daily, base)}"/>`);
      parts.push(
        `<use href="#${bandId}"${cls('wf-fade')} fill="${t.fillAbove}" fill-opacity="${t.fillAboveOpacity}" clip-path="url(#${idPrefix}-a)"/>`,
        `<use href="#${bandId}"${cls('wf-fade')} fill="${t.fillBelow}" fill-opacity="${t.fillBelowOpacity}" clip-path="url(#${idPrefix}-b)"/>`,
      );
    }

    parts.push(stroke(avg7), wave(daily));
    if (showPeaks) parts.push(peakMarkers(series, xAt, (v) => toY(norm(v)), rect, t, o.animate));
  }

  return (defs.length ? `<defs>${defs.join('')}</defs>` : '') + parts.join('');
}

function peakMarkers(
  series: PlotSeries,
  xAt: (i: number) => number,
  yAt: (clamped: number) => number,
  rect: PanelRect,
  t: Theme,
  animate: boolean,
): string {
  if (series.peaks.length === 0) return '';
  const cls = animate ? 'wf-fade' : undefined;

  // A peak day sits at the percentile ceiling, i.e. on the plot's top edge, so
  // pulling the label toward the dot would drop it into the densest part of the
  // wave where the strokes cut through the digits. Put it in the margin above.
  const labelY = Math.max(9, rect.y - 4);

  return series.peaks
    .map((peak) => {
      const point = series.points[peak.index];
      if (!point) return '';
      const x = xAt(peak.index);
      const y = yAt(point.clamped);

      let anchor = 'middle';
      if (x < rect.x + 14) anchor = 'start';
      else if (x > rect.x + rect.width - 14) anchor = 'end';

      return (
        `<circle${cls ? ` class="${cls}"` : ''} cx="${round(x)}" cy="${round(y)}" r="2.5" fill="${t.peak}"/>` +
        textEl(x, labelY, String(peak.count), t.textDim, 9, { anchor, cls })
      );
    })
    .join('');
}

/** Applies explicit colour overrides on top of the theme's values. */
function resolveTheme(params: WaveParams): Theme {
  const t = getTheme(params.theme);
  if (params.line) t.line = params.line;
  if (params.fillAbove) t.fillAbove = params.fillAbove;
  if (params.fillBelow) t.fillBelow = params.fillBelow;
  if (params.text) {
    t.text = params.text;
    t.textDim = params.text;
  }
  return t;
}

export interface YearRow {
  year: number;
  series: PlotSeries;
}

export interface WaveCardOptions {
  params: WaveParams;
  /** Single-wave views (`range=year` / `month`). */
  series?: PlotSeries;
  /** `range=all` — one row per year, sharing a y-scale. */
  rows?: YearRow[];
  total: number;
  from: string;
  to: string;
}

const PAD = 25;

export function renderWaveCard(o: WaveCardOptions): string {
  const p = o.params;
  const t = resolveTheme(p);
  const animate = !p.disableAnimations;
  const label = monthLabeller(p.locale);
  const { defs: bgDefs, fill: bgFill } = backgroundPaint(p.background, t.bg, 'wf-bg');

  const width = p.cardWidth;
  const height = p.cardHeight;
  // Baselines, top to bottom: header, plot area, month ticks, footer. Each row
  // gets its own band so the tick labels cannot land on the footer text.
  const headerY = 32;
  const footerY = height - 12;
  const tickY = footerY - 17;
  const plotTop = headerY + 14;

  const body: string[] = [
    textEl(PAD, headerY, `@${escapeXml(p.user)}`, t.text, 16, { weight: 600 }),
  ];

  if (o.rows) {
    // Stacked years. Rows share the y-scale set by the caller, so a busy year
    // reads as taller than a quiet one instead of every row self-normalising.
    // No month ticks in the stacked view, so the rows may use the tick band too.
    const gutter = PAD + 26;
    const available = footerY - 12 - plotTop;
    const rowHeight = o.rows.length > 0 ? available / o.rows.length : available;

    for (const [i, row] of o.rows.entries()) {
      const rect: PanelRect = {
        x: gutter,
        y: plotTop + i * rowHeight,
        width: width - gutter - PAD,
        height: Math.max(8, rowHeight - 6),
      };
      body.push(
        textEl(gutter - 8, rect.y + rect.height / 2 + 3, String(row.year), t.textDim, 9, {
          anchor: 'end',
        }),
        renderPanel({
          series: row.series,
          theme: t,
          mirror: p.mirror,
          rect,
          idPrefix: `y${row.year}`,
          showPeaks: false,
          showBaseline: p.baseline > 0,
          tension: p.smoothing,
          animate,
        }),
      );
    }
  } else if (o.series) {
    const rect: PanelRect = {
      x: PAD,
      y: plotTop,
      width: width - PAD * 2,
      height: Math.max(20, tickY - 11 - plotTop),
    };

    body.push(
      renderPanel({
        series: o.series,
        theme: t,
        mirror: p.mirror,
        rect,
        idPrefix: 'w',
        showPeaks: p.peaks > 0,
        showBaseline: p.baseline > 0,
        tension: p.smoothing,
        animate,
      }),
    );

    const xAt = xAtFor(rect, o.series.points.length);
    for (const tick of monthTicks(o.series.points, xAt, label)) {
      body.push(textEl(tick.x, tickY, tick.label, t.textDim, 9, { anchor: 'middle' }));
    }

    body.push(textEl(width - PAD, headerY, `max ${o.series.max}`, t.textDim, 9, { anchor: 'end' }));
  }

  const totals = new Intl.NumberFormat(safeLocale(p.locale)).format(o.total);
  body.push(
    textEl(
      PAD,
      footerY,
      `${totals} contributions · ${escapeXml(o.from)} – ${escapeXml(o.to)}`,
      t.textDim,
      10,
    ),
  );

  return svgCard({
    width,
    height,
    title: `GitHub contribution waveform for ${p.user}`,
    bgFill,
    bgDefs,
    border: t.border,
    borderRadius: p.borderRadius,
    hideBorder: p.hideBorder,
    animate,
    body: body.join(''),
  });
}

function safeLocale(locale: string): string {
  try {
    new Intl.NumberFormat(locale);
    return locale;
  } catch {
    return 'en';
  }
}
