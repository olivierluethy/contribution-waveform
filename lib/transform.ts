export interface ContributionDay {
  date: string;
  count: number;
}

/** Local calendar date (YYYY-MM-DD) in the given IANA zone. `en-CA` formats as YYYY-MM-DD. */
export function todayIn(timezone: string, now: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Shift a YYYY-MM-DD string by whole days. UTC-anchored so DST never shifts the result. */
export function addDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * Trailing rolling mean. Positions before the window is full average only the
 * days available so far, so callers can compute over a full history and slice
 * afterwards to get windows seeded by preceding data.
 */
export function rollingAverage(values: number[], window: number): number[] {
  const out: number[] = new Array(values.length);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= window) sum -= values[i - window]!;
    out[i] = sum / Math.min(i + 1, window);
  }
  return out;
}

/** Nearest-rank percentile. `p` is a fraction in [0, 1]. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank))]!;
}

/**
 * Y-axis scale: the 98th percentile, so one 200-commit day cannot flatten the
 * rest of the wave. Never returns 0 — that would divide by zero and put NaN in
 * a path `d` attribute.
 */
export function scaleMaxFor(values: number[]): number {
  const p98 = percentile(values, 0.98);
  if (p98 > 0) return p98;
  const max = values.reduce((a, b) => (b > a ? b : a), 0);
  return max > 0 ? max : 1;
}

export interface PlotPoint {
  date: string;
  /** Raw contribution count. */
  count: number;
  /** Count clipped to `scaleMax`. */
  clamped: number;
  avg7: number;
  avg30: number;
}

export interface Peak {
  index: number;
  date: string;
  count: number;
}

export interface PlotSeries {
  points: PlotPoint[];
  /** Y-axis top: the 98th percentile of the window. Always > 0. */
  scaleMax: number;
  /** Highest raw count in the window, for the corner label. */
  max: number;
  total: number;
  from: string;
  to: string;
  peaks: Peak[];
}

/**
 * Top `count` days, forced at least `minSeparation` days apart so three markers
 * cannot stack on a single spike. Returned in chronological order.
 */
export function findPeaks(points: PlotPoint[], count: number, minSeparation = 7): Peak[] {
  const chosen: Peak[] = [];
  const candidates = points
    .map((p, index) => ({ index, date: p.date, count: p.count }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count || a.index - b.index);

  for (const candidate of candidates) {
    if (chosen.length >= count) break;
    if (chosen.some((k) => Math.abs(k.index - candidate.index) < minSeparation)) continue;
    chosen.push(candidate);
  }
  return chosen.sort((a, b) => a.index - b.index);
}

/**
 * Build a plottable window. Rolling averages are computed across the *whole*
 * history and sliced afterwards, so the left edge of a trailing-365 window is
 * seeded by the preceding month instead of ramping up from zero.
 */
export interface BuildOptions {
  /** Rolling-average window for the baseline band, in days. Defaults to 30. */
  baselineWindow?: number;
  /**
   * Forces the y-axis ceiling instead of deriving it from this window. Used by
   * the all-years view so every year row shares one scale and the rows are
   * actually comparable to each other.
   */
  scaleMax?: number;
}

export function buildSeries(
  all: ContributionDay[],
  from: string,
  to: string,
  peakCount: number,
  opts: BuildOptions = {},
): PlotSeries {
  const counts = all.map((d) => d.count);
  const avg7 = rollingAverage(counts, 7);
  const avg30 = rollingAverage(counts, Math.max(1, opts.baselineWindow ?? 30));

  const indices: number[] = [];
  for (let i = 0; i < all.length; i++) {
    const date = all[i]!.date;
    if (date >= from && date <= to) indices.push(i);
  }

  const windowCounts = indices.map((i) => counts[i]!);
  const scaleMax = opts.scaleMax && opts.scaleMax > 0 ? opts.scaleMax : scaleMaxFor(windowCounts);

  const points: PlotPoint[] = indices.map((i) => ({
    date: all[i]!.date,
    count: counts[i]!,
    clamped: Math.min(counts[i]!, scaleMax),
    avg7: Math.min(avg7[i]!, scaleMax),
    avg30: Math.min(avg30[i]!, scaleMax),
  }));

  return {
    points,
    scaleMax,
    max: windowCounts.reduce((a, b) => (b > a ? b : a), 0),
    total: windowCounts.reduce((a, b) => a + b, 0),
    from: points[0]?.date ?? from,
    to: points[points.length - 1]?.date ?? to,
    peaks: findPeaks(points, peakCount),
  };
}

/**
 * Groups consecutive points into buckets of `factor` and averages the drawn
 * fields within each bucket — a statistics operation for views (the
 * all-years row) where daily resolution is more points than the pixel width
 * can usefully show.
 *
 * `clamped`, `avg7` and `avg30` are averaged (they are the values that get
 * drawn); `count` is summed (it is a total, not a rate); `date` is the first
 * date in the bucket. A trailing partial bucket is kept — never dropped or
 * padded — and averaged/summed over its own, smaller size.
 *
 * `scaleMax`, `max`, `total`, `from` and `to` describe the whole window and
 * are carried through unchanged. `peaks` always comes back empty: its
 * indices refer to positions in the *original* (pre-bucketed) points array
 * and would silently point at the wrong bucket otherwise — and the one
 * caller of this function (the all-years view) never renders peaks anyway.
 *
 * `factor <= 1` (including 0, negative, or non-finite input) is treated as
 * a no-op bucket size of 1, so the result is the input points unchanged
 * (aside from `peaks`) rather than throwing or dividing by zero.
 */
export function downsample(series: PlotSeries, factor: number): PlotSeries {
  const step = Number.isFinite(factor) && factor > 1 ? Math.floor(factor) : 1;

  const points: PlotPoint[] = [];
  for (let i = 0; i < series.points.length; i += step) {
    const bucket = series.points.slice(i, i + step);
    const n = bucket.length;
    const sum = (pick: (p: PlotPoint) => number) =>
      bucket.reduce((total, p) => total + pick(p), 0);

    points.push({
      date: bucket[0]!.date,
      count: sum((p) => p.count),
      clamped: sum((p) => p.clamped) / n,
      avg7: sum((p) => p.avg7) / n,
      avg30: sum((p) => p.avg30) / n,
    });
  }

  // Bucket means are systematically smaller than the daily 98th percentile, so
  // carrying the original scaleMax through would leave every row under-filled
  // and nearly flat. Rescale to the downsampled distribution. Averaging has
  // already removed the outliers a percentile clamp exists to suppress, so the
  // true peak is the right ceiling here — it fills the row without clipping
  // any drawn value. Never 0, which would divide by zero downstream.
  const peak = points.reduce((m, p) => Math.max(m, p.clamped, p.avg7, p.avg30), 0);
  const scaleMax = peak > 0 ? peak : 1;

  return { ...series, points, scaleMax, peaks: [] };
}
