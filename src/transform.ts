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
