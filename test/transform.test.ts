import { describe, expect, it } from 'vitest';
import {
  addDays,
  percentile,
  rollingAverage,
  scaleMaxFor,
  todayIn,
} from '../src/transform.js';

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
