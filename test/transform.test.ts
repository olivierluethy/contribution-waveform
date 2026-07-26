import { describe, expect, it } from 'vitest';
import {
  addDays,
  buildSeries,
  downsample,
  findPeaks,
  percentile,
  rollingAverage,
  scaleMaxFor,
  todayIn,
} from '../src/transform.js';
import type { PlotPoint, PlotSeries } from '../src/transform.js';

describe('todayIn', () => {
  it('formats the local date in the given zone', () => {
    // 2024-03-10T23:30:00Z is already 2024-03-11 in Zurich (UTC+1).
    expect(todayIn('Europe/Zurich', new Date('2024-03-10T23:30:00Z'))).toBe('2024-03-11');
  });

  it('stays on the previous day in a western zone', () => {
    expect(todayIn('America/Los_Angeles', new Date('2024-03-10T23:30:00Z'))).toBe('2024-03-10');
  });
});

describe('addDays', () => {
  it('adds days across a month boundary', () => {
    expect(addDays('2024-01-31', 1)).toBe('2024-02-01');
  });

  it('subtracts days across a year boundary', () => {
    expect(addDays('2024-01-01', -1)).toBe('2023-12-31');
  });

  it('handles a leap day', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
  });

  it('spans a full trailing year', () => {
    expect(addDays('2024-12-31', -364)).toBe('2024-01-02');
  });
});

describe('rollingAverage', () => {
  it('uses a partial window before the window length is reached', () => {
    expect(rollingAverage([3, 5, 10], 3)).toEqual([3, 4, 6]);
  });

  it('drops the oldest value once the window is full', () => {
    // window 2: [1], [1,2], [2,3], [3,4]
    expect(rollingAverage([1, 2, 3, 4], 2)).toEqual([1, 1.5, 2.5, 3.5]);
  });

  it('returns zeros for an all-zero series', () => {
    expect(rollingAverage([0, 0, 0], 7)).toEqual([0, 0, 0]);
  });

  it('returns an empty array for empty input', () => {
    expect(rollingAverage([], 7)).toEqual([]);
  });
});

describe('percentile', () => {
  it('uses nearest-rank', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    expect(percentile(values, 0.98)).toBe(98);
  });

  it('returns the max when the percentile lands on the last element', () => {
    expect(percentile([1, 2, 3], 1)).toBe(3);
  });

  it('does not mutate the input', () => {
    const values = [5, 1, 3];
    percentile(values, 0.5);
    expect(values).toEqual([5, 1, 3]);
  });

  it('returns 0 for empty input', () => {
    expect(percentile([], 0.98)).toBe(0);
  });
});

describe('scaleMaxFor', () => {
  it('clips a lone spike to the 98th percentile', () => {
    const values = [...Array.from({ length: 99 }, () => 2), 200];
    expect(scaleMaxFor(values)).toBe(2);
  });

  it('falls back to the max when the 98th percentile is zero', () => {
    const values = [...Array.from({ length: 99 }, () => 0), 7];
    expect(scaleMaxFor(values)).toBe(7);
  });

  it('falls back to 1 when every value is zero', () => {
    expect(scaleMaxFor([0, 0, 0])).toBe(1);
  });

  it('falls back to 1 for empty input', () => {
    expect(scaleMaxFor([])).toBe(1);
  });
});

function days(from: string, counts: number[]) {
  return counts.map((count, i) => ({ date: addDays(from, i), count }));
}

/**
 * `findPeaks` measures separation in array positions, which equals days only
 * because real series are contiguous. Build test points the same way.
 */
function contiguous(counts: number[], from = '2024-01-01'): PlotPoint[] {
  return days(from, counts).map((d) => ({
    date: d.date,
    count: d.count,
    clamped: d.count,
    avg7: d.count,
    avg30: d.count,
  }));
}

