# GitHub Contribution Waveform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render `olivierluethy`'s GitHub contribution history as six self-contained animated SVG waveforms, publish them plus a dark-mode Vite/Tailwind site to GitHub Pages, and emit a copy-paste `<picture>` snippet for the profile README.

**Architecture:** A pure pipeline — `fetch` (GraphQL v4, year by year) → `data/contributions.json` → `transform` (rolling 7/30 averages, p98 clamp, normalize) → `curve` (Catmull-Rom → cubic Bézier) → `render` (SVG string composition) → `dist/*.svg`. `transform` and `curve` are pure functions over plain numbers with no SVG knowledge; `render` does placement and string assembly with no statistics. A scheduled GitHub Action regenerates and deploys daily.

**Tech Stack:** TypeScript (ESM, NodeNext), Node 20+, zod, vitest, Vite, Tailwind CSS v4. No charting library — SVG is emitted as strings and curve math is hand-rolled. Networking uses the built-in `fetch`, so `graphql-request` is not needed.

## Global Constraints

Every task's requirements implicitly include this section.

- Node 20+, TypeScript, ESM (`"type": "module"`). NodeNext resolution means **relative imports must carry a `.js` extension** even in `.ts` source.
- Runtime dependencies: **`zod` only**. Test/dev: `vitest`, `typescript`, `@types/node`, `vite`, `tailwindcss`, `@tailwindcss/vite`. Nothing else.
- No charting library. No `d3-*`. SVG is emitted as strings.
- Generated SVGs must be **fully self-contained**: no `<script>`, no `<foreignObject>`, no external font imports, no external image refs, no `http://` reference, no `@import`, no `xlink:href` to an external origin.
- Font stack in SVGs is exactly: `ui-sans-serif, -apple-system, "Segoe UI", sans-serif`.
- Animation lives **inside** the SVG as CSS `@keyframes` in an inline `<style>`. Never external JS. The base style must be the *finished* state so a renderer that ignores animation shows a complete image.
- No `width`/`height` attributes on the root `<svg>`. `preserveAspectRatio="xMidYMid meet"` always.
- Username: `olivierluethy`. Repo: `contribution-waveform`. Pages base: `https://olivierluethy.github.io/contribution-waveform/`. Accent: `#7c3aed`. Timezone: `Europe/Zurich`. `mirror` defaults to **true**. `peakMarkers` defaults to **3**.
- A path `d` attribute must never contain `NaN`, `Infinity`, or `undefined`, including for a user with zero contributions.
- Conventional Commits for every commit.
- The Pages site is **dark mode only** and uses Tailwind exclusively — no custom CSS file beyond the Tailwind entry.

---

### Task 1: Project scaffolding and validated config

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `waveform.config.json`
- Create: `src/config.ts`
- Test: `test/config.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Config` (`{ username: string; timezone: string; peakMarkers: number; mirror: boolean; accent: string }`), `ConfigSchema`, `isValidTimeZone(tz: string): boolean`, `loadConfig(path?: string): Promise<Config>`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "contribution-waveform",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "compile": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "fetch": "npm run compile && node build/cli.js fetch",
    "build": "npm run compile && node build/cli.js build",
    "build:site": "vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@types/node": "^20.14.0",
    "tailwindcss": "^4.0.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022", "DOM"],
    "rootDir": "src",
    "outDir": "build",
    "strict": true,
    "noUncheckedIndexedAccess": false,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "esModuleInterop": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
build/
site-dist/
*.local
.DS_Store
```

Note: `dist/` is **not** ignored — the generated SVGs are committed and deployed.

- [ ] **Step 5: Create `waveform.config.json`**

```json
{
  "username": "olivierluethy",
  "timezone": "Europe/Zurich",
  "peakMarkers": 3,
  "mirror": true,
  "accent": "#7c3aed"
}
```

- [ ] **Step 6: Install dependencies**

Run: `npm install`
Expected: completes, creates `package-lock.json` and `node_modules/`.

- [ ] **Step 7: Write the failing test**

Create `test/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ConfigSchema, isValidTimeZone, loadConfig } from '../src/config.js';

const valid = {
  username: 'olivierluethy',
  timezone: 'Europe/Zurich',
  peakMarkers: 3,
  mirror: true,
  accent: '#7c3aed',
};

describe('ConfigSchema', () => {
  it('accepts a valid config', () => {
    expect(ConfigSchema.parse(valid)).toEqual(valid);
  });

  it('rejects a username with invalid characters', () => {
    expect(() => ConfigSchema.parse({ ...valid, username: 'bad user!' })).toThrow();
  });

  it('rejects a username starting with a hyphen', () => {
    expect(() => ConfigSchema.parse({ ...valid, username: '-nope' })).toThrow();
  });

  it('rejects an unknown timezone', () => {
    expect(() => ConfigSchema.parse({ ...valid, timezone: 'Mars/Olympus' })).toThrow();
  });

  it('rejects a non-integer peakMarkers', () => {
    expect(() => ConfigSchema.parse({ ...valid, peakMarkers: 2.5 })).toThrow();
  });

  it('rejects peakMarkers above 10', () => {
    expect(() => ConfigSchema.parse({ ...valid, peakMarkers: 11 })).toThrow();
  });

  it('rejects a non-hex accent', () => {
    expect(() => ConfigSchema.parse({ ...valid, accent: 'violet' })).toThrow();
  });

  it('rejects a 3-digit hex accent', () => {
    expect(() => ConfigSchema.parse({ ...valid, accent: '#abc' })).toThrow();
  });
});

describe('isValidTimeZone', () => {
  it('accepts a real IANA zone', () => {
    expect(isValidTimeZone('Europe/Zurich')).toBe(true);
  });

  it('rejects nonsense', () => {
    expect(isValidTimeZone('Not/AZone')).toBe(false);
  });
});

describe('loadConfig', () => {
  it('loads the repo config', async () => {
    const config = await loadConfig('waveform.config.json');
    expect(config.username).toBe('olivierluethy');
    expect(config.mirror).toBe(true);
    expect(config.accent).toBe('#7c3aed');
  });
});
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `npx vitest run test/config.test.ts`
Expected: FAIL — cannot resolve `../src/config.js`.

- [ ] **Step 9: Write `src/config.ts`**

```ts
import { readFile } from 'node:fs/promises';
import { z } from 'zod';

/** GitHub's own username rule: alphanumeric or single hyphens, cannot start or end with a hyphen, max 39 chars. */
const USERNAME_RE = /^[a-zA-Z\d](?:[a-zA-Z\d]|-(?=[a-zA-Z\d])){0,38}$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const ConfigSchema = z.object({
  username: z.string().regex(USERNAME_RE, 'invalid GitHub username'),
  timezone: z.string().refine(isValidTimeZone, 'unknown IANA timezone'),
  peakMarkers: z.number().int().min(0).max(10),
  mirror: z.boolean(),
  accent: z.string().regex(HEX_RE, 'accent must be #rrggbb'),
});

export type Config = z.infer<typeof ConfigSchema>;

export async function loadConfig(path = 'waveform.config.json'): Promise<Config> {
  const raw = await readFile(path, 'utf8');
  return ConfigSchema.parse(JSON.parse(raw));
}
```

- [ ] **Step 10: Run the test to verify it passes**

Run: `npx vitest run test/config.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 11: Verify typecheck is clean**

Run: `npm run typecheck`
Expected: no output, exit 0.

- [ ] **Step 12: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore waveform.config.json src/config.ts test/config.test.ts
git commit -m "feat: scaffold project with zod-validated waveform config"
```

---

### Task 2: Date helpers and rolling statistics

**Files:**
- Create: `src/transform.ts`
- Test: `test/transform.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ContributionDay` (`{ date: string; count: number }`), `todayIn(timezone: string, now: Date): string`, `addDays(iso: string, delta: number): string`, `rollingAverage(values: number[], window: number): number[]`, `percentile(values: number[], p: number): number`, `scaleMaxFor(values: number[]): number`.

- [ ] **Step 1: Write the failing test**

Create `test/transform.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/transform.test.ts`
Expected: FAIL — cannot resolve `../src/transform.js`.

