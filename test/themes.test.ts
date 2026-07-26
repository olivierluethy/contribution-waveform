import { describe, expect, it } from 'vitest';
import {
  ALL_ROW_HEIGHT,
  FONT_STACK,
  MONTH_GEOMETRY,
  YEAR_GEOMETRY,
  allYearsHeight,
  theme,
} from '../src/themes.js';

describe('theme', () => {
  it('uses the configured accent for the above-average fill', () => {
    expect(theme('dark', '#7c3aed').above).toBe('#7c3aed');
    expect(theme('light', '#7c3aed').above).toBe('#7c3aed');
  });

  it('gives dark and light different backgrounds', () => {
    expect(theme('dark', '#7c3aed').bg).not.toBe(theme('light', '#7c3aed').bg);
  });

  it('emits only 6-digit hex colors so no rgba() reaches a renderer', () => {
    for (const name of ['dark', 'light'] as const) {
      const t = theme(name, '#7c3aed');
      for (const [key, value] of Object.entries(t)) {
        if (key === 'name' || typeof value === 'number') continue;
        expect(value, key).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });
});

describe('geometry', () => {
  it('matches the specced year viewBox', () => {
    expect(YEAR_GEOMETRY.width).toBe(880);
    expect(YEAR_GEOMETRY.height).toBe(220);
  });

  it('matches the specced month viewBox', () => {
    expect(MONTH_GEOMETRY.width).toBe(880);
    expect(MONTH_GEOMETRY.height).toBe(160);
  });

  it('grows the all-years height by one row per year', () => {
    expect(allYearsHeight(2) - allYearsHeight(1)).toBe(ALL_ROW_HEIGHT);
  });

  it('keeps eight years legible', () => {
    expect(allYearsHeight(8)).toBe(44 * 8 + 60);
  });
});

describe('FONT_STACK', () => {
  it('contains no external font reference', () => {
    expect(FONT_STACK).not.toMatch(/http|@import|url\(/);
  });
});