describe('findPeaks', () => {
  it('picks the highest days', () => {
    expect(findPeaks(contiguous([1, 9, 4]), 2, 1).map((p) => p.count)).toEqual([9, 4]);
  });

  it('returns peaks in chronological order', () => {
    const points = contiguous([4, ...Array.from({ length: 18 }, () => 0), 9]);
    expect(findPeaks(points, 2).map((p) => p.date)).toEqual(['2024-01-01', '2024-01-20']);
  });

  it('enforces a minimum separation so one spike does not take every marker', () => {
    // Three adjacent big days, then isolated smaller ones a week apart.
    const points = contiguous([10, 9, 8, 0, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 4]);
    expect(findPeaks(points, 3).map((p) => p.date)).toEqual([
      '2024-01-01',
      '2024-01-08',
      '2024-01-15',
    ]);
  });

  it('ignores zero-contribution days', () => {
    expect(findPeaks(contiguous([0, 0]), 3)).toEqual([]);
  });

  it('returns nothing when asked for zero peaks', () => {
    expect(findPeaks(contiguous([5]), 0)).toEqual([]);
  });
});

describe('buildSeries', () => {
  it('slices the window and keeps raw counts', () => {
    const series = buildSeries(days('2024-01-01', [1, 2, 3, 4, 5]), '2024-01-02', '2024-01-04', 3);
    expect(series.points.map((p) => p.date)).toEqual(['2024-01-02', '2024-01-03', '2024-01-04']);
    expect(series.points.map((p) => p.count)).toEqual([2, 3, 4]);
    expect(series.total).toBe(9);
    expect(series.from).toBe('2024-01-02');
    expect(series.to).toBe('2024-01-04');
  });

  it('seeds rolling averages from history before the window', () => {
    // 30 days of 10 precede the window. On the window's first day the 30-day
    // average must still reflect those 10s (29 of them plus this 0 = 290/30),
    // not restart from zero at the window edge.
    const history = days('2024-01-01', Array.from({ length: 30 }, () => 10));
    const window = days('2024-01-31', [0, 0, 0, 0, 0, 0, 0, 0, 0, 20]);
    const series = buildSeries([...history, ...window], '2024-01-31', '2024-02-09', 3);
    expect(series.points).toHaveLength(10);
    expect(series.points[0]!.avg30).toBeCloseTo(290 / 30, 5);
  });

  it('clamps values above the 98th percentile', () => {
    const counts = [...Array.from({ length: 99 }, () => 2), 200];
    const series = buildSeries(days('2024-01-01', counts), '2024-01-01', addDays('2024-01-01', 99), 3);
    expect(series.scaleMax).toBe(2);
    expect(series.points[99]!.clamped).toBe(2);
    expect(series.points[99]!.count).toBe(200);
    expect(series.max).toBe(200);
  });

  it('never returns a zero scaleMax for an all-zero user', () => {
    const series = buildSeries(days('2024-01-01', [0, 0, 0]), '2024-01-01', '2024-01-03', 3);
    expect(series.scaleMax).toBe(1);
    expect(series.max).toBe(0);
    expect(series.total).toBe(0);
    expect(series.peaks).toEqual([]);
  });

  it('handles an empty history without throwing', () => {
    const series = buildSeries([], '2024-01-01', '2024-12-31', 3);
    expect(series.points).toEqual([]);
    expect(series.scaleMax).toBe(1);
    expect(series.from).toBe('2024-01-01');
    expect(series.to).toBe('2024-12-31');
  });
});

