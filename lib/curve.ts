export interface Point {
  x: number;
  y: number;
}

/**
 * Two decimals keeps the emitted files small. Non-finite values collapse to 0
 * rather than throwing: a degenerate input must never put `NaN` into a `d`
 * attribute, and must never crash the build.
 */
export function round(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/**
 * Uniform Catmull-Rom spline emitted as cubic Béziers. For points p0..p3 the
 * segment p1 -> p2 uses:
 *     cp1 = p1 + (p2 - p0) * t / 3
 *     cp2 = p2 - (p3 - p1) * t / 3
 * At the default t = 0.5 this is the classic `/6` form. Terminal points are
 * duplicated so the curve starts and ends exactly on the data.
 */
export function catmullRomPath(points: Point[], tension = 0.5): string {
  if (points.length === 0) return '';
  const first = points[0]!;
  if (points.length === 1) return `M ${round(first.x)} ${round(first.y)}`;

  const parts: string[] = [`M ${round(first.x)} ${round(first.y)}`];
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p0 = points[i - 1] ?? p1;
    const p3 = points[i + 2] ?? p2;

    const c1x = p1.x + ((p2.x - p0.x) * tension) / 3;
    const c1y = p1.y + ((p2.y - p0.y) * tension) / 3;
    const c2x = p2.x - ((p3.x - p1.x) * tension) / 3;
    const c2y = p2.y - ((p3.y - p1.y) * tension) / 3;

    parts.push(
      `C ${round(c1x)} ${round(c1y)}, ${round(c2x)} ${round(c2y)}, ${round(p2.x)} ${round(p2.y)}`,
    );
  }
  return parts.join(' ');
}

/** Closed region between two curves: upper forward, lower reversed. */
export function bandPath(upper: Point[], lower: Point[]): string {
  if (upper.length === 0 || lower.length === 0) return '';
  const back = catmullRomPath([...lower].reverse()).replace(/^M /, 'L ');
  return `${catmullRomPath(upper)} ${back} Z`;
}

/** Closed region between a curve and a horizontal edge. Used for fills and clip paths. */
export function areaPath(curve: Point[], edgeY: number): string {
  if (curve.length === 0) return '';
  const first = curve[0]!;
  const last = curve[curve.length - 1]!;
  return `${catmullRomPath(curve)} L ${round(last.x)} ${round(edgeY)} L ${round(first.x)} ${round(edgeY)} Z`;
}
