import { z } from 'zod';
import { THEME_NAMES, type ThemeName } from './themes';

/** The 148 CSS named colours. An allowlist, so a colour param can never be arbitrary text. */
const CSS_COLOR_NAMES = new Set(
  `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue
   blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk
   crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki
   darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen
   darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue
   dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite
   gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki
   lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan
   lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen
   lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen
   magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen
   mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream
   mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid
   palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum
   powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown
   seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen
   steelblue tan teal thistle tomato transparent turquoise violet wheat white whitesmoke
   yellow yellowgreen`
    .split(/\s+/)
    .filter(Boolean),
);

const HEX = /^[0-9a-fA-F]{3,8}$/;

export type Background =
  | { kind: 'solid'; value: string }
  | { kind: 'gradient'; angle: number; stops: string[] };

/**
 * A colour param is a bare hex string (no `#`, 3/4/6/8 digits) or a CSS colour
 * name. Returns null for anything else so the caller can render an error card
 * rather than emitting unvalidated text into the document.
 */
export function parseColor(raw: string): string | null {
  const value = raw.trim();
  if (HEX.test(value)) return `#${value}`;
  if (CSS_COLOR_NAMES.has(value.toLowerCase())) return value.toLowerCase();
  return null;
}

/**
 * `background` additionally accepts `angle,color1,...,colorN` for a linear
 * gradient — the same shape github-readme-stats uses.
 */
export function parseBackground(raw: string): Background | null {
  const parts = raw.split(',').map((p) => p.trim());

  if (parts.length >= 3) {
    const angle = Number(parts[0]);
    if (!Number.isFinite(angle)) return null;
    const stops: string[] = [];
    for (const part of parts.slice(1)) {
      const color = parseColor(part);
      if (!color) return null;
      stops.push(color);
    }
    return { kind: 'gradient', angle, stops };
  }

  const solid = parseColor(raw);
  return solid ? { kind: 'solid', value: solid } : null;
}

const boolish = z
  .string()
  .optional()
  .transform((v) => (v === undefined ? undefined : v.toLowerCase() === 'true'));

const Query = z.object({
  user: z
    .string({ required_error: 'user' })
    .regex(/^[A-Za-z0-9-]{1,39}$/, 'user'),
  range: z.enum(['year', 'month', 'all']).optional(),
  theme: z.enum(THEME_NAMES).optional(),
  mirror: boolish,
  smoothing: z.coerce.number().min(0).max(1).optional(),
  baseline: z.coerce.number().int().min(0).max(365).optional(),
  peaks: z.coerce.number().int().min(0).max(10).optional(),
  hide_border: boolish,
  border_radius: z.coerce.number().min(0).max(50).optional(),
  card_width: z.coerce.number().int().min(300).max(2000).optional(),
  card_height: z.coerce.number().int().min(120).max(2000).optional(),
  disable_animations: boolish,
  locale: z
    .string()
    .regex(/^[a-z]{2}$/i, 'locale')
    .optional(),
  type: z.enum(['svg', 'json']).optional(),
});

export interface WaveParams {
  user: string;
  range: 'year' | 'month' | 'all';
  theme: ThemeName;
  mirror: boolean;
  smoothing: number;
  baseline: number;
  peaks: number;
  hideBorder: boolean;
  borderRadius: number;
  cardWidth: number;
  cardHeight: number;
  disableAnimations: boolean;
  locale: string;
  type: 'svg' | 'json';
  /** Explicit overrides. Undefined means "use the theme's value". */
  background?: Background;
  line?: string;
  fillAbove?: string;
  fillBelow?: string;
  text?: string;
}

export type ParseResult =
  | { ok: true; params: WaveParams }
  | { ok: false; message: string; theme: ThemeName };

/** Best-effort theme lookup, so an error card still honours `?theme=` when the failure is elsewhere. */
function themeHint(search: URLSearchParams): ThemeName {
  const raw = search.get('theme');
  return (THEME_NAMES as readonly string[]).includes(raw ?? '')
    ? (raw as ThemeName)
    : 'dark';
}

export function parseParams(search: URLSearchParams): ParseResult {
  const theme = themeHint(search);

  // Unknown keys are ignored rather than rejected: a README URL that picked up
  // a stray tracking param should still render.
  const raw = Object.fromEntries(
    [...search.entries()].filter(([k]) => k in Query.shape),
  );

  const parsed = Query.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path[0] ?? issue?.message ?? 'parameter';
    return {
      ok: false,
      theme,
      message:
        field === 'user' && !search.get('user')
          ? 'Missing required parameter `user`'
          : `Invalid value for \`${String(field)}\``,
    };
  }

  const q = parsed.data;
  const params: WaveParams = {
    user: q.user,
    range: q.range ?? 'year',
    theme: q.theme ?? 'dark',
    mirror: q.mirror ?? false,
    smoothing: q.smoothing ?? 0.5,
    baseline: q.baseline ?? 30,
    peaks: q.peaks ?? 3,
    hideBorder: q.hide_border ?? false,
    borderRadius: q.border_radius ?? 6,
    cardWidth: q.card_width ?? 495,
    cardHeight: q.card_height ?? 195,
    disableAnimations: q.disable_animations ?? false,
    locale: (q.locale ?? 'en').toLowerCase(),
    type: q.type ?? 'svg',
  };

  // Colour overrides are parsed separately so an invalid one names itself.
  const colorFields = [
    ['line', 'line'],
    ['fill_above', 'fillAbove'],
    ['fill_below', 'fillBelow'],
    ['text', 'text'],
  ] as const;

  for (const [queryKey, paramKey] of colorFields) {
    const rawValue = search.get(queryKey);
    if (rawValue === null || rawValue === '') continue;
    const color = parseColor(rawValue);
    if (!color) return { ok: false, theme, message: `Invalid value for \`${queryKey}\`` };
    params[paramKey] = color;
  }

  const rawBackground = search.get('background');
  if (rawBackground !== null && rawBackground !== '') {
    const background = parseBackground(rawBackground);
    if (!background) return { ok: false, theme, message: 'Invalid value for `background`' };
    params.background = background;
  }

  return { ok: true, params };
}