describe('downsample', () => {
  /** A point where every drawn field is deliberately distinct from `count`, so a test that reads the wrong field fails loudly. */
  function point(date: string, count: number, offset = 0): PlotPoint {
    return { date, count, clamped: count + offset, avg7: count + offset * 2, avg30: count + offset * 3 };
  }

  function seriesOf(points: PlotPoint[]): PlotSeries {
    return {
      points,
      scaleMax: 100,
      max: 42,
      total: 999,
      from: '2024-01-01',
      to: '2024-12-31',
      peaks: points.length > 0 ? [{ index: 0, date: points[0]!.date, count: points[0]!.count }] : [],
    };
  }

  it('buckets an exact multiple: sums count, averages the drawn fields', () => {
    const s = seriesOf([
      point('2024-01-01', 2, 1),
      point('2024-01-02', 4, 1),
      point('2024-01-03', 6, 1),
      point('2024-01-04', 8, 1),
    ]);
    const out = downsample(s, 2);
    expect(out.points).toEqual([
      { date: '2024-01-01', count: 6, clamped: 4, avg7: 5, avg30: 6 },
      { date: '2024-01-03', count: 14, clamped: 8, avg7: 9, avg30: 10 },
    ]);
  });

  it('keeps a trailing partial bucket, averaged over its own (smaller) size', () => {
    const s = seriesOf([
      point('2024-01-01', 2, 0),
      point('2024-01-02', 4, 0),
      point('2024-01-03', 9, 0),
    ]);
    const out = downsample(s, 2);
    expect(out.points).toHaveLength(2);
    // The trailing bucket has one point: averaging over 1 (not 2) keeps its
    // value exact rather than halving it.
    expect(out.points[1]).toEqual({ date: '2024-01-03', count: 9, clamped: 9, avg7: 9, avg30: 9 });
  });

  it('is the identity at factor 1 (aside from clearing peaks)', () => {
    const s = seriesOf([point('2024-01-01', 3), point('2024-01-02', 5)]);
    const out = downsample(s, 1);
    expect(out.points).toEqual(s.points);
  });

  it('treats factor <= 1 (0, negative) the same as factor 1', () => {
    const s = seriesOf([point('2024-01-01', 3), point('2024-01-02', 5)]);
    expect(downsample(s, 0).points).toEqual(s.points);
    expect(downsample(s, -5).points).toEqual(s.points);
  });

  it('handles an empty series without throwing', () => {
    const out = downsample(seriesOf([]), 7);
    expect(out.points).toEqual([]);
    expect(out.peaks).toEqual([]);
  });

  it('handles a series shorter than one bucket as a single partial bucket', () => {
    const s = seriesOf([point('2024-01-01', 3), point('2024-01-02', 5)]);
    const out = downsample(s, 7);
    expect(out.points).toHaveLength(1);
    expect(out.points[0]).toEqual({ date: '2024-01-01', count: 8, clamped: 4, avg7: 4, avg30: 4 });
  });

  it('clears peaks, since their indices would refer to the wrong (pre-bucketed) points', () => {
    const s = seriesOf([point('2024-01-01', 3), point('2024-01-02', 5), point('2024-01-03', 9)]);
    expect(s.peaks).not.toEqual([]);
    expect(downsample(s, 2).peaks).toEqual([]);
  });

  it('carries max, total, from and to through unchanged', () => {
    const s = seriesOf([point('2024-01-01', 3), point('2024-01-02', 5)]);
    const out = downsample(s, 2);
    expect(out.max).toBe(s.max);
    expect(out.total).toBe(s.total);
    expect(out.from).toBe(s.from);
    expect(out.to).toBe(s.to);
  });

  it('rescales scaleMax to the downsampled peak so the row is not under-filled', () => {
    // Bucket means are far below the daily-resolution scaleMax of 100. Carrying
    // it through would draw this row as a nearly flat line.
    const s = seriesOf([point('2024-01-01', 3), point('2024-01-02', 5)]);
    const out = downsample(s, 2);
    expect(s.scaleMax).toBe(100);
    expect(out.scaleMax).toBe(4); // mean of 3 and 5, the largest drawn value
  });

  it('never lets a drawn value exceed the rescaled scaleMax', () => {
    // avg30 is the largest drawn field for these points; scaleMax must cover it,
    // otherwise the curve would be drawn outside its panel.
    const s = seriesOf([point('2024-01-01', 2, 1), point('2024-01-02', 4, 1)]);
    const out = downsample(s, 2);
    for (const p of out.points) {
      expect(p.clamped).toBeLessThanOrEqual(out.scaleMax);
      expect(p.avg7).toBeLessThanOrEqual(out.scaleMax);
      expect(p.avg30).toBeLessThanOrEqual(out.scaleMax);
    }
  });

  it('never returns a zero scaleMax for an all-zero series', () => {
    const s = seriesOf([point('2024-01-01', 0), point('2024-01-02', 0)]);
    expect(downsample(s, 2).scaleMax).toBe(1);
  });

  it('never produces NaN for a degenerate factor', () => {
    const s = seriesOf([point('2024-01-01', 3)]);
    for (const bad of [0, -5, NaN, Infinity, -Infinity]) {
      const out = downsample(s, bad);
      for (const p of out.points) {
        expect(Number.isNaN(p.count)).toBe(false);
        expect(Number.isNaN(p.clamped)).toBe(false);
        expect(Number.isNaN(p.avg7)).toBe(false);
        expect(Number.isNaN(p.avg30)).toBe(false);
      }
    }
  });
});