- [ ] **Step 3: Write `src/transform.ts`**

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/transform.test.ts`
Expected: PASS, 18 tests.

- [ ] **Step 5: Commit**

```bash
git add src/transform.ts test/transform.test.ts
git commit -m "feat: add date helpers and rolling statistics"
```

---

### Task 3: Series assembly and peak selection

**Files:**
- Modify: `src/transform.ts` (append)
- Modify: `test/transform.test.ts` (append)

**Interfaces:**
- Consumes: `ContributionDay`, `rollingAverage`, `scaleMaxFor` from Task 2.
- Produces:
  - `PlotPoint` = `{ date: string; count: number; clamped: number; avg7: number; avg30: number }`
  - `Peak` = `{ index: number; date: string; count: number }`
  - `PlotSeries` = `{ points: PlotPoint[]; scaleMax: number; max: number; total: number; from: string; to: string; peaks: Peak[] }`
  - `findPeaks(points: PlotPoint[], count: number, minSeparation?: number): Peak[]`
  - `buildSeries(all: ContributionDay[], from: string, to: string, peakCount: number): PlotSeries`

- [ ] **Step 1: Write the failing test**

Append to `test/transform.test.ts`:

```ts
import { buildSeries, findPeaks } from '../src/transform.js';
import type { PlotPoint } from '../src/transform.js';

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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/transform.test.ts`
Expected: FAIL — `buildSeries` / `findPeaks` are not exported.

- [ ] **Step 3: Append to `src/transform.ts`**

```ts
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
export function buildSeries(
  all: ContributionDay[],
  from: string,
  to: string,
  peakCount: number,
): PlotSeries {
  const counts = all.map((d) => d.count);
  const avg7 = rollingAverage(counts, 7);
  const avg30 = rollingAverage(counts, 30);

  const indices: number[] = [];
  for (let i = 0; i < all.length; i++) {
    const date = all[i]!.date;
    if (date >= from && date <= to) indices.push(i);
  }

  const windowCounts = indices.map((i) => counts[i]!);
  const scaleMax = scaleMaxFor(windowCounts);

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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/transform.test.ts`
Expected: PASS, 28 tests.

- [ ] **Step 5: Commit**

```bash
git add src/transform.ts test/transform.test.ts
git commit -m "feat: assemble plot series with percentile clamp and peak markers"
```

---

### Task 4: Catmull-Rom to cubic Bézier path builder

**Files:**
- Create: `src/curve.ts`
- Test: `test/curve.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Point` (`{ x: number; y: number }`), `round(n: number): number`, `catmullRomPath(points: Point[], tension?: number): string`, `bandPath(upper: Point[], lower: Point[]): string`, `areaPath(curve: Point[], edgeY: number): string`.

- [ ] **Step 1: Write the failing test**

Create `test/curve.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { areaPath, bandPath, catmullRomPath, round } from '../src/curve.js';

const NON_FINITE = /NaN|Infinity|undefined/;

describe('round', () => {
  it('rounds to two decimals', () => {
    expect(round(1.23456)).toBe(1.23);
  });

  it('maps non-finite values to 0 so no path can contain NaN', () => {
    expect(round(NaN)).toBe(0);
    expect(round(Infinity)).toBe(0);
    expect(round(-Infinity)).toBe(0);
  });
});

describe('catmullRomPath', () => {
  it('returns an empty string for no points', () => {
    expect(catmullRomPath([])).toBe('');
  });

  it('emits a bare moveto for a single point', () => {
    expect(catmullRomPath([{ x: 5, y: 6 }])).toBe('M 5 6');
  });

  it('matches the known fixture for a three-point curve at tension 0.5', () => {
    // Endpoints duplicate the terminal point: p0 = p1 for the first segment,
    // p3 = p2 for the last. With t = 0.5 the control offset is (p2 - p0) / 6.
    const path = catmullRomPath([
      { x: 0, y: 0 },
      { x: 10, y: 20 },
      { x: 20, y: 0 },
    ]);
    expect(path).toBe(
      'M 0 0 C 1.67 3.33, 6.67 20, 10 20 C 13.33 20, 18.33 3.33, 20 0',
    );
  });

  it('produces a straight horizontal line for collinear flat points', () => {
    const path = catmullRomPath([
      { x: 0, y: 10 },
      { x: 10, y: 10 },
      { x: 20, y: 10 },
    ]);
    expect(path).toBe('M 0 10 C 1.67 10, 6.67 10, 10 10 C 13.33 10, 18.33 10, 20 10');
  });

  it('handles a two-point series', () => {
    expect(catmullRomPath([{ x: 0, y: 0 }, { x: 10, y: 10 }])).toBe(
      'M 0 0 C 1.67 1.67, 8.33 8.33, 10 10',
    );
  });

  it('never emits non-finite numbers even for non-finite input', () => {
    const path = catmullRomPath([
      { x: 0, y: NaN },
      { x: 10, y: 5 },
      { x: NaN, y: Infinity },
    ]);
    expect(path).not.toMatch(NON_FINITE);
  });
});

describe('bandPath', () => {
  it('closes the upper curve into the reversed lower curve', () => {
    const path = bandPath(
      [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      [{ x: 0, y: 10 }, { x: 10, y: 10 }],
    );
    expect(path.startsWith('M 0 0 C')).toBe(true);
    expect(path).toContain('L 10 10');
    expect(path.endsWith('Z')).toBe(true);
  });

  it('returns an empty string when either side is empty', () => {
    expect(bandPath([], [{ x: 0, y: 0 }])).toBe('');
    expect(bandPath([{ x: 0, y: 0 }], [])).toBe('');
  });
});

describe('areaPath', () => {
  it('closes the curve down to the edge', () => {
    const path = areaPath([{ x: 0, y: 5 }, { x: 10, y: 5 }], 100);
    expect(path).toBe('M 0 5 C 1.67 5, 8.33 5, 10 5 L 10 100 L 0 100 Z');
  });

  it('returns an empty string for no points', () => {
    expect(areaPath([], 100)).toBe('');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/curve.test.ts`
Expected: FAIL — cannot resolve `../src/curve.js`.

- [ ] **Step 3: Write `src/curve.ts`**

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/curve.test.ts`
Expected: PASS, 12 tests. If the fixture strings in Step 1 disagree with the implementation, the **implementation formula is authoritative** — recompute the expected strings by hand from `cp1 = p1 + (p2 - p0) / 6` and update the test, but do not change the formula.

- [ ] **Step 5: Commit**

```bash
git add src/curve.ts test/curve.test.ts
git commit -m "feat: add Catmull-Rom to cubic Bezier path builder"
```

---

### Task 5: Theme tokens and panel geometry

**Files:**
- Create: `src/themes.ts`
- Test: `test/themes.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ThemeName` (`'dark' | 'light'`), `Theme`, `theme(name: ThemeName, accent: string): Theme`, `Geometry`, `YEAR_GEOMETRY`, `MONTH_GEOMETRY`, `ALL_ROW_HEIGHT`, `ALL_GUTTER`, `allYearsHeight(years: number): number`, `FONT_STACK`.

- [ ] **Step 1: Write the failing test**

Create `test/themes.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/themes.test.ts`
Expected: FAIL — cannot resolve `../src/themes.js`.

- [ ] **Step 3: Write `src/themes.ts`**

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/themes.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/themes.ts test/themes.test.ts
git commit -m "feat: add dark and light theme tokens and panel geometry"
```

---

### Task 6: Wave panel rendering with mirrored deviation fill

**Files:**
- Create: `src/render.ts`
- Test: `test/render.test.ts`

**Interfaces:**
- Consumes: `PlotSeries`, `PlotPoint` (Task 3); `Point`, `catmullRomPath`, `bandPath`, `areaPath`, `round` (Task 4); `Theme`, `Geometry`, `FONT_STACK` (Task 5).
- Produces:
  - `PanelRect` = `{ x: number; y: number; width: number; height: number }`
  - `escapeXml(s: string): string`
  - `renderPanel(opts: PanelOptions): string` where `PanelOptions` = `{ series: PlotSeries; theme: Theme; mirror: boolean; rect: PanelRect; idPrefix: string; showPeaks: boolean }`
  - `monthTicks(points: PlotPoint[], xAt: (i: number) => number, minGap?: number): Array<{ x: number; label: string }>`
  - `ANIMATION_CSS: string`

- [ ] **Step 1: Write the failing test**

Create `test/render.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildSeries, addDays } from '../src/transform.js';
import type { ContributionDay } from '../src/transform.js';
import { theme, YEAR_GEOMETRY } from '../src/themes.js';
import { ANIMATION_CSS, escapeXml, monthTicks, renderPanel } from '../src/render.js';

const NON_FINITE = /NaN|Infinity|undefined/;
const RECT = { x: 44, y: 26, width: 816, height: 144 };
const T = theme('dark', '#7c3aed');

function series(counts: number[], from = '2024-01-01') {
  const all: ContributionDay[] = counts.map((count, i) => ({ date: addDays(from, i), count }));
  return buildSeries(all, from, addDays(from, counts.length - 1), 3);
}

describe('escapeXml', () => {
  it('escapes the five XML entities', () => {
    expect(escapeXml(`<&>"'`)).toBe('&lt;&amp;&gt;&quot;&apos;');
  });
});

describe('renderPanel', () => {
  it('emits no non-finite numbers for a normal series', () => {
    const svg = renderPanel({
      series: series([1, 4, 2, 9, 3, 0, 5]),
      theme: T,
      mirror: true,
      rect: RECT,
      idPrefix: 'a',
      showPeaks: true,
    });
    expect(svg).not.toMatch(NON_FINITE);
  });

  it('emits no non-finite numbers for a zero-contribution user', () => {
    const svg = renderPanel({
      series: series(Array.from({ length: 60 }, () => 0)),
      theme: T,
      mirror: true,
      rect: RECT,
      idPrefix: 'b',
      showPeaks: true,
    });
    expect(svg).not.toMatch(NON_FINITE);
  });

  it('emits no non-finite numbers for an empty series', () => {
    const svg = renderPanel({
      series: series([]),
      theme: T,
      mirror: true,
      rect: RECT,
      idPrefix: 'c',
      showPeaks: true,
    });
    expect(svg).not.toMatch(NON_FINITE);
  });

  it('emits no non-finite numbers for a single-day series', () => {
    const svg = renderPanel({
      series: series([5]),
      theme: T,
      mirror: false,
      rect: RECT,
      idPrefix: 'd',
      showPeaks: true,
    });
    expect(svg).not.toMatch(NON_FINITE);
  });

  it('namespaces clip path ids so several panels can share one document', () => {
    const svg = renderPanel({
      series: series([1, 2, 3]),
      theme: T,
      mirror: true,
      rect: RECT,
      idPrefix: 'row7',
      showPeaks: false,
    });
    expect(svg).toContain('id="row7-above"');
    expect(svg).toContain('url(#row7-above)');
  });

  it('emits four clip regions when mirrored and two when not', () => {
    const opts = { series: series([1, 5, 2, 8]), theme: T, rect: RECT, idPrefix: 'm', showPeaks: false };
    const mirrored = renderPanel({ ...opts, mirror: true });
    const flat = renderPanel({ ...opts, mirror: false });
    expect((mirrored.match(/<clipPath/g) ?? []).length).toBe(4);
    expect((flat.match(/<clipPath/g) ?? []).length).toBe(2);
  });

  it('uses the accent for the above-average fill', () => {
    const svg = renderPanel({
      series: series([1, 9, 1, 9]),
      theme: T,
      mirror: true,
      rect: RECT,
      idPrefix: 'e',
      showPeaks: false,
    });
    expect(svg).toContain('fill="#7c3aed"');
  });

  it('draws peak markers with their counts', () => {
    const svg = renderPanel({
      series: series([1, 1, 1, 42, 1, 1, 1]),
      theme: T,
      mirror: false,
      rect: RECT,
      idPrefix: 'f',
      showPeaks: true,
    });
    expect(svg).toContain('>42<');
    expect(svg).toContain('<circle');
  });

  it('omits peak markers when showPeaks is false', () => {
    const svg = renderPanel({
      series: series([1, 1, 1, 42, 1, 1, 1]),
      theme: T,
      mirror: false,
      rect: RECT,
      idPrefix: 'g',
      showPeaks: false,
    });
    expect(svg).not.toContain('<circle');
  });

  it('keeps every path coordinate non-negative and inside the frame', () => {
    // A hard square wave is the worst case for Catmull-Rom overshoot.
    const svg = renderPanel({
      series: series([0, 100, 0, 100, 0]),
      theme: T,
      mirror: true,
      rect: RECT,
      idPrefix: 'h',
      showPeaks: false,
    });
    const coords = [...svg.matchAll(/ d="([^"]*)"/g)].flatMap((m) =>
      [...m[1]!.matchAll(/-?\d+(?:\.\d+)?/g)].map((c) => Number(c[0])),
    );
    expect(coords.length).toBeGreaterThan(0);
    expect(Math.min(...coords)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...coords)).toBeLessThanOrEqual(880);
  });
});

describe('monthTicks', () => {
  const xAt = (i: number) => i * 10;

  it('always labels the first point', () => {
    const s = series([1, 2, 3], '2024-03-15');
    expect(monthTicks(s.points, xAt)[0]!.label).toBe('Mar');
  });

  it('labels each month start', () => {
    const s = series(Array.from({ length: 70 }, () => 1), '2024-01-01');
    expect(monthTicks(s.points, xAt).map((t) => t.label)).toEqual(['Jan', 'Feb', 'Mar']);
  });

  it('drops labels that would collide', () => {
    const s = series(Array.from({ length: 70 }, () => 1), '2024-01-01');
    const tight = monthTicks(s.points, (i) => i * 0.5, 40);
    expect(tight).toHaveLength(1);
  });

  it('returns nothing for an empty series', () => {
    expect(monthTicks([], xAt)).toEqual([]);
  });
});

describe('ANIMATION_CSS', () => {
  it('settles to the finished state so a non-animating renderer shows the full curve', () => {
    expect(ANIMATION_CSS).toContain('stroke-dashoffset: 0');
    expect(ANIMATION_CSS).toContain('opacity: 1');
  });

  it('respects prefers-reduced-motion', () => {
    expect(ANIMATION_CSS).toContain('prefers-reduced-motion');
  });

  it('references nothing external', () => {
    expect(ANIMATION_CSS).not.toMatch(/@import|url\(|http/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/render.test.ts`
Expected: FAIL — cannot resolve `../src/render.js`.

- [ ] **Step 3: Write `src/render.ts`**

```ts
import { areaPath, bandPath, catmullRomPath, round } from './curve.js';
import type { Point } from './curve.js';
import { FONT_STACK } from './themes.js';
import type { Theme } from './themes.js';
import type { PlotPoint, PlotSeries } from './transform.js';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * One-shot draw-in. The base rules are the FINISHED state (`stroke-dashoffset: 0`,
 * `opacity: 1`) and the keyframes only rewind from there, so a renderer that
 * ignores CSS animation shows a complete image rather than a blank one.
 * `pathLength="1000"` on the curve normalises the dash maths — no measurement needed.
 */
export const ANIMATION_CSS = `
.wf-curve { stroke-dasharray: 1000; stroke-dashoffset: 0; animation: wf-draw 1.4s ease-out 1 both; }
.wf-fade { opacity: 1; animation: wf-fade-in 0.6s ease-out 0.6s 1 both; }
@keyframes wf-draw { from { stroke-dashoffset: 1000; } to { stroke-dashoffset: 0; } }
@keyframes wf-fade-in { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .wf-curve, .wf-fade { animation: none; }
}
`.trim();

export interface PanelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PanelOptions {
  series: PlotSeries;
  theme: Theme;
  mirror: boolean;
  rect: PanelRect;
  /** Namespaces clip path ids so multiple panels can share one SVG document. */
  idPrefix: string;
  showPeaks: boolean;
}

/** Month tick positions. The first point is always labelled so a 31-day window is never bare. */
export function monthTicks(
  points: PlotPoint[],
  xAt: (i: number) => number,
  minGap = 40,
): Array<{ x: number; label: string }> {
  const ticks: Array<{ x: number; label: string }> = [];
  let lastX = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < points.length; i++) {
    const date = points[i]!.date;
    const isMonthStart = date.endsWith('-01');
    if (i !== 0 && !isMonthStart) continue;

    const x = xAt(i);
    if (x - lastX < minGap) continue;

    ticks.push({ x: round(x), label: MONTH_NAMES[Number(date.slice(5, 7)) - 1]! });
    lastX = x;
  }
  return ticks;
}

export function renderPanel(opts: PanelOptions): string {
  const { series, theme: t, mirror, rect, idPrefix, showPeaks } = opts;
  const points = series.points;
  const n = points.length;
  if (n === 0) return '';

  const xAt = (i: number): number =>
    n <= 1 ? rect.x + rect.width / 2 : rect.x + (i * rect.width) / (n - 1);

  /** Fraction of the plot height a value occupies. `scaleMax` is guaranteed > 0. */
  const norm = (v: number): number => Math.max(0, Math.min(1, v / series.scaleMax));

  const at = (values: (p: PlotPoint) => number, toY: (f: number) => number): Point[] =>
    points.map((p, i) => ({ x: xAt(i), y: toY(norm(values(p))) }));

  const parts: string[] = [];
  const clips: string[] = [];
  const bottom = rect.y + rect.height;
  const centre = rect.y + rect.height / 2;

  if (mirror) {
    // Amplitude measured out from the centre axis in both directions. The
    // baseline envelope is mirrored too, so the deviation fill keeps meaning
    // "this day beat its 30-day average".
    const half = rect.height / 2;
    const up = (f: number) => centre - f * half;
    const down = (f: number) => centre + f * half;

    const dailyUp = at((p) => p.clamped, up);
    const dailyDown = at((p) => p.clamped, down);
    const baseUp = at((p) => p.avg30, up);
    const baseDown = at((p) => p.avg30, down);
    const avg7Up = at((p) => p.avg7, up);
    const avg7Down = at((p) => p.avg7, down);

    clips.push(
      `<clipPath id="${idPrefix}-above"><path d="${areaPath(baseUp, rect.y)}"/></clipPath>`,
      `<clipPath id="${idPrefix}-below"><path d="${areaPath(baseUp, centre)}"/></clipPath>`,
      `<clipPath id="${idPrefix}-above-m"><path d="${areaPath(baseDown, bottom)}"/></clipPath>`,
      `<clipPath id="${idPrefix}-below-m"><path d="${areaPath(baseDown, centre)}"/></clipPath>`,
    );

    // 1. baseline band
    parts.push(
      `<path class="wf-fade" d="${bandPath(baseUp, baseDown)}" fill="${t.band}" fill-opacity="${t.bandOpacity}"/>`,
    );

    // 2. deviation fill, both halves, each split above/below by clip. Painted
    // before the 7-day and daily strokes: the fill's top edge is the daily
    // curve itself, so drawing it on top would lay accent across the wave's
    // own stroke and mute the outline.
    const upperBand = bandPath(dailyUp, baseUp);
    const lowerBand = bandPath(baseDown, dailyDown);
    parts.push(
      `<path class="wf-fade" d="${upperBand}" fill="${t.above}" fill-opacity="${t.aboveOpacity}" clip-path="url(#${idPrefix}-above)"/>`,
      `<path class="wf-fade" d="${upperBand}" fill="${t.below}" fill-opacity="${t.belowOpacity}" clip-path="url(#${idPrefix}-below)"/>`,
      `<path class="wf-fade" d="${lowerBand}" fill="${t.above}" fill-opacity="${t.aboveOpacity}" clip-path="url(#${idPrefix}-above-m)"/>`,
      `<path class="wf-fade" d="${lowerBand}" fill="${t.below}" fill-opacity="${t.belowOpacity}" clip-path="url(#${idPrefix}-below-m)"/>`,
    );

    // 3. rolling 7-day line
    parts.push(
      `<path d="${catmullRomPath(avg7Up)}" fill="none" stroke="${t.avg7}" stroke-width="1" stroke-opacity="0.7" class="wf-fade"/>`,
      `<path d="${catmullRomPath(avg7Down)}" fill="none" stroke="${t.avg7}" stroke-width="1" stroke-opacity="0.7" class="wf-fade"/>`,
    );

    // 4. daily curve (the wave itself)
    parts.push(
      `<path class="wf-curve" pathLength="1000" d="${catmullRomPath(dailyUp)}" fill="none" stroke="${t.daily}" stroke-width="1.5" stroke-linecap="round"/>`,
      `<path class="wf-curve" pathLength="1000" d="${catmullRomPath(dailyDown)}" fill="none" stroke="${t.daily}" stroke-width="1.5" stroke-linecap="round"/>`,
    );

    // 5. peak markers
    if (showPeaks) parts.push(peakMarkers(series, xAt, (p) => up(norm(p)), rect, t));
  } else {
    const toY = (f: number) => bottom - f * rect.height;
    const daily = at((p) => p.clamped, toY);
    const base = at((p) => p.avg30, toY);
    const avg7 = at((p) => p.avg7, toY);

    clips.push(
      `<clipPath id="${idPrefix}-above"><path d="${areaPath(base, rect.y)}"/></clipPath>`,
      `<clipPath id="${idPrefix}-below"><path d="${areaPath(base, bottom)}"/></clipPath>`,
    );

    // 1. baseline band
    parts.push(
      `<path class="wf-fade" d="${areaPath(base, bottom)}" fill="${t.band}" fill-opacity="${t.bandOpacity}"/>`,
    );

    // 2. deviation fill, split above/below by clip. Painted before the
    // 7-day and daily strokes: the fill's top edge is the daily curve
    // itself, so drawing it on top would lay accent across the wave's own
    // stroke and mute the outline.
    const band = bandPath(daily, base);
    parts.push(
      `<path class="wf-fade" d="${band}" fill="${t.above}" fill-opacity="${t.aboveOpacity}" clip-path="url(#${idPrefix}-above)"/>`,
      `<path class="wf-fade" d="${band}" fill="${t.below}" fill-opacity="${t.belowOpacity}" clip-path="url(#${idPrefix}-below)"/>`,
    );

    // 3. rolling 7-day line
    parts.push(
      `<path d="${catmullRomPath(avg7)}" fill="none" stroke="${t.avg7}" stroke-width="1" stroke-opacity="0.7" class="wf-fade"/>`,
    );

    // 4. daily curve (the wave itself)
    parts.push(
      `<path class="wf-curve" pathLength="1000" d="${catmullRomPath(daily)}" fill="none" stroke="${t.daily}" stroke-width="1.5" stroke-linecap="round"/>`,
    );

    // 5. peak markers
    if (showPeaks) parts.push(peakMarkers(series, xAt, (p) => toY(norm(p)), rect, t));
  }

  return `<defs>${clips.join('')}</defs>${parts.join('')}`;
}

function peakMarkers(
  series: PlotSeries,
  xAt: (i: number) => number,
  yAt: (clamped: number) => number,
  rect: PanelRect,
  t: Theme,
): string {
  if (series.peaks.length === 0) return '';

  return series.peaks
    .map((peak) => {
      const point = series.points[peak.index];
      if (!point) return '';
      const x = xAt(peak.index);
      const y = yAt(point.clamped);
      const labelY = Math.max(rect.y + 8, y - 7);

      // Keep the label inside the panel by flipping its anchor near the edges.
      let anchor = 'middle';
      if (x < rect.x + 16) anchor = 'start';
      else if (x > rect.x + rect.width - 16) anchor = 'end';

      return (
        `<circle class="wf-fade" cx="${round(x)}" cy="${round(y)}" r="2.5" fill="${t.peak}"/>` +
        `<text class="wf-fade" x="${round(x)}" y="${round(labelY)}" text-anchor="${anchor}" ` +
        `font-family="${FONT_STACK}" font-size="9" fill="${t.textDim}">${peak.count}</text>`
      );
    })
    .join('');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/render.test.ts`
Expected: PASS, 18 tests.

- [ ] **Step 5: Commit**

```bash
git add src/render.ts test/render.test.ts
git commit -m "feat: render wave panels with mirrored deviation fill"
```

---

### Task 7: Full document renderers for year, month and all-years

**Files:**
- Modify: `src/render.ts` (append)
- Modify: `test/render.test.ts` (append)

**Interfaces:**
- Consumes: everything from Task 6, plus `Geometry`, `allYearsHeight`, `ALL_ROW_HEIGHT`, `ALL_GUTTER` (Task 5).
- Produces:
  - `WaveOptions` = `{ series: PlotSeries; theme: Theme; username: string; mirror: boolean; geometry: Geometry; label: string }`
  - `renderWave(opts: WaveOptions): string`
  - `YearRow` = `{ year: number; series: PlotSeries }`
  - `AllYearsOptions` = `{ rows: YearRow[]; theme: Theme; username: string; mirror: boolean; total: number; from: string; to: string }`
  - `renderAllYears(opts: AllYearsOptions): string`

- [ ] **Step 1: Write the failing test**

Append to `test/render.test.ts`:

```ts
import { renderAllYears, renderWave } from '../src/render.js';
import { MONTH_GEOMETRY, allYearsHeight } from '../src/themes.js';

describe('renderWave', () => {
  const base = {
    theme: T,
    username: 'olivierluethy',
    mirror: true,
    geometry: YEAR_GEOMETRY,
    label: 'Trailing year',
  };

  it('emits a well-formed self-contained root element', () => {
    const svg = renderWave({ ...base, series: series([1, 5, 2, 8, 3]) });
    expect(svg.startsWith('<svg ')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox="0 0 880 220"');
    expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
  });

  it('sets no width or height on the root so the README can scale it', () => {
    const svg = renderWave({ ...base, series: series([1, 2, 3]) });
    const root = svg.slice(0, svg.indexOf('>'));
    expect(root).not.toMatch(/\swidth=/);
    expect(root).not.toMatch(/\sheight=/);
  });

  it('uses the month viewBox for the month geometry', () => {
    const svg = renderWave({ ...base, geometry: MONTH_GEOMETRY, series: series([1, 2, 3]) });
    expect(svg).toContain('viewBox="0 0 880 160"');
  });

  it('writes the footer line', () => {
    const svg = renderWave({ ...base, series: series([2, 3, 4]) });
    expect(svg).toContain('@olivierluethy');
    expect(svg).toContain('9 contributions');
    expect(svg).toContain('2024-01-01');
    expect(svg).toContain('2024-01-03');
  });

  it('writes a subtle max label and no y gridlines', () => {
    const svg = renderWave({ ...base, series: series([1, 2, 30]) });
    expect(svg).toContain('max 30');
    expect(svg).not.toContain('<line');
  });

  it('escapes a username containing XML metacharacters', () => {
    const svg = renderWave({ ...base, username: 'a<b&c', series: series([1, 2]) });
    expect(svg).toContain('@a&lt;b&amp;c');
    expect(svg).not.toContain('@a<b&c');
  });

  it('renders a zero-contribution user without non-finite numbers', () => {
    const svg = renderWave({ ...base, series: series(Array.from({ length: 365 }, () => 0)) });
    expect(svg).not.toMatch(NON_FINITE);
    expect(svg).toContain('0 contributions');
  });

  it('renders an empty series without throwing', () => {
    const svg = renderWave({ ...base, series: series([]) });
    expect(svg).toContain('</svg>');
    expect(svg).not.toMatch(NON_FINITE);
  });

  it('includes the inline animation stylesheet', () => {
    const svg = renderWave({ ...base, series: series([1, 2, 3]) });
    expect(svg).toContain('<style>');
    expect(svg).toContain('@keyframes wf-draw');
  });

  it('carries an accessible title', () => {
    const svg = renderWave({ ...base, series: series([1, 2, 3]) });
    expect(svg).toContain('<title>');
    expect(svg).toContain('role="img"');
  });
});

describe('renderAllYears', () => {
  const rows = [
    { year: 2023, series: series(Array.from({ length: 200 }, (_, i) => i % 5), '2023-01-01') },
    { year: 2024, series: series(Array.from({ length: 200 }, (_, i) => i % 7), '2024-01-01') },
  ];
  const base = {
    rows,
    theme: T,
    username: 'olivierluethy',
    mirror: true,
    total: 1234,
    from: '2023-01-01',
    to: '2024-07-18',
  };

  it('grows the viewBox height with the year count', () => {
    expect(renderAllYears(base)).toContain(`viewBox="0 0 880 ${allYearsHeight(2)}"`);
  });

  it('labels every year on the left', () => {
    const svg = renderAllYears(base);
    expect(svg).toContain('>2023<');
    expect(svg).toContain('>2024<');
  });

  it('gives each row its own clip path namespace', () => {
    const svg = renderAllYears(base);
    expect(svg).toContain('id="y2023-above"');
    expect(svg).toContain('id="y2024-above"');
  });

  it('shows the combined total in the footer', () => {
    expect(renderAllYears(base)).toContain('1234 contributions');
  });

  it('emits no non-finite numbers', () => {
    expect(renderAllYears(base)).not.toMatch(NON_FINITE);
  });

  it('renders with no rows at all', () => {
    const svg = renderAllYears({ ...base, rows: [], total: 0 });
    expect(svg).toContain('</svg>');
    expect(svg).not.toMatch(NON_FINITE);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/render.test.ts`
Expected: FAIL — `renderWave` / `renderAllYears` are not exported.

- [ ] **Step 3: Append to `src/render.ts`**

First **replace** the two existing `./themes.js` import lines at the top of the file:

```ts
// remove these two lines
import { FONT_STACK } from './themes.js';
import type { Theme } from './themes.js';
```

with:

```ts
import { ALL_GUTTER, ALL_ROW_HEIGHT, allYearsHeight, FONT_STACK } from './themes.js';
import type { Geometry, Theme } from './themes.js';
```

Then append:

```ts
export interface WaveOptions {
  series: PlotSeries;
  theme: Theme;
  username: string;
  mirror: boolean;
  geometry: Geometry;
  /** Human description used in the accessible title, e.g. "Trailing year". */
  label: string;
}

function svgOpen(width: number, height: number, title: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" ` +
    `preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeXml(title)}">` +
    `<title>${escapeXml(title)}</title>` +
    `<style>${ANIMATION_CSS}</style>`
  );
}

function textEl(
  x: number,
  y: number,
  content: string,
  fill: string,
  size: number,
  anchor = 'start',
): string {
  return (
    `<text x="${round(x)}" y="${round(y)}" text-anchor="${anchor}" font-family="${FONT_STACK}" ` +
    `font-size="${size}" fill="${fill}">${content}</text>`
  );
}

function footer(username: string, total: number, from: string, to: string): string {
  return `@${escapeXml(username)} · ${total} contributions · ${escapeXml(from)} – ${escapeXml(to)}`;
}

export function renderWave(opts: WaveOptions): string {
  const { series, theme: t, username, mirror, geometry: g, label } = opts;
  const rect: PanelRect = {
    x: g.left,
    y: g.top,
    width: g.width - g.left - g.right,
    height: g.height - g.top - g.bottom,
  };

  const n = series.points.length;
  const xAt = (i: number): number =>
    n <= 1 ? rect.x + rect.width / 2 : rect.x + (i * rect.width) / (n - 1);

  const ticks = monthTicks(series.points, xAt)
    .map((tick) => textEl(tick.x, g.height - g.bottom + 16, tick.label, t.textDim, 9, 'middle'))
    .join('');

  const title = `${label} of GitHub contributions for ${username} as a waveform`;

  return [
    svgOpen(g.width, g.height, title),
    `<rect width="${g.width}" height="${g.height}" fill="${t.bg}"/>`,
    renderPanel({ series, theme: t, mirror, rect, idPrefix: 'w', showPeaks: true }),
    ticks,
    textEl(g.width - g.right, g.top - 10, `max ${series.max}`, t.textDim, 9, 'end'),
    textEl(g.left, g.height - 12, footer(username, series.total, series.from, series.to), t.text, 10),
    '</svg>',
  ].join('');
}

export interface YearRow {
  year: number;
  series: PlotSeries;
}

export interface AllYearsOptions {
  rows: YearRow[];
  theme: Theme;
  username: string;
  mirror: boolean;
  total: number;
  from: string;
  to: string;
}

export function renderAllYears(opts: AllYearsOptions): string {
  const { rows, theme: t, username, mirror, total, from, to } = opts;
  const height = allYearsHeight(rows.length);
  const width = 880;
  const right = 20;
  const top = 20;
  const plotWidth = width - ALL_GUTTER - right;

  const panels = rows
    .map((row, i) => {
      const rect: PanelRect = {
        x: ALL_GUTTER,
        y: top + i * ALL_ROW_HEIGHT,
        width: plotWidth,
        height: ALL_ROW_HEIGHT - 8,
      };
      const label = textEl(
        ALL_GUTTER - 10,
        rect.y + rect.height / 2 + 3,
        String(row.year),
        t.textDim,
        10,
        'end',
      );
      const panel = renderPanel({
        series: row.series,
        theme: t,
        mirror,
        rect,
        idPrefix: `y${row.year}`,
        showPeaks: false,
      });
      return label + panel;
    })
    .join('');

  const title = `All years of GitHub contributions for ${username} as a waveform`;

  return [
    svgOpen(width, height, title),
    `<rect width="${width}" height="${height}" fill="${t.bg}"/>`,
    panels,
    textEl(ALL_GUTTER, height - 14, footer(username, total, from, to), t.text, 10),
    '</svg>',
  ].join('');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/render.test.ts`
Expected: PASS, 34 tests.

- [ ] **Step 5: Verify typecheck is clean**

Run: `npm run typecheck`
Expected: no output, exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/render.ts test/render.test.ts
git commit -m "feat: compose full SVG documents for year, month and all-years views"
```

---

### Task 8: Fixtures, snapshot test and SVG sanitizer test

**Files:**
- Create: `test/fixtures/generate-fixture.mjs`
- Create: `test/fixtures/contributions.sample.json` (generated, committed)
- Create: `test/fixtures/contributions.empty.json`
- Create: `test/svg-safety.test.ts`
- Create: `test/snapshot.test.ts`

**Interfaces:**
- Consumes: `buildSeries` (Task 3), `theme`/`YEAR_GEOMETRY`/`MONTH_GEOMETRY` (Task 5), `renderWave`/`renderAllYears` (Task 7).
- Produces: `test/fixtures/contributions.sample.json` in the shape `{ username, createdAt, days: [{ date, count }] }` — the same shape `data/contributions.json` uses.

- [ ] **Step 1: Write the fixture generator**

Create `test/fixtures/generate-fixture.mjs`:

```js
// Deterministic fixture: a seeded LCG, so the file is reproducible and its
// snapshot is stable. Run once with `node test/fixtures/generate-fixture.mjs`
// and commit the output.
import { writeFileSync } from 'node:fs';

let seed = 20240726;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

const days = [];
const start = new Date('2023-01-01T00:00:00Z');
for (let i = 0; i < 730; i++) {
  const d = new Date(start);
  d.setUTCDate(d.getUTCDate() + i);
  const date = d.toISOString().slice(0, 10);
  const weekday = d.getUTCDay();
  const weekendPenalty = weekday === 0 || weekday === 6 ? 0.35 : 1;
  const seasonal = 1 + 0.6 * Math.sin((i / 730) * Math.PI * 4);
  const r = rnd();
  let count = r < 0.18 ? 0 : Math.round(rnd() * 9 * seasonal * weekendPenalty);
  if (i === 400) count = 187; // a single outlier day, to exercise the p98 clamp
  days.push({ date, count });
}

writeFileSync(
  new URL('./contributions.sample.json', import.meta.url),
  `${JSON.stringify({ username: 'octofixture', createdAt: '2023-01-01T00:00:00Z', days }, null, 2)}\n`,
);
console.log(`wrote ${days.length} days`);
```

- [ ] **Step 2: Generate the fixture**

Run: `node test/fixtures/generate-fixture.mjs`
Expected: `wrote 730 days`, and `test/fixtures/contributions.sample.json` exists.

- [ ] **Step 3: Create the empty fixture**

Create `test/fixtures/contributions.empty.json`:

```json
{
  "username": "emptyuser",
  "createdAt": "2024-01-01T00:00:00Z",
  "days": []
}
```

- [ ] **Step 4: Write the sanitizer test**

Create `test/svg-safety.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildSeries } from '../src/transform.js';
import type { ContributionDay } from '../src/transform.js';
import { MONTH_GEOMETRY, YEAR_GEOMETRY, theme } from '../src/themes.js';
import { renderAllYears, renderWave } from '../src/render.js';

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/contributions.sample.json', import.meta.url), 'utf8'),
) as { username: string; days: ContributionDay[] };

const empty = JSON.parse(
  readFileSync(new URL('./fixtures/contributions.empty.json', import.meta.url), 'utf8'),
) as { username: string; days: ContributionDay[] };

/** Every SVG this project can produce, across both themes and both data shapes. */
function allSvgs(): Array<{ name: string; svg: string }> {
  const out: Array<{ name: string; svg: string }> = [];

  for (const themeName of ['dark', 'light'] as const) {
    const t = theme(themeName, '#7c3aed');
    for (const source of [
      { tag: 'sample', data: fixture },
      { tag: 'empty', data: empty },
    ]) {
      const year = buildSeries(source.data.days, '2024-01-01', '2024-12-30', 3);
      const month = buildSeries(source.data.days, '2024-11-30', '2024-12-30', 3);
      const y2023 = buildSeries(source.data.days, '2023-01-01', '2023-12-31', 0);
      const y2024 = buildSeries(source.data.days, '2024-01-01', '2024-12-31', 0);

      for (const mirror of [true, false]) {
        const suffix = `${themeName}-${source.tag}-${mirror ? 'mirror' : 'flat'}`;
        out.push({
          name: `year-${suffix}`,
          svg: renderWave({
            series: year, theme: t, username: source.data.username, mirror,
            geometry: YEAR_GEOMETRY, label: 'Trailing year',
          }),
        });
        out.push({
          name: `month-${suffix}`,
          svg: renderWave({
            series: month, theme: t, username: source.data.username, mirror,
            geometry: MONTH_GEOMETRY, label: 'Trailing month',
          }),
        });
        out.push({
          name: `all-${suffix}`,
          svg: renderAllYears({
            rows: [{ year: 2023, series: y2023 }, { year: 2024, series: y2024 }],
            theme: t, username: source.data.username, mirror,
            total: year.total, from: '2023-01-01', to: '2024-12-31',
          }),
        });
      }
    }
  }
  return out;
}

describe('generated SVGs are self-contained and safe for a README', () => {
  const svgs = allSvgs();

  it('produces the expected number of variants', () => {
    expect(svgs).toHaveLength(24);
  });

  it.each(svgs)('$name contains no <script>', ({ svg }) => {
    expect(svg).not.toMatch(/<script/i);
  });

  it.each(svgs)('$name contains no <foreignObject>', ({ svg }) => {
    expect(svg).not.toMatch(/<foreignObject/i);
  });

  it.each(svgs)('$name contains no @import', ({ svg }) => {
    expect(svg).not.toMatch(/@import/i);
  });

  it.each(svgs)('$name references no origin but the SVG namespace', ({ svg }) => {
    // `http://www.w3.org/2000/svg` is the XML namespace *identifier*, which is
    // mandatory on the root element and is never fetched. It is the one and
    // only permitted URL-shaped string; anything else is an external reference.
    const matches = [...svg.matchAll(/https?:\/\/[^"'\s)]+/gi)].map((m) => m[0]);
    expect(matches).toEqual(['http://www.w3.org/2000/svg']);
  });

  it.each(svgs)('$name uses no xlink:href', ({ svg }) => {
    expect(svg).not.toMatch(/xlink:href/i);
  });

  it.each(svgs)('$name has no on* event handler attribute', ({ svg }) => {
    expect(svg).not.toMatch(/\son[a-z]+\s*=/i);
  });

  it.each(svgs)('$name has no NaN, Infinity or undefined anywhere', ({ svg }) => {
    expect(svg).not.toMatch(/NaN|Infinity|undefined/);
  });

  it.each(svgs)('$name has no non-finite value in any path d attribute', ({ svg }) => {
    for (const match of svg.matchAll(/ d="([^"]*)"/g)) {
      expect(match[1]).not.toMatch(/NaN|Infinity|undefined/);
    }
  });

  it.each(svgs)('$name sets no width or height on the root element', ({ svg }) => {
    const root = svg.slice(0, svg.indexOf('>'));
    expect(root).not.toMatch(/\swidth=/);
    expect(root).not.toMatch(/\sheight=/);
  });

  it.each(svgs)('$name has balanced svg tags', ({ svg }) => {
    expect((svg.match(/<svg/g) ?? []).length).toBe(1);
    expect((svg.match(/<\/svg>/g) ?? []).length).toBe(1);
  });
});
```

- [ ] **Step 5: Run the sanitizer test**

Run: `npx vitest run test/svg-safety.test.ts`
Expected: PASS. If the external-origin assertion fails because `role="img"` or another attribute introduced a URL, fix `render.ts` — do not relax the assertion.

- [ ] **Step 6: Write the snapshot test**

Create `test/snapshot.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildSeries } from '../src/transform.js';
import type { ContributionDay } from '../src/transform.js';
import { MONTH_GEOMETRY, YEAR_GEOMETRY, theme } from '../src/themes.js';
import { renderAllYears, renderWave } from '../src/render.js';

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/contributions.sample.json', import.meta.url), 'utf8'),
) as { username: string; days: ContributionDay[] };

const t = theme('dark', '#7c3aed');

describe('rendering snapshots', () => {
  it('matches the year waveform snapshot', async () => {
    const svg = renderWave({
      series: buildSeries(fixture.days, '2024-01-01', '2024-12-30', 3),
      theme: t,
      username: fixture.username,
      mirror: true,
      geometry: YEAR_GEOMETRY,
      label: 'Trailing year',
    });
    await expect(svg).toMatchFileSnapshot('./__snapshots__/wave-year-dark.svg');
  });

  it('matches the month waveform snapshot', async () => {
    const svg = renderWave({
      series: buildSeries(fixture.days, '2024-11-30', '2024-12-30', 3),
      theme: t,
      username: fixture.username,
      mirror: true,
      geometry: MONTH_GEOMETRY,
      label: 'Trailing month',
    });
    await expect(svg).toMatchFileSnapshot('./__snapshots__/wave-month-dark.svg');
  });

  it('matches the all-years waveform snapshot', async () => {
    const svg = renderAllYears({
      rows: [
        { year: 2023, series: buildSeries(fixture.days, '2023-01-01', '2023-12-31', 0) },
        { year: 2024, series: buildSeries(fixture.days, '2024-01-01', '2024-12-31', 0) },
      ],
      theme: t,
      username: fixture.username,
      mirror: true,
      total: fixture.days.reduce((sum, d) => sum + d.count, 0),
      from: '2023-01-01',
      to: '2024-12-31',
    });
    await expect(svg).toMatchFileSnapshot('./__snapshots__/wave-all-dark.svg');
  });
});
```

- [ ] **Step 7: Generate and inspect the snapshots**

Run: `npx vitest run test/snapshot.test.ts`
Expected: PASS, writing three files under `test/__snapshots__/`.

Then open `test/__snapshots__/wave-year-dark.svg` in a browser and confirm it looks like a waveform — a mirrored wave around a centre axis, month labels along the bottom, three peak dots with counts, a footer line. **If it does not look right, fix `render.ts` and regenerate before continuing.** This is the first point where the visual output is verifiable.

- [ ] **Step 8: Run the whole suite**

Run: `npm test`
Expected: PASS, all files.

- [ ] **Step 9: Commit**

```bash
git add test/fixtures test/__snapshots__ test/svg-safety.test.ts test/snapshot.test.ts
git commit -m "test: add fixtures, SVG sanitizer checks and rendering snapshots"
```

---

### Task 9: GraphQL fetcher

**Files:**
- Create: `src/fetch.ts`
- Test: `test/fetch.test.ts`

**Interfaces:**
- Consumes: `ContributionDay` (Task 2).
- Produces:
  - `ContributionData` = `{ username: string; createdAt: string; days: ContributionDay[] }`
  - `yearWindows(createdAt: string, today: string): Array<{ from: string; to: string }>`
  - `fetchContributions(login: string, token: string, today: string, fetchImpl?: typeof fetch): Promise<ContributionData>`

- [ ] **Step 1: Write the failing test**

Create `test/fetch.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { fetchContributions, yearWindows } from '../src/fetch.js';

describe('yearWindows', () => {
  it('covers one window per calendar year', () => {
    const windows = yearWindows('2022-06-15T10:00:00Z', '2024-03-01');
    expect(windows).toHaveLength(3);
  });

  it('starts at the account creation date, not January', () => {
    const windows = yearWindows('2022-06-15T10:00:00Z', '2024-03-01');
    expect(windows[0]!.from).toBe('2022-06-15T00:00:00Z');
    expect(windows[0]!.to).toBe('2022-12-31T23:59:59Z');
  });

  it('ends at today, not December', () => {
    const windows = yearWindows('2022-06-15T10:00:00Z', '2024-03-01');
    expect(windows[2]!.to).toBe('2024-03-01T23:59:59Z');
  });

  it('never spans more than a year, which the API rejects', () => {
    for (const w of yearWindows('2015-01-01T00:00:00Z', '2024-12-31')) {
      const span = Date.parse(w.to) - Date.parse(w.from);
      expect(span).toBeLessThanOrEqual(366 * 24 * 3600 * 1000);
    }
  });

  it('handles an account created today', () => {
    const windows = yearWindows('2024-03-01T09:00:00Z', '2024-03-01');
    expect(windows).toHaveLength(1);
    expect(windows[0]!.from).toBe('2024-03-01T00:00:00Z');
  });
});

function calendarResponse(days: Array<{ date: string; contributionCount: number }>) {
  return {
    data: {
      user: {
        createdAt: '2023-11-01T00:00:00Z',
        contributionsCollection: {
          contributionCalendar: {
            totalContributions: days.reduce((s, d) => s + d.contributionCount, 0),
            weeks: [{ contributionDays: days }],
          },
        },
      },
    },
  };
}

describe('fetchContributions', () => {
  it('merges every year window, de-duplicates and sorts by date', async () => {
    const responses = [
      calendarResponse([{ date: '2023-12-31', contributionCount: 3 }]),
      calendarResponse([
        { date: '2024-01-02', contributionCount: 5 },
        { date: '2023-12-31', contributionCount: 3 },
        { date: '2024-01-01', contributionCount: 1 },
      ]),
    ];
    let call = 0;
    const fake = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => responses[call++]!,
    })) as unknown as typeof fetch;

    const result = await fetchContributions('octocat', 'tok', '2024-01-02', fake);

    expect(result.username).toBe('octocat');
    expect(result.days.map((d) => d.date)).toEqual(['2023-12-31', '2024-01-01', '2024-01-02']);
    expect(result.days.map((d) => d.count)).toEqual([3, 1, 5]);
  });

  it('sends the token as a bearer credential', async () => {
    const fake = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => calendarResponse([{ date: '2023-12-31', contributionCount: 1 }]),
    })) as unknown as typeof fetch;

    await fetchContributions('octocat', 'secret-token', '2023-12-31', fake);

    const init = (fake as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret-token');
  });

  it('throws with the GraphQL message when the API returns errors', async () => {
    const fake = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ errors: [{ message: 'Bad credentials' }] }),
    })) as unknown as typeof fetch;

    await expect(fetchContributions('octocat', 'tok', '2024-01-01', fake)).rejects.toThrow(
      /Bad credentials/,
    );
  });

  it('throws on a non-2xx response', async () => {
    const fake = vi.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    })) as unknown as typeof fetch;

    await expect(fetchContributions('octocat', 'tok', '2024-01-01', fake)).rejects.toThrow(/401/);
  });

  it('throws a clear error when the user does not exist', async () => {
    const fake = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: { user: null } }),
    })) as unknown as typeof fetch;

    await expect(fetchContributions('nobody', 'tok', '2024-01-01', fake)).rejects.toThrow(
      /nobody/,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/fetch.test.ts`
Expected: FAIL — cannot resolve `../src/fetch.js`.

- [ ] **Step 3: Write `src/fetch.ts`**

```ts
import type { ContributionDay } from './transform.js';

const ENDPOINT = 'https://api.github.com/graphql';

// One query serves both purposes: it carries `createdAt`, so the first call
// doubles as the bootstrap that tells us how far back to page.
const CALENDAR_QUERY = `query($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    createdAt
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount } }
      }
    }
  }
}`;

export interface ContributionData {
  username: string;
  createdAt: string;
  days: ContributionDay[];
}

/**
 * `contributionsCollection` accepts at most a one-year window, so history is
 * fetched calendar year by calendar year, clipped to the account creation date
 * at the start and to today at the end.
 */
export function yearWindows(
  createdAt: string,
  today: string,
): Array<{ from: string; to: string }> {
  const createdDate = createdAt.slice(0, 10);
  const firstYear = Number(createdDate.slice(0, 4));
  const lastYear = Number(today.slice(0, 4));

  const windows: Array<{ from: string; to: string }> = [];
  for (let year = firstYear; year <= lastYear; year++) {
    const from = year === firstYear ? createdDate : `${year}-01-01`;
    const to = year === lastYear ? today : `${year}-12-31`;
    if (from > to) continue;
    windows.push({ from: `${from}T00:00:00Z`, to: `${to}T23:59:59Z` });
  }
  return windows;
}

interface GraphQLUser {
  createdAt: string;
  contributionsCollection?: {
    contributionCalendar: {
      totalContributions: number;
      weeks: Array<{ contributionDays: Array<{ date: string; contributionCount: number }> }>;
    };
  };
}

interface GraphQLResponse {
  data?: { user: GraphQLUser | null };
  errors?: Array<{ message: string }>;
}

async function query(
  body: { query: string; variables: Record<string, string> },
  token: string,
  login: string,
  fetchImpl: typeof fetch,
): Promise<GraphQLUser> {
  const response = await fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'contribution-waveform',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GitHub API returned ${response.status}: ${detail.slice(0, 200)}`);
  }

  const payload = (await response.json()) as GraphQLResponse;
  if (payload.errors?.length) {
    throw new Error(`GitHub API error: ${payload.errors.map((e) => e.message).join('; ')}`);
  }
  const user = payload.data?.user ?? null;
  if (!user) throw new Error(`GitHub user "${login}" not found, or the token cannot see them`);
  return user;
}

export async function fetchContributions(
  login: string,
  token: string,
  today: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ContributionData> {
  // The first calendar request also carries createdAt, so bootstrap with a
  // one-year window ending today and widen from whatever it reports.
  const firstWindow = { from: `${today.slice(0, 4)}-01-01T00:00:00Z`, to: `${today}T23:59:59Z` };
  const bootstrap = await query(
    { query: CALENDAR_QUERY, variables: { login, ...firstWindow } },
    token,
    login,
    fetchImpl,
  );

  const createdAt = bootstrap.createdAt;
  const byDate = new Map<string, number>();

  const absorb = (user: GraphQLUser): void => {
    const weeks = user.contributionsCollection?.contributionCalendar.weeks ?? [];
    for (const week of weeks) {
      for (const day of week.contributionDays) {
        byDate.set(day.date, day.contributionCount);
      }
    }
  };

  absorb(bootstrap);

  for (const window of yearWindows(createdAt, today)) {
    if (window.from === firstWindow.from && window.to === firstWindow.to) continue;
    absorb(
      await query(
        { query: CALENDAR_QUERY, variables: { login, ...window } },
        token,
        login,
        fetchImpl,
      ),
    );
  }

  const days: ContributionDay[] = [...byDate.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Deliberately no `fetchedAt` field: a timestamp would make the cache file
  // differ on every run and defeat the Action's "commit only when changed" check.
  return { username: login, createdAt, days };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/fetch.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add src/fetch.ts test/fetch.test.ts
git commit -m "feat: fetch contribution history year by year over GraphQL v4"
```

---

### Task 10: CLI entrypoint and first real build

**Files:**
- Create: `src/cli.ts`
- Test: `test/cli.test.ts`
- Seed: `data/contributions.json` (from the fixture, in Step 5)

**Interfaces:**
- Consumes: `loadConfig` (Task 1); `todayIn`, `addDays`, `buildSeries` (Tasks 2-3); `theme`, `YEAR_GEOMETRY`, `MONTH_GEOMETRY` (Task 5); `renderWave`, `renderAllYears` (Task 7); `fetchContributions` (Task 9).
- Produces: `parseArgs(argv: string[]): CliArgs` where `CliArgs` = `{ command: 'fetch' | 'build'; offline: boolean; mirror: boolean | undefined; out: string; today: string | undefined }`; `buildAll(data, config, today, outDir): Promise<string[]>`.

- [ ] **Step 1: Write the failing test**

Create `test/cli.test.ts`:

```ts
import { readFileSync, rmSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildAll, parseArgs } from '../src/cli.js';
import type { ContributionData } from '../src/fetch.js';

describe('parseArgs', () => {
  it('defaults to a build with no overrides', () => {
    const args = parseArgs(['build']);
    expect(args.command).toBe('build');
    expect(args.offline).toBe(false);
    expect(args.mirror).toBeUndefined();
    expect(args.out).toBe('dist');
  });

  it('reads the fetch command', () => {
    expect(parseArgs(['fetch']).command).toBe('fetch');
  });

  it('reads --offline', () => {
    expect(parseArgs(['build', '--offline']).offline).toBe(true);
  });

  it('reads --mirror and --no-mirror as an override', () => {
    expect(parseArgs(['build', '--mirror']).mirror).toBe(true);
    expect(parseArgs(['build', '--no-mirror']).mirror).toBe(false);
  });

  it('reads --out and --today', () => {
    const args = parseArgs(['build', '--out', 'tmp', '--today', '2024-12-30']);
    expect(args.out).toBe('tmp');
    expect(args.today).toBe('2024-12-30');
  });

  it('rejects an unknown command', () => {
    expect(() => parseArgs(['frobnicate'])).toThrow(/frobnicate/);
  });

  it('rejects an unknown flag', () => {
    expect(() => parseArgs(['build', '--wat'])).toThrow(/--wat/);
  });
});

describe('buildAll', () => {
  const fixture = JSON.parse(
    readFileSync(new URL('./fixtures/contributions.sample.json', import.meta.url), 'utf8'),
  ) as ContributionData;

  const config = {
    username: 'octofixture',
    timezone: 'Europe/Zurich',
    peakMarkers: 3,
    mirror: true,
    accent: '#7c3aed',
  };

  it('writes exactly the six specced files', async () => {
    const out = 'test/.tmp-dist';
    rmSync(out, { recursive: true, force: true });

    const written = await buildAll(fixture, config, '2024-12-30', out);

    expect(readdirSync(out).sort()).toEqual([
      'wave-all-dark.svg',
      'wave-all-light.svg',
      'wave-month-dark.svg',
      'wave-month-light.svg',
      'wave-year-dark.svg',
      'wave-year-light.svg',
    ]);
    expect(written).toHaveLength(6);

    const year = readFileSync(`${out}/wave-year-dark.svg`, 'utf8');
    expect(year).toContain('viewBox="0 0 880 220"');
    expect(year).toContain('@octofixture');
    expect(year).not.toMatch(/NaN|Infinity|undefined/);

    const month = readFileSync(`${out}/wave-month-dark.svg`, 'utf8');
    expect(month).toContain('viewBox="0 0 880 160"');

    // The fixture spans 2023 and 2024, so the all-years file gets two rows.
    const all = readFileSync(`${out}/wave-all-dark.svg`, 'utf8');
    expect(all).toContain('>2023<');
    expect(all).toContain('>2024<');

    rmSync(out, { recursive: true, force: true });
  });

  it('produces different bytes for dark and light', async () => {
    const out = 'test/.tmp-dist2';
    rmSync(out, { recursive: true, force: true });
    await buildAll(fixture, config, '2024-12-30', out);
    expect(readFileSync(`${out}/wave-year-dark.svg`, 'utf8')).not.toBe(
      readFileSync(`${out}/wave-year-light.svg`, 'utf8'),
    );
    rmSync(out, { recursive: true, force: true });
  });

  it('builds a zero-contribution user without throwing', async () => {
    const out = 'test/.tmp-dist3';
    rmSync(out, { recursive: true, force: true });
    const empty: ContributionData = {
      username: 'emptyuser',
      createdAt: '2024-01-01T00:00:00Z',
      days: [],
    };
    await buildAll(empty, { ...config, username: 'emptyuser' }, '2024-12-30', out);
    const year = readFileSync(`${out}/wave-year-dark.svg`, 'utf8');
    expect(year).toContain('0 contributions');
    expect(year).not.toMatch(/NaN|Infinity|undefined/);
    rmSync(out, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/cli.test.ts`
Expected: FAIL — cannot resolve `../src/cli.js`.

- [ ] **Step 3: Write `src/cli.ts`**

```ts
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { loadConfig } from './config.js';
import type { Config } from './config.js';
import { fetchContributions } from './fetch.js';
import type { ContributionData } from './fetch.js';
import { renderAllYears, renderWave } from './render.js';
import type { YearRow } from './render.js';
import { MONTH_GEOMETRY, YEAR_GEOMETRY, theme } from './themes.js';
import { addDays, buildSeries, todayIn } from './transform.js';

const CACHE_PATH = 'data/contributions.json';

export interface CliArgs {
  command: 'fetch' | 'build';
  offline: boolean;
  /** Undefined means "use the config value". */
  mirror: boolean | undefined;
  out: string;
  /** Overrides "today", for reproducible builds in tests. */
  today: string | undefined;
}

export function parseArgs(argv: string[]): CliArgs {
  const [command, ...rest] = argv;
  if (command !== 'fetch' && command !== 'build') {
    throw new Error(`unknown command "${command ?? ''}" — expected "fetch" or "build"`);
  }

  const args: CliArgs = {
    command,
    offline: false,
    mirror: undefined,
    out: 'dist',
    today: undefined,
  };

  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i]!;
    switch (flag) {
      case '--offline':
        args.offline = true;
        break;
      case '--mirror':
        args.mirror = true;
        break;
      case '--no-mirror':
        args.mirror = false;
        break;
      case '--out':
        args.out = rest[++i] ?? 'dist';
        break;
      case '--today':
        args.today = rest[++i];
        break;
      default:
        throw new Error(`unknown flag "${flag}"`);
    }
  }
  return args;
}

/** Distinct calendar years present in the data, ascending. */
function yearsIn(data: ContributionData): number[] {
  const years = new Set<number>();
  for (const day of data.days) years.add(Number(day.date.slice(0, 4)));
  return [...years].sort((a, b) => a - b);
}

export async function buildAll(
  data: ContributionData,
  config: Config,
  today: string,
  outDir: string,
): Promise<string[]> {
  await mkdir(outDir, { recursive: true });

  const { username, mirror, accent, peakMarkers } = config;
  const yearSeries = buildSeries(data.days, addDays(today, -364), today, peakMarkers);
  const monthSeries = buildSeries(data.days, addDays(today, -30), today, peakMarkers);

  const rows: YearRow[] = yearsIn(data).map((year) => ({
    year,
    series: buildSeries(data.days, `${year}-01-01`, `${year}-12-31`, 0),
  }));
  const allTotal = data.days.reduce((sum, d) => sum + d.count, 0);
  const allFrom = data.days[0]?.date ?? today;
  const allTo = data.days[data.days.length - 1]?.date ?? today;

  const written: string[] = [];

  for (const themeName of ['dark', 'light'] as const) {
    const t = theme(themeName, accent);

    const files: Array<[string, string]> = [
      [
        `wave-year-${themeName}.svg`,
        renderWave({
          series: yearSeries, theme: t, username, mirror,
          geometry: YEAR_GEOMETRY, label: 'Trailing year',
        }),
      ],
      [
        `wave-month-${themeName}.svg`,
        renderWave({
          series: monthSeries, theme: t, username, mirror,
          geometry: MONTH_GEOMETRY, label: 'Trailing month',
        }),
      ],
      [
        `wave-all-${themeName}.svg`,
        renderAllYears({
          rows, theme: t, username, mirror,
          total: allTotal, from: allFrom, to: allTo,
        }),
      ],
    ];

    for (const [name, svg] of files) {
      const path = `${outDir}/${name}`;
      await writeFile(path, `${svg}\n`, 'utf8');
      written.push(path);
    }
  }

  return written;
}

async function readCache(): Promise<ContributionData | null> {
  try {
    return JSON.parse(await readFile(CACHE_PATH, 'utf8')) as ContributionData;
  } catch {
    return null;
  }
}

async function writeCache(data: ContributionData): Promise<void> {
  await mkdir('data', { recursive: true });
  await writeFile(CACHE_PATH, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const config = await loadConfig();
  const today = args.today ?? todayIn(config.timezone, new Date());
  const effective: Config = { ...config, mirror: args.mirror ?? config.mirror };

  if (args.command === 'fetch') {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error('GITHUB_TOKEN is not set — cannot fetch');
    const data = await fetchContributions(config.username, token, today);
    await writeCache(data);
    console.log(`fetched ${data.days.length} days for @${data.username} through ${today}`);
    return;
  }

  let data = await readCache();
  if (!data) {
    if (args.offline) {
      throw new Error(`--offline was set but ${CACHE_PATH} is missing — run "npm run fetch" first`);
    }
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error(`${CACHE_PATH} is missing and GITHUB_TOKEN is not set`);
    data = await fetchContributions(config.username, token, today);
    await writeCache(data);
  }

  const written = await buildAll(data, effective, today, args.out);
  console.log(`wrote ${written.length} files to ${args.out}/`);
  for (const path of written) console.log(`  ${path}`);
}

// Only run when executed directly, so tests can import buildAll and parseArgs.
if (process.argv[1]?.endsWith('cli.js')) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/cli.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Seed the cache from the fixture and verify an offline build**

The real fetch needs a token that does not exist yet, so prove the offline path with fixture data first.

```bash
mkdir -p data
cp test/fixtures/contributions.sample.json data/contributions.json
npm run build -- --offline --today 2024-12-30
```

Expected: `wrote 6 files to dist/`, then six files listed.

- [ ] **Step 6: Verify the offline build genuinely touches no network**

Run: `unshare -rn npm run build -- --offline --today 2024-12-30`
Expected: succeeds with the same output. If `unshare` is unavailable on this machine, instead confirm by inspection that the `build` path with an existing cache never calls `fetchContributions`, and record that the sandboxed check was skipped.

- [ ] **Step 7: Verify the output visually**

Open `dist/wave-year-dark.svg`, `dist/wave-year-light.svg`, `dist/wave-month-dark.svg` and `dist/wave-all-dark.svg` in a browser. Confirm for each: the wave is legible, month labels do not overlap, peak labels sit inside the frame, and the footer reads `@octofixture · N contributions · 2024-01-01 – 2024-12-30`.

Then resize the browser window so the SVG renders at roughly 400px wide and confirm the wave is still legible. **Record what you actually saw.** If anything is illegible or clipped, fix `render.ts`, re-run `npx vitest run` to refresh snapshots, and re-check.

- [ ] **Step 8: Commit**

```bash
git add src/cli.ts test/cli.test.ts data/contributions.json dist
git commit -m "feat: add CLI with fetch, offline build and mirror override"
```

---

### Task 11: GitHub Pages site

**Files:**
- Create: `vite.config.ts`
- Create: `site/index.html`
- Create: `site/main.ts`
- Create: `site/style.css`

**Interfaces:**
- Consumes: the six files in `dist/`, which Vite serves as its `publicDir`.
- Produces: `site-dist/` containing `index.html`, hashed assets, and the six SVGs at the root, so `https://olivierluethy.github.io/contribution-waveform/wave-year-dark.svg` resolves.

- [ ] **Step 1: Create `vite.config.ts`**

```ts
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: 'site',
  base: '/contribution-waveform/',
  // The generated SVGs are copied to the output root, so the deployed Pages
  // artifact is exactly this build — no separate copy step in the workflow.
  publicDir: resolve(here, 'dist'),
  build: {
    outDir: resolve(here, 'site-dist'),
    emptyOutDir: true,
  },
  plugins: [tailwindcss()],
});
```

- [ ] **Step 2: Create `site/style.css`**

This is the only CSS file in the project — the Tailwind entry, nothing else.

```css
@import "tailwindcss";
```

- [ ] **Step 3: Create `site/index.html`**

```html
<!doctype html>
<html lang="en" class="dark">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Contribution Waveform</title>
    <link rel="stylesheet" href="./style.css" />
  </head>
  <body class="min-h-screen bg-neutral-950 text-neutral-200 antialiased">
    <div class="mx-auto max-w-4xl px-6 py-16">
      <header class="mb-12">
        <h1 class="text-3xl font-semibold tracking-tight text-white">Contribution Waveform</h1>
        <p class="mt-3 max-w-2xl text-neutral-400">
          GitHub contribution history as a continuous waveform instead of a grid of squares.
          Regenerated daily by a scheduled Action and served as a self-contained SVG, so it
          renders inside a profile README.
        </p>
        <div class="mt-5 flex flex-wrap items-center gap-3">
          <button
            id="theme-toggle"
            class="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 transition hover:border-neutral-500 hover:text-white"
          >
            Previewing: <span id="theme-label" class="font-medium text-white">dark</span>
          </button>
          <button
            id="how-it-works"
            class="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 transition hover:border-neutral-500 hover:text-white"
          >
            How it works
          </button>
        </div>
      </header>

      <section id="previews" class="space-y-10"></section>

      <section class="mt-16">
        <h2 class="text-xl font-semibold text-white">Embed snippets</h2>
        <p class="mt-2 text-sm text-neutral-400">
          The <code class="text-neutral-300">&lt;picture&gt;</code> form adapts to the reader's
          GitHub theme. The Markdown form is simpler but locks to one theme.
        </p>
        <div id="snippets" class="mt-6 space-y-6"></div>
      </section>

      <section class="mt-16">
        <h2 class="text-xl font-semibold text-white">Use this for your own account</h2>
        <ol class="mt-4 space-y-2 text-neutral-400">
          <li><span class="text-neutral-200">1.</span> Fork this repository.</li>
          <li>
            <span class="text-neutral-200">2.</span> Set
            <code class="text-neutral-300">username</code> in
            <code class="text-neutral-300">waveform.config.json</code> to your GitHub handle.
          </li>
          <li>
            <span class="text-neutral-200">3.</span> Add a repository secret named
            <code class="text-neutral-300">GH_PAT</code> — a classic PAT with the
            <code class="text-neutral-300">read:user</code> scope.
          </li>
          <li>
            <span class="text-neutral-200">4.</span> Enable Pages with
            <span class="text-neutral-300">GitHub Actions</span> as the source, then run the
            workflow once by hand.
          </li>
        </ol>
      </section>

      <footer class="mt-20 border-t border-neutral-800 pt-6 text-sm text-neutral-500">
        Built with TypeScript and no charting library. Images are proxied and cached by GitHub's
        camo for a few hours, so a README embed updates about once a day.
      </footer>
    </div>

    <dialog
      id="explainer"
      class="m-auto max-w-lg rounded-lg border border-neutral-700 bg-neutral-900 p-0 text-neutral-200 backdrop:bg-black/70"
    >
      <div class="p-6">
        <h3 class="text-lg font-semibold text-white">How it works</h3>
        <div class="mt-4 space-y-3 text-sm text-neutral-400">
          <p>
            A scheduled Action queries the GitHub GraphQL API year by year, caches the result to
            <code class="text-neutral-300">data/contributions.json</code>, and renders six SVG
            files.
          </p>
          <p>
            The soft band is your rolling 30-day average. The thin line is the 7-day average. The
            wave is your actual daily count, smoothed with a Catmull-Rom spline. The accent fill
            marks days above your 30-day average; the muted fill marks days below it.
          </p>
          <p>
            The Y axis is scaled to the 98th percentile rather than the maximum, so a single
            200-commit day cannot flatten the rest of the year.
          </p>
        </div>
        <button
          id="explainer-close"
          class="mt-6 rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 transition hover:border-neutral-500 hover:text-white"
        >
          Close
        </button>
      </div>
    </dialog>

    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

- [ ] **Step 4: Create `site/main.ts`**

```ts
const BASE = import.meta.env.BASE_URL;
const ORIGIN = 'https://olivierluethy.github.io/contribution-waveform/';
const USERNAME = 'olivierluethy';

interface Variant {
  key: 'year' | 'month' | 'all';
  title: string;
  blurb: string;
  alt: string;
}

const VARIANTS: Variant[] = [
  {
    key: 'year',
    title: 'Trailing year',
    blurb: 'The last 365 days. The default embed.',
    alt: 'My GitHub contributions as a waveform',
  },
  {
    key: 'month',
    title: 'Trailing month',
    blurb: 'The last 31 days, in a shorter frame.',
    alt: 'My GitHub contributions this month as a waveform',
  },
  {
    key: 'all',
    title: 'All years',
    blurb: 'Every year on record, one wave per row.',
    alt: 'My GitHub contributions by year as a waveform',
  },
];

let previewTheme: 'dark' | 'light' = 'dark';

function fileFor(key: Variant['key'], theme: 'dark' | 'light'): string {
  return `wave-${key}-${theme}.svg`;
}

function pictureSnippet(v: Variant): string {
  return `<picture>
  <source media="(prefers-color-scheme: dark)"
          srcset="${ORIGIN}${fileFor(v.key, 'dark')}">
  <source media="(prefers-color-scheme: light)"
          srcset="${ORIGIN}${fileFor(v.key, 'light')}">
  <img alt="${v.alt}"
       src="${ORIGIN}${fileFor(v.key, 'dark')}">
</picture>`;
}

function markdownSnippet(v: Variant): string {
  return `![${v.alt}](${ORIGIN}${fileFor(v.key, 'dark')})`;
}

function renderPreviews(): void {
  const host = document.querySelector<HTMLElement>('#previews');
  if (!host) return;

  host.innerHTML = VARIANTS.map(
    (v) => `
      <figure>
        <figcaption class="mb-3">
          <span class="text-lg font-medium text-white">${v.title}</span>
          <span class="ml-2 text-sm text-neutral-500">${v.blurb}</span>
        </figcaption>
        <div class="overflow-hidden rounded-lg border border-neutral-800">
          <img class="block w-full" src="${BASE}${fileFor(v.key, previewTheme)}" alt="${v.alt}" />
        </div>
      </figure>`,
  ).join('');
}

function renderSnippets(): void {
  const host = document.querySelector<HTMLElement>('#snippets');
  if (!host) return;

  const blocks = VARIANTS.flatMap((v) => [
    { label: `${v.title} — picture (theme-aware)`, code: pictureSnippet(v) },
    { label: `${v.title} — Markdown (dark only)`, code: markdownSnippet(v) },
  ]);

  host.innerHTML = blocks
    .map(
      (block, i) => `
      <div class="rounded-lg border border-neutral-800 bg-neutral-900/60">
        <div class="flex items-center justify-between border-b border-neutral-800 px-4 py-2">
          <span class="text-sm text-neutral-400">${block.label}</span>
          <button
            data-copy="${i}"
            class="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 transition hover:border-neutral-500 hover:text-white"
          >Copy</button>
        </div>
        <pre class="overflow-x-auto px-4 py-3 text-xs leading-relaxed text-neutral-300"><code id="snippet-${i}">${escapeHtml(
          block.code,
        )}</code></pre>
      </div>`,
    )
    .join('');

  host.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((button) => {
    button.addEventListener('click', async () => {
      const index = button.dataset.copy;
      const code = document.querySelector(`#snippet-${index}`)?.textContent ?? '';
      await navigator.clipboard.writeText(code);
      button.textContent = 'Copied';
      setTimeout(() => {
        button.textContent = 'Copy';
      }, 1500);
    });
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function wireControls(): void {
  const toggle = document.querySelector<HTMLButtonElement>('#theme-toggle');
  const label = document.querySelector<HTMLElement>('#theme-label');
  toggle?.addEventListener('click', () => {
    previewTheme = previewTheme === 'dark' ? 'light' : 'dark';
    if (label) label.textContent = previewTheme;
    renderPreviews();
  });

  const dialog = document.querySelector<HTMLDialogElement>('#explainer');
  document.querySelector('#how-it-works')?.addEventListener('click', () => dialog?.showModal());
  document.querySelector('#explainer-close')?.addEventListener('click', () => dialog?.close());
}

renderPreviews();
renderSnippets();
wireControls();
```

- [ ] **Step 5: Build the site**

Run: `npm run build:site`
Expected: succeeds, creating `site-dist/index.html`, `site-dist/assets/*`, and the six SVGs at `site-dist/wave-*.svg`.

- [ ] **Step 6: Verify the SVGs landed at the output root**

Run: `ls site-dist/*.svg`
Expected: exactly six files.

- [ ] **Step 7: Verify the page in a browser**

Run: `npx vite preview --base /contribution-waveform/`
Then open the printed URL at `/contribution-waveform/`. Confirm: three previews render, the theme toggle swaps every preview between dark and light, the copy button on the first snippet copies the `<picture>` block, and "How it works" opens a modal that closes again. **Record what you actually saw.**

- [ ] **Step 8: Commit**

```bash
git add vite.config.ts site
git commit -m "feat: add dark-mode Pages site with previews and snippet generator"
```

---

### Task 12: Scheduled Action, README and the final snippet

**Files:**
- Create: `.github/workflows/build.yml`
- Create: `README.md`

**Interfaces:**
- Consumes: `npm run fetch`, `npm run build`, `npm run build:site` from Task 1; `site-dist/` from Task 11.
- Produces: a deployed Pages site and the embed URLs used in the README.

- [ ] **Step 1: Create `.github/workflows/build.yml`**

```yaml
name: Build waveform

on:
  schedule:
    - cron: '0 4 * * *'
  workflow_dispatch:
  push:
    branches: [main]
    # The job commits back to main. Ignoring the paths it writes stops it
    # retriggering itself, belt-and-braces with the [skip ci] commit message.
    paths-ignore:
      - 'data/contributions.json'
      - 'dist/**'

permissions:
  contents: write
  pages: write
  id-token: write

concurrency:
  group: waveform-build
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - run: npm test

      - name: Fetch contributions
        env:
          # A classic PAT with read:user sees private contributions; the default
          # token does not. Fall back so a fresh fork still builds.
          GITHUB_TOKEN: ${{ secrets.GH_PAT || secrets.GITHUB_TOKEN }}
        run: npm run fetch

      - run: npm run build

      - run: npm run build:site

      - name: Commit refreshed data and SVGs only when they changed
        run: |
          git config user.name  "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add data/contributions.json dist
          if git diff --cached --quiet; then
            echo "No content change — skipping commit."
          else
            git commit -m "chore: refresh contribution waveform [skip ci]"
            git push
          fi

      - uses: actions/configure-pages@v5

      - uses: actions/upload-pages-artifact@v3
        with:
          path: site-dist

      - id: deploy
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Validate the workflow YAML parses**

Run: `node -e "const {readFileSync}=require('fs');const s=readFileSync('.github/workflows/build.yml','utf8');if(!/deploy-pages/.test(s))throw new Error('missing deploy step');console.log('workflow present, '+s.split('\n').length+' lines')"`
Expected: prints the line count. (There is no YAML parser in the dependency budget; GitHub validates on push.)

- [ ] **Step 3: Write `README.md`**

````markdown
# Contribution Waveform

GitHub contribution history rendered as a continuous waveform instead of a grid
of squares. Regenerated daily by a scheduled Action, served as a self-contained
SVG, and embeddable in a profile README.

<picture>
  <source media="(prefers-color-scheme: dark)"
          srcset="https://olivierluethy.github.io/contribution-waveform/wave-year-dark.svg">
  <source media="(prefers-color-scheme: light)"
          srcset="https://olivierluethy.github.io/contribution-waveform/wave-year-light.svg">
  <img alt="My GitHub contributions as a waveform"
       src="https://olivierluethy.github.io/contribution-waveform/wave-year-dark.svg">
</picture>

## What you are looking at

Four layers, back to front:

1. **Baseline band** — the rolling 30-day average. "Normally I do about this much."
2. **Deviation fill** — the area between the daily curve and the 30-day
   baseline. Accent where the day beat its average, muted where it fell short.
   Painted before the line layers, since its top edge is the daily curve
   itself — filling over the curve would mute the wave's own stroke.
3. **7-day average** — a thin smoothed line.
4. **Daily series** — the actual per-day count, smoothed with a Catmull-Rom
   spline converted to cubic Béziers.

The wave is mirrored around a centre axis for an audio-waveform look. The
baseline envelope is mirrored too, so the deviation fill keeps its meaning.

The Y axis is scaled to the **98th percentile** of the period rather than the
maximum, so a single 200-commit day cannot flatten the rest of the year.
Anything above is clipped. There are no gridlines and no Y numbers — just a
`max` label in the corner.

## Generated files

| File | Content |
|---|---|
| `wave-year-dark.svg` / `-light` | Trailing 365 days |
| `wave-month-dark.svg` / `-light` | Trailing 31 days |
| `wave-all-dark.svg` / `-light` | Every year, one wave per row |

All six live at `https://olivierluethy.github.io/contribution-waveform/`.

## Embedding

```html
<picture>
  <source media="(prefers-color-scheme: dark)"
          srcset="https://olivierluethy.github.io/contribution-waveform/wave-year-dark.svg">
  <source media="(prefers-color-scheme: light)"
          srcset="https://olivierluethy.github.io/contribution-waveform/wave-year-light.svg">
  <img alt="My GitHub contributions as a waveform"
       src="https://olivierluethy.github.io/contribution-waveform/wave-year-dark.svg">
</picture>
```

Or the simpler Markdown form, which locks to one theme:

```markdown
![My GitHub contributions as a waveform](https://olivierluethy.github.io/contribution-waveform/wave-year-dark.svg)
```

## Use it for your own account

1. Fork this repository.
2. Set `username` in `waveform.config.json` to your GitHub handle.
3. Add a repository secret `GH_PAT` — a classic PAT with the `read:user` scope.
4. Enable Pages with **GitHub Actions** as the source.
5. Run the **Build waveform** workflow once by hand.

Swap `olivierluethy/contribution-waveform` for your own user and repo in every
URL above.

## Caveats

**Private contributions.** They appear only if the `GH_PAT` secret has the
`read:user` scope *and* "Include private contributions on my profile" is enabled
in your GitHub settings. Without both, the wave shows public activity only.

**Camo caching.** GitHub proxies README images through camo and caches them for
a few hours. Your embed updates roughly once a day. This is expected; the tool
does not try to defeat the cache.

**Why this cannot work for arbitrary usernames.** GitHub Pages is static
hosting — there is no server-side code and no request-time SVG generation. A URL
like `.../wave.svg?user=someone` cannot exist, because nothing runs to answer it.
Every embeddable file must be generated ahead of time and committed. So the repo
is configured for exactly one username, and anyone else forks it and sets their
own. A serverless variant (a small function that renders on demand and caches)
would lift that limit, but it is deliberately **not implemented here** — it needs
hosting outside GitHub Pages.

## Configuration

```json
{
  "username": "olivierluethy",
  "timezone": "Europe/Zurich",
  "peakMarkers": 3,
  "mirror": true,
  "accent": "#7c3aed"
}
```

## Development

```bash
npm install
npm test                          # unit, sanitizer and snapshot tests
npm run fetch                     # needs GITHUB_TOKEN
npm run build -- --offline        # rebuild SVGs from data/contributions.json
npm run build -- --no-mirror      # unmirrored variant
npm run build:site                # Vite + Tailwind site into site-dist/
```

`--offline` builds entirely from the committed `data/contributions.json`, so
rendering changes can be tested and diffed without API access.

## How it is built

TypeScript, Node 20+, ESM. No charting library — SVG is emitted as strings and
the curve maths is hand-rolled. The only runtime dependency is `zod`, for config
validation.

```
src/config.ts     zod-validated config
src/fetch.ts      GraphQL v4 client, year-by-year pagination
src/transform.ts  rolling averages, percentile clamp, normalisation
src/curve.ts      Catmull-Rom to cubic Bézier
src/render.ts     SVG string composition
src/themes.ts     dark and light colour tokens
src/cli.ts        fetch / build / --offline / --mirror
```

Generated SVGs contain no `<script>`, no `<foreignObject>`, no external fonts
and no external references of any kind — a sanitizer test enforces this on every
build, because GitHub strips almost everything else from a README.
````

- [ ] **Step 4: Run the full verification sweep**

```bash
npm run typecheck
npm test
npm run build -- --offline --today 2024-12-30
npm run build:site
```

Expected: all four succeed. Record the actual test count.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/build.yml README.md
git commit -m "ci: add scheduled Pages build and document the project"
```

- [ ] **Step 6: Ask the user for a GitHub token and run the first real fetch**

The build has only ever seen fixture data. Ask the user to create a classic PAT
with the `read:user` scope and provide it, then:

```bash
GITHUB_TOKEN=<their token> npm run fetch
npm run build
npm test
```

Expected: `data/contributions.json` now holds their real history, six SVGs
regenerate, and the suite still passes.

Then open `dist/wave-year-dark.svg` and `dist/wave-all-dark.svg` in a browser
and confirm the real data looks right — in particular that the all-years file
has one row per year of their account's life and stays legible.

- [ ] **Step 7: Commit the real data**

```bash
git add data/contributions.json dist
git commit -m "feat: generate waveforms from live contribution history"
```

- [ ] **Step 8: Print the final snippet**

Print the exact `<picture>` block for the user to paste into their profile
README, with the real URLs filled in, plus the Markdown fallback. State plainly
that the images 404 until the repo is pushed to GitHub, Pages is enabled with
**GitHub Actions** as the source, and the workflow has run once.

---

## Notes for the implementer

- **Do not add dependencies.** If something seems to need one, it does not — the
  whole point of this project is that a waveform is a few hundred lines of
  string building.
- **`.js` extensions on relative imports.** NodeNext resolution requires them in
  `.ts` source. `import { round } from './curve.js'` is correct even though the
  file on disk is `curve.ts`.
- **Snapshot churn is a signal.** If a rendering change produces a snapshot diff,
  read the diff before accepting it. Regenerate with `npx vitest run -u`.
- **Never relax the sanitizer test to make it pass.** It encodes a platform
  constraint, not a preference.
