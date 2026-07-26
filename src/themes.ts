export type ThemeName = 'dark' | 'light';

export interface Theme {
  name: ThemeName;
  /** Page background rect. */
  bg: string;
  /** 30-day baseline band fill. */
  band: string;
  bandOpacity: number;
  /** 7-day rolling average stroke. */
  avg7: string;
  /** Daily series stroke. */
  daily: string;
  /** Deviation fill where the day beats its 30-day average (the configured accent). */
  above: string;
  aboveOpacity: number;
  /** Deviation fill where the day falls short. */
  below: string;
  belowOpacity: number;
  text: string;
  textDim: string;
  peak: string;
}

/** Generic stack only — an SVG in a README cannot load an external font. */
export const FONT_STACK = 'ui-sans-serif, -apple-system, "Segoe UI", sans-serif';

const DARK = {
  bg: '#0d1117',
  band: '#21262d',
  avg7: '#8b949e',
  daily: '#c9d1d9',
  below: '#30363d',
  text: '#c9d1d9',
  textDim: '#6e7681',
  peak: '#f0f6fc',
};

const LIGHT = {
  bg: '#ffffff',
  band: '#eaeef2',
  avg7: '#6e7781',
  daily: '#24292f',
  below: '#d0d7de',
  text: '#24292f',
  textDim: '#6e7781',
  peak: '#0d1117',
};

export function theme(name: ThemeName, accent: string): Theme {
  const base = name === 'dark' ? DARK : LIGHT;
  return {
    name,
    ...base,
    bandOpacity: 0.85,
    above: accent,
    aboveOpacity: 0.55,
    belowOpacity: 0.7,
  };
}

export interface Geometry {
  width: number;
  height: number;
  /** Insets from each edge to the plot area. */
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export const YEAR_GEOMETRY: Geometry = {
  width: 880,
  height: 220,
  left: 44,
  right: 20,
  top: 26,
  bottom: 50,
};

export const MONTH_GEOMETRY: Geometry = {
  width: 880,
  height: 160,
  left: 44,
  right: 20,
  top: 24,
  bottom: 42,
};

/** One wave row per year in the all-years view. */
export const ALL_ROW_HEIGHT = 44;
/** Left gutter reserved for the year label. */
export const ALL_GUTTER = 52;

/**
 * The all-years view grows instead of compressing: a fixed 220px height squeezes
 * eight years into ~20px rows, which is not legible.
 */
export function allYearsHeight(years: number): number {
  return ALL_ROW_HEIGHT * Math.max(years, 1) + 60;
}
