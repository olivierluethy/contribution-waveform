export const THEME_NAMES = [
  'dark',
  'light',
  'github-dark',
  'github-light',
  'radical',
  'nord',
] as const;

export type ThemeName = (typeof THEME_NAMES)[number];

export interface Theme {
  /** Card background. Overridable by `background`, which also accepts a gradient. */
  bg: string;
  /** Card border. */
  border: string;
  /** Rolling-baseline band fill. */
  band: string;
  bandOpacity: number;
  /** 7-day rolling average stroke. */
  avg7: string;
  /** Daily series stroke — the wave itself. */
  line: string;
  /** Deviation fill where the day beat its rolling average. */
  fillAbove: string;
  fillAboveOpacity: number;
  /** Deviation fill where the day fell short. */
  fillBelow: string;
  fillBelowOpacity: number;
  /** Header and footer text. */
  text: string;
  /** Axis labels, peak counts, the max-value label. */
  textDim: string;
  /** Peak marker dots. */
  peak: string;
}

/** Generic stack only — an SVG inside an `<img>` cannot load an external font. */
export const FONT_STACK =
  'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';

const THEMES: Record<ThemeName, Theme> = {
  dark: {
    bg: '#0d1117',
    border: '#30363d',
    band: '#21262d',
    bandOpacity: 0.85,
    avg7: '#8b949e',
    line: '#c9d1d9',
    fillAbove: '#7c3aed',
    fillAboveOpacity: 0.55,
    fillBelow: '#30363d',
    fillBelowOpacity: 0.7,
    text: '#c9d1d9',
    textDim: '#6e7681',
    peak: '#f0f6fc',
  },
  light: {
    bg: '#ffffff',
    border: '#d0d7de',
    band: '#eaeef2',
    bandOpacity: 0.85,
    avg7: '#6e7781',
    line: '#24292f',
    fillAbove: '#7c3aed',
    fillAboveOpacity: 0.5,
    fillBelow: '#d0d7de',
    fillBelowOpacity: 0.7,
    text: '#24292f',
    textDim: '#6e7781',
    peak: '#0d1117',
  },
  'github-dark': {
    bg: '#0d1117',
    border: '#30363d',
    band: '#161b22',
    bandOpacity: 0.9,
    avg7: '#26a641',
    line: '#39d353',
    fillAbove: '#39d353',
    fillAboveOpacity: 0.45,
    fillBelow: '#006d32',
    fillBelowOpacity: 0.5,
    text: '#c9d1d9',
    textDim: '#8b949e',
    peak: '#39d353',
  },
  'github-light': {
    bg: '#ffffff',
    border: '#d0d7de',
    band: '#ebedf0',
    bandOpacity: 0.9,
    avg7: '#40c463',
    line: '#216e39',
    fillAbove: '#40c463',
    fillAboveOpacity: 0.55,
    fillBelow: '#9be9a8',
    fillBelowOpacity: 0.65,
    text: '#24292f',
    textDim: '#57606a',
    peak: '#216e39',
  },
  radical: {
    bg: '#141321',
    border: '#fe428e',
    band: '#1f1d36',
    bandOpacity: 0.9,
    avg7: '#a9fef7',
    line: '#fe428e',
    fillAbove: '#fe428e',
    fillAboveOpacity: 0.45,
    fillBelow: '#a9fef7',
    fillBelowOpacity: 0.25,
    text: '#f8d847',
    textDim: '#a9fef7',
    peak: '#f8d847',
  },
  nord: {
    bg: '#2e3440',
    border: '#4c566a',
    band: '#3b4252',
    bandOpacity: 0.9,
    avg7: '#81a1c1',
    line: '#eceff4',
    fillAbove: '#88c0d0',
    fillAboveOpacity: 0.55,
    fillBelow: '#4c566a',
    fillBelowOpacity: 0.7,
    text: '#eceff4',
    textDim: '#81a1c1',
    peak: '#ebcb8b',
  },
};

export function getTheme(name: ThemeName): Theme {
  return { ...THEMES[name] };
}
